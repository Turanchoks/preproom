/**
 * Chain Runner — Zustand store that orchestrates the exercise chain flow.
 *
 * Ported from linqua-quizapp/src/core/chain-runner.ts. The shape of the
 * state and the action API are kept identical so adapters port over without
 * modification.
 *
 * In addition to the original behaviour, this version exposes
 * `setPersistenceCallbacks` so the host page can wire up tRPC persistence
 * (start an attempt, submit results) without coupling the runtime to React.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { getAttemptsPerExercise, getQuizLives } from "./attempts";
import type {
  ChainJSON,
  ChainPhase,
  ChainSettings,
  ChainStatistics,
  EndReason,
  ExerciseDisplayStatus,
  ExerciseEntry,
  ExerciseInteractionState,
  ExerciseResult,
  ExerciseResultSummary,
  ExerciseRunPhase,
  ExerciseRunState,
  ExerciseState,
  ExerciseStatus,
  FinalScreenConfig,
  Outcome,
  WelcomeScreenConfig,
} from "./types";

// ============================================================================
// PERSISTENCE HOOKS
// ============================================================================

export interface PersistenceCallbacks {
  /** Called the first time the chain transitions out of welcome. */
  onChainStart?: () => void | Promise<void>;
  /** Called once when the chain finishes (final phase). */
  onChainFinish?: (statistics: ChainStatistics, endReason: string) => void | Promise<void>;
}

// ============================================================================
// STATE
// ============================================================================

export interface ChainRunnerState {
  chainSettings: ChainSettings;
  welcomeScreen: WelcomeScreenConfig | null;
  finalScreen: FinalScreenConfig | null;
  exercises: ExerciseEntry[];

  phase: ChainPhase;
  currentIndex: number;
  exerciseStates: ExerciseState[];

  remainingSeconds: number | null;

  attemptsRemaining: number | null;
  livesRemaining: number | null;

  timedSnapshotIndex: number | null;

  currentInteraction: ExerciseInteractionState | null;
  currentChecksUsed: number;
  lastFailedCheckScore: number | null;
  currentExerciseStartedAt: number | null;

  isMuted: boolean;

  startedAt: number | null;
  finishedAt: number | null;

  /** Internal — set via setPersistenceCallbacks. Not meant for direct read. */
  persistenceCallbacks: PersistenceCallbacks;
  hasNotifiedStart: boolean;
  hasNotifiedFinish: boolean;
}

export interface ChainRunnerActions {
  initialize: (chain: ChainJSON) => void;
  startChain: () => void;
  completeExercise: (result: ExerciseResult) => void;
  advanceAfterFeedback: () => void;
  skipExercise: () => void;
  jumpToExercise: (targetIndex: number) => void;
  updateInteraction: (state: ExerciseInteractionState) => void;
  expireTimer: () => void;
  startPractice: () => void;
  finishChain: (endReason?: string) => void;
  consumeAttempt: () => number | null;
  consumeAttemptForCheck: () => number | null;
  consumeLife: () => number | null;
  reset: () => void;
  toggleMute: () => void;
  timerTick: () => void;
  getStatistics: () => ChainStatistics;
  setPersistenceCallbacks: (callbacks: PersistenceCallbacks) => void;
}

const DEFAULT_CHAIN_SETTINGS: ChainSettings = {
  timeLimitSec: 0,
  allowSkip: false,
};

