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

export type ToolStatus = "running" | "done" | "error";

export interface ToolEvent {
  name: string;
  status: ToolStatus;
  detail?: string;
}

export interface StreamChatOptions {
  message: string;
  sessionId: string;
  history: HistoryMessage[];
  onChunk: (chunk: string) => void;
  onTool?: (event: ToolEvent) => void;
  signal?: AbortSignal;
}

export async function streamChatMessage({
  message,
  sessionId,
  history,
  onChunk,
  onTool,
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
        if (parsed.tool && typeof parsed.tool.name === "string" && onTool) {
          const status: ToolStatus =
            parsed.tool.status === "done" || parsed.tool.status === "error"
              ? parsed.tool.status
              : "running";
          onTool({
            name: parsed.tool.name,
            status,
            detail: typeof parsed.tool.detail === "string" ? parsed.tool.detail : undefined,
          });
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue;
        throw err;
      }
    }
  }
}
