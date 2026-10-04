# Learning Guide

## The big picture

The **frontend** is the HTML, CSS, and browser JavaScript that the user sees. The **backend** is the Node.js program that receives requests, keeps secrets, validates actions, and talks to Trello. An **API** is a set of URLs and rules that let programs communicate. HTTP is the request/response protocol used by the browser and server.

This project uses `GET` to read data such as status and `POST` to send a command or perform an action. **JSON** is a text format for objects and arrays, used to move structured data between frontend and backend. `fetch()` sends HTTP requests from browser JavaScript. `async`/`await` lets JavaScript wait for a Promise (a value that will arrive later) without deeply nested callbacks.

## How a command travels

1. `public/index.html` provides semantic sections, labels, buttons, and a textarea.
2. `public/app.js` reads the textarea and sends `POST /api/interpret`.
3. `server.js` uses the AI service or fallback parser to create an intent object.
4. Validation rejects unsupported actions or missing required fields.
5. The frontend shows the interpretation and waits for confirmation.
6. Confirmation sends the same intent to `POST /api/execute`.
7. The backend checks Trello context and then calls Trello only if the request is safe.
8. The response becomes a success or error message in the UI.

## Important files

| File | Purpose | Input / output | Important functions and connections |
|---|---|---|---|
| `server.js` | Express backend, parser, validation, Trello adapter | HTTP JSON in; HTTP JSON out | `interpretCommand`, `validateIntent`, `getTrelloContext`, `executeIntent`; serves `public/` |
| `public/index.html` | Semantic page structure | Browser loads HTML | Labels connect to controls; sections represent workflow stages |
| `public/styles.css` | Layout and visual design | HTML classes in; styled page out | CSS variables, flexbox, grid, responsive media query |
| `public/app.js` | Browser interactions | User events in; fetch requests and DOM updates out | `processCommand`, `renderIntent`, `startSpeech`, `transcribeRecording`; calls backend endpoints |
| `.env` | Local secrets/configuration | Environment variables in | Never send this file to the browser or Git |
| `TESTING.md` | Test checklist | Human test observations | Fill in actual results during the demonstration |

## Why structured output and validation matter

An LLM predicts text; it is not an authorization system. The backend converts its answer into a small known shape, checks the allowed action list, checks required fields, and compares names against Trello context. This is safer than letting model text directly become an API call. The confirmation step gives the human the final decision.

## Trello and secrets

Trello's API uses an API key and token. The backend includes them in server-side requests. They must stay on the backend because frontend JavaScript is visible to every browser user. In demo mode, the application returns a clearly labeled simulation and never claims that a real Trello card exists.

## Voice transcription

The browser's `MediaRecorder` API captures microphone audio as a `Blob`. The browser sends that file to `POST /api/transcribe`; the backend adds the secret Groq authorization header and asks `whisper-large-v3` to convert audio into text. Keeping the API call on the backend prevents the key from being exposed in browser code. Browser recording support is not universal, so a typed command is always available.

## Failure handling

Empty input, malformed AI data, unknown actions, missing cards, unknown lists/members, network failures, unsupported speech, and missing credentials produce a friendly message. Detailed secrets and stack traces are not sent to the browser.
