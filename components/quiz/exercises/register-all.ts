/**
 * Exercise registration entry point.
 *
 * Each call to `registerExercise(type, Component)` makes that type available
 * to ExerciseSlot. This module is imported once for its side effects.
 *
 * Ported from the linqua quizapp. For PrepRoom we ship only the six
 * exercise types the homework artifact contract supports. Authors can still
 * pass an unregistered `type` in their JSON — those fall through to the
 * FallbackExercise renderer.
 */

import { registerExercise } from "../core/exercise-registry";
import { MultipleChoiceExercise } from "./multiple-choice";
import { FillBlankExercise } from "./fill-blank";
import { FillGapsExercise } from "./fill-gaps";
import { WordMatchingExercise } from "./word-matching";
import { WordPuzzleExercise } from "./word-puzzle";
import { SentenceMatchingExercise } from "./sentence-matching";
import { ListeningExercise } from "./listening";
import { ImageFlashcardExercise } from "./image-flashcard";

let registered = false;

/** Idempotent — safe to call from multiple ChainProvider mounts. */
export function registerAllExercises() {
  if (registered) return;
  registered = true;

  registerExercise("multiple-choice", MultipleChoiceExercise);
  registerExercise("fill-blank", FillBlankExercise);
  registerExercise("fill-gaps", FillGapsExercise);
  registerExercise("word-matching", WordMatchingExercise);
  registerExercise("word-puzzle", WordPuzzleExercise);
  registerExercise("sentence-matching", SentenceMatchingExercise);
  registerExercise("listening", ListeningExercise);
  registerExercise("image-flashcard", ImageFlashcardExercise);
}

/** Stable list of supported types — used by builder UIs and fallback messaging. */
export const SUPPORTED_EXERCISE_TYPES = [
  "multiple-choice",
  "fill-blank",
  "fill-gaps",
  "word-matching",
  "word-puzzle",
  "sentence-matching",
  "listening",
  "image-flashcard",
] as const;

export type SupportedExerciseType = (typeof SUPPORTED_EXERCISE_TYPES)[number];
