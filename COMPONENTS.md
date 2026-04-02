# Core Components

A breakdown of every meaningful piece of this project — what it is, what it does, and how it connects to everything else.

---

## Frontend

### `src/components/ChatWidget.tsx`
The entire visible UI of the chatbot. Renders a floating button in the bottom-right corner of the screen. When clicked, it opens a chat panel with a message list, a typing indicator, and a text input field. It reads state and handlers from the `useChatWidget` hook and has no logic of its own — it is purely presentational.

**Connects to:** `useChatWidget.ts` (for all state and actions), `ask-me-bubble.png` / `ask-me-logo.png` (icons)

---

### `src/hooks/useChatWidget.ts`
The brain of the frontend. Manages:
- The list of messages displayed in the widget
- Loading state (shows typing indicator while waiting for a response)
- The session ID (generated once per browser tab and stored in `sessionStorage`)
- The `sendMessage` function that calls the backend API and appends the response

This hook is the only place in the frontend that talks to the server.

**Connects to:** `src/lib/api.ts` (sends HTTP requests), `ChatWidget.tsx` (consumed by)

---

### `src/lib/api.ts`
A thin HTTP client. Exports a single `sendChatMessage(message, sessionId)` function that POSTs to `/api/chat/send` and returns the assistant's reply. Also handles resolving the backend URL using this priority order:

1. `window.__CHAT_WIDGET_API_URL__` — set externally when embedding on another site
2. `import.meta.env.VITE_API_URL` — set at build time via environment variable
3. `http://localhost:3002` — default for local development

**Connects to:** `useChatWidget.ts` (called by), backend `/api/chat/send` (sends to)

---

### `src/embed.tsx`
The entry point for the standalone embeddable version of the widget. Instead of rendering into an existing `#root` element like a normal React app, it creates its own `<div id="jonathan-chat-widget">` and mounts the `ChatWidget` into it. This lets the widget be dropped into any third-party website with a single `<script>` tag.

**Connects to:** `ChatWidget.tsx` (mounts it), `vite.embed.config.ts` (built by)

---

### `src/App.tsx`
A simple demo/preview page. Used during local development to see the widget in a realistic context. Not part of the embeddable bundle.

---

## Backend

### `server/src/index.ts`
The Express server entry point. Sets up CORS (allowing requests from the configured frontend URL), registers the chat routes, adds a `/api/health` endpoint, and starts listening on the configured port (default: `3002`).

**Connects to:** `chat.routes.ts` (registers), `server/.env` (reads config from)

---

### `server/src/routes/chat.routes.ts`
Declares the API surface. Currently defines one route:
- `POST /api/chat/send` → `chat.controller.ts`

---

### `server/src/controllers/chat.controller.ts`
The request gatekeeper. Before anything reaches the AI, this controller:
- Checks that `message` is present and not empty
- Enforces the 500-character message limit
- Checks that `sessionId` is present
- Passes valid requests to `GroqService`

If any check fails, it returns a `400` error immediately.

**Connects to:** `groq.service.ts` (delegates valid requests to), `chat.routes.ts` (registered by)

---

### `server/src/services/groq.service.ts`
The core AI service (named `gemini` historically but uses Groq/Llama). Responsible for:
- Maintaining a **per-session conversation history** (stored in a `Map` keyed by `sessionId`)
- Trimming history to the **last 20 messages** to avoid context overflow
- Constructing the full message array: system prompt → history → new user message
- Calling the **Groq API** with the Llama 3.3 70B model (`max_tokens: 300`, `temperature: 0.7`)
- Returning the assistant's text response

**Connects to:** `jonathan.ts` + `compiled-docs.ts` (reads knowledge from), Groq API (calls externally), `chat.controller.ts` (called by)

---

### `server/src/services/docs.service.ts`
Reads files from `server/docs/` and extracts their plain text content. Supports:
- `.pdf` via `pdf-parse`
- `.docx` / `.doc` via `mammoth`
- `.txt` and `.md` natively

The extracted text is used by `scripts/build-knowledge.mjs` at build time to generate `compiled-docs.ts`.

**Connects to:** `scripts/build-knowledge.mjs` (called by during build)

---

## Knowledge Base

### `server/src/knowledge/jonathan.ts`
The static system prompt. Hard-coded information about Jonathan: name, contact details, skills with proficiency levels, notable projects, and instructions on how the bot should respond (concise, warm, 2–4 sentences). This is the primary identity layer of the chatbot and the first thing injected into every Groq API call.

**Connects to:** `groq.service.ts` (imported and prepended to every API call)

---

### `server/src/knowledge/compiled-docs.ts`
Auto-generated — do not edit manually. Contains the parsed text of every file in `server/docs/` (currently the CV PDF and "About me" document). Regenerated every time the build runs via `scripts/build-knowledge.mjs`. Appended after `jonathan.ts` in the system prompt.

**Connects to:** `groq.service.ts` (imported), `scripts/build-knowledge.mjs` (generated by)

---

## Build & Config

### `scripts/build-knowledge.mjs`
A pre-build Node script. Reads every file in `server/docs/`, calls `docs.service.ts` to extract text, and writes the result into `server/src/knowledge/compiled-docs.ts` as an exported TypeScript constant. Runs automatically as the first step of the Vercel build pipeline.

**Connects to:** `docs.service.ts` (uses to parse), `compiled-docs.ts` (writes to)

---

### `vite.config.ts`
Configures the main frontend build: React plugin for Fast Refresh, Tailwind CSS plugin, and the `@/` path alias pointing to `src/`. Used for both `npm run dev` and `npm run build`.

---

### `vite.embed.config.ts`
A separate Vite config specifically for building the embeddable widget. Key differences from the main config:
- Entry point is `src/embed.tsx` instead of `index.html`
- Output format is **IIFE** (Immediately Invoked Function Expression) so it runs without a bundler
- Outputs to `dist-embed/` instead of `dist/`
- Produces `chat-widget.iife.js` and `chat-widget.css`

---

### `vercel.json`
Tells Vercel how to build and serve this project:
- **Build command:** runs `build-knowledge.mjs` → main build → embed build → copies embed into `dist/embed/`
- **Output directory:** `dist/`
- **Framework:** Vite
- **Rewrites:** `/api/*` → Vercel serverless functions

---

## How They All Connect

```
server/docs/
    └─[build time]─► build-knowledge.mjs
                          └─► compiled-docs.ts
                                    │
                          jonathan.ts
                                    │
                              [combined system prompt]
                                    │
Browser                       groq.service.ts ──► Groq API (Llama 3.3 70B)
  └─ ChatWidget.tsx                 ▲
       └─ useChatWidget.ts          │
            └─ api.ts ──POST /api/chat/send──► chat.controller.ts
                                                    └─► groq.service.ts
```
