import crypto from "crypto";

import {
  openBillingDispute,
  reportFraudAlert,
  requestFeeWaiver
} from "./actions.js";
import { processVoiceChain, transcribeAudio } from "./hathora.js";
import { getCustomerById } from "./store.js";

const sessions = new Map();

function pickCardLast4(customer, preferredLast4) {
  if (preferredLast4) return preferredLast4;
  const firstCard = customer.cards?.[0];
  if (!firstCard) throw new Error("No card available for this customer");
  return firstCard.last4;
}

function normalizeTranscript(sttResponse) {
  if (!sttResponse) return "";
  if (typeof sttResponse.text === "string") return sttResponse.text;
  if (typeof sttResponse.transcript === "string") return sttResponse.transcript;
  if (Array.isArray(sttResponse.results) && typeof sttResponse.results[0]?.transcript === "string") {
    return sttResponse.results[0].transcript;
  }
  return "";
}

function detectIssueType(text) {
  const t = text.toLowerCase();
  if (t.includes("fraud") || t.includes("unknown charge") || t.includes("did not make")) {
    return "fraud_alert";
  }
  if (t.includes("dispute") || t.includes("refund") || t.includes("charged") || t.includes("merchant")) {
    return "billing_dispute";
  }
  if (t.includes("annual fee") || t.includes("late fee") || t.includes("waive") || t.includes("fee waiver")) {
    return "fee_waiver";
  }
  return "billing_dispute";
}

