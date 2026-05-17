import { Request, Response } from "express";
import {
  chatRequestSchema,
  checkRateLimit,
  runChat,
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

  try {
    const reply = await runChat(parsed.data);
    res.json({ success: true, message: reply });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      message: "Sorry, I'm having trouble responding right now. Please try again.",
    });
  }
};
