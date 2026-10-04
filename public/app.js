const commandInput = document.querySelector("#commandInput");
const transcript = document.querySelector("#transcript");
const processButton = document.querySelector("#processButton");
const speakButton = document.querySelector("#speakButton");
const stopButton = document.querySelector("#stopButton");
const speechHelp = document.querySelector("#speechHelp");
const voiceStatus = document.querySelector("#voiceStatus");
const captureStatus = document.querySelector("#captureStatus");
const modeBadge = document.querySelector("#modeBadge");
const message = document.querySelector("#message");
const interpretationPanel = document.querySelector("#interpretationPanel");
const previewPanel = document.querySelector("#previewPanel");
let currentIntent = null;
let mediaRecorder = null;
let audioChunks = [];
let microphoneStream = null;

const showMessage = (text, type) => {
  message.textContent = text;
  message.className = `message show ${type}`;
};

const displayValue = (value) => value || "Not specified";

const renderIntent = (intent) => {
  const labels = { action: "Action", title: "Title", targetCardQuery: "Target card", listName: "List", dueDate: "Due date", dueTime: "Due time", memberName: "Member", description: "Description", confidence: "Confidence" };
  const interpretation = document.querySelector("#interpretation");
  interpretation.replaceChildren();
  Object.entries(labels).forEach(([key, label]) => {
    const detail = document.createElement("div");
    const heading = document.createElement("strong");
    const value = document.createElement("span");
    heading.textContent = label;
    value.textContent = key === "confidence" ? `${Math.round((intent[key] || 0) * 100)}%` : displayValue(intent[key]);
    detail.className = "detail";
    detail.append(heading, value);
    interpretation.append(detail);
  });
  document.querySelector("#previewText").textContent = intent.action === "create_card"
    ? `Create "${intent.title}"${intent.listName ? ` in ${intent.listName}` : ""}${intent.dueDate ? ` with a due date of ${intent.dueDate}` : ""}.`
    : `Apply "${intent.action.replaceAll("_", " ")}" to "${intent.targetCardQuery}".`;
  interpretationPanel.classList.remove("hidden");
  previewPanel.classList.remove("hidden");
};

const processCommand = async () => {
  console.log(new Date().toISOString(), '[app] processCommand called');
  const command = commandInput.value.trim();
  if (!command) return showMessage("Please enter or speak a command first.", "error");
  processButton.disabled = true;
  showMessage("Understanding your command...", "success");
  console.debug(new Date().toISOString(), '[app] sending interpret request', { snippet: command.slice(0,160) });
  transcript.textContent = command;
  try {
    const response = await fetch("/api/interpret", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    currentIntent = data.intent;
    renderIntent(currentIntent);
    showMessage(currentIntent.parserNotice || "Review the interpretation, then confirm if it is correct.", "success");
  } catch (error) { showMessage(error.message, "error"); } finally { processButton.disabled = false; }
};

const transcribeRecording = async () => {
  console.log(new Date().toISOString(), '[app] transcribeRecording: preparing upload', { chunks: audioChunks.length });
  voiceStatus.textContent = "Transcribing...";
  captureStatus.textContent = "Sending your recording to Groq Whisper...";
  captureStatus.className = "capture-status listening";
  const audioBlob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
  const formData = new FormData();
  formData.append("audio", audioBlob, "voice-command.webm");

  try {
    console.debug(new Date().toISOString(), '[app] uploading audio to /api/transcribe');
    const response = await fetch("/api/transcribe", { method: "POST", body: formData });
    const data = await response.json();
    console.debug(new Date().toISOString(), '[app] transcribe response', { ok: response.ok, dataSummary: data?.transcript?.slice?.(0,120) });
    if (!response.ok) throw new Error(data.error);
    commandInput.value = data.transcript;
    transcript.textContent = data.transcript;
    captureStatus.textContent = `Transcript captured with ${data.model}. Edit it if needed, then click Process command.`;
    captureStatus.className = "capture-status captured";
    showMessage("Voice command transcribed. Review it before processing.", "success");
  } catch (error) {
    console.error(new Date().toISOString(), '[app] transcribe failed', error);
    captureStatus.textContent = error.message;
    captureStatus.className = "capture-status";
    showMessage(error.message, "error");
  } finally {
    voiceStatus.textContent = "Ready";
    speakButton.disabled = false;
    stopButton.disabled = true;
    mediaRecorder = null;
  }
};

const startSpeech = async () => {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    return showMessage("Audio recording is not supported in this browser. You can type instead.", "error");
  }

  commandInput.focus();
  transcript.textContent = "Listening for your voice...";
  captureStatus.textContent = "Microphone is starting...";
  captureStatus.className = "capture-status listening";
  showMessage("Microphone active. Speak now.", "success");

  try {
    console.log(new Date().toISOString(), '[app] requesting microphone');
    microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log(new Date().toISOString(), '[app] microphone stream obtained');
    mediaRecorder = new MediaRecorder(microphoneStream);
    audioChunks = [];
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", transcribeRecording, { once: true });
    mediaRecorder.start();
    console.log(new Date().toISOString(), '[app] mediaRecorder started', { mimeType: mediaRecorder.mimeType });
    voiceStatus.textContent = "Recording...";
    captureStatus.textContent = "Recording... click Stop recording when you are finished.";
    speakButton.disabled = true;
    stopButton.disabled = false;
  } catch (error) {
    console.error(new Date().toISOString(), '[app] microphone start failed', error);
    microphoneStream?.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
    const errorMessage = error.name === "NotAllowedError"
      ? "Microphone permission was denied. Allow microphone access in the browser address bar."
      : "The microphone could not be started. You can type the command instead.";
    captureStatus.textContent = errorMessage;
    captureStatus.className = "capture-status";
    showMessage(errorMessage, "error");
  }
};

