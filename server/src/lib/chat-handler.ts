import Groq from "groq-sdk";
import { z } from "zod";
import { JONATHAN_KNOWLEDGE } from "../knowledge/jonathan.js";
import { COMPILED_DOCS } from "../knowledge/compiled-docs.js";

export const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_MESSAGES = 20;
const GROQ_TIMEOUT_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  sessionId: z.string().min(1).max(128),
  history: z.array(chatMessageSchema).max(MAX_HISTORY_MESSAGES).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function resolveAllowedOrigin(requestOrigin: string | undefined): string | null {
  if (!requestOrigin) return null;
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  if (ALLOWED_ORIGINS.length === 0 && LOCALHOST_RE.test(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}

const SYSTEM_PROMPT = COMPILED_DOCS
  ? `${JONATHAN_KNOWLEDGE}\n\n## Source Documents\nThe text below comes from Jonathan's resume and personal notes. Use it as ground truth when answering factual questions.\n${COMPILED_DOCS}`
  : JONATHAN_KNOWLEDGE;

let groqClient: Groq | null = null;
function getGroq(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not configured");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
    }
    return { allowed: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true };
}

export async function* streamChat(input: ChatRequest): AsyncGenerator<string> {
  const history = input.history ?? [];
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.message },
  ];

  const stream = await getGroq().chat.completions.create(
    {
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 300,
      temperature: 0.7,
      stream: true,
    },
    { timeout: GROQ_TIMEOUT_MS }
  );

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}
