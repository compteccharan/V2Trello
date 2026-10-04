require("dotenv").config();

// Simple leveled logger (set LOG_LEVEL=debug for verbose output)
const LOG_LEVEL = process.env.LOG_LEVEL || "info"; // error, warn, info, debug
const _levels = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, ...msg) {
  try {
    if ((_levels[level] ?? 2) <= (_levels[LOG_LEVEL] ?? 2)) {
      console.log(new Date().toISOString(), `[${level.toUpperCase()}]`, ...msg);
    }
  } catch (e) {
    console.log(new Date().toISOString(), "[ERROR] Logger failed", e);
  }
}


const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const allowedActions = ["create_card", "update_card", "move_card", "assign_member", "set_due_date"];
const maxAudioSize = 19.5 * 1024 * 1024;
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxAudioSize }
});
const maxCommandLength = 1200;

app.use(express.json({ limit: "20kb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  res.on("finish", () => {
    log("info", "request completed", {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });
  next();
});
app.use(express.static(path.join(__dirname, "public")));
log('info', 'Express static and JSON middleware configured');

const hasTrelloCredentials = () =>
  Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_BOARD_ID);
log('debug', 'Trello credentials present?', Boolean(process.env.TRELLO_API_KEY && process.env.TRELLO_TOKEN && process.env.TRELLO_BOARD_ID));

function cleanString(value, maxLength = 500) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : null;
}

function validateIntent(rawIntent) {
  if (!rawIntent || typeof rawIntent !== "object") {
    throw new Error("The AI response was not a valid object.");
  }

  const intent = {
    action: cleanString(rawIntent.action, 40),
    title: cleanString(rawIntent.title, 200),
    description: cleanString(rawIntent.description, 1000),
    listName: cleanString(rawIntent.listName, 100),
    dueDate: cleanString(rawIntent.dueDate, 30),
    dueTime: cleanString(rawIntent.dueTime, 10),
    memberName: cleanString(rawIntent.memberName, 100),
    targetCardQuery: cleanString(rawIntent.targetCardQuery, 200),
    confidence: typeof rawIntent.confidence === "number" ? rawIntent.confidence : 0,
    needsClarification: rawIntent.needsClarification === true,
    clarificationQuestion: cleanString(rawIntent.clarificationQuestion, 300)
  };

  if (!allowedActions.includes(intent.action)) {
    throw new Error("This command requested an unsupported action.");
  }
  if (intent.confidence < 0 || intent.confidence > 1) {
    throw new Error("The AI confidence value was invalid.");
  }

  const needsTarget = ["update_card", "move_card", "assign_member", "set_due_date"].includes(intent.action);
  if (needsTarget && !intent.targetCardQuery) {
    throw new Error("An existing card must be identified before it can be changed.");
  }
  if (intent.action === "create_card" && !intent.title) {
    throw new Error("A new card needs a title.");
  }
  if (["move_card", "update_card"].includes(intent.action) && !intent.listName && intent.action === "move_card") {
    throw new Error("A destination list is required to move a card.");
  }
  if (intent.action === "assign_member" && !intent.memberName) {
    throw new Error("A member is required for assignment.");
  }
  if (intent.needsClarification && !intent.clarificationQuestion) {
    throw new Error("Clarification was requested without a question.");
  }
  return intent;
}

