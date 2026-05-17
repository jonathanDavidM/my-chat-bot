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

export async function sendChatMessage(
  message: string,
  sessionId: string,
  history: HistoryMessage[]
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId, history }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to send message");
  }

  return data;
}
