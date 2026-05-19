import { Request, Response } from "express";
import {
  chatRequestSchema,
  checkRateLimit,
  streamChat,
} from "../lib/chat-handler.js";

function clientKey(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip = Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim();
  return ip || req.ip || "unknown";
}

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const rate = checkRateLimit(clientKey(req));
  if (!rate.allowed) {
    if (rate.retryAfterSec) res.setHeader("Retry-After", String(rate.retryAfterSec));
    res.status(429).json({ success: false, message: "Too many requests" });
    return;
  }

  const parsed = chatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid request" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

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
};
