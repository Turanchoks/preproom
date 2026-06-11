import {
  EXERCISE_TYPES,
  type ExerciseType,
} from "@/lib/quiz/homework-schema";
import { PEDAGOGY_RUBRIC } from "./prompts";

/**
 * Per-exercise-type pedagogical metadata, distilled from
 * docs/harvest/pedagogy-rubric.md (didactic stage, control level, CEFR range,
 * skills, cognitive budget). This is the catalog the agent consults to decide
 * which exercise types it can build and how to sequence them.
 *
 * Shared by the MCP server (mcp/exercise-server.ts) and the in-process
 * get_exercise_catalog FunctionTool fallback (lib/agent/tools.ts).
 */
export type ExerciseCatalogEntry = {
  type: ExerciseType;
  description: string;
  didacticStage: string;
  controlLevel: string;
  cefr: string[];
  skills: string;
  cognitiveBudget: number;
};

const CATALOG: Record<ExerciseType, Omit<ExerciseCatalogEntry, "type">> = {
  "multiple-choice": {
    description:
      "Pick the correct option for a question. Recognition check of grammar, vocabulary, or comprehension.",
    didacticStage: "practice",
    controlLevel: "recognition",
    cefr: ["A1", "A2", "B1", "B2"],
    skills: "grammar, vocabulary, reading",
    cognitiveBudget: 6,
  },
  "fill-blank": {
    description:
      "Type the missing word into a single gap in a sentence (one canonical answer, accepts variants).",
    didacticStage: "practice",
    controlLevel: "controlled",
    cefr: ["A2", "B1", "B2"],
    skills: "grammar, vocabulary",
    cognitiveBudget: 8,
  },
  "word-matching": {
    description:
      "Match source items to their targets (e.g. word↔translation, term↔definition). Lexical recognition.",
    didacticStage: "practice",
    controlLevel: "recognition",
    cefr: ["A1", "A2", "B1", "B2"],
    skills: "vocabulary",
    cognitiveBudget: 10,
  },
  "fill-gaps": {
    description:
      "Complete a paragraph by choosing each gap's answer from a dropdown of options (with distractors).",
    didacticStage: "practice",
    controlLevel: "recognition",
    cefr: ["A2", "B1", "B2"],
    skills: "grammar, reading, vocabulary",
    cognitiveBudget: 11,
  },
  "word-puzzle": {
    description:
      "Reorder shuffled tokens (optionally with distractors) into a correct sentence. Controlled syntax practice.",
    didacticStage: "practice",
    controlLevel: "controlled",
    cefr: ["A1", "A2", "B1"],
    skills: "grammar, writing",
    cognitiveBudget: 20,
  },
  "sentence-matching": {
    description:
      "Read a long-form prompt sentence and choose the option that best matches/responds. Comprehension recognition.",
    didacticStage: "practice",
    controlLevel: "recognition",
    cefr: ["A2", "B1", "B2", "C1"],
    skills: "reading, grammar",
    cognitiveBudget: 6,
  },
  listening: {
    description:
      "Listen to a generated audio clip (a word, phrase, or short sentence in the target language) and answer a multiple-choice question about it. The spoken text is never shown. Audio is TTS-synthesized in post-processing.",
    didacticStage: "practice",
    controlLevel: "recognition",
    cefr: ["A1", "A2", "B1", "B2"],
    skills: "listening, pronunciation, vocabulary",
    cognitiveBudget: 10,
  },
  "image-flashcard": {
    description:
      "See a generated illustration and pick the matching word/meaning from options. For concrete, picturable vocabulary only. The image is generated in post-processing.",
    didacticStage: "presentation",
    controlLevel: "recognition",
    cefr: ["A1", "A2", "B1"],
    skills: "vocabulary",
    cognitiveBudget: 8,
  },
};

/** The full exercise-type catalog enriched with pedagogical metadata. */
export function buildExerciseCatalog(): ExerciseCatalogEntry[] {
  return EXERCISE_TYPES.map((type) => ({ type, ...CATALOG[type] }));
}

/**
 * The catalog payload returned by get_exercise_catalog (MCP tool or
 * FunctionTool fallback): the exercise types plus the embeddable pedagogy
 * rubric for sequencing.
 */
export function getExerciseCatalogPayload() {
  return {
    exerciseTypes: buildExerciseCatalog(),
    pedagogyRubric: PEDAGOGY_RUBRIC,
    note: "Select types whose cefr range includes the learner's level and whose skills match the lesson goals; sequence by didacticStage then increasing controlLevel (see pedagogyRubric).",
  };
}
