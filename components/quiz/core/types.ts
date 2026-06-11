/**
 * Core data types for the Exercise Chain system.
 *
 * Ported from the linqua-quizapp reference repo (src/core/types.ts).
 * All exported names are kept identical to the original — DO NOT rename them
 * without updating every adapter and chain component too.
 */

import type { ReactNode } from "react";
import type { SupportedLocale } from "../lib/i18n";
import type { FeedbackEmojiName } from "../lib/feedback-presentation";

// ============================================================================
// INPUT JSON CONTRACT
// ============================================================================

/** Top-level JSON that the player receives. */
export interface ChainJSON {
  locale?: SupportedLocale;
  chainSettings: ChainSettings;
  welcomeScreen: WelcomeScreenConfig;
  finalScreen: FinalScreenConfig;
  exercises: ExerciseEntry[];
}

export interface ChainSettings {
  /** Time limit in seconds. 0 or absent = no timer. */
  timeLimitSec: number;
  /** Whether the "Skip" option appears in the exercise menu. */
  allowSkip: boolean;
  /** Attempts allowed for each exercise. 0 or absent = unlimited. */
  attemptsPerExercise?: number;
  /** Retry lives shared across the whole quiz. 0 or absent = unlimited. */
  lives?: number;
}

export interface WelcomeScreenConfig {
  title: string;
  description: string;
  author?: string;
  authorPrefix?: string;
  authorLink?: string;
  startButtonText?: string;
  coverImage?: string;
  avatar?: string;
}

export interface FinalScreenConfig {
  title: string;
  congratsMessage: string;
  followText?: string;
  avatar?: string;
}

export interface ExerciseEntry {
  /** Unique identifier for this exercise instance. */
  id: string;
  /** Exercise template type key (looked up in ExerciseRegistry). */
  type: string;
  /** Exercise-specific data. Structure depends on `type`. */
  payload: unknown;
}

// ============================================================================
// RUNTIME STATE
// ============================================================================

export type ChainPhase = "welcome" | "exercise" | "times-up" | "practice" | "final";

export type ExerciseStatus = "pending" | "active" | "completed" | "skipped" | "error";

export type ExerciseRunPhase = "timed" | "practice";

export type Outcome = "solved" | "unsolved" | "unassessed";

export type EndReason =
  | "solved"
  | "attempts-exhausted"
  | "user-skip"
  | "time-limit"
  | "policy"
  | "error";

export interface ExerciseRunState {
  status: ExerciseStatus;
  result?: ExerciseResult;
}

export interface ExerciseState {
  id: string;
  type: string;
  timed: ExerciseRunState;
  practice: ExerciseRunState;
}

export interface ExerciseResult {
  /** Normalized score from 0 to 1. */
  score: number;
  outcome: Outcome;
  endReason: EndReason;
  attempts: number;
  timeSpentMs: number;
  isPractice?: boolean;
}

export interface ExerciseReviewSnapshot {
  exerciseId: string;
  phase: ExerciseRunPhase;
  result: ExerciseResult;
  feedbackData: ExerciseFeedbackPayload;
  reviewData?: unknown;
}

export interface ExerciseInteractionState {
  isReadyForCheck: boolean;
  isReadyForNext: boolean;
  mainActionType?: "check" | "advance";
  mainButtonLabel?: string;
  isProcessing?: boolean;
  feedbackData?: ExerciseFeedbackPayload;
  hasPlacedAnswers?: boolean;
}

export interface ExerciseFeedbackPayload {
  status: "correct" | "almost" | "incorrect";
  title: string;
  emoji: FeedbackEmojiName;
  hint?: string;
  primaryText?: ReactNode;
  secondaryText?: ReactNode;
  audioUrl?: string;
  score: number;
  attemptsExhausted?: boolean;
  nextAction?: "advance" | "skip";
  exerciseData?: unknown;
  reviewData?: unknown;
}

// ============================================================================
// AGGREGATE STATISTICS
// ============================================================================

export type ExerciseDisplayStatus =
  | "correct"
  | "incorrect"
  | "skipped"
  | "practice-correct"
  | "practice-incorrect";

export interface ExerciseResultSummary {
  id: string;
  type: string;
  status: ExerciseDisplayStatus;
  outcome: Outcome;
  endReason: EndReason;
  score: number;
  attempts: number;
}

export interface ChainStatistics {
  totalExercises: number;
  completedCount: number;
  skippedCount: number;
  errorCount: number;
  correctCount: number;
  incorrectCount: number;
  averageScore: number;
  totalTimeMs: number;
  exerciseResults: ExerciseResultSummary[];
  practiceResults: ExerciseResultSummary[];
  practiceCorrectCount: number;
  practiceIncorrectCount: number;
  hasPracticeResults: boolean;
}
