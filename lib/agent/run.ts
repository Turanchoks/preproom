import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import {
  type BaseToolset,
  type Event,
  Gemini,
  getFunctionCalls,
  getFunctionResponses,
  InMemorySessionService,
  LlmAgent,
  MCPToolset,
  Runner,
  StreamingMode,
} from "@google/adk";
import type { Content, Part as GenAiPart } from "@google/genai";
import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import {
  getDocumentsByStudentId,
  getFactsByStudentId,
  getVideosByStudentId,
} from "@/lib/db/queries-studio";
import type { Student } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { buildSystemPrompt, type TranscriptMessage } from "./prompts";
import { buildAgentTools } from "./tools";

const APP_NAME = "teachflow";
const MAX_TRANSCRIPT = 30;

// Cost guard ceilings (generous — meant to catch runaway loops, not normal use).
// Override with env TOKEN_GUARD_CHARS; events ceiling is a sane constant.
const TOKEN_GUARD_CHARS = Number(process.env.TOKEN_GUARD_CHARS) || 200_000;
const TOKEN_GUARD_EVENTS = 500;

/**
 * Emits one single-line structured JSON record to stdout. On Cloud Run these
 * lines are ingested by Cloud Logging as structured `jsonPayload` entries that
 * can be queried (e.g. `jsonPayload.tool="create_homework"`,
 * `jsonPayload.runId="..."`). Keep it to a single line and JSON-only.
 */
function logStructured(fields: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ ts: new Date().toISOString(), ...fields }));
  } catch {
    /* logging must never throw */
  }
}

/**
 * Builds the exercise-catalog MCP toolset (stdio child process) when enabled.
 * Returns null when disabled (MCP_ENABLED=0) or if construction throws — the
 * in-process get_exercise_catalog FunctionTool fallback then covers the
 * capability (see lib/agent/tools.ts). Degrades gracefully.
 */
function buildMcpToolset(): MCPToolset | null {
  if (process.env.MCP_ENABLED === "0") {
    return null;
  }
  try {
    // Production image ships a precompiled server (no tsx in standalone build)
    const compiled = path.join(process.cwd(), "mcp", "exercise-server.cjs");
    const serverParams = existsSync(compiled)
      ? { command: "node", args: [compiled] }
      : { command: "npx", args: ["tsx", "mcp/exercise-server.ts"] };
    return new MCPToolset({
      type: "StdioConnectionParams",
      serverParams: {
        ...serverParams,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      },
      timeout: 20_000,
    });
  } catch (err) {
    console.error("buildMcpToolset: failed to construct MCPToolset:", err);
    return null;
  }
}

