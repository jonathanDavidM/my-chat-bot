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
      <Icon
        className={cn(
          "size-3",
          activity.status === "running" && "animate-spin motion-reduce:animate-none"
        )}
      />
      <span>{toolLabel(activity.name)}</span>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1" aria-label="Assistant is typing">
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms] motion-reduce:animate-none" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms] motion-reduce:animate-none" />
      <span className="size-2 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms] motion-reduce:animate-none" />
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
        {isUser ? <User className="size-4" /> : <img src={askMeLogo} alt="" className="size-5 rounded-full" />}
      </div>
      <div className="flex min-w-0 max-w-[75%] flex-col items-start gap-1.5">
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
              "max-w-full whitespace-pre-wrap wrap-anywhere rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
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
    messagesContainerRef,
    toggle,
    setInput,
    sendMessage,
  } = useChatWidget();

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Escape closes the dialog from anywhere inside the widget (input, buttons…).
  const handleWrapperKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && isOpen) {
      e.stopPropagation();
      toggle();
    }
  };

  return (
    <div
      onKeyDown={handleWrapperKeyDown}
      className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3"
    >
      {/* Chat Panel */}
      {isOpen && (
        <div
          id="jm-chat-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="jm-chat-title"
          className="flex h-[500px] w-[370px] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between bg-primary px-4 py-3">
            <div className="flex items-center gap-2">
              <img src={askMeLogo} alt="" className="size-6 rounded-full" />
              <div>
                <p
                  id="jm-chat-title"
                  className="text-sm font-semibold text-primary-foreground"
                >
                  Chat with Jonathan's AI
                </p>
                <p className="text-xs text-primary-foreground/90">
                  Ask me anything about Jonathan
                </p>
              </div>
            </div>
            <button
              onClick={toggle}
              aria-label="Close chat"
              className="rounded-full p-1 text-primary-foreground/80 transition-colors hover:bg-white/10 hover:text-primary-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={messagesContainerRef}
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            className="chat-scroll flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-4"
          >
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
                onKeyDown={handleInputKeyDown}
                placeholder="Type a message..."
                aria-label="Message"
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
        aria-controls="jm-chat-panel"
        className={cn(
          "flex size-14 items-center justify-center rounded-full transition-all hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100",
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
