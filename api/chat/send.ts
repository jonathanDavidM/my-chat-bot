import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  chatRequestSchema,
  checkRateLimit,
  resolveAllowedOrigin,
  streamChat,
} from "../../server/src/lib/chat-handler.js";

function applyCors(req: VercelRequest, res: VercelResponse) {
  const allowed = resolveAllowedOrigin(req.headers.origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", allowed);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return allowed !== null;
}

function clientKey(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim();
  return ip || req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const originOk = applyCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(originOk ? 204 : 403).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  if (!originOk) {
    return res.status(403).json({ success: false, message: "Origin not allowed" });
  }

  const rate = checkRateLimit(clientKey(req));
  if (!rate.allowed) {
    if (rate.retryAfterSec) res.setHeader("Retry-After", String(rate.retryAfterSec));
    return res.status(429).json({ success: false, message: "Too many requests" });
  }

  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  try {
    for await (const event of streamChat(parsed.data)) {
      if (event.type === "text") {
        res.write(`data: ${JSON.stringify({ chunk: event.value })}\n\n`);
      } else if (event.type === "tool") {
        res.write(
          `data: ${JSON.stringify({
            tool: { name: event.name, status: event.status, detail: event.detail },
          })}\n\n`
        );
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Chat error:", error);
    res.write(`data: ${JSON.stringify({ error: "stream_failed" })}\n\n`);
    res.end();
  }
}
