"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

export interface WordMatchingPayload {
  question?: string;
  pairs: Array<{ source: string; target: string }>;
}

function isValid(payload: unknown): payload is WordMatchingPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    Array.isArray(p.pairs) &&
    p.pairs.length > 0 &&
    p.pairs.every(
      (pair) =>
        pair &&
        typeof pair === "object" &&
        typeof (pair as Record<string, unknown>).source === "string" &&
        typeof (pair as Record<string, unknown>).target === "string",
    )
  );
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function WordMatchingExercise(props: ExerciseComponentProps) {
  const { exerciseId, payload, interfaceLanguage, onComplete, onStateChange } = props;
  const ok = isValid(payload);
  const data = ok ? payload : null;

  // Stable shuffled target column (re-shuffle when exercise changes).
  const shuffledTargets = useMemo(
    () => (data ? shuffle(data.pairs.map((p) => p.target)) : []),
    [data, exerciseId],
  );

  const [matches, setMatches] = useState<Record<string, string | null>>({});
  const [activeSource, setActiveSource] = useState<string | null>(null);
  const [committed, setCommitted] = useState(false);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  useEffect(() => {
    if (ok) return;
    onComplete({
      score: 0,
      outcome: "unassessed",
      endReason: "error",
      attempts: 0,
      timeSpentMs: 0,
    });
  }, [ok, onComplete]);

  // Wait until all pairs are matched before letting the student check.
  const allPlaced = useMemo(() => {
    if (!data) return false;
    return data.pairs.every((p) => !!matches[p.source]);
  }, [matches, data]);

  useEffect(() => {
    if (!ok) return;
    onStateChange?.({
      isReadyForCheck: !committed && allPlaced,
      isReadyForNext: committed,
      mainActionType: committed ? "advance" : "check",
      hasPlacedAnswers: Object.keys(matches).length > 0,
    });
  }, [ok, allPlaced, committed, matches, onStateChange]);

  const score = useMemo(() => {
    if (!data) return 0;
    const correct = data.pairs.filter((p) => matches[p.source] === p.target).length;
    return correct / data.pairs.length;
  }, [matches, data]);

  const feedback: ExerciseFeedbackPayload | null = useMemo(() => {
    if (!committed || !data) return null;
    const status = score === 1 ? "correct" : score >= 0.5 ? "almost" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    return {
      status,
      title: presentation.title,
      emoji: presentation.emoji,
      hint: `${Math.round(score * data.pairs.length)} of ${data.pairs.length} matched`,
      score,
      attemptsExhausted: true,
      nextAction: "advance",
    };
  }, [committed, data, score, interfaceLanguage]);

  useEffect(() => {
    if (!feedback) return;
    onStateChange?.({
      isReadyForCheck: false,
      isReadyForNext: true,
      mainActionType: "advance",
      feedbackData: feedback,
    });
    if (!completedRef.current) {
      completedRef.current = true;
      const result: ExerciseResult = {
        score,
        outcome: score === 1 ? "solved" : "unsolved",
        endReason: score === 1 ? "solved" : "attempts-exhausted",
        attempts: 1,
        timeSpentMs: Date.now() - startedAt.current,
      };
      onComplete(result);
    }
  }, [feedback, score, onComplete, onStateChange]);

  if (!ok || !data) return null;

  function pickSource(src: string) {
    if (committed) return;
    setActiveSource((prev) => (prev === src ? null : src));
  }

  function pickTarget(tgt: string) {
    if (committed) return;
    if (!activeSource) return;
    setMatches((prev) => {
      const next = { ...prev };
      // If this target was used elsewhere, clear it first.
      for (const k of Object.keys(next)) {
        if (next[k] === tgt) next[k] = null;
      }
      next[activeSource] = tgt;
      return next;
    });
    setActiveSource(null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {data.question ? (
        <h2 className="text-2xl font-semibold text-gray-900">{data.question}</h2>
      ) : null}
      <p className="text-sm text-gray-500">
        Tap a word on the left, then tap its match on the right.
      </p>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          {data.pairs.map((p) => {
            const matched = matches[p.source];
            const isActive = activeSource === p.source;
            const isCorrect = committed && matched === p.target;
            const isWrong = committed && matched && matched !== p.target;
            return (
              <button
                type="button"
                key={p.source}
                onClick={() => pickSource(p.source)}
                disabled={committed}
                className={cn(
                  "flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition",
                  isActive && "border-blue-500 bg-blue-50",
                  !isActive && !committed && "border-gray-200 bg-white hover:border-gray-300",
                  isCorrect && "border-green-500 bg-green-50",
                  isWrong && "border-red-500 bg-red-50",
                )}
              >
                <span>{p.source}</span>
                {matched ? <span className="text-sm text-gray-500">→ {matched}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {shuffledTargets.map((tgt) => {
            const used = Object.values(matches).includes(tgt);
            return (
              <button
                type="button"
                key={tgt}
                onClick={() => pickTarget(tgt)}
                disabled={committed || (!activeSource && !used)}
                className={cn(
                  "block w-full rounded-xl border-2 px-4 py-3 text-left transition",
                  used
                    ? "border-gray-100 bg-gray-50 text-gray-400"
                    : "border-gray-200 bg-white hover:border-blue-400",
                )}
              >
                {tgt}
              </button>
            );
          })}
        </div>
      </div>
      {!committed && allPlaced ? (
        <button
          type="button"
          onClick={() => setCommitted(true)}
          className="rounded-xl bg-blue-600 px-6 py-2 font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Check
        </button>
      ) : null}
    </div>
  );
}

WordMatchingExercise.displayName = "WordMatchingExercise";
