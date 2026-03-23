import Groq from "groq-sdk";
import { JONATHAN_KNOWLEDGE } from "../knowledge/jonathan.js";
import { COMPILED_DOCS } from "../knowledge/compiled-docs.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const systemPrompt = COMPILED_DOCS
  ? JONATHAN_KNOWLEDGE +
    "\n\n## Additional Documents & References\n" +
    "The following are contents from Jonathan's uploaded documents (resume, etc.). Use this information to answer questions accurately.\n" +
    COMPILED_DOCS
  : JONATHAN_KNOWLEDGE;

export class GeminiService {
  private groq: Groq;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor() {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not configured");
    }
    this.groq = new Groq({ apiKey });
  }

  async chat(sessionId: string, userMessage: string): Promise<string> {
    const history = this.conversationHistory.get(sessionId) || [];

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userMessage },
    ];

    const completion = await this.groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages,
      max_tokens: 300,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";

    // Update history
    history.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: response }
    );

    // Keep only last 20 messages
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    this.conversationHistory.set(sessionId, history);

    return response;
  }

  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
  }
}
