declare global {
  interface Window {
    __CHAT_WIDGET_API_URL__?: string;
  }
}

const API_BASE_URL =
  (typeof window !== "undefined" && window.__CHAT_WIDGET_API_URL__) ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3002";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StreamChatOptions {
  message: string;
  sessionId: string;
  history: HistoryMessage[];
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
}

export async function streamChatMessage({
  message,
  sessionId,
  history,
  onChunk,
  signal,
}: StreamChatOptions): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, history }),
    signal,
  });

  if (!response.ok || !response.body) {
    let serverMessage = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody?.message) serverMessage = errBody.message;
    } catch {
      // body wasn't JSON; keep the default
    }
    throw new Error(serverMessage);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx: number;
    while ((sepIdx = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const line = event.startsWith("data: ") ? event.slice(6) : event;
      if (!line) continue;
      if (line === "[DONE]") return;
      try {
        const parsed = JSON.parse(line);
        if (parsed.error) throw new Error("Stream interrupted");
        if (typeof parsed.chunk === "string") onChunk(parsed.chunk);
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
}
