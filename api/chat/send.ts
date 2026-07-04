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
  // Trust only the platform-provided client IP. Vercel overwrites x-real-ip at
  // the edge, so it is not client-spoofable; the leftmost x-forwarded-for entry
  // IS attacker-controlled and must never key rate limiting.
  const realIp = req.headers["x-real-ip"];
  const real = Array.isArray(realIp) ? realIp[0] : realIp;
  if (real) return real.trim();
  const fwd = req.headers["x-forwarded-for"];
  const fwdStr = Array.isArray(fwd) ? fwd[fwd.length - 1] : fwd;
  const lastHop = fwdStr?.split(",").pop()?.trim();
  return lastHop || req.socket?.remoteAddress || "unknown";
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

  // Stop pulling tokens from Groq (and stop writing to a dead socket) if the
  // client disconnects mid-stream.
  const abort = new AbortController();
  let clientGone = false;
  const onClose = () => {
    clientGone = true;
    abort.abort();
  };
  req.on("close", onClose);

  try {
    for await (const event of streamChat(parsed.data, abort.signal)) {
      if (clientGone) break;
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
    if (!clientGone && !res.writableEnded) {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } catch (error) {
    if (!clientGone) console.error("Chat error:", error);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: "stream_failed" })}\n\n`);
      res.end();
    }
  } finally {
    req.off("close", onClose);
  }
}
