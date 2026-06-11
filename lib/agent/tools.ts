import {
  AgentTool,
  type BaseTool,
  FunctionTool,
  Gemini,
  GOOGLE_SEARCH,
  LlmAgent,
} from "@google/adk";
import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import { getExerciseCatalogPayload } from "./exercise-catalog";
import {
  type AspectRatio,
  generateAudioUrl,
  generateIllustrationUrl,
} from "./media-bridge";
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
import { buildPedagogyBlock, buildStudentProfileBlock } from "./prompts";

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

/**
 * Builds a web_search tool as an AgentTool wrapping a sub-agent that has ONLY
 * the built-in Google Search tool. ADK forbids mixing the built-in
 * google_search with function tools on one agent, so we isolate it in a
 * sub-agent and expose it to the main agent as a callable tool. Returns null if
 * construction fails (then we simply skip web search).
 */
function buildWebSearchTool(ctx: AgentToolContext): AgentTool | null {
  try {
    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
    const searchAgent = new LlmAgent({
      name: "web_search",
      description:
        "Searches the web (Google) for current, factual, or culture/topic information and returns a concise grounded answer with sources.",
      model: new Gemini({ model: ctx.modelId, apiKey }),
      instruction:
        "You are a focused web-search assistant for a language teacher. Use Google Search to answer the query factually and concisely. Return the key facts plus any source titles/links you used. Do not editorialize.",
      tools: [GOOGLE_SEARCH],
    });
    return new AgentTool({ agent: searchAgent });
  } catch (err) {
    console.error("buildWebSearchTool: failed to build web_search tool:", err);
    return null;
  }
}

/**
 * Builds a `pedagogy_reviewer` tool as an AgentTool wrapping a sub-agent
 * (gemini-3.5-flash) that critiques a homework set against the compact pedagogy
 * rubric. Same isolation pattern as `buildWebSearchTool`: a focused LlmAgent
 * exposed to the main agent as a callable tool. The sub-agent is instructed to
 * emit strict JSON {score:1-5, issues:[], suggestions:[]}; callers parse
 * leniently. Returns null if construction fails (the loop then simply skips the
 * critic, never blocking homework creation).
 */
function buildPedagogyReviewerTool(ctx: AgentToolContext): AgentTool | null {
  try {
    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
    const reviewer = new LlmAgent({
      name: "pedagogy_reviewer",
      description:
        "Reviews a freshly created homework set against the pedagogy rubric for this student. Pass the homework as JSON (or a description of its exercises) plus the student context (CEFR level, target language, goals). Returns a STRICT JSON critique {score:1-5, issues:string[], suggestions:string[]}. Call this once right after create_homework and report the score to the teacher; treat it as advisory feedback (do not auto-revise unless the teacher asks).",
      model: new Gemini({ model: ctx.modelId, apiKey }),
      instruction: `You are a rigorous pedagogy reviewer for a language-teaching tool. You are given a homework exercise set (as JSON or a description) and the student's context (CEFR level, target language, goals, recurring errors).

Evaluate the homework against this rubric:

${buildPedagogyBlock()}

Score the set 1-5 on overall pedagogical quality, weighing: CEFR-appropriateness of every exercise, correct didactic-stage ordering, monotonic control-level progression, one-new-pattern-per-item, recycle-don't-repeat, self-study suitability (deterministic / self-checkable), and relevance to the student's goals and recurring errors.

Scoring guide: 5 = exemplary; 4 = solid, minor nits; 3 = usable but real sequencing/level problems; 1-2 = significant violations (wrong CEFR, production before practice, mixed patterns, non-self-checkable bulk).

Respond with ONLY a single JSON object, no prose, no markdown fences:
{"score": <integer 1-5>, "issues": ["<concrete problem>", ...], "suggestions": ["<concrete actionable fix phrased as an instruction for update_artifact>", ...]}

Keep issues and suggestions concise (each a short sentence). If the set is excellent, return score 5 with empty arrays.`,
    });
    return new AgentTool({ agent: reviewer });
  } catch (err) {
    console.error(
      "buildPedagogyReviewerTool: failed to build pedagogy_reviewer tool:",
      err
    );
    return null;
  }
}