document.querySelectorAll(".example").forEach((button) => button.addEventListener("click", () => {
  commandInput.value = button.textContent;
  transcript.textContent = button.textContent;
  console.log(new Date().toISOString(), '[app] example injected', { text: button.textContent.slice(0,120) });
}));
processButton.addEventListener("click", processCommand);
speakButton.addEventListener("click", startSpeech);
stopButton.addEventListener("click", () => {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  console.log(new Date().toISOString(), '[app] stopping recording', { chunks: audioChunks.length });
  mediaRecorder.stop();
  microphoneStream?.getTracks().forEach((track) => track.stop());
  microphoneStream = null;
  captureStatus.textContent = "Recording stopped. Preparing your transcript...";
});
commandInput.addEventListener("input", () => { transcript.textContent = commandInput.value || "Your typed or spoken command will appear here."; });
document.querySelector("#cancelButton").addEventListener("click", () => {
  currentIntent = null;
  previewPanel.classList.add("hidden");
  interpretationPanel.classList.add("hidden");
  showMessage("Action cancelled. Nothing was changed.", "success");
  console.log(new Date().toISOString(), '[app] user cancelled action');
});
document.querySelector("#confirmButton").addEventListener("click", async () => {
  if (!currentIntent) return;
  console.log(new Date().toISOString(), '[app] confirmButton clicked', { intent: currentIntent });
  const button = document.querySelector("#confirmButton");
  button.disabled = true;
  try {
    console.debug(new Date().toISOString(), '[app] sending execute request');
    const response = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: currentIntent }) });
    const data = await response.json();
    console.debug(new Date().toISOString(), '[app] execute response', { ok: response.ok, data });
    if (!response.ok) throw new Error(data.error);
    showMessage(`${data.message} ${data.demoMode ? "This was simulated because Trello credentials are not configured." : ""}`, "success");
    previewPanel.classList.add("hidden");
  } catch (error) { console.error(new Date().toISOString(), '[app] execute failed', error); showMessage(error.message, "error"); } finally { button.disabled = false; }
});

fetch("/api/status").then((response) => response.json()).then((status) => {
  console.log(new Date().toISOString(), '[app] /api/status', status);
  modeBadge.textContent = status.demoMode ? "DEMO MODE" : "LIVE TRELLO MODE";
  if (!status.transcriptionConfigured) {
    speechHelp.textContent = "Groq credentials are not configured. Add GROQ_API_KEY to .env to enable Whisper voice transcription.";
    speakButton.disabled = true;
  }
}).catch((err) => { console.error(new Date().toISOString(), '[app] /api/status failed', err); modeBadge.textContent = "Backend unavailable"; });
