"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

export interface ImageFlashcardPayload {
  /** Image-generation prompt — never rendered; only the image is shown. */
  imagePrompt: string;
  word: string;
  options: string[];
  correctIndex: number;
  /** Public URL of the pre-generated image (attached in post-processing). */
  imageUrl: string;
}

function isValid(payload: unknown): payload is ImageFlashcardPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.imageUrl === "string" &&
    p.imageUrl.length > 0 &&
    Array.isArray(p.options) &&
    p.options.every((o) => typeof o === "string") &&
    typeof p.correctIndex === "number"
  );
}

/**
 * Image flashcard: show a generated picture, the student picks the matching
 * word/meaning from an options grid. Single-attempt multiple-choice flow.
 */
export function ImageFlashcardExercise(props: ExerciseComponentProps) {
  const { exerciseId, payload, interfaceLanguage, onComplete, onStateChange } = props;
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

  const feedback: ExerciseFeedbackPayload | null = useMemo(() => {
    if (!committed || selected === null || !data) return null;
    const correct = selected === data.correctIndex;
    const status = correct ? "correct" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    return {
      status,
      title: presentation.title,
      emoji: presentation.emoji,
      primaryText: correct
        ? data.options[data.correctIndex]
        : `Correct answer: ${data.options[data.correctIndex]}`,
      score: correct ? 1 : 0,
      attemptsExhausted: true,
      nextAction: "advance",
    };
  }, [committed, selected, data, interfaceLanguage]);

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
      <div className="flex justify-center">
        <img
          src={data.imageUrl}
          alt="What does this picture show?"
          className="h-56 w-56 rounded-2xl border border-gray-200 object-cover shadow-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                "rounded-xl border-2 px-4 py-3 text-center text-base transition",
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

ImageFlashcardExercise.displayName = "ImageFlashcardExercise";
