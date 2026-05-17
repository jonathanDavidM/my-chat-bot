import { useState, useCallback, useRef, useEffect } from "react";
import { streamChatMessage, type HistoryMessage } from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const HISTORY_LIMIT = 10;
const SESSION_KEY = "chat-widget-session";

const REVEAL_INTERVAL_MS = 28;
const REVEAL_CHARS_NORMAL = 1;
const REVEAL_CHARS_CATCHUP = 4;
const CATCHUP_BUFFER_THRESHOLD = 120;

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
    const assistantId = newId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    const history: HistoryMessage[] = messagesRef.current
      .filter((m) => m.id !== "welcome")
      .slice(-HISTORY_LIMIT)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
    setInput("");
    setIsLoading(true);

    let pending = "";
    let streamDone = false;
    let receivedAny = false;

    const revealTimer = window.setInterval(() => {
      if (pending.length === 0) {
        if (streamDone) {
          window.clearInterval(revealTimer);
          setIsLoading(false);
        }
        return;
      }
      const take =
        streamDone && pending.length > CATCHUP_BUFFER_THRESHOLD
          ? REVEAL_CHARS_CATCHUP
          : REVEAL_CHARS_NORMAL;
      const slice = pending.slice(0, take);
      pending = pending.slice(take);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + slice } : m
        )
      );
    }, REVEAL_INTERVAL_MS);

    try {
      await streamChatMessage({
        message: trimmed,
        sessionId: sessionId.current,
        history,
        onChunk(chunk) {
          receivedAny = true;
          pending += chunk;
        },
      });
      streamDone = true;
    } catch {
      streamDone = true;
      window.clearInterval(revealTimer);
      setIsLoading(false);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: receivedAny
                  ? m.content + pending + "\n\n[response interrupted]"
                  : "Sorry, I'm having trouble right now. Please try again!",
              }
            : m
        )
      );
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
