# My Chat Bot

An embeddable AI chat widget powered by [Groq](https://groq.com/) (Llama 3.3 70B). Built to sit on a portfolio website and answer visitor questions using a personal knowledge base and uploaded documents.

## Tech Stack

**Frontend:** React, TypeScript, Tailwind CSS, Vite, Lucide Icons
**Backend:** Express, Groq SDK (Llama 3.3 70B)
**Document Parsing:** pdf-parse (PDF), mammoth (DOCX)

## Project Structure

```
my-chat-bot/
├── server/
│   ├── docs/                  # Drop resume/docs here (PDF, DOCX, TXT, MD)
│   ├── src/
│   │   ├── index.ts           # Express server
│   │   ├── routes/            # API routes
│   │   ├── controllers/       # Request handlers
│   │   ├── services/
│   │   │   ├── gemini.service.ts   # Groq chat service
│   │   │   └── docs.service.ts     # Document parser/loader
│   │   └── knowledge/
│   │       └── jonathan.ts    # Knowledge base (system prompt)
│   └── .env                   # API keys & config
├── src/
│   ├── components/
│   │   └── ChatWidget.tsx     # Floating chat widget
│   ├── hooks/
│   │   └── useChatWidget.ts   # Chat state management
│   ├── lib/
│   │   ├── api.ts             # API client
│   │   └── utils.ts           # Utility functions
│   ├── embed.tsx              # Embeddable entry point
│   ├── App.tsx                # Demo page
│   └── main.tsx               # React entry point
├── vite.config.ts             # Dev/build config
└── vite.embed.config.ts       # Embed bundle config
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Get a Groq API key

Sign up at [console.groq.com](https://console.groq.com/keys) and create a free API key.

### 3. Configure environment

Add your key to `server/.env`:

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

These are automatically parsed and included in the chatbot's knowledge on server start.

### 5. Run in development

```bash
# Run both frontend and backend
npm run dev:all

# Or run separately
npm run dev          # Frontend on http://localhost:5173
npm run dev:server   # Backend on http://localhost:3002
```

## Embedding in Another Website

### 1. Build the embed bundle

```bash
npm run build:embed
```

This outputs `dist-embed/chat-widget.iife.js` and `dist-embed/chat-widget.css`.

### 2. Add to your website

```html
<link rel="stylesheet" href="/path/to/chat-widget.css" />
<script>window.__CHAT_WIDGET_API_URL__ = "https://your-backend-url";</script>
<script src="/path/to/chat-widget.iife.js"></script>
```

The widget renders as a floating chat bubble in the bottom-right corner.

## API

### POST `/api/chat/send`

Send a message to the chatbot.

**Request:**

```json
{
  "message": "What are your skills?",
  "sessionId": "unique-session-id"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Jonathan is skilled in React, TypeScript, Node.js..."
}
```

### GET `/api/health`

Health check endpoint.

## Customizing the Knowledge Base

Edit `server/src/knowledge/jonathan.ts` to update the chatbot's core knowledge. This is the system prompt that tells the AI who you are, your skills, projects, and how to respond.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start frontend dev server |
| `npm run dev:server` | Start backend dev server |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Production build |
| `npm run build:embed` | Build embeddable widget bundle |
