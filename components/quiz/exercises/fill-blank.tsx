"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

export interface FillBlankPayload {
  /** Sentence with `___` (three underscores) marking the blank. */
  sentence: string;
  /** Accepted answers — the first one is the canonical / displayed answer. */
  answers: string[];
  hint?: string;
  caseSensitive?: boolean;
}

function isValid(payload: unknown): payload is FillBlankPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.sentence === "string" &&
    Array.isArray(p.answers) &&
    p.answers.length > 0 &&
    p.answers.every((a) => typeof a === "string")
  );
}

function normalize(s: string, caseSensitive?: boolean): string {
  const trimmed = s.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

export function FillBlankExercise(props: ExerciseComponentProps) {
  const { payload, interfaceLanguage, onComplete, onStateChange } = props;
  const ok = isValid(payload);
  const data = ok ? payload : null;
  const [value, setValue] = useState("");
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
    const ready = value.trim().length > 0;
    onStateChange?.({
      isReadyForCheck: !committed && ready,
      isReadyForNext: committed,
      mainActionType: committed ? "advance" : "check",
      hasPlacedAnswers: ready,
    });
  }, [ok, value, committed, onStateChange]);

  const isCorrect = useMemo(() => {
    if (!data) return false;
    const userVal = normalize(value, data.caseSensitive);
    return data.answers.some((a) => normalize(a, data.caseSensitive) === userVal);
  }, [value, data]);

  const feedback: ExerciseFeedbackPayload | null = useMemo(() => {
    if (!committed || !data) return null;
    const status = isCorrect ? "correct" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    return {
      status,
      title: presentation.title,
      emoji: presentation.emoji,
      hint: data.hint,
      primaryText: isCorrect ? value : `Answer: ${data.answers[0]}`,
      score: isCorrect ? 1 : 0,
      attemptsExhausted: true,
      nextAction: "advance",
    };
  }, [committed, data, isCorrect, value, interfaceLanguage]);

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
        score: isCorrect ? 1 : 0,
        outcome: isCorrect ? "solved" : "unsolved",
        endReason: isCorrect ? "solved" : "attempts-exhausted",
        attempts: 1,
        timeSpentMs: Date.now() - startedAt.current,
      };
      onComplete(result);
    }
  }, [feedback, isCorrect, onComplete, onStateChange]);

  if (!ok || !data) return null;

  const parts = data.sentence.split("___");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-2xl leading-relaxed text-gray-900">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 ? (
              <input
                type="text"
                value={value}
                onChange={(e) => !committed && setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !committed && value.trim()) {
                    setCommitted(true);
                  }
                }}
                disabled={committed}
                className={cn(
                  "mx-1 inline-block min-w-[120px] border-b-2 px-2 py-1 text-center font-semibold focus:outline-none",
                  !committed && "border-blue-500",
                  committed && isCorrect && "border-green-500 text-green-700",
                  committed && !isCorrect && "border-red-500 text-red-700",
                )}
                autoFocus
              />
            ) : null}
          </span>
        ))}
      </p>
      {!committed && value.trim() ? (
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

FillBlankExercise.displayName = "FillBlankExercise";
