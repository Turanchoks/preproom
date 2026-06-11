import { FunctionTool } from "@google/adk";
import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import {
  getDocumentsByStudentId,
  getFactsByStudentId,
  getLatestDocumentById,
  getStudentById,
  getVideoById,
  getVideosByStudentId,
  saveStudentFact,
  searchStudentFacts,
} from "@/lib/db/queries-studio";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { buildStudentProfileBlock } from "./prompts";

/**
 * Thin wrapper around ADK's FunctionTool. The app's `zod` install and ADK's
 * bundled `zod/v3` are structurally different at the type level (private
 * internals differ), so we cast the schema when handing it to ADK while
 * keeping the `execute` callback strongly typed off the same zod schema.
 */
function defineTool<S extends z.ZodObject<z.ZodRawShape>>(opts: {
  name: string;
  description: string;
  parameters: S;
  execute: (input: z.infer<S>) => Promise<unknown> | unknown;
}): FunctionTool {
  // biome-ignore lint/suspicious/noExplicitAny: cross-zod-version interop
  return new FunctionTool({
    name: opts.name,
    description: opts.description,
    // biome-ignore lint/suspicious/noExplicitAny: cross-zod-version interop
    parameters: opts.parameters as any,
    // biome-ignore lint/suspicious/noExplicitAny: cross-zod-version interop
    execute: opts.execute as any,
    // biome-ignore lint/suspicious/noExplicitAny: cross-zod-version interop
  }) as any;
}

export type AgentToolContext = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  studentId: string;
  userId: string;
  modelId: string;
};

const FACT_CATEGORIES = [
  "strength",
  "error",
  "interest",
  "note",
  "progress",
] as const;

function handlerForKind(kind: "text" | "homework") {
  const handler = documentHandlersByArtifactKind.find((h) => h.kind === kind);
  if (!handler) {
    throw new Error(`No document handler registered for kind: ${kind}`);
  }
  return handler;
}

/**
 * Runs the template-native artifact choreography (kind/id/title/clear → handler
 * → finish) and returns the resulting artifact id + title.
 */
async function createArtifact(
  ctx: AgentToolContext,
  kind: "text" | "homework",
  title: string,
  studentContext: string
): Promise<{ artifactId: string; title: string }> {
  const id = generateUUID();

  ctx.dataStream.write({ type: "data-kind", data: kind, transient: true });
  ctx.dataStream.write({ type: "data-id", data: id, transient: true });
  ctx.dataStream.write({ type: "data-title", data: title, transient: true });
  ctx.dataStream.write({ type: "data-clear", data: null, transient: true });

  const handler = handlerForKind(kind);
  await handler.onCreateDocument({
    id,
    title,
    dataStream: ctx.dataStream,
    session: ctx.session,
    modelId: ctx.modelId,
    studentId: ctx.studentId,
    studentContext,
  });

  ctx.dataStream.write({ type: "data-finish", data: null, transient: true });

  return { artifactId: id, title };
}

async function condensedProfile(ctx: AgentToolContext): Promise<string> {
  const student = await getStudentById({ id: ctx.studentId });
  if (!student) {
    return "";
  }
  const facts = await getFactsByStudentId({
    studentId: ctx.studentId,
    limit: 20,
  });
  return buildStudentProfileBlock(student, facts);
}

