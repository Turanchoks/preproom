import { streamObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { buildPedagogyBlock } from "@/lib/agent/prompts";
import { enrichHomework } from "@/lib/media/enrich";
import type { HomeworkContent } from "@/lib/quiz/homework-schema";

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
  // Media-backed types: the model generates ONLY text. `prompt`/`imagePrompt`
  // are fed to TTS / image generation in post-processing (lib/media/enrich.ts),
  // which attaches audioUrl / imageUrl. Those URL fields are deliberately ABSENT
  // from the generation schema.
  z.object({
    ...baseExerciseFields,
    type: z.literal("listening"),
    payload: z.object({
      prompt: z
        .string()
        .describe(
          "Text spoken aloud by TTS — NOT shown to the student. A word, phrase, or short sentence in the target language."
        ),
      question: z
        .string()
        .describe("Question shown to the student about what they heard"),
      options: z.array(z.string()).describe("2-6 answer choices"),
      correctIndex: z.number().int().describe("0-based index of the correct option"),
      explanation: z.string().optional(),
    }),
  }),
  z.object({
    ...baseExerciseFields,
    type: z.literal("image-flashcard"),
    payload: z.object({
      imagePrompt: z
        .string()
        .describe(
          "Prompt for an image generator — NOT shown to the student. Describe a single concrete subject on a plain white background, no text."
        ),
      word: z.string().describe("The word/meaning the image depicts"),
      options: z
        .array(z.string())
        .describe("2-6 answer choices (the matching word/meaning + distractors)"),
      correctIndex: z.number().int().describe("0-based index of the correct option"),
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
- between 3 and 8 exercises drawn from these types: multiple-choice, fill-blank, word-matching, fill-gaps, word-puzzle, listening, image-flashcard.

Payload rules per exercise type (the "payload" object):
- multiple-choice: { question, options (2-6 strings), correctIndex (0-based), explanation? }
- fill-blank: { sentence (exactly one blank written as ___), answers (accepted strings), hint? }
- word-matching: { question?, pairs (3-8 { source, target }) }
- fill-gaps: { paragraph (gaps written as [gap1], [gap2], ...), gaps ([{ id, answers }]), question?, hint? }
- word-puzzle: { correctSentence, words (shuffled sentence tokens), distractors?, alternativeAnswers? }
- listening: { prompt, question, options (2-6 strings), correctIndex (0-based), explanation? } — the student HEARS an audio clip and answers a question about it. The "prompt" is the exact text that will be spoken aloud (in the target language); it is NEVER shown on screen. Use this for pronunciation and listening-comprehension practice (e.g. "Which word did you hear?", "What did the speaker say?"). Keep the spoken "prompt" to a word, phrase, or short sentence.
- image-flashcard: { imagePrompt, word, options (2-6 strings), correctIndex (0-based) } — the student SEES a generated picture and picks the matching word/meaning. The "imagePrompt" is the description sent to an image generator (NEVER shown); describe a single concrete subject on a plain white background, no text in the image. Use this only for CONCRETE, picturable vocabulary (objects, animals, food, actions) — never for abstract grammar.

Give each exercise a stable id like ex-1, a clear type, a short title, and concise instructions. Vary the exercise types across the set — when pedagogically apt, a typical homework should MIX media exercises with the text ones: include about 1 listening exercise (for pronunciation/listening practice) and about 1 image-flashcard (when the lesson involves concrete vocabulary) among the text exercises. Return only the structured object.

${buildPedagogyBlock()}`;

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

    const final = (await object) as HomeworkContent;
    // Post-process: synthesize audio/images for media-backed exercises and
    // attach their URLs, then emit ONE final snapshot with the enriched JSON.
    const enriched = await enrichHomework(final);
    const enrichedContent = JSON.stringify(enriched);
    dataStream.write({
      type: "data-homeworkDelta",
      data: enrichedContent,
      transient: true,
    });
    return enrichedContent;
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

    const final = (await object) as HomeworkContent;
    const enriched = await enrichHomework(final);
    const enrichedContent = JSON.stringify(enriched);
    dataStream.write({
      type: "data-homeworkDelta",
      data: enrichedContent,
      transient: true,
    });
    return enrichedContent;
  },
});