function fallbackParse(command) {
  const text = command.trim();
  const lower = text.toLowerCase();
  const listMatch = text.match(/\b(?:in|into|put it in|move it to|to)\s+["']?([^."']+)["']?\.?$/i);
  const listName = listMatch ? listMatch[1].trim() : null;
  const dateMatch = lower.match(/\b(today|tomorrow|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/);
  const targetMatch = text.match(/\b(?:the|that|this)\s+(.+?)(?:\s+to\s+|\s+and\s+|\s*$)/i);

  if (lower.startsWith("move ")) {
    return validateIntent({
      action: "move_card",
      targetCardQuery: text.replace(/^move\s+/i, "").split(/\s+to\s+/i)[0].trim(),
      listName,
      confidence: 0.78,
      needsClarification: false
    });
  }
  if (lower.includes("assign") && lower.includes(" to ")) {
    const memberName = text.split(/\s+to\s+/i).pop().replace(/[.!?]+$/, "").trim();
    return validateIntent({
      action: "assign_member",
      targetCardQuery: targetMatch ? targetMatch[1].trim() : text.replace(/^assign\s+/i, "").split(/\s+to\s+/i)[0].trim(),
      memberName,
      confidence: 0.74,
      needsClarification: false
    });
  }
  if (lower.startsWith("set the deadline") || lower.startsWith("set a deadline")) {
    return validateIntent({
      action: "set_due_date",
      targetCardQuery: text.replace(/^set (the )?deadline for\s+/i, "").split(/\s+to\s+/i)[0].trim(),
      dueDate: dateMatch ? dateMatch[1] : null,
      confidence: dateMatch ? 0.72 : 0.35,
      needsClarification: !dateMatch,
      clarificationQuestion: dateMatch ? null : "What date should I use?"
    });
  }

  const title = text
    .replace(/\b(?:tomorrow|today|on friday|before \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/gi, "")
    .replace(/\s+(?:and\s+)?(?:put|place)\s+(?:it\s+)?in\s+.+$/i, "")
    .replace(/^create a card called\s+/i, "")
    .trim()
    .replace(/[.!?]+$/, "");

  return validateIntent({
    action: "create_card",
    title: title || text,
    description: text,
    listName,
    dueDate: dateMatch ? dateMatch[1] : null,
    confidence: listName || dateMatch ? 0.7 : 0.52,
    needsClarification: false
  });
}

async function interpretCommand(command) {
  log('info', 'interpretCommand called');
  log('debug', 'interpretCommand input', { length: (command || '').length, snippet: (command || '').slice(0, 160) });
  if (!process.env.GROQ_API_KEY) return fallbackParse(command);

  const prompt = `Convert the user's command into JSON only. Never invent names, dates, or actions. Allowed actions: ${allowedActions.join(", ")}.
Return keys: action, title, description, listName, dueDate, dueTime, memberName, targetCardQuery, confidence, needsClarification, clarificationQuestion.
For ambiguous existing-card requests set needsClarification=true. User command: ${command}`;
  log('debug', 'Sending prompt to Groq', { model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', promptSnippet: prompt.slice(0,200) });
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a cautious task parser. Preserve negations and deadlines. Output JSON only." },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!response.ok) {
    const status = response.status;
    const providerError = await response.json().catch(() => ({}));
    log('warn', 'Groq parser non-OK response', { status, providerError: providerError.error?.code || providerError.error?.message || '(no detail)' });
    const fallbackIntent = fallbackParse(command);
    fallbackIntent.parserNotice = providerError.error?.code === "credit_balance_exhausted"
      ? "AI credits are exhausted, so the built-in demo parser was used."
      : "The AI service was unavailable, so the built-in demo parser was used.";
    return fallbackIntent;
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  log('debug', 'Groq parser body keys', Object.keys(body || {}));
  if (!content) {
    log('error', 'Groq parser returned empty content');
    throw new Error("The AI service returned an empty response.");
  }
  log('info', 'Groq parser returned content length', (content || '').length);
  return validateIntent(JSON.parse(content));
}

async function transcribeAudio(file) {
  log('info', 'transcribeAudio called');
  log('debug', 'transcribeAudio file', { originalname: file.originalname, mimetype: file.mimetype, size: file.size });
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Groq credentials are not configured. Add GROQ_API_KEY to .env before using voice transcription.");
  }

  const form = new FormData();
  const audio = new Blob([file.buffer], { type: file.mimetype || "application/octet-stream" });
  form.append("file", audio, file.originalname || "voice-command.webm");
  form.append("model", process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3");
  form.append("response_format", "json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form
  });
  if (!response.ok) {
    const providerError = await response.json().catch(() => ({}));
    throw new Error(providerError.error?.message || "Groq could not transcribe the audio.");
  }

  const body = await response.json();
  const text = cleanString(body.text, maxCommandLength);
  if (!text) throw new Error("Groq returned an empty transcript. Please try speaking again.");
  return text;
}
async function trelloRequest(endpoint, options = {}) {
  log('info', 'trelloRequest', { endpoint, method: options.method || 'GET' });
  const url = new URL(`https://api.trello.com/1/${endpoint}`);
  url.searchParams.set("key", process.env.TRELLO_API_KEY);
  url.searchParams.set("token", process.env.TRELLO_TOKEN);
  const request = { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } };
  if (request.body) {
    const body = JSON.parse(request.body);
    log('debug', 'trelloRequest params', Object.keys(body).length ? body : '(none)');
    Object.entries(body).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    delete request.body;
  }
  const response = await fetch(url, request);
  if (!response.ok) {
    const text = await response.text().catch(() => '(no body)');
    log('error', 'Trello request failed', { endpoint, status: response.status, body: text });
    throw new Error("Trello returned an error while processing the request.");
  }
  log('debug', 'Trello request successful', { endpoint });
  return response.json();
}

function normalizeDueDate(value) {
  if (!value) return null;
  const lower = value.toLowerCase();
  const today = new Date();
  if (lower === "today") return today.toISOString().slice(0, 10);
  if (lower === "tomorrow") {
    today.setDate(today.getDate() + 1);
    return today.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

async function getTrelloContext() {
  if (!hasTrelloCredentials()) {
    log('info', 'getTrelloContext using demo mode');
    return { demoMode: true, lists: ["To Do", "Doing", "Done", "College Tasks"], members: ["Arun", "Rahul"], cards: [] };
  }
  log('info', 'getTrelloContext fetching live Trello context');
  const [lists, cards, members] = await Promise.all([
    trelloRequest(`boards/${process.env.TRELLO_BOARD_ID}/lists`),
    trelloRequest(`boards/${process.env.TRELLO_BOARD_ID}/cards`),
    trelloRequest(`boards/${process.env.TRELLO_BOARD_ID}/members`)
  ]);
  log('debug', 'getTrelloContext counts', { lists: lists.length, cards: cards.length, members: members.length });
  return {
    demoMode: false,
    lists: lists.map((item) => ({ id: item.id, name: item.name })),
    cards: cards.map((item) => ({ id: item.id, name: item.name, idList: item.idList, url: item.url })),
    members: members.map((item) => ({ id: item.id, name: item.fullName, username: item.username }))
  };
}

function findExact(items, name) {
  return items.find((item) => (typeof item === "string" ? item : item.name).toLowerCase() === name.toLowerCase());
}

async function executeIntent(intent) {
  const context = await getTrelloContext();
  if (context.demoMode) {
    return { demoMode: true, message: "Demo mode: no Trello card was changed.", card: { name: intent.title || intent.targetCardQuery, list: intent.listName } };
  }

  const list = intent.listName ? findExact(context.lists, intent.listName) : null;
  if (intent.listName && !list) throw new Error(`No Trello list named "${intent.listName}" was found.`);
  const member = intent.memberName ? findExact(context.members, intent.memberName) : null;
  if (intent.memberName && !member) throw new Error(`No board member named "${intent.memberName}" was found.`);
  const candidates = context.cards.filter((card) => card.name.toLowerCase().includes((intent.targetCardQuery || "").toLowerCase()));
  if (intent.targetCardQuery && candidates.length !== 1) {
    throw new Error(candidates.length ? "More than one matching card was found. Please be more specific." : "No matching Trello card was found.");
  }

  if (intent.action === "create_card") {
    const params = new URLSearchParams({ idList: list?.id || context.lists[0].id, name: intent.title });
    if (intent.description) params.set("desc", intent.description);
    const dueDate = normalizeDueDate(intent.dueDate);
    if (dueDate) params.set("due", dueDate);
    const card = await trelloRequest("cards", { method: "POST", body: JSON.stringify(Object.fromEntries(params)) });
    return { demoMode: false, message: "Card created successfully.", card };
  }

  const card = candidates[0];
  const updates = {};
  if (list) updates.idList = list.id;
  if (intent.title && intent.action === "update_card") updates.name = intent.title;
  if (intent.description && intent.action === "update_card") updates.desc = intent.description;
  const dueDate = normalizeDueDate(intent.dueDate);
  if (dueDate) updates.due = dueDate;
  if (Object.keys(updates).length) await trelloRequest(`cards/${card.id}`, { method: "PUT", body: JSON.stringify(updates) });
  if (member) await trelloRequest(`cards/${card.id}/idMembers`, { method: "POST", body: JSON.stringify({ value: member.id }) });
  return { demoMode: false, message: "Trello card updated successfully.", card: { ...card, ...updates } };
}

app.get("/api/status", (req, res) => {
  log('info', '/api/status requested');
  res.json({
    demoMode: !hasTrelloCredentials(),
    aiConfigured: Boolean(process.env.GROQ_API_KEY),
    transcriptionConfigured: Boolean(process.env.GROQ_API_KEY)
  });
});

app.get("/api/context", async (req, res) => {
  try {
    res.json(await getTrelloContext());
  } catch (error) {
    log("error", "context lookup failed", error.message);
    res.status(502).json({ error: error.message });
  }
});

app.post("/api/interpret", async (req, res) => {
  const command = cleanString(req.body?.command, maxCommandLength);
  log('info', '/api/interpret called');
  log('debug', 'interpret payload snippet', { snippet: (command || '').slice(0,200) });
  if (!command) return res.status(400).json({ error: "Please enter a command first." });
  try { res.json({ intent: await interpretCommand(command) }); } catch (error) { log('error', 'interpret failed', error.message); res.status(422).json({ error: error.message }); }
});

app.post("/api/transcribe", uploadAudio.single("audio"), async (req, res) => {
  log('info', '/api/transcribe called');
  if (!req.file) {
    log('warn', '/api/transcribe missing file');
    return res.status(400).json({ error: "Please record or select an audio file first." });
  }
  log('debug', 'received audio file', { originalname: req.file.originalname, size: req.file.size, mimetype: req.file.mimetype });
  try {
    const transcript = await transcribeAudio(req.file);
    log('info', 'transcription completed', { length: transcript.length });
    res.json({ transcript, model: process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3" });
  } catch (error) { log('error', 'transcription failed', error.message); res.status(422).json({ error: error.message }); }
});

app.post("/api/execute", async (req, res) => {
  log('info', '/api/execute called');
  log('debug', 'execute payload keys', Object.keys(req.body || {}));
  try {
    const intent = validateIntent(req.body?.intent);
    log('info', 'Executing intent', { action: intent.action, title: intent.title || '(none)', target: intent.targetCardQuery || '(none)' });
    const result = await executeIntent(intent);
    log('info', 'executeIntent result', { message: result.message, demoMode: result.demoMode });
    res.json(result);
  } catch (error) { log('error', '/api/execute failed', error.message); res.status(422).json({ error: error.message }); }
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const isUploadLimit = error.code === "LIMIT_FILE_SIZE";
  const status = isUploadLimit ? 413 : error.statusCode || error.status || 500;
  const message = isUploadLimit
    ? "Audio file is too large. Please record a shorter voice command."
    : status >= 500
      ? "The server could not complete the request."
      : error.message;
  log("error", "unhandled request error", {
    method: req.method,
    path: req.path,
    status,
    message: error.message
  });
  res.status(status).json({ error: message });
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => log('info', `Voice-to-Trello AI running at http://localhost:${port}`));
}