export const useChainRunner = create<ChainRunnerState & ChainRunnerActions>()(
  immer((set, get) => ({
    chainSettings: DEFAULT_CHAIN_SETTINGS,
    welcomeScreen: null,
    finalScreen: null,
    exercises: [],
    phase: "welcome" as ChainPhase,
    currentIndex: 0,
    exerciseStates: [],
    remainingSeconds: null,
    timedSnapshotIndex: null,
    attemptsRemaining: null,
    livesRemaining: null,
    currentInteraction: null,
    currentChecksUsed: 0,
    lastFailedCheckScore: null,
    currentExerciseStartedAt: null,
    isMuted: false,
    startedAt: null,
    finishedAt: null,
    persistenceCallbacks: {},
    hasNotifiedStart: false,
    hasNotifiedFinish: false,

    initialize(chain: ChainJSON) {
      set((s) => {
        s.phase = "welcome";
        s.currentIndex = 0;
        s.remainingSeconds = null;
        s.attemptsRemaining = null;
        s.livesRemaining = null;
        s.timedSnapshotIndex = null;
        s.currentInteraction = null;
        s.currentChecksUsed = 0;
        s.lastFailedCheckScore = null;
        s.currentExerciseStartedAt = null;
        s.startedAt = null;
        s.finishedAt = null;
        s.hasNotifiedStart = false;
        s.hasNotifiedFinish = false;

        s.chainSettings = chain.chainSettings;
        s.welcomeScreen = chain.welcomeScreen;
        s.finalScreen = chain.finalScreen;

        s.exercises = chain.exercises;

        s.exerciseStates = chain.exercises.map((ex) => ({
          id: ex.id,
          type: ex.type,
          timed: createPendingRunState(),
          practice: createPendingRunState(),
        }));
      });
    },

    setPersistenceCallbacks(callbacks: PersistenceCallbacks) {
      set((s) => {
        s.persistenceCallbacks = callbacks;
      });
    },

    startChain() {
      const now = Date.now();

      let shouldNotify = false;
      set((s) => {
        if (s.phase !== "welcome") return;

        s.startedAt = now;

        if (s.exerciseStates.length === 0) {
          s.phase = "final";
          s.finishedAt = now;
          return;
        }

        s.phase = "exercise";
        s.currentIndex = 0;
        s.exerciseStates[0]!.timed.status = "active";

        if (s.chainSettings.timeLimitSec > 0) {
          s.remainingSeconds = s.chainSettings.timeLimitSec;
        }

        resetAttemptsForExercise(s);
        startExerciseRun(s, now);
        resetLivesForQuiz(s);

        if (!s.hasNotifiedStart) {
          s.hasNotifiedStart = true;
          shouldNotify = true;
        }
      });

      if (shouldNotify) {
        const cb = get().persistenceCallbacks.onChainStart;
        if (cb)
          Promise.resolve(cb()).catch((err) =>
            console.error("[chain-runner] onChainStart failed", err),
          );
      }
    },

    completeExercise(result: ExerciseResult) {
      const now = Date.now();

      set((s) => {
        const current = s.exerciseStates[s.currentIndex];
        const currentRun = current ? getRunStateForPhase(current, s.phase) : null;

        if (!currentRun || (currentRun.status !== "active" && currentRun.status !== "completed"))
          return;

        const isErrorResult = result.endReason === "error";
        currentRun.status = isErrorResult ? "error" : "completed";
        currentRun.result = buildResultPayload({
          result,
          defaultOutcome: "unassessed",
          defaultEndReason: isErrorResult ? "error" : "policy",
          isPractice: getRunPhaseForChainPhase(s.phase) === "practice",
        });

        if (isErrorResult) {
          s.currentInteraction = null;
          advanceToNext(s, now);
        }
      });

      // If the chain advanced into the final phase as a result of an error,
      // notify persistence so the attempt is closed out.
      maybeNotifyFinish(get, set, "error-advance");
    },

    advanceAfterFeedback() {
      const now = Date.now();
      set((s) => {
        s.currentInteraction = null;
        advanceToNext(s, now);
      });
      maybeNotifyFinish(get, set, "completed");
    },

    skipExercise() {
      const now = Date.now();
      set((s) => {
        const current = s.exerciseStates[s.currentIndex];
        const currentRun = current ? getRunStateForPhase(current, s.phase) : null;
        const hasAssessedFailure = hasStoredFailedCheck(s);
        const outcomeAfterSkip = hasAssessedFailure ? "unsolved" : "unassessed";

        if (!currentRun || currentRun.status !== "active") return;

        currentRun.status = "skipped";
        currentRun.result = buildResultPayload({
          result: {
            score: hasAssessedFailure ? (s.lastFailedCheckScore ?? 0) : 0,
            attempts: s.currentChecksUsed,
            timeSpentMs: getElapsedTimeMs(s, now),
            isPractice: getRunPhaseForChainPhase(s.phase) === "practice",
          },
          defaultEndReason: "user-skip",
          defaultOutcome: outcomeAfterSkip,
        });
        s.currentInteraction = null;
        resetAssessmentTracking(s);

        advanceToNext(s, now);
      });
      maybeNotifyFinish(get, set, "skip-advance");
    },

    jumpToExercise(targetIndex: number) {
      set((s) => {
        if (s.phase !== "exercise" && s.phase !== "practice") return;
        if (targetIndex < 0 || targetIndex >= s.exercises.length) return;
        if (targetIndex === s.currentIndex) return;

        const currentState = s.exerciseStates[s.currentIndex];
        const currentRun = currentState ? getRunStateForPhase(currentState, s.phase) : null;
        if (currentRun?.status === "active") {
          currentRun.status = "skipped";
        }

        s.currentIndex = targetIndex;
        s.currentInteraction = null;
        resetAttemptsForExercise(s);
        startExerciseRun(s, Date.now());
        const targetState = s.exerciseStates[targetIndex];
        if (targetState) {
          getRunStateForPhase(targetState, s.phase).status = "active";
        }
      });
    },

    updateInteraction(state: ExerciseInteractionState) {
      set((s) => {
        s.currentInteraction = state;

        if (!state.feedbackData) return;
        if (state.feedbackData.status === "correct") {
          s.lastFailedCheckScore = null;
          return;
        }
        if (state.feedbackData.nextAction === "skip") return;
        s.lastFailedCheckScore = state.feedbackData.score;
      });
    },

    consumeAttempt() {
      let remaining: number | null = null;
      set((s) => {
        s.currentChecksUsed += 1;
        if (s.attemptsRemaining !== null) {
          s.attemptsRemaining = Math.max(0, s.attemptsRemaining - 1);
          remaining = s.attemptsRemaining;
        }
        if (s.livesRemaining !== null) {
          s.livesRemaining = Math.max(0, s.livesRemaining - 1);
        }
      });
      return remaining;
    },

    consumeAttemptForCheck() {
      let remaining: number | null = null;
      set((s) => {
        s.currentChecksUsed += 1;
        if (s.attemptsRemaining !== null) {
          s.attemptsRemaining = Math.max(0, s.attemptsRemaining - 1);
          remaining = s.attemptsRemaining;
        }
      });
      return remaining;
    },

    consumeLife() {
      let remaining: number | null = null;
      set((s) => {
        if (s.livesRemaining !== null) {
          s.livesRemaining = Math.max(0, s.livesRemaining - 1);
          remaining = s.livesRemaining;
        }
      });
      return remaining;
    },

    expireTimer() {
      set((s) => {
        if (s.phase !== "exercise") return;

        s.timedSnapshotIndex = s.currentIndex;

        const current = s.exerciseStates[s.currentIndex];
        const currentRun = current ? getRunState(current, "timed") : null;
        if (currentRun?.status === "active") {
          const hasAssessedFailure = hasStoredFailedCheck(s);
          currentRun.status = hasAssessedFailure ? "completed" : "skipped";
          currentRun.result = buildResultPayload({
            result: {
              score: hasAssessedFailure ? (s.lastFailedCheckScore ?? 0) : 0,
              attempts: s.currentChecksUsed,
              timeSpentMs: getElapsedTimeMs(s, Date.now()),
              isPractice: false,
            },
            defaultEndReason: "time-limit",
            defaultOutcome: hasAssessedFailure ? "unsolved" : "unassessed",
          });
        }

        s.phase = "times-up";
        s.remainingSeconds = null;
        s.currentInteraction = null;
      });
    },

    startPractice() {
      set((s) => {
        if (s.phase !== "times-up") return;

        s.phase = "practice";

        const nextPending = s.exerciseStates.findIndex(
          (e) => isPracticeCandidate(e) && e.practice.status === "pending",
        );

        if (nextPending >= 0) {
          s.currentIndex = nextPending;
          s.exerciseStates[nextPending]!.practice.status = "active";
          resetAttemptsForExercise(s);
          startExerciseRun(s, Date.now());
        } else {
          s.phase = "final";
          s.finishedAt = Date.now();
        }
      });
      maybeNotifyFinish(get, set, "practice-skipped");
    },

    finishChain(endReason: string = "manual") {
      const now = Date.now();
      set((s) => {
        if (s.phase === "final") return;

        for (const ex of s.exerciseStates) {
          const targetRun = getTerminalizingRunForFinish(s.phase, ex);
          if (targetRun && (targetRun.status === "pending" || targetRun.status === "active")) {
            targetRun.status = "skipped";
            targetRun.result = buildResultPayload({
              result: targetRun.result,
              defaultEndReason: "user-skip",
              defaultOutcome: "unassessed",
              isPractice: targetRun === ex.practice,
            });
          }
        }

        s.phase = "final";
        s.finishedAt = now;
        s.remainingSeconds = null;
        s.currentInteraction = null;
      });
      maybeNotifyFinish(get, set, endReason);
    },

    reset() {
      set((s) => {
        s.chainSettings = DEFAULT_CHAIN_SETTINGS;
        s.welcomeScreen = null;
        s.finalScreen = null;
        s.exercises = [];
        s.phase = "welcome";
        s.currentIndex = 0;
        s.exerciseStates = [];
        s.remainingSeconds = null;
        s.timedSnapshotIndex = null;
        s.attemptsRemaining = null;
        s.livesRemaining = null;
        s.currentInteraction = null;
        s.currentChecksUsed = 0;
        s.lastFailedCheckScore = null;
        s.currentExerciseStartedAt = null;
        s.isMuted = false;
        s.startedAt = null;
        s.finishedAt = null;
        s.hasNotifiedStart = false;
        s.hasNotifiedFinish = false;
      });
    },

    toggleMute() {
      set((s) => {
        s.isMuted = !s.isMuted;
      });
    },

    timerTick() {
      const { remainingSeconds, phase } = get();
      if (remainingSeconds === null || phase !== "exercise") return;
      if (remainingSeconds <= 1) {
        get().expireTimer();
      } else {
        set((s) => {
          if (s.remainingSeconds !== null) s.remainingSeconds -= 1;
        });
      }
    },

    getStatistics(): ChainStatistics {
      const { exerciseStates, startedAt, finishedAt } = get();

      let completedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      let correctCount = 0;
      let incorrectCount = 0;
      let practiceCorrectCount = 0;
      let practiceIncorrectCount = 0;
      let totalScore = 0;
      let timedCompletedCount = 0;
      const exerciseResults: ExerciseResultSummary[] = [];
      const practiceResults: ExerciseResultSummary[] = [];

      for (const ex of exerciseStates) {
        const timedResult = getResolvedResultForStatistics(ex.timed);
        const timedDisplayStatus = getDisplayStatus(ex.timed.status, timedResult, "timed");

        const timedSummary: ExerciseResultSummary = {
          id: ex.id,
          type: ex.type,
          status: timedDisplayStatus,
          outcome: timedResult.outcome,
          endReason: timedResult.endReason,
          score: timedResult.score,
          attempts: timedResult.attempts,
        };

        switch (ex.timed.status) {
          case "completed":
            completedCount++;
            totalScore += timedResult.score;
            timedCompletedCount++;
            if (timedResult.outcome === "solved") correctCount++;
            else if (timedResult.outcome === "unsolved") incorrectCount++;
            break;
          case "skipped":
            skippedCount++;
            break;
          case "error":
            errorCount++;
            break;
        }

        exerciseResults.push(timedSummary);

        const practiceResult = getResolvedResultForStatistics(ex.practice);
        const practiceDisplayStatus = getDisplayStatus(
          ex.practice.status,
          practiceResult,
          "practice",
        );

        if (
          practiceDisplayStatus === "practice-correct" ||
          practiceDisplayStatus === "practice-incorrect"
        ) {
          practiceResults.push({
            id: ex.id,
            type: ex.type,
            status: practiceDisplayStatus,
            outcome: practiceResult.outcome,
            endReason: practiceResult.endReason,
            score: practiceResult.score,
            attempts: practiceResult.attempts,
          });

          if (practiceResult.outcome === "solved") practiceCorrectCount++;
          else if (practiceResult.outcome === "unsolved") practiceIncorrectCount++;
        }
      }

      const hasPracticeResults = practiceCorrectCount > 0 || practiceIncorrectCount > 0;

      return {
        totalExercises: exerciseStates.length,
        completedCount,
        skippedCount,
        errorCount,
        correctCount,
        incorrectCount,
        averageScore: timedCompletedCount > 0 ? totalScore / timedCompletedCount : 0,
        totalTimeMs: startedAt && finishedAt ? finishedAt - startedAt : 0,
        exerciseResults,
        practiceResults,
        practiceCorrectCount,
        practiceIncorrectCount,
        hasPracticeResults,
      };
    },
  })),
);

