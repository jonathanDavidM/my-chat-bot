import { useState, useCallback, useRef, useEffect } from "react";
import { sendChatMessage, type HistoryMessage } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const HISTORY_LIMIT = 10;
const SESSION_KEY = "chat-widget-session";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newId();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function useChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm Jonathan's AI assistant. Ask me anything about his skills, projects, or experience!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sessionId = useRef(getSessionId());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const history: HistoryMessage[] = messagesRef.current
      .filter((m) => m.id !== "welcome")
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await sendChatMessage(trimmed, sessionId.current, history);
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: response.message,
          timestamp: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          content: "Sorry, I'm having trouble right now. Please try again!",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading]);

  return {
    isOpen,
    messages,
    input,
    isLoading,
    messagesEndRef,
    toggle,
    setInput,
    sendMessage,
  };
}
