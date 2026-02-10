import crypto from "crypto";
import { getCustomerById, saveCustomer } from "./store.js";

function requireCard(customer, cardLast4) {
  const card = customer.cards.find((c) => c.last4 === cardLast4);
  if (!card) {
    throw new Error(`No card found ending in ${cardLast4}`);
  }
  return card;
}

export async function verifyCustomer({ customerId, last4Ssn }) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    return { verified: false, reason: "customer_not_found" };
  }

  const verified = customer.last4Ssn === last4Ssn;
  return {
    verified,
    reason: verified ? "ok" : "mismatch",
    customer: verified
      ? {
          customerId: customer.id,
          fullName: customer.fullName,
          phone: customer.phone
        }
      : null
  };
}

export async function listCustomerCards({ customerId }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Customer not found");

  return {
    customerId: customer.id,
    cards: customer.cards.map((card) => ({
      issuer: card.issuer,
      nickname: card.nickname,
      cardLast4: card.last4,
      status: card.status,
      fraudLocked: card.fraudLocked
    }))
  };
}

export async function listCustomerTransactions({ customerId, cardLast4 }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Customer not found");

  const transactions = customer.transactions || [];
  const filtered = cardLast4
    ? transactions.filter((t) => t.cardLast4 === cardLast4)
    : transactions;

  return {
    customerId: customer.id,
    count: filtered.length,
    transactions: filtered
  };
}

export async function flagTransaction({ customerId, transactionId, reason }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Customer not found");

  const transactions = customer.transactions || [];
  const tx = transactions.find((t) => t.transactionId === transactionId);
  if (!tx) throw new Error(`Transaction not found: ${transactionId}`);

  tx.flagged = true;
  tx.flagReason = reason || "customer_reported";
  tx.flaggedAt = new Date().toISOString();

  const relatedCard = requireCard(customer, tx.cardLast4);
  relatedCard.fraudLocked = true;

  const caseId = `fraud_${crypto.randomUUID().slice(0, 8)}`;
  await saveCustomer(customer);

  return {
    caseId,
    transactionId: tx.transactionId,
    cardLast4: tx.cardLast4,
    issuer: relatedCard.issuer,
    temporaryLockApplied: true,
    flagged: true
  };
}

export async function requestFeeWaiver({ customerId, cardLast4, feeType, reason }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Customer not found");

  const card = requireCard(customer, cardLast4);
  const normalizedFeeType = (feeType || "annual").toLowerCase();

  const approved =
    (normalizedFeeType === "late" && card.lateFeesYtd > 0) ||
    (normalizedFeeType === "annual" && card.annualFee > 0);

  const amount = normalizedFeeType === "late" ? card.lateFeesYtd : card.annualFee;
  const waiverAmount = approved ? Math.min(amount, normalizedFeeType === "annual" ? 200 : amount) : 0;

  const result = {
    ticketId: `fee_${crypto.randomUUID().slice(0, 8)}`,
    issuer: card.issuer,
    cardLast4,
    feeType: normalizedFeeType,
    approved,
    waiverAmount,
    reasonProvided: reason || "No reason provided"
  };

  if (approved && normalizedFeeType === "late") {
    card.lateFeesYtd = Math.max(0, card.lateFeesYtd - waiverAmount);
    await saveCustomer(customer);
  }

  return result;
}

export async function reportFraudAlert({ customerId, cardLast4, suspiciousTransaction }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Customer not found");

  const card = requireCard(customer, cardLast4);
  card.fraudLocked = true;

  const caseId = `fraud_${crypto.randomUUID().slice(0, 8)}`;
  await saveCustomer(customer);

  return {
    caseId,
    issuer: card.issuer,
    cardLast4,
    temporaryLockApplied: true,
    suspiciousTransaction
  };
}

export async function openBillingDispute({ customerId, cardLast4, merchant, amount, transactionDate, reason }) {
  const customer = await getCustomerById(customerId);
  if (!customer) throw new Error("Customer not found");

  const card = requireCard(customer, cardLast4);
  const disputeId = `disp_${crypto.randomUUID().slice(0, 8)}`;

  const dispute = {
    disputeId,
    cardId: card.cardId,
    cardLast4,
    merchant,
    amount,
    transactionDate,
    reason,
    status: "submitted",
    createdAt: new Date().toISOString()
  };

  customer.openDisputes.push(dispute);
  await saveCustomer(customer);

  return {
    disputeId,
    issuer: card.issuer,
    expectedResolutionWindowDays: 10,
    temporaryCreditLikely: amount >= 50
  };
}

export async function escalateToHuman({ topic, summary }) {
  return {
    escalated: true,
    queue: "credit_card_advocacy",
    etaMinutes: 15,
    topic,
    summary
  };
}