function textFromParts(parts: ChatMessage["parts"]): string {
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function fileUrlsFromParts(parts: ChatMessage["parts"]): {
  url: string;
  mediaType: string;
}[] {
  const files: { url: string; mediaType: string }[] = [];
  for (const p of parts) {
    if (
      p.type === "file" &&
      typeof (p as { url?: unknown }).url === "string"
    ) {
      files.push({
        url: (p as { url: string }).url,
        mediaType:
          (p as { mediaType?: string }).mediaType ?? "application/octet-stream",
      });
    }
  }
  return files;
}

/**
 * Builds the genai Content for the latest user message. Attaches image
 * attachments as inlineData when reachable, otherwise appends their URLs to
 * the text so the model is at least aware of them.
 */
async function buildNewMessage(
  latest: ChatMessage
): Promise<Content> {
  const text = textFromParts(latest.parts);
  const files = fileUrlsFromParts(latest.parts);
  const parts: GenAiPart[] = [];

  for (const file of files) {
    try {
      const res = await fetch(file.url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        parts.push({
          inlineData: {
            mimeType: file.mediaType,
            data: buf.toString("base64"),
          },
        });
        continue;
      }
    } catch {
      /* fall through to URL text */
    }
    parts.push({ text: `[attachment: ${file.url}]` });
  }

  parts.push({ text: text || "(no text)" });
  return { role: "user", parts };
}

function buildTranscript(uiMessages: ChatMessage[]): TranscriptMessage[] {
  // Drop the latest message (sent as newMessage), text parts only, cap.
  const prior = uiMessages.slice(0, -1);
  const transcript: TranscriptMessage[] = [];
  for (const m of prior) {
    if (m.role !== "user" && m.role !== "assistant") {
      continue;
    }
    const text = textFromParts(m.parts);
    if (!text) {
      continue;
    }
    transcript.push({ role: m.role, text });
  }
  return transcript.slice(-MAX_TRANSCRIPT);
}

export type RunStudioAgentArgs = {
  writer: UIMessageStreamWriter<ChatMessage>;
  session: Session;
  student: Student;
  userId: string;
  uiMessages: ChatMessage[];
  modelId: string;
  chatId?: string;
};

/**
 * Bridges the ADK agent into the AI SDK UI message stream. Builds a fresh
 * agent + in-memory session per request, embeds prior conversation as a
 * transcript block in the instruction, and streams events to the writer.
 */
export async function runStudioAgent(args: RunStudioAgentArgs): Promise<void> {
  const { writer, session, student, userId, uiMessages, modelId, chatId } =
    args;
  const studentId = student.id;

  // Per-run trace id correlating every structured log line for this agent run.
  const runId = crypto.randomUUID();
  const runStartedAt = Date.now();
  const logBase = { runId, studentId, chatId: chatId ?? null };

  const latest = uiMessages.at(-1);
  if (!latest) {
    return;
  }
  const latestText = textFromParts(latest.parts);

  logStructured({
    severity: "INFO",
    message: "run_start",
    ...logBase,
    modelId,
  });

  // Load context for the instruction. searchStudentFacts is keyword-based;
  // we combine the most recent facts with a search on the user message.
  const [facts, documents, videos] = await Promise.all([
    getFactsByStudentId({ studentId, limit: 20 }),
    getDocumentsByStudentId({ studentId }),
    getVideosByStudentId({ studentId }),
  ]);

  const instruction = buildSystemPrompt({
    student,
    facts,
    documents: documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      createdAt: d.createdAt,
    })),
    videos,
    recentTranscript: buildTranscript(uiMessages),
  });

  const tools = buildAgentTools({
    session,
    dataStream: writer,
    studentId,
    userId,
    modelId,
  });

  const mcpToolset = buildMcpToolset();
  const agentTools: (BaseToolset | (typeof tools)[number])[] = mcpToolset
    ? [...tools, mcpToolset]
    : tools;

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;

  const agent = new LlmAgent({
    name: "teachflow_copilot",
    model: new Gemini({ model: modelId, apiKey }),
    instruction,
    // Prior turns are supplied via the transcript block in the instruction.
    // We keep `includeContents: "default"` (not "none") so that WITHIN this
    // request the model sees its own tool calls + tool responses and can
    // produce a grounded follow-up answer. The ADK session is fresh per
    // request, so the only "history" it injects is the current turn.
    includeContents: "default",
    tools: agentTools,
  });

  const sessionService = new InMemorySessionService();
  const adkSession = await sessionService.createSession({
    appName: APP_NAME,
    userId,
  });

  const runner = new Runner({
    appName: APP_NAME,
    agent,
    sessionService,
  });

  const newMessage = await buildNewMessage(latest);

  let streamedAny = false;
  let toolActivitySeen = false;
  const blockId = generateUUID();
  let started = false;
  let aggregated = "";

  // Observability + cost-guard accounting.
  let eventCount = 0;
  let outputChars = 0;
  let costGuardTriggered = false;
  // Maps a function-call name to the wall-clock time it was first observed, so
  // tool_result lines can report an approximate latency (ms).
  const toolStartTimes = new Map<string, number>();

  const ensureStart = () => {
    if (!started) {
      writer.write({ type: "text-start", id: blockId });
      started = true;
    }
  };

  try {
    for await (const event of runner.runAsync({
      userId,
      sessionId: adkSession.id,
      newMessage,
      runConfig: { streamingMode: StreamingMode.SSE },
    })) {
      eventCount += 1;

      if (handleToolActivity(writer, event, logBase, toolStartTimes)) {
        toolActivitySeen = true;
      }

      const parts = event.content?.parts ?? [];
      const eventText = textFromEventParts(parts);
      outputChars += eventText.length;

      // Cost guard: abort the runner loop gracefully past a generous ceiling.
      if (
        !costGuardTriggered &&
        (outputChars > TOKEN_GUARD_CHARS || eventCount > TOKEN_GUARD_EVENTS)
      ) {
        costGuardTriggered = true;
        logStructured({
          severity: "WARNING",
          message: "cost_guard_triggered",
          ...logBase,
          eventCount,
          outputChars,
          limitChars: TOKEN_GUARD_CHARS,
          limitEvents: TOKEN_GUARD_EVENTS,
        });
        ensureStart();
        writer.write({
          type: "text-delta",
          id: blockId,
          delta:
            "\n\n_(Stopping here — this response hit the per-run budget guard. Ask me to continue if you need more.)_",
        });
        streamedAny = true;
        break;
      }

      if (eventText) {
        if (event.partial) {
          ensureStart();
          writer.write({
            type: "text-delta",
            id: blockId,
            delta: eventText,
          });
          aggregated += eventText;
          streamedAny = true;
        } else if (streamedAny) {
          // Final aggregated text after we already streamed deltas — dedupe:
          // only emit the remainder if the final text extends what we streamed.
          if (eventText.length > aggregated.length && started) {
            writer.write({
              type: "text-delta",
              id: blockId,
              delta: eventText.slice(aggregated.length),
            });
            aggregated = eventText;
          }
        } else {
          // Non-partial final text without prior deltas (SSE unsupported):
          // emit as one complete text block.
          const id = generateUUID();
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: eventText });
          writer.write({ type: "text-end", id });
        }
      }
    }
  } catch (err) {
    console.error("runStudioAgent: error during agent run:", err);
    throw err;
  } finally {
    if (started) {
      writer.write({ type: "text-end", id: blockId });
    }
    if (mcpToolset) {
      // Close the stdio MCP child process; never let cleanup failures surface.
      await mcpToolset.close().catch((err) => {
        console.error("runStudioAgent: MCP toolset close failed:", err);
      });
    }
    logStructured({
      severity: "INFO",
      message: "run_end",
      ...logBase,
      ms: Date.now() - runStartedAt,
      eventCount,
      outputChars,
      costGuardTriggered,
    });
  }

  // The agent produced no text and ran no tools — usually a model/quota error
  // swallowed by the runtime. Surface a visible note instead of a blank turn.
  if (!(streamedAny || toolActivitySeen)) {
    const id = generateUUID();
    writer.write({ type: "text-start", id });
    writer.write({
      type: "text-delta",
      id,
      delta:
        "I couldn't generate a response just now (the model may be rate-limited). Please try again in a moment.",
    });
    writer.write({ type: "text-end", id });
  }
}

function textFromEventParts(parts: GenAiPart[]): string {
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text as string)
    .join("");
}

function handleToolActivity(
  writer: UIMessageStreamWriter<ChatMessage>,
  event: Event,
  logBase: Record<string, unknown>,
  toolStartTimes: Map<string, number>
): boolean {
  let saw = false;
  const calls = getFunctionCalls(event);
  for (const call of calls) {
    saw = true;
    const tool = call.name ?? "tool";
    toolStartTimes.set(tool, Date.now());
    writer.write({
      type: "data-toolActivity",
      data: { name: tool, status: "running" },
      transient: true,
    });
    logStructured({
      severity: "INFO",
      message: "tool_call",
      ...logBase,
      tool,
    });
  }
  const responses = getFunctionResponses(event);
  for (const resp of responses) {
    saw = true;
    const tool = resp.name ?? "tool";
    const startedAt = toolStartTimes.get(tool);
    writer.write({
      type: "data-toolActivity",
      data: { name: tool, status: "done" },
      transient: true,
    });
    logStructured({
      severity: "INFO",
      message: "tool_result",
      ...logBase,
      tool,
      ms: typeof startedAt === "number" ? Date.now() - startedAt : null,
    });
  }
  return saw;
}
