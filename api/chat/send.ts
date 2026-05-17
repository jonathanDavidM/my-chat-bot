import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  chatRequestSchema,
  checkRateLimit,
  resolveAllowedOrigin,
  runChat,
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

  try {
    const reply = await runChat(parsed.data);
    return res.json({ success: true, message: reply });
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      success: false,
      message: "Sorry, I'm having trouble responding right now. Please try again.",
    });
  }
}
