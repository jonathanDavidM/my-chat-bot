# Core Components

A breakdown of every meaningful piece of this project — what it is, what it does, and how it connects to everything else.

---

## Frontend

### `src/components/ChatWidget.tsx`
The entire visible UI of the agent. Renders a floating button in the bottom-right corner. When clicked, it opens a chat panel with the message list, a typing indicator, an input field, and **tool-activity chips** that appear above an assistant message while tools are running (spinning loader → green check or red alert). Friendly labels for each tool are defined in `TOOL_LABELS` at the top of the file. Purely presentational — all state comes from the `useChatWidget` hook.

**Connects to:** `useChatWidget.ts` (state + actions), `ask-me-bubble.png` / `ask-me-logo.png` (icons)

---

### `src/hooks/useChatWidget.ts`
The brain of the frontend. Manages:
- The list of messages displayed in the widget (each can carry a `toolActivity` array)
- Loading state (typing dots while waiting)
- The session ID (generated once per browser tab, stored in `sessionStorage`)
- The `sendMessage` function that streams from the backend and progressively reveals tokens via a `setInterval` typewriter effect
- The `onTool` callback that appends/updates tool-activity chips on the active assistant message

This hook is the only place in the frontend that talks to the server.

**Connects to:** `src/lib/api.ts` (SSE client), `ChatWidget.tsx` (consumed by)

---

### `src/lib/api.ts`
The SSE client. Exports `streamChatMessage({ message, sessionId, history, onChunk, onTool, signal })` which:
- POSTs to `/api/chat/send` with `Content-Type: application/json`
- Parses the SSE stream (`data: <json>\n\n` frames)
- Routes text deltas to `onChunk` and tool events to `onTool`
- Stops on `data: [DONE]` or throws on `data: {"error": ...}`

Also handles backend URL resolution:
1. `window.__CHAT_WIDGET_API_URL__` — set externally when embedding
2. `import.meta.env.VITE_API_URL` — set at build time
3. `http://localhost:3002` — default for local dev

**Connects to:** `useChatWidget.ts` (called by), backend `/api/chat/send` (streams from)

---

### `src/embed.tsx`
The entry point for the standalone embeddable version. Instead of rendering into an existing `#root`, it creates its own `<div id="jonathan-chat-widget">` and mounts `ChatWidget` into it. Lets the widget be dropped into any third-party website with one `<script>` tag.

**Connects to:** `ChatWidget.tsx` (mounts it), `vite.embed.config.ts` (built by)

---

### `src/App.tsx`
A simple demo/preview page used during local development. Not part of the embeddable bundle.

---

## Backend

### `server/src/index.ts`
The Express server entry point (local dev only). Sets up an origin-guarding CORS middleware (localhost/127.0.0.1 origins are always allowed; `ALLOWED_ORIGINS` gates additional production origins), registers the chat routes, exposes `/api/health`, and listens on the configured `PORT` (default `3002`).

**Connects to:** `chat.routes.ts` (registers), `chat-handler.ts` (origin resolver), `server/.env` (config)

---

### `server/src/routes/chat.routes.ts`
Declares the API surface for the standalone Express server. Currently defines:
- `POST /api/chat/send` → `chat.controller.ts`

---

### `server/src/controllers/chat.controller.ts`
The request gatekeeper for the Express path. Before anything reaches the agent:
- Per-IP rate limit (20 req/min, in-memory) — returns `429` with `Retry-After` when exceeded
- Validates body against `chatRequestSchema` (Zod) — `400` on bad input
- Sets SSE headers and flushes them
- Iterates the `streamChat` generator and writes each event as `data: <json>\n\n`:
  - `{ chunk: "..." }` for text deltas
  - `{ tool: { name, status, detail } }` for tool events
- Closes with `data: [DONE]` or `data: {"error": "stream_failed"}` on exception

**Connects to:** `chat-handler.ts` (delegates to `streamChat`)

---

### `api/chat/send.ts`
The Vercel serverless function — a near-duplicate of `chat.controller.ts` that runs in production on Vercel. Same validation, same SSE event shape, same rate limiter (though note: serverless rate limits are per-instance, so behavior in prod is best-effort).

**Connects to:** `chat-handler.ts` (delegates to `streamChat`)

---

### `server/src/lib/chat-handler.ts`
**The agent core.** Exports `streamChat(input)`, an async generator that yields a discriminated union of `{ type: "text", value }` or `{ type: "tool", name, status, detail? }` events.

What it does, per request:
1. Builds the message array: `system` (knowledge + tool instructions) + history + user message.
2. Enters an **agent loop** (up to `MAX_TOOL_ITERATIONS = 4`):
   - Calls Groq with `tools` and `tool_choice: "auto"`, streaming enabled.
   - For each streamed chunk:
     - Forwards content deltas as `text` events — with a small lookahead buffer that holds back the last `"<function".length` chars in case an inline-call tag is starting.
     - If the lookahead detects `<function`, switches to **suppress mode**: stops forwarding text, accumulates everything for parsing later.
     - Accumulates streamed `tool_calls` by index.
   - After the stream ends, picks one of:
     - **Structured tool calls** (the normal Groq path) — preferred
     - **Inline tool calls** parsed from the suppressed text via regex (handles three Llama-style XML variants)
     - **No tool calls** — return; the conversation turn is done.
   - Strips inline tags from the assistant content before pushing it back into `messages` so the model doesn't see and replicate its own malformed pattern.
   - Yields `running` / `done` / `error` tool events, executes each call via `executeToolCall`, pushes the JSON-serialized result as a `tool` message, loops.