function extractAmount(text) {
  const match = text.match(/\$?\s?(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  return Number(match[1]);
}

function extractMerchant(text) {
  const match = text.match(/(?:at|from)\s+([A-Za-z0-9 .&-]{2,40})/i);
  return match ? match[1].trim() : "Unknown merchant";
}

function buildSummary({ session, customer, resolution }) {
  const base = {
    sessionId: session.sessionId,
    customerId: customer.id,
    customerName: customer.fullName,
    cardLast4: session.cardLast4,
    detectedIssueType: session.issueType,
    transcript: session.transcript,
    resolution
  };

  let resolutionText = "";
  if (session.issueType === "fee_waiver") {
    resolutionText = resolution.approved
      ? `Fee waiver approved for $${resolution.waiverAmount}.`
      : "Fee waiver request was not approved.";
  } else if (session.issueType === "fraud_alert") {
    resolutionText = `Fraud alert filed with case ${resolution.caseId}. Card lock is active.`;
  } else {
    resolutionText = `Dispute ${resolution.disputeId} was submitted. Expected review window is ${resolution.expectedResolutionWindowDays} days.`;
  }

  return {
    ...base,
    summary: `${customer.fullName} reported ${session.issueType.replace("_", " ")}. ${resolutionText}`
  };
}

export async function voiceIntake({
  customerId,
  cardLast4,
  transcript,
  audioBase64,
  mimeType = "audio/wav"
}) {
  console.log("[voiceIntake] === START ===");
  console.log("[voiceIntake]   customerId:", customerId);
  console.log("[voiceIntake]   cardLast4:", cardLast4);
  console.log("[voiceIntake]   transcript provided:", transcript ? `"${transcript.slice(0, 80)}..."` : "NO");
  console.log("[voiceIntake]   audioBase64 provided:", audioBase64 ? `YES (${(audioBase64.length * 0.75 / 1024).toFixed(1)} KB)` : "NO");
  console.log("[voiceIntake]   mimeType:", mimeType);

  const customer = await getCustomerById(customerId);
  if (!customer) {
    console.error("[voiceIntake] ERROR: Customer not found:", customerId);
    throw new Error("Customer not found");
  }
  console.log("[voiceIntake]   Customer found:", customer.fullName);

  let finalTranscript = transcript || "";
  let sttResponse = null;
  let chainResponse = null;

  if (!finalTranscript) {
    if (!audioBase64) {
      console.error("[voiceIntake] ERROR: No transcript AND no audio — nothing to process");
      throw new Error("Provide either transcript or audioBase64 for voice intake");
    }
    console.log("[voiceIntake] No text transcript, attempting STT...");
    try {
      sttResponse = await transcribeAudio({ audioBase64, mimeType });
      finalTranscript = normalizeTranscript(sttResponse);
      console.log("[voiceIntake] STT transcript:", finalTranscript ? `"${finalTranscript.slice(0, 100)}"` : "EMPTY after normalize");
    } catch (sttError) {
      console.error("[voiceIntake] STT FAILED:", sttError.message);
      if (!process.env.HATHORA_CHAIN_URL) {
        console.error("[voiceIntake] No HATHORA_CHAIN_URL set — cannot fallback. Throwing.");
        throw sttError;
      }

      console.log("[voiceIntake] Falling back to voice chain...");
      chainResponse = await processVoiceChain({
        audioBase64,
        mimeType,
        sessionId: `session-${Date.now()}`,
        enableConversationHistory: true
      });

      finalTranscript = "Voice issue captured via Hathora chain. Customer reported unauthorized or incorrect card charge.";
    }
  } else {
    console.log("[voiceIntake] Using provided text transcript, skipping STT");
  }

  if (!finalTranscript) {
    console.error("[voiceIntake] ERROR: finalTranscript is empty after all attempts");
    throw new Error("Could not derive transcript from voice input");
  }
  console.log("[voiceIntake] Final transcript:", `"${finalTranscript.slice(0, 100)}"`);
  console.log("[voiceIntake] Detected issue:", detectIssueType(finalTranscript));

  const sessionId = `sess_${crypto.randomUUID().slice(0, 8)}`;
  const session = {
    sessionId,
    customerId,
    cardLast4: pickCardLast4(customer, cardLast4),
    transcript: finalTranscript,
    issueType: detectIssueType(finalTranscript),
    createdAt: new Date().toISOString(),
    status: "intake_complete",
    resolution: null
  };
  sessions.set(sessionId, session);

  return {
    sessionId,
    customerId,
    cardLast4: session.cardLast4,
    issueType: session.issueType,
    transcript: finalTranscript,
    sttUsed: !transcript,
    sttResponse,
    chainResponse
  };
}

export async function callHandling({ sessionId }) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");

  const customer = await getCustomerById(session.customerId);
  if (!customer) throw new Error("Customer not found");

  let resolution;
  if (session.issueType === "fee_waiver") {
    const feeType = session.transcript.toLowerCase().includes("late") ? "late" : "annual";
    resolution = await requestFeeWaiver({
      customerId: session.customerId,
      cardLast4: session.cardLast4,
      feeType,
      reason: "Requested by voice agent after customer intake"
    });
  } else if (session.issueType === "fraud_alert") {
    resolution = await reportFraudAlert({
      customerId: session.customerId,
      cardLast4: session.cardLast4,
      suspiciousTransaction: session.transcript
    });
  } else {
    resolution = await openBillingDispute({
      customerId: session.customerId,
      cardLast4: session.cardLast4,
      merchant: extractMerchant(session.transcript),
      amount: extractAmount(session.transcript) || 89.99,
      transactionDate: new Date().toISOString().slice(0, 10),
      reason: `Captured from voice intake: ${session.transcript}`
    });
  }

  const updated = {
    ...session,
    status: "call_handled",
    resolution
  };
  sessions.set(sessionId, updated);

  return {
    sessionId,
    status: updated.status,
    issueType: updated.issueType,
    resolution
  };
}

export async function finalResolutionSummary({ sessionId }) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("Session not found");
  if (!session.resolution) throw new Error("Call handling not completed for this session");

  const customer = await getCustomerById(session.customerId);
  if (!customer) throw new Error("Customer not found");

  const result = buildSummary({
    session,
    customer,
    resolution: session.resolution
  });

  const updated = {
    ...session,
    status: "summary_ready"
  };
  sessions.set(sessionId, updated);

  return result;
}
