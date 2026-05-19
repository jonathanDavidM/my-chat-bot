import Groq from "groq-sdk";
import { z } from "zod";
import { JONATHAN_KNOWLEDGE } from "../knowledge/jonathan.js";
import { COMPILED_DOCS } from "../knowledge/compiled-docs.js";
import {
  TOOL_SCHEMAS_FOR_GROQ,
  executeToolCall,
} from "../tools/index.js";

export const MAX_MESSAGE_LENGTH = 500;
const MAX_HISTORY_MESSAGES = 20;
const GROQ_TIMEOUT_MS = 20_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const MAX_TOOL_ITERATIONS = 4;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(MAX_MESSAGE_LENGTH),
  sessionId: z.string().min(1).max(128),
  history: z.array(chatMessageSchema).max(MAX_HISTORY_MESSAGES).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatEvent =
  | { type: "text"; value: string }
  | { type: "tool"; name: string; status: "running" | "done" | "error"; detail?: string };

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const LOCALHOST_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function resolveAllowedOrigin(requestOrigin: string | undefined): string | null {
  if (!requestOrigin) return null;
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  if (ALLOWED_ORIGINS.length === 0 && LOCALHOST_RE.test(requestOrigin)) {
    return requestOrigin;
  }
  return null;
}

const TOOL_INSTRUCTIONS = `

## Tools available
You have function-calling tools you may call when they help answer the user:
- get_github_activity — call when the visitor asks what Jonathan has been working on lately, recent commits, or how active he is on GitHub.
- get_project_details — call when the visitor asks about a specific project (portfolio, ams-shop, invitation, chatbot) and wants more than the brief description above.
- send_contact_message — ONLY call after the visitor has explicitly provided their name, email, and message AND confirmed they want it sent. Never invent contact details. If any field is missing, ask for it in plain text first.

CRITICAL: When you use a tool, invoke it via the function-calling API (structured tool_calls in your response). DO NOT write tool calls as text inside your message — never output XML tags like <function/...>, <tool_use>, or JSON like {"name": "...", "arguments": ...} as visible content. The user must not see the call itself, only your final answer after the tool runs.

Prefer answering from the source documents when you can. Use tools when they add real value (live data, structured details, or taking action on the visitor's behalf).`;

const BASE_SYSTEM_PROMPT = COMPILED_DOCS
  ? `${JONATHAN_KNOWLEDGE}\n\n## Source Documents\nThe text below comes from Jonathan's resume and personal notes. Use it as ground truth when answering factual questions.\n${COMPILED_DOCS}`
  : JONATHAN_KNOWLEDGE;

const SYSTEM_PROMPT = `${BASE_SYSTEM_PROMPT}${TOOL_INSTRUCTIONS}`;

let groqClient: Groq | null = null;
function getGroq(): Groq {
  if (!groqClient) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not configured");
    }
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
    }
    return { allowed: true };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true };
}

type GroqMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

type AccumulatedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

const INLINE_CALL_TRIGGER = "<function";
const INLINE_PATTERNS: RegExp[] = [
  /<function\/(\w+)>\s*([\s\S]*?)\s*<\/function\/\1>/g,
  /<function=(\w+)>\s*([\s\S]*?)\s*<\/function>/g,
  /<function\s+name="(\w+)"[^>]*>\s*([\s\S]*?)\s*<\/function>/g,
];

function parseInlineToolCalls(text: string): Array<{ name: string; arguments: string }> {
  const out: Array<{ name: string; arguments: string }> = [];
  for (const re of INLINE_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ name: m[1], arguments: m[2].trim() });
    }
  }
  return out;
}

export async function* streamChat(input: ChatRequest): AsyncGenerator<ChatEvent> {
  const history = input.history ?? [];
  const messages: GroqMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: input.message },
  ];

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const stream = await getGroq().chat.completions.create(
      {
        model: "llama-3.3-70b-versatile",
        messages: messages as Groq.Chat.Completions.ChatCompletionMessageParam[],
        max_tokens: 400,
        temperature: 0.7,
        tools: TOOL_SCHEMAS_FOR_GROQ,
        tool_choice: "auto",
        stream: true,
      },
      { timeout: GROQ_TIMEOUT_MS }
    );

    let assistantText = "";
    let unemitted = "";
    let suppressTextOutput = false;
    const toolCallsByIndex = new Map<number, AccumulatedToolCall>();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const delta = choice.delta;
      if (delta?.content) {
        assistantText += delta.content;
        if (!suppressTextOutput) {
          unemitted += delta.content;
          const triggerIdx = unemitted.indexOf(INLINE_CALL_TRIGGER);
          if (triggerIdx >= 0) {
            if (triggerIdx > 0) {
              yield { type: "text", value: unemitted.slice(0, triggerIdx) };
            }
            unemitted = "";
            suppressTextOutput = true;
          } else {
            const safeLen = unemitted.length - INLINE_CALL_TRIGGER.length;
            if (safeLen > 0) {
              yield { type: "text", value: unemitted.slice(0, safeLen) };
              unemitted = unemitted.slice(safeLen);
            }
          }
        }
      }
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          const existing =
            toolCallsByIndex.get(idx) ?? { id: "", name: "", arguments: "" };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.arguments += tc.function.arguments;
          toolCallsByIndex.set(idx, existing);
        }
      }
    }

    if (!suppressTextOutput && unemitted.length > 0) {
      yield { type: "text", value: unemitted };
      unemitted = "";
    }

    const structuredToolCalls = Array.from(toolCallsByIndex.values())
      .filter((t) => t.name)
      .map((t) => ({
        ...t,
        id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`,
      }));

    const inlineToolCalls = suppressTextOutput
      ? parseInlineToolCalls(assistantText).map((c) => ({
          id: `call_${Math.random().toString(36).slice(2, 10)}`,
          name: c.name,
          arguments: c.arguments || "{}",
        }))
      : [];

    const toolCalls =
      structuredToolCalls.length > 0 ? structuredToolCalls : inlineToolCalls;

    if (toolCalls.length === 0) {
      if (suppressTextOutput) {
        yield {
          type: "text",
          value:
            "(I tried to call a tool but the response was malformed. Could you rephrase?)",
        };
      }
      return;
    }

    const cleanedContent = suppressTextOutput
      ? assistantText.replace(/<function[\s\S]*?<\/function[^>]*>/g, "").trim()
      : assistantText;

    messages.push({
      role: "assistant",
      content: cleanedContent || null,
      tool_calls: toolCalls.map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.name, arguments: t.arguments || "{}" },
      })),
    });

    for (const tc of toolCalls) {
      yield { type: "tool", name: tc.name, status: "running" };
      let result: unknown;
      try {
        result = await executeToolCall(tc.name, tc.arguments);
        yield { type: "tool", name: tc.name, status: "done" };
      } catch (err) {
        result = {
          ok: false,
          error: err instanceof Error ? err.message : "Tool execution failed",
        };
        yield {
          type: "tool",
          name: tc.name,
          status: "error",
          detail: err instanceof Error ? err.message : undefined,
        };
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }

  yield {
    type: "text",
    value:
      "\n\n(Note: I hit my tool-use limit for this turn. Let me know if you'd like me to try again.)",
  };
}