export function buildAgentTools(ctx: AgentToolContext): FunctionTool[] {
  const saveFact = defineTool({
    name: "save_fact",
    description:
      "Persist a durable observation about the student into long-term memory. Call this whenever the teacher reveals something lasting about the student (a recurring error, a strength, an interest, a milestone, or an important note).",
    parameters: z.object({
      category: z
        .enum(FACT_CATEGORIES)
        .describe(
          "strength | error | interest | note | progress — choose the best fit"
        ),
      fact: z
        .string()
        .describe("The observation, written concisely as a standalone fact."),
    }),
    execute: async ({ category, fact }) => {
      const row = await saveStudentFact({
        studentId: ctx.studentId,
        category,
        fact,
        source: "chat",
        sourceRef: null,
      });
      return { saved: true, id: row.id, category, fact };
    },
  });

  const searchMemory = defineTool({
    name: "search_memory",
    description:
      "Search the student's stored long-term observations by keyword. Call this before claiming you don't know something about the student.",
    parameters: z.object({
      query: z.string().describe("Keywords to search the student's memory."),
    }),
    execute: async ({ query }) => {
      const facts = await searchStudentFacts({
        studentId: ctx.studentId,
        query,
        limit: 10,
      });
      return {
        results: facts.map((f) => ({
          category: f.category,
          fact: f.fact,
          date: f.createdAt,
        })),
      };
    },
  });

  const getStudentProfile = defineTool({
    name: "get_student_profile",
    description:
      "Get the student's profile (name, level, languages, goals) plus their most recent stored observations.",
    parameters: z.object({}),
    execute: async () => {
      const student = await getStudentById({ id: ctx.studentId });
      if (!student) {
        return { error: "Student not found." };
      }
      const facts = await getFactsByStudentId({
        studentId: ctx.studentId,
        limit: 20,
      });
      return {
        profile: {
          name: student.name,
          level: student.level,
          goals: student.goals,
          nativeLanguage: student.nativeLanguage,
          targetLanguage: student.targetLanguage,
        },
        recentFacts: facts.map((f) => ({
          category: f.category,
          fact: f.fact,
          date: f.createdAt,
        })),
      };
    },
  });

  const listVideos = defineTool({
    name: "list_videos",
    description: "List the lesson videos uploaded for this student.",
    parameters: z.object({}),
    execute: async () => {
      const videos = await getVideosByStudentId({ studentId: ctx.studentId });
      return {
        videos: videos.map((v) => ({
          id: v.id,
          title: v.title,
          status: v.status,
          summary: v.summary,
        })),
      };
    },
  });

  const getVideoAnalysis = defineTool({
    name: "get_video_analysis",
    description:
      "Get the full AI analysis of a specific lesson video by its id (from list_videos).",
    parameters: z.object({
      videoId: z.string().describe("The id of the video to analyze."),
    }),
    execute: async ({ videoId }) => {
      const v = await getVideoById({ id: videoId });
      if (!v || v.studentId !== ctx.studentId) {
        return { error: "Video not found for this student." };
      }
      let analysis: string | null = null;
      if (v.analysisDocumentId) {
        const doc = await getLatestDocumentById({ id: v.analysisDocumentId });
        analysis = doc?.content ?? null;
      }
      return {
        title: v.title,
        status: v.status,
        summary: v.summary,
        analysis: analysis ?? "No detailed analysis available yet.",
      };
    },
  });

  const listStudentArtifacts = defineTool({
    name: "list_student_artifacts",
    description:
      "List the lesson plans and homework artifacts already created for this student (id, kind, title, date). Use an id with update_artifact to revise one.",
    parameters: z.object({}),
    execute: async () => {
      const docs = await getDocumentsByStudentId({ studentId: ctx.studentId });
      return {
        artifacts: docs.map((d) => ({
          id: d.id,
          kind: d.kind,
          title: d.title,
          createdAt: d.createdAt,
        })),
      };
    },
  });

  const createLessonPlan = defineTool({
    name: "create_lesson_plan",
    description:
      "Create a lesson plan artifact (a text document) personalized to the student. The plan opens in the canvas — do NOT paste its content into chat. Provide a detailed brief.",
    parameters: z.object({
      title: z.string().describe("Short title for the lesson plan."),
      brief: z
        .string()
        .describe(
          "Detailed instructions: lesson topic, objectives, target grammar/vocabulary, and anything to emphasize for this student."
        ),
    }),
    execute: async ({ title, brief }) => {
      const profile = await condensedProfile(ctx);
      const studentContext = `${brief}\n\nStudent profile:\n${profile}`;
      const result = await createArtifact(ctx, "text", title, studentContext);
      return {
        ...result,
        note: "Lesson plan created in the canvas. Reference it in your reply; do not paste its content.",
      };
    },
  });

  const createHomework = defineTool({
    name: "create_homework",
    description:
      "Create an interactive homework exercise set (quiz) artifact personalized to the student. It opens in the canvas — do NOT paste its content into chat. Provide a detailed brief.",
    parameters: z.object({
      title: z.string().describe("Short title for the homework set."),
      brief: z
        .string()
        .describe(
          "Detailed instructions: topic, target grammar/vocabulary, difficulty, and anything to emphasize for this student."
        ),
    }),
    execute: async ({ title, brief }) => {
      const profile = await condensedProfile(ctx);
      const studentContext = `${brief}\n\nStudent profile:\n${profile}`;
      const result = await createArtifact(
        ctx,
        "homework",
        title,
        studentContext
      );
      return {
        ...result,
        note: "Homework created in the canvas. Reference it in your reply; do not paste its content.",
      };
    },
  });

  const updateArtifact = defineTool({
    name: "update_artifact",
    description:
      "Revise an existing artifact (lesson plan or homework) by its id, following the given instructions. Updates appear live in the canvas — do not paste the content into chat.",
    parameters: z.object({
      artifactId: z
        .string()
        .describe("The id of the artifact to update (from the artifact index)."),
      instructions: z
        .string()
        .describe("What to change about the artifact."),
    }),
    execute: async ({ artifactId, instructions }) => {
      const doc = await getLatestDocumentById({ id: artifactId });
      if (!doc) {
        return { error: "Artifact not found." };
      }
      const kind = doc.kind === "homework" ? "homework" : "text";

      ctx.dataStream.write({ type: "data-kind", data: kind, transient: true });
      ctx.dataStream.write({
        type: "data-id",
        data: doc.id,
        transient: true,
      });
      ctx.dataStream.write({
        type: "data-title",
        data: doc.title,
        transient: true,
      });
      ctx.dataStream.write({ type: "data-clear", data: null, transient: true });

      const profile = await condensedProfile(ctx);
      const handler = handlerForKind(kind);
      await handler.onUpdateDocument({
        document: doc,
        description: `${instructions}\n\nStudent profile:\n${profile}`,
        dataStream: ctx.dataStream,
        session: ctx.session,
        modelId: ctx.modelId,
        studentId: ctx.studentId,
        studentContext: `${instructions}\n\nStudent profile:\n${profile}`,
      });

      ctx.dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        artifactId: doc.id,
        title: doc.title,
        note: "Artifact updated in the canvas. Reference the change; do not paste its content.",
      };
    },
  });

  return [
    saveFact,
    searchMemory,
    getStudentProfile,
    listVideos,
    getVideoAnalysis,
    listStudentArtifacts,
    createLessonPlan,
    createHomework,
    updateArtifact,
  ];
}
