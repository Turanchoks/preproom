import { streamObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

/**
 * Generation schema (NOT the validation contract).
 *
 * The shared `homeworkSchema` uses an open `z.record` for `payload`, which
 * Gemini's structured-output mode renders as an empty object (no properties),
 * so the model leaves it blank. A flat "superset" payload also confuses the
 * model (it reuses generic field names like `words` across types). So we use a
 * discriminated union on `type`: each exercise variant exposes ONLY its exact
 * per-type payload fields, which Gemini's structured output then enforces. The
 * emitted JSON is still re-validated per-type downstream by `parseHomework`.
 */
const baseExerciseFields = {
  id: z.string().describe("Stable id, e.g. ex-1"),
  title: z.string(),
  instructions: z.string(),
};

const generationExerciseSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseExerciseFields,
    type: z.literal("multiple-choice"),
    payload: z.object({
      question: z.string(),
      options: z.array(z.string()).describe("2-6 answer choices"),
      correctIndex: z.number().int().describe("0-based index of the correct option"),
      explanation: z.string().optional(),
    }),
  }),
  z.object({
    ...baseExerciseFields,
    type: z.literal("fill-blank"),
    payload: z.object({
      sentence: z.string().describe("Sentence with exactly one blank as ___"),
      answers: z.array(z.string()).describe("Accepted answers"),
      hint: z.string().optional(),
    }),
  }),
  z.object({
    ...baseExerciseFields,
    type: z.literal("word-matching"),
    payload: z.object({
      question: z.string().optional(),
      pairs: z
        .array(z.object({ source: z.string(), target: z.string() }))
        .describe("3-8 source/target pairs"),
    }),
  }),
  z.object({
    ...baseExerciseFields,
    type: z.literal("fill-gaps"),
    payload: z.object({
      paragraph: z.string().describe("Paragraph with gaps as [gap1], [gap2], ..."),
      gaps: z.array(
        z.object({ id: z.string(), answers: z.array(z.string()) })
      ),
      question: z.string().optional(),
      hint: z.string().optional(),
    }),
  }),
  z.object({
    ...baseExerciseFields,
    type: z.literal("word-puzzle"),
    payload: z.object({
      correctSentence: z.string(),
      words: z.array(z.string()).describe("Shuffled sentence tokens"),
      distractors: z.array(z.string()).optional(),
      alternativeAnswers: z.array(z.string()).optional(),
    }),
  }),
]);

const homeworkGenerationSchema = z.object({
  title: z.string(),
  lessonSummary: z
    .string()
    .describe("1-2 sentence summary shown on the welcome screen"),
  exercises: z.array(generationExerciseSchema).min(3).max(8),
});

const SYSTEM_PROMPT = `You are an expert language-teaching content designer. You create interactive homework exercise sets tailored to an individual language student.

Personalize every exercise to the student's profile when context is provided:
- Match the difficulty to the student's CEFR level (A1-C2).
- Reinforce their learning goals and the lesson topic / grammar theme.
- Lean on the student's strengths, but deliberately target their recurring errors and areas for improvement.
- Keep everything student-safe, encouraging, and unambiguous.

Produce a homework set with:
- a short, motivating title;
- a one or two sentence lessonSummary shown on the welcome screen;
- between 3 and 8 exercises drawn from these types: multiple-choice, fill-blank, word-matching, fill-gaps, word-puzzle.

Payload rules per exercise type (the "payload" object):
- multiple-choice: { question, options (2-6 strings), correctIndex (0-based), explanation? }
- fill-blank: { sentence (exactly one blank written as ___), answers (accepted strings), hint? }
- word-matching: { question?, pairs (3-8 { source, target }) }
- fill-gaps: { paragraph (gaps written as [gap1], [gap2], ...), gaps ([{ id, answers }]), question?, hint? }
- word-puzzle: { correctSentence, words (shuffled sentence tokens), distractors?, alternativeAnswers? }

Give each exercise a stable id like ex-1, a clear type, a short title, and concise instructions. Vary the exercise types across the set. Return only the structured object.`;

export const homeworkDocumentHandler = createDocumentHandler<"homework">({
  kind: "homework",
  // Snapshot streaming semantics: each `data-homeworkDelta` carries the FULL
  // current partial object as JSON and REPLACES the previous draft content on
  // the client. This keeps client-side parsing trivial — the latest delta is
  // always a (possibly partial) valid JSON object.
  onCreateDocument: async ({ title, dataStream, modelId, studentContext }) => {
    let draftContent = "";

    const { partialObjectStream, object } = streamObject({
      model: getLanguageModel(modelId),
      schema: homeworkGenerationSchema,
      system: SYSTEM_PROMPT,
      maxOutputTokens: 16_384,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 2048 } },
      },
      prompt: `Create a homework exercise set titled "${title}".

Student context:
${studentContext ?? "No specific student context provided — design a solid general-purpose set for an intermediate (B1) learner."}`,
    });

    for await (const partial of partialObjectStream) {
      draftContent = JSON.stringify(partial);
      dataStream.write({
        type: "data-homeworkDelta",
        data: draftContent,
        transient: true,
      });
    }

    const final = await object;
    return JSON.stringify(final);
  },
  onUpdateDocument: async ({
    document,
    description,
    dataStream,
    modelId,
    studentContext,
  }) => {
    let draftContent = "";

    const { partialObjectStream, object } = streamObject({
      model: getLanguageModel(modelId),
      schema: homeworkGenerationSchema,
      system: SYSTEM_PROMPT,
      maxOutputTokens: 16_384,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 2048 } },
      },
      prompt: `Revise the following homework exercise set based on the requested change.

Existing homework JSON:
${document.content ?? ""}

Requested change:
${description}
${studentContext ? `\nStudent context:\n${studentContext}` : ""}

Return the full updated homework object.`,
    });

    for await (const partial of partialObjectStream) {
      draftContent = JSON.stringify(partial);
      dataStream.write({
        type: "data-homeworkDelta",
        data: draftContent,
        transient: true,
      });
    }

    const final = await object;
    return JSON.stringify(final);
  },
});
