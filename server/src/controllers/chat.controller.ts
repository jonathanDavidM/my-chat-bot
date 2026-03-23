import { Request, Response } from "express";
import { GeminiService } from "../services/gemini.service.js";

let geminiService: GeminiService | null = null;

function getGeminiService() {
  if (!geminiService) {
    geminiService = new GeminiService();
  }
  return geminiService;
}

export const sendMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string") {
      res.status(400).json({
        success: false,
        message: "Message is required",
      });
      return;
    }

    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
      return;
    }

    // Limit message length
    if (message.length > 500) {
      res.status(400).json({
        success: false,
        message: "Message is too long (max 500 characters)",
      });
      return;
    }

    const reply = await getGeminiService().chat(sessionId, message);

    res.json({
      success: true,
      message: reply,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      success: false,
      message: "Sorry, I'm having trouble responding right now. Please try again.",
    });
  }
};
