const baseUrl = process.env.HATHORA_BASE_URL || "https://api.hathora.dev/v1";
const chainUrl = process.env.HATHORA_CHAIN_URL || "";

function requireApiKey() {
  const key = process.env.HATHORA_API_KEY;
  if (!key) throw new Error("Missing HATHORA_API_KEY");
  return key;
}

function maybeAuthHeaders() {
  const key = process.env.HATHORA_API_KEY;
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

export async function transcribeAudio({ audioBase64, mimeType = "audio/wav" }) {
  const apiKey = requireApiKey();
  const model = process.env.HATHORA_STT_MODEL || "deepgram:nova-2";

  const res = await fetch(`${baseUrl}/speech-to-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      audio: {
        content: audioBase64,
        mimeType
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Hathora STT failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function synthesizeSpeech({ text, voice = "alloy" }) {
  const apiKey = requireApiKey();
  const model = process.env.HATHORA_TTS_MODEL || "elevenlabs:multilingual-v2";

  const res = await fetch(`${baseUrl}/text-to-speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: text,
      voice
    })
  });

  if (!res.ok) {
    const textBody = await res.text();
    throw new Error(`Hathora TTS failed (${res.status}): ${textBody}`);
  }

  return res.json();
}

export async function processVoiceChain({
  audioBase64,
  mimeType = "audio/wav",
  sessionId,
  enableConversationHistory = true
}) {
  if (!chainUrl) {
    throw new Error("Missing HATHORA_CHAIN_URL");
  }

  if (!audioBase64) {
    throw new Error("Missing audioBase64");
  }

  const sttModel = process.env.HATHORA_STT_MODEL || "parakeet";
  const llmModel = process.env.HATHORA_LLM_MODEL || "qwen3";
  const ttsModel = process.env.HATHORA_TTS_MODEL || "kokoro";
  const resolvedSessionId = sessionId || `session-${Date.now()}`;

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const audioBlob = new Blob([audioBuffer], { type: mimeType });

  const config = {
    enableConversationHistory,
    sessionId: resolvedSessionId,
    stt: { model: sttModel },
    llm: { model: llmModel, stream: true },
    tts: { model: ttsModel }
  };

  const form = new FormData();
  form.append("file", audioBlob, "input.wav");
  form.append("config", JSON.stringify(config));

  const res = await fetch(chainUrl, {
    method: "POST",
    headers: {
      ...maybeAuthHeaders()
    },
    body: form
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Hathora chain failed (${res.status}): ${errorText}`);
  }

  const contentType = res.headers.get("content-type") || "audio/wav";
  const outputBuffer = Buffer.from(await res.arrayBuffer());

  return {
    sessionId: resolvedSessionId,
    mimeType: contentType,
    audioBase64: outputBuffer.toString("base64")
  };
}