// ============================================================================
// HELPERS
// ============================================================================

function maybeNotifyFinish(
  getter: () => ChainRunnerState & ChainRunnerActions,
  setter: (fn: (s: ChainRunnerState & ChainRunnerActions) => void) => void,
  endReason: string,
) {
  const state = getter();
  if (state.phase !== "final" || state.hasNotifiedFinish) return;
  setter((s) => {
    s.hasNotifiedFinish = true;
  });
  const cb = state.persistenceCallbacks.onChainFinish;
  if (cb) {
    Promise.resolve(cb(state.getStatistics(), endReason)).catch((err) =>
      console.error("[chain-runner] onChainFinish failed", err),
    );
  }
}

function createPendingRunState(): ExerciseRunState {
  return { status: "pending" };
}

function getRunPhaseForChainPhase(phase: ChainPhase): ExerciseRunPhase {
  return phase === "practice" ? "practice" : "timed";
}

function getRunState(exercise: ExerciseState, runPhase: ExerciseRunPhase): ExerciseRunState {
  return runPhase === "practice" ? exercise.practice : exercise.timed;
}

function getRunStateForPhase(exercise: ExerciseState, phase: ChainPhase): ExerciseRunState {
  return getRunState(exercise, getRunPhaseForChainPhase(phase));
}

