import type { VercelRequest, VercelResponse } from "@vercel/node";
import Groq from "groq-sdk";
import { JONATHAN_KNOWLEDGE } from "../../server/src/knowledge/jonathan.js";
import { COMPILED_DOCS } from "../../server/src/knowledge/compiled-docs.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const systemPrompt = COMPILED_DOCS
  ? JONATHAN_KNOWLEDGE +
    "\n\n## Additional Documents & References\n" +
    "The following are contents from Jonathan's uploaded documents (resume, etc.). Use this information to answer questions accurately.\n" +
    COMPILED_DOCS
  : JONATHAN_KNOWLEDGE;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    const { message, sessionId } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ success: false, message: "Message is required" });
    }

    if (!sessionId || typeof sessionId !== "string") {
      return res.status(400).json({ success: false, message: "Session ID is required" });
    }

    if (message.length > 500) {
      return res.status(400).json({ success: false, message: "Message is too long (max 500 characters)" });
    }

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";

    return res.json({ success: true, message: reply });
  } catch (error) {
    console.error("Chat error:", error);
    return res.status(500).json({
      success: false,
      message: "Sorry, I'm having trouble responding right now. Please try again.",
    });
  }
}
