/**
 * Exercise Component Contract.
 *
 * Every exercise type must implement a React component that accepts
 * `ExerciseComponentProps`. The component is a "black box" — the shell
 * knows nothing about its internals; it only communicates through
 * `onComplete` and optionally `onStateChange`.
 *
 * Ported from linqua-quizapp/src/core/exercise-contract.ts.
 */

import type { SupportedLocale } from "../lib/i18n";
import type {
  ChainSettings,
  ExerciseInteractionState,
  ExerciseResult,
  ExerciseReviewSnapshot,
} from "./types";

export interface ExerciseComponentProps {
  exerciseId: string;
  payload: unknown;
  chainSettings: ChainSettings;
  interfaceLanguage: SupportedLocale;
  isMuted: boolean;
  onComplete: (result: ExerciseResult) => void;
  onStateChange?: (state: ExerciseInteractionState) => void;
  reviewMode?: boolean;
  reviewSnapshot?: ExerciseReviewSnapshot | null;
}

export interface ExerciseImperativeHandle {
  performCheck?: () => void;
  reset?: () => void;
  executeCommand?: (command: string) => void;
}