3. If the loop exhausts iterations without a final text answer, yields a fallback note to the user.

Also exports `chatRequestSchema`, `checkRateLimit`, `resolveAllowedOrigin`, `MAX_MESSAGE_LENGTH`, and the `ChatEvent` type — these are reused by both the Express controller and the Vercel handler.

**Connects to:** `tools/index.ts` (tool schemas + executor), `knowledge/jonathan.ts` + `knowledge/compiled-docs.ts` (system prompt), Groq API

---

### `server/src/tools/index.ts`
**The tool registry.** Defines and executes the agent's tools.

Exports:
- `TOOLS: ToolDefinition[]` — full metadata for each tool (name, description, JSON-Schema parameters for Groq, Zod schema for validation, executor)
- `TOOL_SCHEMAS_FOR_GROQ` — the subset that gets sent to the API (`{ type: "function", function: { ... } }`)
- `executeToolCall(name, rawArgs)` — looks up a tool by name, parses `rawArgs` as JSON, and runs the executor. Returns `{ ok: false, error }` for unknown tools or malformed arguments — never throws.

Tools currently registered:
- **`get_github_activity`** — fetches `https://api.github.com/users/jonathanDavidM/events/public` (unauthenticated, 6s timeout, ~60 req/hr/IP). Returns the 8 most recent events with type, repo, timestamp, and commit messages.
- **`get_project_details`** — looks up a slug (`wtg`, `portfolio`, `ams-shop`, `invitation`, `chatbot`) in the in-file `PROJECTS` map. Returns stack, description, repo URL, and highlights.
- **`send_contact_message`** — Zod-validates `{ name, email, message }`, applies a best-effort per-instance send cap + dedupe, logs a PII-redacted summary, and if `RESEND_API_KEY` is set sends an email via Resend (configurable `RESEND_FROM` and `CONTACT_RECIPIENT`). Without the key it returns `{ ok: true, delivered: false }`.

**Connects to:** `chat-handler.ts` (consumed by the agent loop), Resend API, GitHub API

---

### `server/src/knowledge/jonathan.ts`
The static system-prompt seed. Hard-coded information about Jonathan: name, contact details, skills, projects, and response-style rules ("2–4 sentences", "ground claims in the source documents"). This is the primary identity layer.

**Connects to:** `chat-handler.ts` (prepended to every Groq call)

---

### `server/src/knowledge/compiled-docs.ts`
Auto-generated — do not edit manually. Contains the parsed text of every file in `server/docs/` (currently the CV PDF and "About me" document). Regenerated by `scripts/build-knowledge.mjs` at build time. Appended after `jonathan.ts` in the system prompt as "Source Documents" the model should treat as ground truth.

**Connects to:** `chat-handler.ts` (imported), `scripts/build-knowledge.mjs` (generated by)

---

## Build & Config

### `scripts/build-knowledge.mjs`
Pre-build Node script. Reads every file in `server/docs/`, extracts text (via inlined helpers backed by `pdf-parse` and `mammoth`), and writes the result into `server/src/knowledge/compiled-docs.ts` as an exported template string. Runs automatically as the first step of the Vercel build pipeline.

**Connects to:** `compiled-docs.ts` (writes to)

---

### `vite.config.ts`
Configures the main frontend build: React plugin (Fast Refresh), Tailwind CSS plugin, `@/` path alias → `src/`. Used by `npm run dev` and `npm run build`.

---

### `vite.embed.config.ts`
Separate Vite config for the embeddable widget. Key differences:
- Entry point is `src/embed.tsx` instead of `index.html`
- Output format is **IIFE** so it runs without a bundler
- Outputs to `dist-embed/` instead of `dist/`
- Produces `chat-widget.iife.js` and `chat-widget.css`

---

### `vercel.json`
Tells Vercel how to build and serve this project:
- **Build command:** runs `build-knowledge.mjs` → main build → embed build → copies embed bundle into `dist/embed/`
- **Output directory:** `dist/`
- **Framework:** Vite
- **Rewrites:** `/api/*` → Vercel serverless functions in `api/`

---

## How They All Connect

```
server/docs/                            server/.env
    └─[build time]─► build-knowledge.mjs    │
                          └─► compiled-docs.ts
                                    │
                          jonathan.ts (knowledge + tool instructions)
                                    │
                          [combined system prompt]
                                    ▼
Browser                       chat-handler.ts (streamChat generator)
  └─ ChatWidget.tsx                 │
       └─ useChatWidget.ts          │   ┌──► Groq API (Llama 3.3 70B, tool_choice: auto)
            └─ api.ts (SSE) ───►    │◄──┤
                  POST /api/        ▼   ├──► tools/index.ts ──► GitHub API
                  chat/send         │   │                       Resend API
                                    │   └──── tool result ──────┘
                                    │
                              chat.controller.ts (or api/chat/send.ts on Vercel)
                                    │
                                    └── SSE: { chunk } | { tool: { name, status } } | [DONE]
```
