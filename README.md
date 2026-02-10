# Card Concierge

AI-powered voice agent that calls your credit card company and resolves issues for you.

Describe the problem — Card Concierge handles the rest: fee waivers, fraud alerts, and billing disputes, all through a single guided flow.

## How It Works

1. **Link Your Card** — Connect your credit card and select the provider
2. **Describe the Issue** — Record audio or type what happened
3. **We Solve It** — Our AI agent calls the card company and resolves it

## Tech Stack

- **Vapi** — Real-time voice calls and assistant orchestration
- **Hathora** — Unified STT/TTS model routing (Deepgram, ElevenLabs, Qwen)
- **Node + Express** — Backend API and workflow engine
- **Vanilla JS** — Lightweight frontend, no build step

## Quick Start

```bash
cp .env.example .env    # fill in your API keys
npm install
npm run dev             # starts on http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VAPI_API_KEY` | Yes | Vapi platform API key |
| `VAPI_WEBHOOK_SECRET` | Yes | Secret for webhook signature validation |
| `VAPI_ASSISTANT_ID` | Yes | Your Vapi assistant ID |
| `HATHORA_API_KEY` | Yes | Hathora API key for voice processing |
| `PORT` | No | Server port (default: `3000`) |
| `PUBLIC_BASE_URL` | No | Your public tunnel URL for Vapi webhooks |
| `VAPI_OUTBOUND_PHONE_NUMBER_ID` | No | Phone number ID for outbound calls |

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/YOUR_REPO)

```bash
npm i -g vercel
vercel
```

Add your environment variables in the Vercel dashboard under **Settings > Environment Variables**.

## Project Structure

```
├── public/             # Frontend (served as static files)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── server.js       # Express server + all API routes
│   ├── config/         # Vapi assistant configuration
│   └── lib/
│       ├── actions.js          # Card tool actions (fee waiver, fraud, dispute)
│       ├── resolution-flow.js  # Voice intake → call handling → summary
│       ├── hathora.js          # STT/TTS via Hathora
│       ├── vapi.js             # Vapi API client
│       ├── vapi-webhook.js     # Webhook handler
│       └── store.js            # Customer data store
├── data/               # Mock customer data
├── scripts/            # Vapi assistant push script
└── vercel.json         # Vercel deployment config
```

## API Endpoints

### Tool Endpoints (called by Vapi assistant)

| Endpoint | Description |
|----------|-------------|
| `POST /api/tools/verify-customer` | Verify customer identity |
| `POST /api/tools/list-cards` | List customer's credit cards |
| `POST /api/tools/request-fee-waiver` | Request annual/late fee waiver |
| `POST /api/tools/report-fraud-alert` | Lock card + file fraud case |
| `POST /api/tools/open-billing-dispute` | Open billing dispute |
| `POST /api/tools/escalate-to-human` | Escalate to human agent |

### Agent Flow

| Endpoint | Description |
|----------|-------------|
| `POST /api/agent/test-call` | Full pipeline: intake + handling + summary + optional outbound call |
| `POST /api/agent/voice-intake` | Process voice/text issue description |
| `POST /api/agent/call-handling` | Execute resolution for a session |
| `POST /api/agent/final-summary` | Generate resolution summary |

### Voice Utilities

| Endpoint | Description |
|----------|-------------|
| `POST /api/voice/transcribe` | Speech-to-text via Hathora |
| `POST /api/voice/synthesize` | Text-to-speech via Hathora |

## License

MIT
