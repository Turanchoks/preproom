import "server-only";

import {
  type BaseTool,
  Gemini,
  InMemorySessionService,
  LlmAgent,
  Runner,
} from "@google/adk";
import type { Content } from "@google/genai";
import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import {
  getStudentById,
  getVideoById,
  saveStudentFact,
} from "@/lib/db/queries-studio";
import type { ChatMessage } from "@/lib/types";
import { buildStudentProfileBlock } from "./prompts";
import { buildAgentTools } from "./tools";

const APP_NAME = "tutorroom-proactive";
const MODEL_ID = "gemini-3.5-flash";

/**
 * Tools the proactive prep loop is allowed to use. Deliberately scoped: it can
 * read the student + video analysis, draft a plan + homework, and save one
 * note. It must NOT search the web, generate media, update existing artifacts,
 * etc. We FILTER the full tool set returned by buildAgentTools (Track RIGOR
 * owns tools.ts — we do not edit it).
 */
const ALLOWED_TOOL_NAMES = new Set<string>([
  "get_student_profile",
  "get_video_analysis",
  "create_lesson_plan",
  "create_homework",
  "save_fact",
]);

/**
 * A UIMessageStreamWriter whose writes are discarded. The proactive loop runs
 * with no client attached — but the artifact handlers in lib/artifacts/server.ts
 * persist the document via saveStudentDocument REGARDLESS of the stream (the
 * stream parts are only the live-canvas choreography). So lesson plans and
 * homework still land in the DB even though nothing reads the stream here.
 */
function buildNoopWriter(): UIMessageStreamWriter<ChatMessage> {
  return {
    write() {
      // discard — no client is attached to this run.
    },
    merge() {
      // discard
    },
    onError: undefined,
  } as unknown as UIMessageStreamWriter<ChatMessage>;
}

/**
 * Synthesizes a server-side Session for the student's owning teacher so the
 * artifact handlers (which gate persistence on session.user.id) save the
 * created documents attributed to the right user + student.
 */
function buildSyntheticSession(userId: string): Session {
  return {
    user: { id: userId, type: "regular" },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } as unknown as Session;
}

function buildInstruction(opts: {
  studentName: string;
  videoId: string;
  videoTitle: string;
  profileBlock: string;
}): string {
  return [
    `You are TutorRoom's autonomous prep copilot. A lesson video for ${opts.studentName} was JUST analyzed by the system, and no teacher is in the loop — you are working ahead so that the materials are ready when the teacher returns.`,
    "",
    `Student profile:`,
    opts.profileBlock,
    "",
    "Work through these steps IN ORDER, calling exactly one tool at a time:",
    `1. Call **get_video_analysis** with videoId "${opts.videoId}" to read the full analysis of the lesson that was just recorded. Identify the concrete struggles the student had.`,
    `2. Call **get_student_profile** if you need more context on ${opts.studentName}'s level, goals, and recurring errors.`,
    `3. Call **create_lesson_plan** to draft the NEXT lesson. The plan must directly target the struggles surfaced in the analysis. Give it a clear, specific title and a rich brief (objectives, target grammar/vocabulary, sequencing) personalized to ${opts.studentName}.`,
    `4. Call **create_homework** to build a homework set that DRILLS the same struggles, reinforcing what the next lesson will teach. Specific title + detailed brief.`,
    `5. Finally, call **save_fact** with category "note" and the fact EXACTLY in this form: "Proactive prep ready: <lesson plan title> + <homework title> (drafted from lesson video ${opts.videoTitle})". Use the actual titles you created.`,
    "",
    "Do not paste artifact bodies into your text. After step 5, reply with one short sentence confirming the prep is ready. Do not ask the teacher any questions — they are away.",
  ].join("\n");
}

export type RunProactivePrepArgs = {
  videoId: string;
  studentId: string;
};

export type ProactivePrepResult = {
  ran: boolean;
  reason?: string;
  factId?: string;
  durationMs?: number;
};

