# My Chat Bot — AI Agent for a Portfolio

An embeddable AI **agent** powered by [Groq](https://groq.com/) (Llama 3.3 70B) with function-calling tools. Goes beyond a chatbot: it can fetch live GitHub activity, return structured project details, and send contact-form messages on the visitor's behalf via [Resend](https://resend.com/).

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 8, Lucide Icons |
| Backend | Express 5, Groq SDK (Llama 3.3 70B, function calling), Resend |
| Document Parsing | pdf-parse (PDF), mammoth (DOCX) |
| Deployment | Vercel (serverless + static) |

## What it does

- **Document-grounded answers** — the system prompt is built from a hand-written knowledge base plus parsed text from your CV and personal docs.
- **Streaming responses** — Server-Sent Events stream tokens to the client; a typewriter effect on the client smooths out latency.
- **Agent loop with tool calling** — up to 4 iterations of `model → tool → result → model`, with three tools:
  - `get_github_activity` — fetches recent public GitHub events
  - `get_project_details` — returns structured details for a featured project
  - `send_contact_message` — delivers a contact-form message via Resend (falls back to console log if no Resend key)
- **Inline-call safety net** — Llama 3.3 occasionally emits tool calls as `<function/...>` XML instead of structured `tool_calls`. The server detects this in the stream, suppresses the malformed text from the UI, and executes the call anyway.
- **Tool-activity chips** — the UI shows "Checking GitHub activity…" / "Sending message to Jonathan…" chips that resolve to a green check while the tool runs.
- **Rate limiting** — 20 req/min per IP, in-memory.
- **Embeddable** — builds to a single IIFE bundle for drop-in use on any website.

## Project Structure

```
my-chat-bot/
├── server/
│   ├── docs/                        # Drop resume/docs here (PDF, DOCX, TXT, MD)
│   └── src/
│       ├── index.ts                 # Express server entry point
│       ├── routes/chat.routes.ts    # Route definitions
│       ├── controllers/chat.controller.ts  # SSE streaming + rate limit + CORS
│       ├── lib/chat-handler.ts      # Agent loop: Groq stream + tool calling + inline parser
│       ├── tools/index.ts           # Tool registry: schemas, Zod validation, executors
│       └── knowledge/
│           ├── jonathan.ts          # Static knowledge base (system prompt)
│           └── compiled-docs.ts     # Auto-generated from server/docs/ at build time
├── api/
│   ├── chat/send.ts                 # Vercel serverless mirror of the Express route
│   └── health.ts
├── src/
│   ├── components/ChatWidget.tsx    # Floating widget UI + tool-activity chips
│   ├── hooks/useChatWidget.ts       # Message state, streaming reveal, tool tracking
│   ├── lib/
│   │   ├── api.ts                   # SSE client (text deltas + tool events)
│   │   └── utils.ts
│   ├── embed.tsx                    # Standalone embeddable entry point
│   ├── App.tsx                      # Demo/preview page
│   └── main.tsx                     # React DOM entry point
├── scripts/build-knowledge.mjs      # Pre-build: parses docs → compiled-docs.ts
├── vite.config.ts                   # Frontend dev/build config
├── vite.embed.config.ts             # Embed bundle config (IIFE output)
├── vercel.json                      # Vercel deployment config
└── package.json
```

## Architecture

```
Browser
  └─ ChatWidget.tsx
       └─ useChatWidget.ts ── sessionId in sessionStorage
            └─ api.ts (SSE client)
                 └─ POST /api/chat/send  ──► Express  OR  Vercel serverless
                                                  │
                                          chat.controller.ts
                                            • Origin guard + rate limit
                                            • Streams SSE: text deltas + tool events
                                                  │
                                          chat-handler.ts (streamChat)
                                            • System prompt = jonathan.ts + compiled-docs.ts + tool instructions
                                            • Loop up to 4 iterations:
                                                – Groq stream(model, tools, tool_choice: "auto")
                                                – Accumulate tool_calls (structured or inline XML)
                                                – Suppress inline-call markup from text stream
                                                – Execute matched tools, append results, re-stream
                                                  │
                                          tools/index.ts
                                            • get_github_activity  → fetch GitHub API
                                            • get_project_details  → in-memory map
                                            • send_contact_message → Resend (fallback: console)
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Get a Groq API key

Sign up at [console.groq.com](https://console.groq.com/keys) and create a free API key.

### 3. (Optional) Get a Resend API key

Without this, `send_contact_message` only logs to the server console. To actually deliver emails:

1. Sign up at [resend.com](https://resend.com/signup) **with the email you want messages delivered to** (the shared `onboarding@resend.dev` sender can only deliver to your Resend account email until you verify a custom domain).
2. Create a key at [resend.com/api-keys](https://resend.com/api-keys) with **Sending access**.

### 4. Configure environment

Create `server/.env` from `server/.env.example`:

```env
GROQ_API_KEY=your_groq_api_key_here

# Optional — enables email delivery
RESEND_API_KEY=re_your_resend_key
# RESEND_FROM=onboarding@resend.dev               # default
# CONTACT_RECIPIENT=magno.jonathan028@gmail.com   # default

# Optional CORS allowlist for production
# ALLOWED_ORIGINS=https://your-portfolio.com,https://www.your-portfolio.com
```

### 5. Add your documents (optional)

Drop your resume or other docs into `server/docs/`. Supported: `.pdf`, `.docx`, `.doc`, `.txt`, `.md`. They're parsed at build time by `scripts/build-knowledge.mjs` and compiled into `server/src/knowledge/compiled-docs.ts`, which is appended to the system prompt.

### 6. Run in development

```bash
npm run dev:all
# Frontend  →  http://localhost:5173
# Backend   →  http://localhost:3002
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run dev:server` | Start backend dev server with file-watch (tsx) |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm run build:embed` | Build standalone embeddable widget bundle |
| `npm run preview` | Preview production build locally |

## API Reference

### `POST /api/chat/send`

Streams a Server-Sent Events response. Each event is a `data: <json>\n\n` line.

**Request body:**

```json
{
  "message": "What is Jonathan working on lately on GitHub?",
  "sessionId": "unique-session-id",
  "history": [
    { "role": "user", "content": "Hi" },
    { "role": "assistant", "content": "Hello!" }
  ]
}
```

**Constraints:** `message` 1–500 chars. `sessionId` 1–128 chars. `history` optional, max 20 messages, each message max 2000 chars.

**Event payloads:**

```text
data: {"chunk": "Jonathan has been "}            # text delta
data: {"tool": {"name": "get_github_activity", "status": "running"}}
data: {"tool": {"name": "get_github_activity", "status": "done"}}
data: {"chunk": "working on the portfolio repo..."}
data: [DONE]
```

`status` can be `"running"`, `"done"`, or `"error"`. On a fatal stream failure: `data: {"error": "stream_failed"}`.

### `GET /api/health`

```json
{ "status": "ok", "timestamp": "2026-05-19T14:22:39.105Z" }
```

## Adding or Customizing Tools

Tools live in `server/src/tools/index.ts`. To add one:

1. Define a Zod schema for the arguments.
2. Write an `async function execute(args)` that returns a JSON-serializable result. Return `{ ok: false, error }` on failure so the model can recover.
3. Add an entry to the `TOOLS` array with a `name`, JSON-Schema `parameters`, and the Zod schema.
4. Add a line under the `## Tools available` section in `chat-handler.ts` (`TOOL_INSTRUCTIONS`) describing when the model should call it — and any guardrails (e.g., "only call after the visitor has explicitly provided X").
5. Optionally, add a friendly label in `src/components/ChatWidget.tsx` (`TOOL_LABELS`) for the activity chip.

## Customizing the Knowledge Base

- **`server/src/knowledge/jonathan.ts`** — the AI's identity, contact info, response-style rules. Edit freely.
- **`server/docs/`** — drop resume/notes here. Run `node scripts/build-knowledge.mjs` to regenerate `compiled-docs.ts` (also runs automatically at build time on Vercel).

## Embedding in Another Website

### 1. Build the embed bundle

```bash
npm run build:embed
```

This outputs:
- `dist-embed/chat-widget.iife.js` — self-contained React bundle (IIFE format)
- `dist-embed/chat-widget.css` — widget styles

### 2. Add to your website

```html
<link rel="stylesheet" href="https://your-domain.com/embed/chat-widget.css" />
<script>
  window.__CHAT_WIDGET_API_URL__ = "https://your-backend-url";
</script>
<script src="https://your-domain.com/embed/chat-widget.iife.js"></script>
```

**API URL resolution order** (`src/lib/api.ts`):
1. `window.__CHAT_WIDGET_API_URL__` — set before the script tag
2. `import.meta.env.VITE_API_URL` — Vite env var (dev/build time)
3. `http://localhost:3002` — default fallback

## Deployment (Vercel)

The project is pre-configured via `vercel.json`.

### Build pipeline

```
node scripts/build-knowledge.mjs   # Parse docs → compiled-docs.ts
npm run build                      # TypeScript + Vite → dist/
npm run build:embed                # IIFE bundle → dist-embed/
cp -r dist-embed dist/embed        # Serve embed bundle from same origin
```

### Steps

1. Push to GitHub.
2. Import the project in [vercel.com](https://vercel.com).
3. Add environment variables in the Vercel dashboard:
   - `GROQ_API_KEY` (required)
   - `RESEND_API_KEY` (optional — enables real email delivery)
   - `RESEND_FROM` (optional — set this once you've verified a custom domain in Resend; `onboarding@resend.dev` will often hit spam in production)
   - `CONTACT_RECIPIENT` (optional)
   - `ALLOWED_ORIGINS` — comma-separated list of allowed origins for CORS, e.g. `https://your-portfolio.com`
4. Deploy. Vercel auto-deploys on every push to `main`.

API routes (`/api/*`) are served by the Vercel serverless functions in the `api/` folder.

## Troubleshooting

- **`<function/...>` XML leaks into the chat bubble.** This means the inline-call detector missed a variant Llama emitted. Add the new pattern to `INLINE_PATTERNS` in `chat-handler.ts`. If it keeps happening, switch the `model` value in `chat-handler.ts` to `openai/gpt-oss-120b` or `moonshotai/kimi-k2-instruct` — both are on Groq and have stronger structured tool-calling than Llama 3.3.
- **Contact tool says delivered, but no email arrives.** With the shared sender (`onboarding@resend.dev`), Resend only delivers to the address you used to sign up. Either sign up with the recipient email, or verify a custom domain in Resend → Domains.
- **Frontend can't reach backend in production.** Check `ALLOWED_ORIGINS` covers the deployed frontend URL exactly (including protocol).
