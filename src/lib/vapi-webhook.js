import {
  escalateToHuman,
  openBillingDispute,
  reportFraudAlert,
  requestFeeWaiver,
  verifyCustomer
} from "./actions.js";

const toolHandlers = {
  verify_customer: verifyCustomer,
  request_fee_waiver: requestFeeWaiver,
  report_fraud_alert: reportFraudAlert,
  open_billing_dispute: openBillingDispute,
  escalate_to_human: escalateToHuman
};

export function handleVapiWebhook(payload) {
  const { message } = payload;

  if (!message) {
    return { error: "No message in webhook payload" };
  }

  switch (message.type) {
    case "function-call":
      return handleFunctionCall(message);
    case "status-update":
      return handleStatusUpdate(message);
    case "end-of-call-report":
      return handleEndOfCall(message);
    case "hang":
      return { ok: true, action: "hang-acknowledged" };
    case "speech-update":
      return { ok: true, action: "speech-update-acknowledged" };
    default:
      return { ok: true, action: "unhandled-type", type: message.type };
  }
}

async function handleFunctionCall(message) {
  const fnName = message.functionCall?.name;
  const args = message.functionCall?.parameters || {};

  const handler = toolHandlers[fnName];
  if (!handler) {
    return { error: `Unknown function: ${fnName}` };
  }

  const result = await handler(args);
  return { result };
}

function handleStatusUpdate(message) {
  const status = message.status;
  console.log(`[Vapi Webhook] Call status: ${status}`);
  return { ok: true, status };
}

function handleEndOfCall(message) {
  console.log(`[Vapi Webhook] Call ended. Duration: ${message.durationSeconds}s`);
  return {
    ok: true,
    action: "call-ended",
    duration: message.durationSeconds,
    summary: message.summary || null
  };
}
