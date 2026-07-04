import { z } from "zod";
import { Resend } from "resend";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  schema: z.ZodTypeAny;
  execute: (args: unknown) => Promise<unknown>;
}

const GITHUB_USER = "jonathanDavidM";
const GITHUB_FETCH_TIMEOUT_MS = 6_000;

const PROJECTS: Record<
  string,
  {
    name: string;
    stack: string[];
    description: string;
    repo: string;
    highlights: string[];
  }
> = {
  wtg: {
    name: "WTG — Order Management System",
    stack: [
      "Next.js",
      "TypeScript",
      "Prisma",
      "PostgreSQL",
      "Auth.js",
      "Zod",
      "React PDF",
    ],
    description:
      "Full-stack internal platform for managing customer orders, computing per-order profit from items and expenses, and issuing Acknowledgement Receipt (AR) PDFs. Session-based staff auth and a business dashboard.",
    repo: "https://github.com/jonathanDavidM/wtg-app",
    highlights: [
      "Server Actions + Prisma/PostgreSQL for type-safe order, expense, and payment data",
      "Server-side PDF receipts via @react-pdf/renderer (no headless browser)",
      "Auth.js credential login with an edge-safe middleware guarding all routes",
    ],
  },
  portfolio: {
    name: "Personal Portfolio",
    stack: ["React", "TypeScript", "Tailwind", "Vite", "Shadcn UI"],
    description:
      "Jonathan's personal portfolio site showcasing projects, skills, and this embedded AI assistant.",
    repo: "https://github.com/jonathanDavidM/jonathan-portfolio",
    highlights: [
      "Embedded AI agent (Groq Llama 3.3 70B) grounded on resume + notes",
      "Responsive, accessible UI",
      "Custom Shadcn-style design system",
    ],
  },
  "ams-shop": {
    name: "Team A x Watch Mods Cavite (Ecommerce)",
    stack: ["Next.js", "Tailwind", "Framer Motion", "Google Sheets"],
    description:
      "Production ecommerce site for a watch-mods business, using Google Sheets as a lightweight CMS.",
    repo: "https://github.com/jonathanDavidM/ams-shop",
    highlights: [
      "Sheets-as-CMS pattern keeps non-technical owner in control of inventory",
      "Animated product detail pages with Framer Motion",
    ],
  },
  invitation: {
    name: "Wedding Invitation Template",
    stack: ["Next.js", "Tailwind", "Framer Motion"],
    description:
      "Reusable digital wedding invitation template with RSVP flow and scroll-driven animations.",
    repo: "https://github.com/jonathanDavidM/invitation-website-templates",
    highlights: [
      "Mobile-first scroll animations",
      "Reusable template that can be re-skinned per event",
    ],
  },
  chatbot: {
    name: "Portfolio AI Agent (this widget)",
    stack: ["React", "Vite", "Express", "Vercel Serverless", "Groq", "Llama 3.3 70B"],
    description:
      "The chatbot you're talking to. Document-grounded answers with tool calling for live GitHub data and contact form submission.",
    repo: "https://github.com/jonathanDavidM/my-chat-bot",
    highlights: [
      "Agent loop with tool calling on top of Groq",
      "Streaming responses with inline tool-activity chips",
      "Embeddable widget bundle",
    ],
  },
};

const projectArgsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .describe(
      "Project slug. One of: wtg, portfolio, ams-shop, invitation, chatbot."
    ),
});

const contactArgsSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  message: z.string().min(5).max(2000),
});

const githubArgsSchema = z.object({}).strict();

async function fetchGithubActivity(): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://api.github.com/users/${GITHUB_USER}/events/public?per_page=10`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      return {
        ok: false,
        error: `GitHub API returned ${res.status}`,
      };
    }
    const events = (await res.json()) as Array<{
      type: string;
      repo?: { name?: string };
      created_at?: string;
      payload?: { commits?: Array<{ message?: string }> };
    }>;
    const summarized = events.slice(0, 8).map((e) => ({
      type: e.type,
      repo: e.repo?.name ?? null,
      at: e.created_at ?? null,
      commit_messages:
        e.payload?.commits?.map((c) => c.message).filter(Boolean) ?? [],
    }));
    return { ok: true, user: GITHUB_USER, recent_events: summarized };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getProjectDetails(args: unknown): Promise<unknown> {
  const parsed = projectArgsSchema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: "Invalid arguments. Provide a slug string." };
  }
  const project = PROJECTS[parsed.data.slug];
  if (!project) {
    return {
      ok: false,
      error: `Unknown project slug "${parsed.data.slug}". Valid slugs: ${Object.keys(
        PROJECTS
      ).join(", ")}.`,
    };
  }
  return { ok: true, ...project };
}

