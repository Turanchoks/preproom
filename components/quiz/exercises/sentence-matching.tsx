"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

export interface SentenceMatchingPayload {
  question?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

function isValid(payload: unknown): payload is SentenceMatchingPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.prompt === "string" &&
    Array.isArray(p.options) &&
    p.options.every((o) => typeof o === "string") &&
    typeof p.correctIndex === "number"
  );
}

/**
 * Pick the sentence that best matches the prompt. Functionally identical to
 * multiple-choice but visually emphasises a long-form prompt at the top.
 */
export function SentenceMatchingExercise(props: ExerciseComponentProps) {
  const { payload, interfaceLanguage, onComplete, onStateChange } = props;
  const ok = isValid(payload);
  const data = ok ? payload : null;
  const [selected, setSelected] = useState<number | null>(null);
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

  useEffect(() => {
    if (!ok) return;
    onStateChange?.({
      isReadyForCheck: !committed && selected !== null,
      isReadyForNext: committed,
      mainActionType: committed ? "advance" : "check",
      hasPlacedAnswers: selected !== null,
    });
  }, [ok, selected, committed, onStateChange]);

  const isCorrect = useMemo(
    () => committed && selected !== null && data !== null && selected === data.correctIndex,
    [committed, selected, data],
  );

  useEffect(() => {
    if (!committed || !data) return;
    const status = isCorrect ? "correct" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    onStateChange?.({
      isReadyForCheck: false,
      isReadyForNext: true,
      mainActionType: "advance",
      feedbackData: {
        status,
        title: presentation.title,
        emoji: presentation.emoji,
        primaryText: data.options[data.correctIndex],
        score: isCorrect ? 1 : 0,
        attemptsExhausted: true,
        nextAction: "advance",
      },
    });
    if (!completedRef.current) {
      completedRef.current = true;
      const result: ExerciseResult = {
        score: isCorrect ? 1 : 0,
        outcome: isCorrect ? "solved" : "unsolved",
        endReason: isCorrect ? "solved" : "attempts-exhausted",
        attempts: 1,
        timeSpentMs: Date.now() - startedAt.current,
      };
      onComplete(result);
    }
  }, [committed, isCorrect, data, interfaceLanguage, onComplete, onStateChange]);

  if (!ok || !data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {data.question ? (
        <h2 className="text-2xl font-semibold text-gray-900">{data.question}</h2>
      ) : null}
      <div className="rounded-2xl bg-blue-50 p-6 text-xl text-blue-900">{data.prompt}</div>
      <div className="space-y-3">
        {data.options.map((opt, idx) => {
          const isSelected = selected === idx;
          const isCorrectChoice = committed && idx === data.correctIndex;
          const isWrongChoice = committed && isSelected && idx !== data.correctIndex;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => !committed && setSelected(idx)}
              disabled={committed}
              className={cn(
                "block w-full rounded-xl border-2 px-4 py-3 text-left text-base transition",
                isSelected && !committed && "border-blue-500 bg-blue-50",
                !isSelected && !committed && "border-gray-200 bg-white hover:border-gray-300",
                isCorrectChoice && "border-green-500 bg-green-50",
                isWrongChoice && "border-red-500 bg-red-50",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {!committed && selected !== null ? (
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

SentenceMatchingExercise.displayName = "SentenceMatchingExercise";
