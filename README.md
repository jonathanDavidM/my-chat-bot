# My Chat Bot

An embeddable AI chat widget powered by [Groq](https://groq.com/) (Llama 3.3 70B). Built to sit on a portfolio website and answer visitor questions using a personal knowledge base and uploaded documents.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React 19, TypeScript, Tailwind CSS 4, Vite 8, Lucide Icons |
| Backend | Express 5, Groq SDK (Llama 3.3 70B) |
| Document Parsing | pdf-parse (PDF), mammoth (DOCX) |
| Deployment | Vercel (serverless + static) |

## Project Structure

```
my-chat-bot/
├── server/
│   ├── docs/                        # Drop resume/docs here (PDF, DOCX, TXT, MD)
│   └── src/
│       ├── index.ts                 # Express server entry point
│       ├── routes/
│       │   └── chat.routes.ts       # Route definitions
│       ├── controllers/
│       │   └── chat.controller.ts   # Input validation & request handling
│       ├── services/
│       │   ├── groq.service.ts    # Groq chat service (session history)
│       │   └── docs.service.ts      # Document parser/loader
│       └── knowledge/
│           ├── jonathan.ts          # Static knowledge base (system prompt)
│           └── compiled-docs.ts     # Auto-generated from server/docs/ at build time
├── src/
│   ├── components/
│   │   └── ChatWidget.tsx           # Floating chat widget UI
│   ├── hooks/
│   │   └── useChatWidget.ts         # Message state & session management
│   ├── lib/
│   │   ├── api.ts                   # API client (resolves backend URL)
│   │   └── utils.ts                 # cn() class name utility
│   ├── assets/
│   │   ├── ask-me-bubble.png        # Chat bubble icon
│   │   └── ask-me-logo.png          # Bot avatar
│   ├── embed.tsx                    # Standalone embeddable entry point
│   ├── App.tsx                      # Demo/preview page
│   └── main.tsx                     # React DOM entry point
├── scripts/
│   └── build-knowledge.mjs          # Pre-build: parses docs → compiled-docs.ts
├── vite.config.ts                   # Frontend dev/build config
├── vite.embed.config.ts             # Embed bundle config (IIFE output)
├── vercel.json                      # Vercel deployment config
└── package.json                     # Dependencies & scripts
```

## Architecture

```
Browser
  └─ ChatWidget.tsx
       └─ useChatWidget.ts (sessionId in sessionStorage)
            └─ POST /api/chat/send
                    │
            Express Server
                    │
            chat.controller.ts
              • Validates message (required, max 500 chars)
              • Requires sessionId
                    │
            GroqService.chat(sessionId, message)
              • Retrieves/creates session history (last 20 messages)
              • Builds system prompt: JONATHAN_KNOWLEDGE + COMPILED_DOCS
              • Calls Groq API → Llama 3.3 70B
              • max_tokens: 300 | temperature: 0.7
                    │
            {"success": true, "message": "..."}
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Get a Groq API key

Sign up at [console.groq.com](https://console.groq.com/keys) and create a free API key.

### 3. Configure environment

Create `server/.env`:

```env
PORT=3002
FRONTEND_URL=http://localhost:5173
GROQ_API_KEY=your_groq_api_key_here
```

### 4. Add your documents (optional)

Drop your resume or other docs into `server/docs/`. Supported formats:

- `.pdf`
- `.docx` / `.doc`
- `.txt`
- `.md`

These are parsed at build time by `scripts/build-knowledge.mjs` and compiled into `server/src/knowledge/compiled-docs.ts`, which is then included in the LLM's system prompt.

### 5. Run in development

```bash
# Run both frontend and backend
npm run dev:all

# Or run separately in two terminals
npm run dev          # Frontend  →  http://localhost:5173
npm run dev:server   # Backend   →  http://localhost:3002
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run dev:server` | Start backend dev server with file-watch |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm run build:embed` | Build standalone embeddable widget bundle |
| `npm run preview` | Preview production build locally |

## API Reference

### `POST /api/chat/send`

Send a message to the chatbot.

**Request body:**

```json
{
  "message": "What are your skills?",
  "sessionId": "unique-session-id"
}
```

**Constraints:** `message` is required, max 500 characters. `sessionId` is required.

**Response:**

```json
{
  "success": true,
  "message": "Jonathan is skilled in React, TypeScript, Node.js..."
}
```

### `GET /api/health`

Returns server status and timestamp.

```json
{
  "status": "ok",
  "timestamp": "2026-04-02T00:00:00.000Z"
}
```

## Session Behavior

- A unique `sessionId` is generated per browser tab and stored in `sessionStorage`.
- Conversation history is stored in memory on the server, scoped to that `sessionId`.
- History is trimmed to the last **20 messages** per session to prevent context bloat.
- Session history resets on server restart (no database persistence).

## Customizing the Knowledge Base

Edit `server/src/knowledge/jonathan.ts` to update the chatbot's core identity: name, contact info, skills, projects, and response style. This file is the primary system prompt sent to the LLM on every request.

To add document-based context, place files in `server/docs/` and rebuild. The `build-knowledge.mjs` script parses them and writes the extracted text into `compiled-docs.ts`, which is appended to the system prompt automatically.

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

The widget mounts itself into a `<div id="jonathan-chat-widget">` it creates and renders a floating chat bubble in the bottom-right corner of the page.

**API URL resolution order** (`src/lib/api.ts`):
1. `window.__CHAT_WIDGET_API_URL__` — set before the script tag
2. `import.meta.env.VITE_API_URL` — Vite env var (dev/build time)
3. `http://localhost:3002` — default fallback

## Deployment (Vercel)

The project is pre-configured for Vercel via `vercel.json`.

### Build pipeline

```
node scripts/build-knowledge.mjs   # Parse docs → compiled-docs.ts
npm run build                      # TypeScript + Vite → dist/
npm run build:embed                # IIFE bundle → dist-embed/
cp -r dist-embed dist/embed        # Serve embed bundle from same origin
```

### Steps

1. Push the repo to GitHub.
2. Import the project in [vercel.com](https://vercel.com).
3. Add environment variables in the Vercel dashboard:
   - `GROQ_API_KEY` — your Groq API key
   - `FRONTEND_URL` — your deployed frontend URL (for CORS)
4. Deploy. Vercel auto-deploys on every push to `main`.

API routes (`/api/*`) are rewritten to Vercel serverless functions automatically.
