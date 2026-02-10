const $ = (id) => document.getElementById(id);

const state = {
  recordedAudio: null,
  issues: [],
  cards: []
};

function headers() {
  const out = { "Content-Type": "application/json" };
  const secret = $("secret").value.trim();
  if (secret) out["x-vapi-secret"] = secret;
  return out;
}

function baseUrl() {
  return ($("baseUrl").value || "http://localhost:3011").replace(/\/$/, "");
}

function render(el, content) {
  el.textContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = loading ? "Running..." : label;
  if (loading) btn.classList.add("loading");
  else btn.classList.remove("loading");
}

async function apiPost(path, body) {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body)
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(json.error || json?.data?.error || `Request failed (${res.status})`);
  }
  return json.data;
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const idx = result.indexOf(",");
      if (idx === -1) return reject(new Error("Could not parse audio"));
      resolve(result.slice(idx + 1));
    };
    reader.onerror = () => reject(new Error("Audio read failed"));
    reader.readAsDataURL(blob);
  });
}

function renderIssues() {
  const root = $("issuesList");
  if (!state.issues.length) {
    root.innerHTML = '<p class="empty">No issues yet.</p>';
    return;
  }

  root.innerHTML = state.issues
    .map(
      (issue) => `
      <article class="issue ${issue.progress >= 100 ? 'issue-done' : ''}">
        <div class="issue-top">
          <span class="issue-label">${issue.label}</span>
          <span class="issue-id">${issue.id}</span>
        </div>
        ${issue.issueType ? `<span class="issue-type-badge">${issue.issueType.replace("_", " ")}</span>` : ""}
        <div class="progress"><span style="width:${issue.progress}%"></span></div>
        <div class="progress-text">${issue.progress}% - ${issue.status}</div>
        ${issue.summary ? `<div class="issue-summary">${issue.summary}</div>` : ""}
        ${issue.callId ? `<div class="issue-call-id">Call ID: ${issue.callId}</div>` : ""}
        ${issue.ticketId ? `<div class="issue-ticket">Ticket: ${issue.ticketId}</div>` : ""}
      </article>
    `
    )
    .join("");
}

function setIssueProgress(id, progress, status, extra) {
  const issue = state.issues.find((x) => x.id === id);
  if (!issue) return;
  issue.progress = progress;
  issue.status = status;
  if (extra) Object.assign(issue, extra);
  renderIssues();
}

function selectedCardLast4() {
  const sel = $("cardSelect");
  return sel.value || state.cards[0]?.cardLast4 || "3005";
}

async function connectCards() {
  const btn = $("connectCardsBtn");
  const out = $("cardsOutput");
  setLoading(btn, true, "Connect All Cards");
  render(out, "Connecting cards...");
  try {
    const data = await apiPost("/api/tools/list-cards", { customerId: $("customerId").value.trim() || "cust_001" });
    state.cards = data.cards || [];

    const sel = $("cardSelect");
    sel.innerHTML = "";
    state.cards.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.cardLast4;
      opt.textContent = `${c.issuer} - ${c.nickname} (****${c.cardLast4})${c.fraudLocked ? " [LOCKED]" : ""}`;
      sel.appendChild(opt);
    });
    sel.disabled = false;

    render(out, data);
  } catch (err) {
    render(out, `Connect failed: ${err.message}`);
  } finally {
    setLoading(btn, false, "Connect All Cards");
  }
}

let mediaRecorder;
let audioChunks = [];

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      state.recordedAudio = {
        audioBase64: await toBase64(blob),
        mimeType: blob.type || "audio/webm"
      };
      $("recordStatus").textContent = `Recorded (${state.recordedAudio.mimeType})`;
      $("recordStatus").classList.remove("recording");
    };

    mediaRecorder.start();
    $("recordStatus").textContent = "Recording...";
    $("recordStatus").classList.add("recording");
  } catch (err) {
    $("recordStatus").textContent = `Recording failed: ${err.message}`;
  }
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state !== "recording") {
    $("recordStatus").textContent = "No active recording";
    return;
  }
  mediaRecorder.stop();
  mediaRecorder.stream.getTracks().forEach((track) => track.stop());
}

async function runAgentFlow() {
  const btn = $("runIssueBtn");
  const out = $("issueOutput");
  setLoading(btn, true, "Run Agent Flow");
  render(out, "Running agent flow...");

  const issueId = `iss_${Date.now().toString().slice(-6)}`;
  state.issues.unshift({
    id: issueId,
    label: "Card Service Case",
    progress: 10,
    status: "Voice intake started"
  });
  renderIssues();

  try {
    const payload = {
      customerId: $("customerId").value.trim() || "cust_001",
      cardLast4: selectedCardLast4(),
      callToNumber: $("callToNumber").value.trim()
    };

    if (state.recordedAudio) {
      payload.audioBase64 = state.recordedAudio.audioBase64;
      payload.mimeType = state.recordedAudio.mimeType;
    } else {
      payload.transcript = $("transcript").value.trim();
    }

    setIssueProgress(issueId, 30, "Voice captured");
    const data = await apiPost("/api/agent/test-call", payload);

    setIssueProgress(issueId, 70, "Agent handled CC call");

    const resolution = data?.handled?.resolution || {};
    const summaryText = data?.summary?.summary || "Resolution generated";
    const issueType = data?.intake?.issueType || "unknown";
    const ticketId = resolution.ticketId || resolution.caseId || resolution.disputeId || null;
    const callId = data?.call?.id || null;

    setIssueProgress(issueId, 100, "Resolved", {
      summary: summaryText,
      issueType,
      ticketId,
      callId
    });

    const display = {
      sessionId: data?.intake?.sessionId,
      issueType,
      customerName: data?.summary?.customerName,
      cardLast4: data?.intake?.cardLast4,
      summary: summaryText,
      outcome: resolution.approved !== undefined
        ? (resolution.approved ? "Approved" : "Denied")
        : (resolution.disputeId ? "Dispute filed" : resolution.caseId ? "Alert filed" : "Processed"),
      ticketId,
      callId
    };
    render(out, display);
  } catch (err) {
    setIssueProgress(issueId, 100, `Failed: ${err.message}`);
    render(out, `Flow failed: ${err.message}`);
  } finally {
    setLoading(btn, false, "Run Agent Flow");
  }
}

async function checkHealth() {
  const btn = $("healthBtn");
  const out = $("cardsOutput");
  setLoading(btn, true, "Check Health");
  try {
    const res = await fetch(`${baseUrl()}/health`);
    const data = await res.json();
    render(out, data);
  } catch (err) {
    render(out, `Health failed: ${err.message}`);
  } finally {
    setLoading(btn, false, "Check Health");
  }
}

$("connectCardsBtn").addEventListener("click", connectCards);
$("startRecording").addEventListener("click", startRecording);
$("stopRecording").addEventListener("click", stopRecording);
$("runIssueBtn").addEventListener("click", runAgentFlow);
$("healthBtn").addEventListener("click", checkHealth);

renderIssues();
