# Voice-to-Trello AI

Voice-to-Trello AI turns a natural-language task into a structured Trello action. The user can type or speak, review the interpretation, and explicitly confirm before a Trello card is created or updated.

## Problem and solution

Manual task entry forces people to translate a thought into a title, list, deadline, and assignee. This prototype asks: **How might we reduce the friction between thinking about a task and organizing it in Trello?** It preserves the user's meaning with a structured intermediate object and a confirmation step.

## Features

- Typed commands and Groq Whisper voice transcription with an editable transcript
- AI interpretation through an OpenAI-compatible API, with a deterministic demo parser when no AI key is present
- Schema-like validation, allowed-action policy, context checks, and confirmation before mutations
- Real Trello create/update/move/assign/due-date operations when credentials are configured
- Clear demo mode when Trello credentials are missing
- Responsive dashboard and friendly error messages

## Architecture

```text
User
  ↓
Frontend (public/index.html, styles.css, app.js)
  ↓
Backend (server.js)
  ├── AI interpretation + fallback parser
  ├── intent validation and action policy
  └── Trello service requests
  ↓
Trello
```

The backend is intentionally one file for this three-day student project. Keeping secrets and mutations server-side is more important here than splitting into many modules.

## Setup

1. Install Node.js 18 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add a replacement `GROQ_API_KEY` for Groq's OpenAI-compatible API. Without it, typed demo parsing still works, but voice transcription is disabled.
5. Add `TRELLO_API_KEY`, `TRELLO_TOKEN`, and `TRELLO_BOARD_ID` for live Trello mode.
6. Run `npm start` and open `http://localhost:3000`.

### Trello setup

Create a Trello API key and token from Trello's developer API page. Find the board ID from the board URL or API. The account represented by the token must have access to the board. The application reads lists, cards, and members before executing a live action.

### AI setup

The default provider is Groq's OpenAI-compatible API. The command parser uses `openai/gpt-oss-120b` by default; set `GROQ_MODEL` to choose another supported text model. Voice recordings are sent server-side to Groq's `whisper-large-v3` transcription model, configurable with `GROQ_TRANSCRIPTION_MODEL`. The parser requests JSON, then the backend independently validates the result; the models never receive permission to call Trello. If Groq is unavailable or out of credits, typed commands fall back to the built-in parser and display a notice.

### Voice requirements

Voice transcription uses the browser `MediaRecorder` API to capture audio and the server-side Groq `whisper-large-v3` model to produce text. Microphone access usually works over localhost or HTTPS. If unavailable or not configured, type the command; typed input is the complete MVP path.

Logging: set `LOG_LEVEL=debug` in your `.env` to see verbose server logs (timestamps, request timing, and lifecycle events). The frontend prints progress and errors to the browser console. If the frontend is hosted on a different domain, set `FRONTEND_ORIGINS` to a comma-separated list of allowed origins, such as `https://v2trello.charancodes.me`.

### Vercel deployment

The Express app is exported for Vercel's serverless runtime. It only calls `app.listen()` when started directly with `npm start`, so local development and Vercel deployment use the same backend code without a legacy long-running server listener. Add the environment variables from `.env.example` in Vercel Project Settings, then redeploy after changing them.

## Example commands

- `Finish the DBMS assignment tomorrow and put it in College Tasks.`
- `Create a card called Prepare project presentation and put it in To Do.`
- `Move the DBMS presentation to Doing.`
- `Assign the project presentation to Arun.`
- `Set the deadline for the project report to Friday.`

## Security

Secrets are read only from `.env`, which is ignored by Git. The frontend never receives credentials. Input length is capped, actions are allow-listed, AI output is validated, Trello names are checked against board context, and confirmation is required before execution. This is an educational MVP, not a production authentication system.

## Known limitations and future improvements

The fallback parser intentionally supports a small demo vocabulary. Natural-language date normalization, better candidate selection, authentication, audit logs, tests, and a richer clarification UI would be good next steps. Do not claim live success while in demo mode.

## Request flow

`POST /api/interpret` receives text and returns a validated intent. The browser renders that intent as a preview. Only after the user clicks Confirm does `POST /api/execute` validate it again, retrieve Trello context, check exact list/member/card matches, and call Trello.

## Design Thinking connection

Empathize: reduce frustration with manual task entry. Define: reduce the gap between thinking and organizing. Ideate: voice, categorization, deadlines, and card updates. Prototype: this working web app. Test: use `TESTING.md` to record actual feedback; no interviews or results are fabricated here.
