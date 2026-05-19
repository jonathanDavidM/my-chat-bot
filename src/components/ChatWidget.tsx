import { X, Send, User, Loader2, Check, AlertCircle } from "lucide-react";
import { useChatWidget, type ChatMessage, type ToolActivity } from "@/hooks/useChatWidget";
import { cn } from "@/lib/utils";
import askMeLogo from "@/assets/ask-me-logo.png";
import askMeBubble from "@/assets/ask-me-bubble.png";

const TOOL_LABELS: Record<string, string> = {
  get_github_activity: "Checking GitHub activity",
  get_project_details: "Looking up project details",
  send_contact_message: "Sending message to Jonathan",
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

function ToolChip({ activity }: { activity: ToolActivity }) {
  const Icon =
    activity.status === "running"
      ? Loader2
      : activity.status === "error"
      ? AlertCircle
      : Check;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        activity.status === "running"
          ? "border-blue-300 bg-blue-50 text-blue-700"
          : activity.status === "error"
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-emerald-300 bg-emerald-50 text-emerald-700"
      )}
    >
      <Icon className={cn("size-3", activity.status === "running" && "animate-spin")} />
      <span>{toolLabel(activity.name)}</span>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1">
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]" />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const hasToolActivity = !isUser && (message.toolActivity?.length ?? 0) > 0;
  const isEmptyAssistant = !isUser && message.content.length === 0 && !hasToolActivity;

  return (
    <div className={cn("flex gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? <User className="size-4" /> : <img src={askMeLogo} alt="Bot" className="size-5 rounded-full" />}
      </div>
      <div className="flex max-w-[75%] flex-col items-start gap-1.5">
        {hasToolActivity && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolActivity!.map((a, i) => (
              <ToolChip key={`${a.name}-${i}`} activity={a} />
            ))}
          </div>
        )}
        {(message.content.length > 0 || isEmptyAssistant) && (
          <div
            className={cn(
              "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              isUser
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-muted text-foreground"
            )}
          >
            {isEmptyAssistant ? <TypingDots /> : message.content}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatWidget() {
  const {
    isOpen,
    messages,
    input,
    isLoading,
    messagesEndRef,
    toggle,
    setInput,
    sendMessage,
  } = useChatWidget();

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    } else if (e.key === "Escape" && isOpen) {
      toggle();
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {/* Chat Panel */}
      {isOpen && (
        <div className="flex h-[500px] w-[370px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3">
            <div className="flex items-center gap-2">
              <img src={askMeLogo} alt="Bot" className="size-6 rounded-full" />
              <div>
                <p className="text-sm font-semibold text-primary-foreground">
                  Chat with Jonathan's AI
                </p>
                <p className="text-xs text-primary-foreground/70">
                  Ask me anything about Jonathan
                </p>
              </div>
            </div>
            <button
              onClick={toggle}
              aria-label="Close chat"
              className="rounded-full p-1 text-primary-foreground/70 transition-colors hover:bg-white/10 hover:text-primary-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                aria-label="Send message"
                className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={toggle}
        aria-label={isOpen ? "Close chat" : "Open chat"}
        aria-expanded={isOpen}
        className={cn(
          "flex size-14 items-center justify-center rounded-full transition-all hover:scale-105",
          isOpen ? "bg-muted text-foreground shadow-lg" : ""
        )}
      >
        {isOpen ? (
          <X className="size-6" />
        ) : (
          <img src={askMeBubble} alt="Chat" className="size-14" />
        )}
      </button>
    </div>
  );
}
