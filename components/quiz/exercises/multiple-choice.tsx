"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

export interface MultipleChoicePayload {
  question: string;
  options: string[];
  correctIndex: number;
  /** Optional explanation surfaced inside the feedback dialog. */
  explanation?: string;
}

function isValid(payload: unknown): payload is MultipleChoicePayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.question === "string" &&
    Array.isArray(p.options) &&
    p.options.every((o) => typeof o === "string") &&
    typeof p.correctIndex === "number"
  );
}

export function MultipleChoiceExercise(props: ExerciseComponentProps) {
  const { exerciseId, payload, interfaceLanguage, onComplete, onStateChange } = props;
  const ok = isValid(payload);
  const data = ok ? payload : null;
  const [selected, setSelected] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);

  // Auto-fail invalid payloads so the chain doesn't hang on a busted exercise.
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

  // Surface ready-state to the shell so the bottom bar's Check/Next button updates.
  useEffect(() => {
    if (!ok) return;
    onStateChange?.({
      isReadyForCheck: !committed && selected !== null,
      isReadyForNext: committed,
      mainActionType: committed ? "advance" : "check",
      hasPlacedAnswers: selected !== null,
    });
  }, [ok, selected, committed, onStateChange]);

  const feedback: ExerciseFeedbackPayload | null = useMemo(() => {
    if (!committed || selected === null || !data) return null;
    const correct = selected === data.correctIndex;
    const status = correct ? "correct" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    return {
      status,
      title: presentation.title,
      emoji: presentation.emoji,
      hint: data.explanation,
      primaryText: correct
        ? data.options[data.correctIndex]
        : `Correct answer: ${data.options[data.correctIndex]}`,
      score: correct ? 1 : 0,
      attemptsExhausted: true,
      nextAction: "advance",
    };
  }, [committed, selected, data, interfaceLanguage]);

  // Push the feedback payload into the shell, and emit completion exactly once.
  useEffect(() => {
    if (!feedback) return;
    onStateChange?.({
      isReadyForCheck: false,
      isReadyForNext: true,
      mainActionType: "advance",
      feedbackData: feedback,
    });
    if (!completedRef.current && data) {
      completedRef.current = true;
      const correct = selected === data.correctIndex;
      const result: ExerciseResult = {
        score: correct ? 1 : 0,
        outcome: correct ? "solved" : "unsolved",
        endReason: correct ? "solved" : "attempts-exhausted",
        attempts: 1,
        timeSpentMs: Date.now() - startedAt.current,
      };
      onComplete(result);
    }
  }, [feedback, data, selected, onComplete, onStateChange]);

  if (!ok || !data) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">{data.question}</h2>
      <div className="space-y-3">
        {data.options.map((opt, idx) => {
          const isSelected = selected === idx;
          const isCorrect = committed && idx === data.correctIndex;
          const isWrong = committed && isSelected && idx !== data.correctIndex;
          return (
            <button
              type="button"
              key={idx}
              data-exercise-id={exerciseId}
              onClick={() => !committed && setSelected(idx)}
              disabled={committed}
              className={cn(
                "block w-full rounded-xl border-2 px-4 py-3 text-left text-base transition",
                isSelected && !committed && "border-blue-500 bg-blue-50",
                !isSelected && !committed && "border-gray-200 bg-white hover:border-gray-300",
                isCorrect && "border-green-500 bg-green-50",
                isWrong && "border-red-500 bg-red-50",
                committed && "cursor-default",
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

MultipleChoiceExercise.displayName = "MultipleChoiceExercise";
