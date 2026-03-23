const API_BASE_URL =
  (typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).__CHAT_WIDGET_API_URL__) ||
  import.meta.env.VITE_API_URL ||
  "http://localhost:3002";

export async function sendChatMessage(
  message: string,
  sessionId: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/api/chat/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to send message");
  }

  return data;
}