const CONTACT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const CONTACT_MAX_PER_WINDOW = 5;
let contactWindowStart = Date.now();
let contactCount = 0;
const recentContactHashes = new Set<string>();

let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key || key === "your_resend_api_key_here") return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

async function sendContactMessage(args: unknown): Promise<unknown> {
  const parsed = contactArgsSchema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        "Invalid arguments. Need {name, email, message}. Email must be valid; message at least 5 chars.",
    };
  }
  const { name, email, message } = parsed.data;

  // Best-effort per-instance abuse guard: cap total sends and dedupe identical
  // submissions within a window. (Note: per-serverless-instance, not global.)
  const now = Date.now();
  if (now - contactWindowStart > CONTACT_WINDOW_MS) {
    contactWindowStart = now;
    contactCount = 0;
    recentContactHashes.clear();
  }
  const dedupeKey = `${email.toLowerCase()}::${message.trim()}`;
  if (recentContactHashes.has(dedupeKey)) {
    return { ok: true, delivered: false, note: "That message was already sent." };
  }
  if (contactCount >= CONTACT_MAX_PER_WINDOW) {
    return {
      ok: false,
      error:
        "Contact limit reached for now — please email magno.jonathan028@gmail.com directly.",
    };
  }
  contactCount += 1;
  recentContactHashes.add(dedupeKey);

  // Redact PII from logs — do not persist the email address or message body.
  console.log(
    `[contact] ${new Date().toISOString()} name_len=${name.length} email_domain=${
      email.split("@")[1] ?? "?"
    } msg_len=${message.length}`
  );

  const resend = getResend();
  if (!resend) {
    return {
      ok: true,
      delivered: false,
      note: "Message logged to server console. Email delivery is not configured in this environment.",
    };
  }

  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const to = process.env.CONTACT_RECIPIENT || "magno.jonathan028@gmail.com";

  try {
    const { data, error } = await resend.emails.send({
      from,
      to,
      replyTo: email,
      subject: `Portfolio contact from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}\n\n— Sent via portfolio AI agent`,
    });
    if (error) {
      console.error("[contact] Resend error:", error);
      return {
        ok: false,
        error: `Email delivery failed: ${error.message ?? "unknown"}`,
      };
    }
    return {
      ok: true,
      delivered: true,
      messageId: data?.id,
      note: "Message delivered. Jonathan will follow up at the provided email.",
    };
  } catch (err) {
    console.error("[contact] Resend exception:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email delivery failed",
    };
  }
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "get_github_activity",
    description:
      "Fetch Jonathan's recent public GitHub activity (pushes, PRs, etc.). Use when the visitor asks what Jonathan has been working on lately, recent commits, or how active he is on GitHub.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    schema: githubArgsSchema,
    execute: fetchGithubActivity,
  },
  {
    name: "get_project_details",
    description:
      "Get structured details (stack, highlights, repo link) for one of Jonathan's featured projects. Use when the visitor asks about a specific project beyond what's in the system prompt.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          enum: Object.keys(PROJECTS),
          description: "Project slug",
        },
      },
      required: ["slug"],
      additionalProperties: false,
    },
    schema: projectArgsSchema,
    execute: getProjectDetails,
  },
  {
    name: "send_contact_message",
    description:
      "Submit a contact message on behalf of the visitor. ONLY call this after the visitor has explicitly provided their name, email, and a message they want sent to Jonathan, and confirmed they want to send it. Never invent contact details.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Visitor's full name" },
        email: { type: "string", description: "Visitor's email address" },
        message: {
          type: "string",
          description: "The message the visitor wants delivered to Jonathan",
        },
      },
      required: ["name", "email", "message"],
      additionalProperties: false,
    },
    schema: contactArgsSchema,
    execute: sendContactMessage,
  },
];

export const TOOL_SCHEMAS_FOR_GROQ = TOOLS.map((t) => ({
  type: "function" as const,
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t] as const));

export async function executeToolCall(
  name: string,
  rawArgs: string
): Promise<unknown> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
  let args: unknown = {};
  if (rawArgs && rawArgs.trim().length > 0) {
    try {
      args = JSON.parse(rawArgs);
    } catch {
      return { ok: false, error: `Invalid JSON arguments for ${name}` };
    }
  }
  return tool.execute(args);
}