function resetAssessmentTracking(state: ChainRunnerState): void {
  state.currentChecksUsed = 0;
  state.lastFailedCheckScore = null;
}

function startExerciseRun(state: ChainRunnerState, now: number): void {
  resetAssessmentTracking(state);
  state.currentExerciseStartedAt = now;
}

function hasStoredFailedCheck(state: ChainRunnerState): boolean {
  return state.currentChecksUsed > 0 && state.lastFailedCheckScore !== null;
}

function resetAttemptsForExercise(state: ChainRunnerState): void {
  state.attemptsRemaining = getAttemptsPerExercise(state.chainSettings);
}

function getElapsedTimeMs(state: ChainRunnerState, now: number): number {
  return state.currentExerciseStartedAt !== null
    ? Math.max(0, now - state.currentExerciseStartedAt)
    : 0;
}

function resetLivesForQuiz(state: ChainRunnerState): void {
  state.livesRemaining = getQuizLives(state.chainSettings);
}

function isPracticeCandidate(exercise: ExerciseState): boolean {
  return exercise.timed.status === "pending" || exercise.timed.status === "skipped";
}

function getTerminalizingRunForFinish(
  phase: ChainPhase,
  exercise: ExerciseState,
): ExerciseRunState | null {
  if (phase === "practice") return exercise.practice;
  if (phase === "exercise" || phase === "times-up" || phase === "final") return exercise.timed;
  return null;
}

