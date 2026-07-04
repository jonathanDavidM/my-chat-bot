import { useState, useCallback, useRef, useEffect } from "react";
import { streamChatMessage, type HistoryMessage, type ToolStatus } from "@/lib/api";

export interface ToolActivity {
  name: string;
  status: ToolStatus;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolActivity?: ToolActivity[];
}

const HISTORY_LIMIT = 10;
const SESSION_KEY = "chat-widget-session";

const REVEAL_INTERVAL_MS = 28;
const REVEAL_CHARS_NORMAL = 2;
const CATCHUP_BUFFER_THRESHOLD = 80;
const AUTOSCROLL_THRESHOLD_PX = 120;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Autoscroll only when the user is already near the bottom, so scrolling up to
  // read history isn't yanked back down by streaming updates. Use instant scroll
  // while streaming or when reduced motion is requested.
  useEffect(() => {
    const end = messagesEndRef.current;
    if (!end) return;
    const container = messagesContainerRef.current;
    const nearBottom =
      !container ||
      container.scrollHeight - container.scrollTop - container.clientHeight <
        AUTOSCROLL_THRESHOLD_PX;
    if (nearBottom) {
      end.scrollIntoView({
        behavior: prefersReducedMotion() || isLoading ? "auto" : "smooth",
      });
    }
  }, [messages, isLoading]);

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
      // Keep pace with the network: drain a large backlog quickly, but stay
      // typewriter-slow when only a little text is pending.
      const take =
        pending.length > CATCHUP_BUFFER_THRESHOLD
          ? Math.min(40, Math.ceil(pending.length / 6))
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
        onTool(event) {
          receivedAny = true;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const activity = m.toolActivity ? [...m.toolActivity] : [];
              if (event.status === "running") {
                activity.push({ name: event.name, status: "running" });
              } else {
                const lastIdx = activity
                  .map((a, i) => (a.name === event.name && a.status === "running" ? i : -1))
                  .filter((i) => i >= 0)
                  .pop();
                if (lastIdx !== undefined) {
                  activity[lastIdx] = { name: event.name, status: event.status };
                } else {
                  activity.push({ name: event.name, status: event.status });
                }
              }
              return { ...m, toolActivity: activity };
            })
          );
        },
      });
      streamDone = true;
      // Stream completed but produced nothing — replace the empty placeholder so
      // it doesn't show the typing indicator forever.
      if (!receivedAny) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Sorry, I didn't catch that — could you try rephrasing?",
                }
              : m
          )
        );
      }
    } catch (err) {
      streamDone = true;
      window.clearInterval(revealTimer);
      setIsLoading(false);
      // Surface the real server message (e.g. rate limit) when we have one.
      const fallback =
        err instanceof Error && err.message
          ? err.message
          : "Sorry, I'm having trouble right now. Please try again!";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: receivedAny
                  ? m.content + pending + "\n\n[response interrupted]"
                  : fallback,
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
    messagesContainerRef,
    toggle,
    setInput,
    sendMessage,
  };
}