export function buildAgentTools(ctx: AgentToolContext): BaseTool[] {
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

  const generateIllustration = defineTool({
    name: "generate_illustration",
    description:
      "Generate an illustration (e.g. a vocabulary scene, a flashcard image, a scene to describe) for use in the lesson. Returns Markdown for the image — paste the returned Markdown EXACTLY into your chat reply so it renders inline for the teacher.",
    parameters: z.object({
      prompt: z
        .string()
        .describe(
          "A vivid, specific description of the image to generate (subject, style, mood, key vocabulary objects to depict)."
        ),
      caption: z
        .string()
        .describe("Short caption / alt text for the image."),
      aspectRatio: z
        .enum(["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"])
        .optional()
        .describe("Aspect ratio; defaults to 1:1."),
    }),
    execute: async ({ prompt, caption, aspectRatio }) => {
      try {
        const url = await generateIllustrationUrl(
          prompt,
          (aspectRatio as AspectRatio | undefined) ?? "1:1"
        );
        const markdown = `![${caption}](${url})`;
        return {
          markdown,
          instruction:
            "Paste the `markdown` string verbatim into your reply so the image renders inline. You may add a sentence around it.",
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  const generateAudioSnippet = defineTool({
    name: "generate_audio_snippet",
    description:
      "Generate a short text-to-speech audio clip (e.g. a pronunciation model, an example sentence, a listening snippet) in the target language. Returns Markdown for an audio link — paste it into your chat reply so the teacher can play it.",
    parameters: z.object({
      text: z
        .string()
        .describe("The text to speak. Keep it short (a word, phrase, or sentence)."),
      language: z
        .string()
        .optional()
        .describe(
          "Optional BCP-47 language code (e.g. es-ES, fr-FR). If omitted, the language is auto-detected from the text."
        ),
    }),
    execute: async ({ text, language }) => {
      try {
        const url = await generateAudioUrl(text, language);
        const label = text.length > 40 ? `${text.slice(0, 40)}…` : text;
        const markdown = `[🔊 ${label}](${url})`;
        return {
          markdown,
          instruction:
            "Paste the `markdown` string into your reply so the teacher can play the audio.",
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  });

  const createProgressBrief = defineTool({
    name: "create_progress_brief",
    description:
      "Generate a parent/administrator-facing Progress Brief for this student — an evidence-cited summary of strengths, areas worked on, recent progress (quiz scores), and recommended next focus. It opens in the canvas — do NOT paste its content into chat; reference it instead. Takes no arguments (the student is implied by context).",
    parameters: z.object({}),
    execute: async () => {
      try {
        // Lazy dynamic import: the brief generator pulls server-only deps and
        // is owned by another track; importing it only when the tool fires
        // keeps the agent module's import graph light and failure-local.
        const { generateProgressBrief } = await import("@/lib/briefs/generate");
        const { documentId, title } = await generateProgressBrief(
          ctx.studentId,
          ctx.userId
        );

        // generateProgressBrief saves the Document but does NOT stream it to the
        // canvas. Emit the template-native artifact choreography so the saved
        // brief opens in the canvas for the teacher.
        const doc = await getLatestDocumentById({ id: documentId });
        const content = doc?.content ?? "";

        ctx.dataStream.write({
          type: "data-kind",
          data: "text",
          transient: true,
        });
        ctx.dataStream.write({
          type: "data-id",
          data: documentId,
          transient: true,
        });
        ctx.dataStream.write({
          type: "data-title",
          data: title,
          transient: true,
        });
        ctx.dataStream.write({
          type: "data-clear",
          data: null,
          transient: true,
        });
        ctx.dataStream.write({
          type: "data-textDelta",
          data: content,
          transient: true,
        });
        ctx.dataStream.write({
          type: "data-finish",
          data: null,
          transient: true,
        });

        return {
          artifactId: documentId,
          title,
          note: "Progress brief created in the canvas. Reference it in your reply; do not paste its content.",
        };
      } catch (err) {
        return {
          error:
            err instanceof Error
              ? err.message
              : "Failed to generate the progress brief.",
        };
      }
    },
  });

  const getExerciseCatalog = defineTool({
    name: "get_exercise_catalog",
    description:
      "Get the catalog of interactive exercise types you can generate (with each type's didactic stage, control level, CEFR range, skills, and cognitive budget) plus the pedagogy rubric for sequencing a homework set. Use this to answer what exercises you can create and how to order them by level.",
    parameters: z.object({}),
    execute: () => getExerciseCatalogPayload(),
  });

  const tools: BaseTool[] = [
    saveFact,
    searchMemory,
    getStudentProfile,
    listVideos,
    getVideoAnalysis,
    listStudentArtifacts,
    createLessonPlan,
    createHomework,
    createProgressBrief,
    updateArtifact,
    generateIllustration,
    generateAudioSnippet,
  ];

  // get_exercise_catalog is served over MCP when enabled; otherwise expose the
  // in-process FunctionTool fallback so the capability always works.
  if (process.env.MCP_ENABLED === "0") {
    tools.push(getExerciseCatalog);
  }

  const webSearch = buildWebSearchTool(ctx);
  if (webSearch) {
    tools.push(webSearch);
  }

  const pedagogyReviewer = buildPedagogyReviewerTool(ctx);
  if (pedagogyReviewer) {
    tools.push(pedagogyReviewer);
  }

  return tools;
}
