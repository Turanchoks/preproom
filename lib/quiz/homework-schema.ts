import { z } from "zod";

/**
 * Homework artifact content contract.
 *
 * Single source of truth shared by:
 *  - the agent's create_homework tool / homework document handler (generation)
 *  - the homework artifact renderer (streaming preview)
 *  - the quiz player on public share pages (playback)
 *
 * Track A note: these payload schemas are RECONCILED against the actual
 * ported exercise components' `isValid` guards (see components/quiz/exercises/*).
 * Keep them in sync with those components — everything else imports from here.
 */

// multiple-choice — components/quiz/exercises/multiple-choice.tsx
export const multipleChoicePayloadSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional(),
});

// fill-blank — components/quiz/exercises/fill-blank.tsx
export const fillBlankPayloadSchema = z.object({
  sentence: z
    .string()
    .describe("Sentence with exactly one blank written as ___ (three underscores)"),
  answers: z
    .array(z.string())
    .min(1)
    .describe("Accepted answers; the first is the canonical/displayed answer"),
  hint: z.string().optional(),
  caseSensitive: z.boolean().optional(),
});

// word-matching — components/quiz/exercises/word-matching.tsx
export const wordMatchingPayloadSchema = z.object({
  question: z.string().optional(),
  pairs: z
    .array(z.object({ source: z.string(), target: z.string() }))
    .min(3)
    .max(8),
});

// fill-gaps — components/quiz/exercises/fill-gaps.tsx
// Each `___` in the paragraph is filled from the i-th entry in `gaps`,
// rendered as a dropdown of `options` with one `correctIndex`.
export const fillGapsPayloadSchema = z.object({
  paragraph: z
    .string()
    .describe("Paragraph with one or more blanks written as ___ (three underscores)"),
  gaps: z
    .array(
      z.object({
        options: z.array(z.string()).min(2),
        correctIndex: z.number().int().min(0),
      })
    )
    .min(1),
  question: z.string().optional(),
  hint: z.string().optional(),
});

// word-puzzle — components/quiz/exercises/word-puzzle.tsx
export const wordPuzzlePayloadSchema = z.object({
  question: z.string().optional(),
  correctSentence: z.string(),
  words: z.array(z.string()).min(2).describe("Sentence tokens, shuffled"),
  alternativeAnswers: z.array(z.string()).optional(),
  distractors: z.array(z.string()).optional(),
});

// sentence-matching — components/quiz/exercises/sentence-matching.tsx
export const sentenceMatchingPayloadSchema = z.object({
  question: z.string().optional(),
  prompt: z.string().describe("Long-form prompt sentence shown at the top"),
  options: z.array(z.string()).min(2).max(6),
  correctIndex: z.number().int().min(0),
});

export const exerciseTypeSchemas = {
  "multiple-choice": multipleChoicePayloadSchema,
  "fill-blank": fillBlankPayloadSchema,
  "word-matching": wordMatchingPayloadSchema,
  "fill-gaps": fillGapsPayloadSchema,
  "word-puzzle": wordPuzzlePayloadSchema,
  "sentence-matching": sentenceMatchingPayloadSchema,
} as const;

export type ExerciseType = keyof typeof exerciseTypeSchemas;

export const EXERCISE_TYPES = Object.keys(
  exerciseTypeSchemas
) as ExerciseType[];

export const homeworkExerciseSchema = z.object({
  id: z.string().describe("Stable id, e.g. ex-1"),
  type: z.enum(
    Object.keys(exerciseTypeSchemas) as [ExerciseType, ...ExerciseType[]]
  ),
  title: z.string(),
  instructions: z.string(),
  // Payload validated per-type at runtime via exerciseTypeSchemas[type]
  payload: z.record(z.string(), z.unknown()),
});

export const homeworkSchema = z.object({
  title: z.string(),
  lessonSummary: z
    .string()
    .describe("1-2 sentence summary shown on the welcome screen"),
  exercises: z.array(homeworkExerciseSchema).min(3).max(8),
});

export type HomeworkExercise = z.infer<typeof homeworkExerciseSchema>;
export type HomeworkContent = z.infer<typeof homeworkSchema>;

export function validateExercisePayload(
  exercise: HomeworkExercise
): boolean {
  const schema = exerciseTypeSchemas[exercise.type as ExerciseType];
  if (!schema) {
    return false;
  }
  return schema.safeParse(exercise.payload).success;
}

export function parseHomework(content: string): HomeworkContent | null {
  try {
    const parsed = homeworkSchema.parse(JSON.parse(content));
    return {
      ...parsed,
      exercises: parsed.exercises.filter(validateExercisePayload),
    };
  } catch {
    return null;
  }
}