function advanceToNext(state: ChainRunnerState, now: number): void {
  if (state.phase === "practice") {
    const nextIdx = state.exerciseStates.findIndex(
      (e, i) => i > state.currentIndex && isPracticeCandidate(e) && e.practice.status === "pending",
    );

    if (nextIdx >= 0) {
      state.currentIndex = nextIdx;
      state.exerciseStates[nextIdx]!.practice.status = "active";
      resetAttemptsForExercise(state);
      startExerciseRun(state, now);
    } else {
      state.phase = "final";
      state.finishedAt = now;
    }
  } else {
    const nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.exerciseStates.length) {
      state.phase = "final";
      state.finishedAt = now;
      state.remainingSeconds = null;
    } else {
      state.currentIndex = nextIndex;
      state.exerciseStates[nextIndex]!.timed.status = "active";
      resetAttemptsForExercise(state);
      startExerciseRun(state, now);
    }
  }
}

function buildResultPayload(params: {
  result?: Partial<ExerciseResult>;
  defaultOutcome: Outcome;
  defaultEndReason?: EndReason;
  isPractice?: boolean;
}): ExerciseResult {
  const source = params.result ?? {};
  const outcome = resolveOutcome({
    outcome: source.outcome,
    endReason: source.endReason,
    fallbackOutcome: params.defaultOutcome,
  });
  const endReason = resolveEndReason({
    outcome,
    endReason: source.endReason,
    defaultEndReason: params.defaultEndReason,
  });

  return {
    score: typeof source.score === "number" && Number.isFinite(source.score) ? source.score : 0,
    outcome,
    endReason,
    attempts:
      typeof source.attempts === "number" && Number.isFinite(source.attempts)
        ? Math.max(0, Math.floor(source.attempts))
        : 0,
    timeSpentMs:
      typeof source.timeSpentMs === "number" && Number.isFinite(source.timeSpentMs)
        ? Math.max(0, Math.floor(source.timeSpentMs))
        : 0,
    isPractice: params.isPractice ?? source.isPractice ?? false,
  };
}