/**
 * Autonomous post-video prep loop (the "your copilot worked while you were
 * away" beat). Driven entirely by the agent: it reads the freshly-completed
 * video analysis, drafts the next lesson plan + a homework set targeting the
 * struggles, and records a 'note' fact announcing the prep — all WITHOUT any
 * human chat turn. Created artifacts persist to the DB via the artifact
 * handlers regardless of the no-op stream.
 *
 * Never throws to the caller in normal operation; the video-analysis hook also
 * wraps it in try/catch so prep failures can never break analysis.
 */
export async function runProactivePrep(
  args: RunProactivePrepArgs
): Promise<ProactivePrepResult> {
  const start = Date.now();
  const { videoId, studentId } = args;

  if (process.env.PROACTIVE_PREP === "0") {
    return { ran: false, reason: "kill_switch" };
  }

  const [student, video] = await Promise.all([
    getStudentById({ id: studentId }),
    getVideoById({ id: videoId }),
  ]);
  if (!student) {
    return { ran: false, reason: "student_not_found" };
  }
  if (!video || video.studentId !== studentId) {
    return { ran: false, reason: "video_not_found" };
  }

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { ran: false, reason: "no_api_key" };
  }

  const session = buildSyntheticSession(student.userId);
  const writer = buildNoopWriter();

  // Reuse the production tools, scoped to the prep-relevant subset. We close
  // over the real studentId/userId so the agent physically cannot touch
  // another student (same per-student tool permissioning as the live chat).
  const allTools = buildAgentTools({
    session,
    dataStream: writer,
    studentId,
    userId: student.userId,
    modelId: MODEL_ID,
  });
  const tools: BaseTool[] = allTools.filter(
    (t): t is BaseTool =>
      typeof (t as BaseTool).name === "string" &&
      ALLOWED_TOOL_NAMES.has((t as BaseTool).name)
  );

  const profileBlock = buildStudentProfileBlock(student, []);
  const instruction = buildInstruction({
    studentName: student.name,
    videoId,
    videoTitle: video.title,
    profileBlock,
  });

  const agent = new LlmAgent({
    name: "tutorroom_proactive_prep",
    model: new Gemini({ model: MODEL_ID, apiKey }),
    instruction,
    includeContents: "default",
    tools,
  });

  const sessionService = new InMemorySessionService();
  const adkSession = await sessionService.createSession({
    appName: APP_NAME,
    userId: student.userId,
  });
  const runner = new Runner({
    appName: APP_NAME,
    agent,
    sessionService,
  });

  const newMessage: Content = {
    role: "user",
    parts: [
      {
        text: `The lesson video "${video.title}" for ${student.name} was just analyzed. Prepare the next lesson plan and homework now, then save the prep note. Begin.`,
      },
    ],
  };

  let savedFactId: string | undefined;

  // Drive to completion. No streaming needed — we only need the tools to fire
  // and their side effects (document + fact persistence) to land.
  for await (const event of runner.runAsync({
    userId: student.userId,
    sessionId: adkSession.id,
    newMessage,
  })) {
    const parts = event.content?.parts ?? [];
    for (const part of parts) {
      const resp = part.functionResponse;
      if (resp?.name === "save_fact") {
        const r = resp.response as { id?: string } | undefined;
        if (r?.id) {
          savedFactId = r.id;
        }
      }
    }
  }

  // Safety net: the agent's instruction always ends in save_fact, but if the
  // model skipped it we still record the prep note so the demo beat lands.
  if (!savedFactId) {
    const row = await saveStudentFact({
      studentId,
      category: "note",
      fact: `Proactive prep ready (drafted from lesson video ${video.title})`,
      source: "video_analysis",
      sourceRef: videoId,
    });
    savedFactId = row.id;
  }

  const durationMs = Date.now() - start;
  return { ran: true, factId: savedFactId, durationMs };
}
