# Credit Card Customer Service Voice Agent (MVP)

Hackathon MVP for a voice AI agent that calls card issuers to handle:
- Fee waiver requests
- Fraud alerts (card lock + case)
- Billing disputes

Stack:
- Vapi AI for real-time voice calls and assistant orchestration
- Hathora for unified STT/TTS model routing
- Node + Express backend for tool execution and workflow logic

## 1) Setup

```bash
cp .env.example .env
npm install
```

Set these in `.env`:
- `VAPI_API_KEY`
- `VAPI_WEBHOOK_SECRET`
- `HATHORA_API_KEY`
- Optional: `PUBLIC_BASE_URL` (your ngrok/tunnel URL)

Run backend:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## 2) Expose Localhost for Vapi

Use any tunnel (ngrok / cloudflared) and copy the HTTPS base URL.

Example:

```bash
ngrok http 3000
```

## 3) Push Assistant Config to Vapi

Create new assistant:

```bash
node scripts/push-vapi-assistant.js --public-url https://YOUR_NGROK_URL
```

Update existing assistant:

```bash
node scripts/push-vapi-assistant.js --assistant-id YOUR_ASSISTANT_ID --public-url https://YOUR_NGROK_URL
```

Assistant config source:
- `src/config/vapi-assistant.json`

## 4) Tool Endpoints (called by Vapi)

- `POST /api/tools/verify-customer`
- `POST /api/tools/request-fee-waiver`
- `POST /api/tools/report-fraud-alert`
- `POST /api/tools/open-billing-dispute`
- `POST /api/tools/escalate-to-human`

Webhook auth:
- If `VAPI_WEBHOOK_SECRET` is set, backend validates `x-vapi-secret`.

## 5) Hathora Voice Utility Endpoints

- `POST /api/voice/transcribe`
- `POST /api/voice/synthesize`

These are optional utility routes for demoing Hathora integration explicitly.

## 6) Local Frontend Dashboard

When the backend is running, open:

- `http://localhost:3000` (or your configured `PORT`, such as `3011`)

The dashboard includes:
- Health check button
- JSON editors and run buttons for verify/fee/fraud/dispute flows
- `x-vapi-secret` input to test webhook-protected routes locally

## 7) Demo Payloads

Fee waiver:

```bash
curl -X POST http://localhost:3000/api/tools/request-fee-waiver \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cust_001","cardLast4":"3005","feeType":"annual","reason":"Loyal customer requesting retention help"}'
```

Fraud alert:

```bash
curl -X POST http://localhost:3000/api/tools/report-fraud-alert \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cust_001","cardLast4":"3005","suspiciousTransaction":"$412.88 at unknown electronics merchant"}'
```

Billing dispute:

```bash
curl -X POST http://localhost:3000/api/tools/open-billing-dispute \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"cust_001","cardLast4":"8891","merchant":"STREAMFLIX","amount":89.99,"transactionDate":"2026-02-01","reason":"charged after cancellation"}'
```

## 8) Hackathon Demo Flow

1. Start backend + tunnel.
2. Push assistant to Vapi.
3. Place a call from Vapi dashboard.
4. Ask agent to do one scenario (fee waiver, fraud alert, or dispute).
5. Show JSON response from backend tool as proof of action.

## Notes

- This repo uses mock customer data in `data/customers.json`.
- For production, replace file storage with a database and add compliance/legal review.