function getResolvedResultForStatistics(exerciseRun: ExerciseRunState): ExerciseResult {
  if (exerciseRun.status === "completed") {
    return buildResultPayload({
      result: exerciseRun.result,
      defaultOutcome: "unassessed",
      defaultEndReason: "policy",
      isPractice: exerciseRun.result?.isPractice,
    });
  }
  if (exerciseRun.status === "skipped") {
    return buildResultPayload({
      result: exerciseRun.result,
      defaultOutcome: "unassessed",
      defaultEndReason: "user-skip",
      isPractice: exerciseRun.result?.isPractice,
    });
  }
  if (exerciseRun.status === "error") {
    return buildResultPayload({
      result: exerciseRun.result,
      defaultOutcome: "unassessed",
      defaultEndReason: "error",
      isPractice: exerciseRun.result?.isPractice,
    });
  }
  return buildResultPayload({
    result: exerciseRun.result,
    defaultOutcome: "unassessed",
    defaultEndReason: "user-skip",
    isPractice: exerciseRun.result?.isPractice,
  });
}

function getDisplayStatus(
  exerciseStatus: ExerciseStatus,
  result: ExerciseResult,
  runPhase: ExerciseRunPhase,
): ExerciseDisplayStatus {
  if (runPhase === "practice") {
    if (exerciseStatus !== "completed") return "skipped";
    return result.outcome === "solved" ? "practice-correct" : "practice-incorrect";
  }
  if (exerciseStatus !== "completed") return "skipped";
  if (result.outcome === "solved") return "correct";
  if (result.outcome === "unassessed") return "skipped";
  return "incorrect";
}

function resolveOutcome(params: {
  outcome?: Outcome;
  endReason?: EndReason;
  fallbackOutcome: Outcome;
}): Outcome {
  if (params.outcome) {
    if (params.endReason === "error" && params.outcome !== "unassessed") return "unassessed";
    return params.outcome;
  }
  if (params.endReason === "solved") return "solved";
  if (params.endReason === "error") return "unassessed";
  if (params.endReason === "attempts-exhausted") return "unsolved";
  return params.fallbackOutcome;
}

function resolveEndReason(params: {
  outcome: Outcome;
  endReason?: EndReason;
  defaultEndReason?: EndReason;
}): EndReason {
  if (params.endReason) return params.endReason === "error" ? "error" : params.endReason;
  if (params.defaultEndReason) return params.defaultEndReason;
  if (params.outcome === "solved") return "solved";
  if (params.outcome === "unsolved") return "policy";
  return "error";
}

// ============================================================================
// SELECTORS
// ============================================================================

export const selectCurrentExercise = (state: ChainRunnerState): ExerciseEntry | null =>
  state.exercises[state.currentIndex] ?? null;

export const selectProgressCurrent = (state: ChainRunnerState): number => state.currentIndex + 1;

export const selectProgressTotal = (state: ChainRunnerState): number => state.exercises.length;

export const selectIsLastExercise = (state: ChainRunnerState): boolean =>
  state.currentIndex >= state.exercises.length - 1;
