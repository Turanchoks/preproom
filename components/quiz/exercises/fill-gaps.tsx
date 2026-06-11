"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

/**
 * Fill-gaps — multiple blanks in a single paragraph, each with a small
 * dropdown of options. Score is the fraction of correctly chosen gaps.
 *
 * Use `___` (three underscores) inside `paragraph` to mark each blank;
 * the i-th blank pulls from `gaps[i]`.
 */
export interface FillGapsGap {
  options: string[];
  correctIndex: number;
}

export interface FillGapsPayload {
  paragraph: string;
  gaps: FillGapsGap[];
  question?: string;
  hint?: string;
}

function isValid(payload: unknown): payload is FillGapsPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (typeof p.paragraph !== "string") return false;
  if (!Array.isArray(p.gaps) || p.gaps.length === 0) return false;
  return p.gaps.every((g) => {
    if (!g || typeof g !== "object") return false;
    const gg = g as Record<string, unknown>;
    return (
      Array.isArray(gg.options) &&
      gg.options.every((o) => typeof o === "string") &&
      typeof gg.correctIndex === "number"
    );
  });
}

export function FillGapsExercise(props: ExerciseComponentProps) {
  const { payload, interfaceLanguage, onComplete, onStateChange } = props;
  const ok = isValid(payload);
  const data = ok ? payload : null;
  const [picks, setPicks] = useState<Record<number, number>>({});
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

  const allFilled = useMemo(() => {
    if (!data) return false;
    return data.gaps.every((_, i) => picks[i] !== undefined);
  }, [picks, data]);

  useEffect(() => {
    if (!ok) return;
    onStateChange?.({
      isReadyForCheck: !committed && allFilled,
      isReadyForNext: committed,
      mainActionType: committed ? "advance" : "check",
      hasPlacedAnswers: Object.keys(picks).length > 0,
    });
  }, [ok, allFilled, committed, picks, onStateChange]);

  const score = useMemo(() => {
    if (!data) return 0;
    const correct = data.gaps.filter((g, i) => picks[i] === g.correctIndex).length;
    return correct / data.gaps.length;
  }, [picks, data]);

  const feedback: ExerciseFeedbackPayload | null = useMemo(() => {
    if (!committed || !data) return null;
    const status = score === 1 ? "correct" : score >= 0.5 ? "almost" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    return {
      status,
      title: presentation.title,
      emoji: presentation.emoji,
      hint: data.hint ?? `${Math.round(score * data.gaps.length)} of ${data.gaps.length} correct`,
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

  const parts = data.paragraph.split("___");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {data.question ? (
        <h2 className="text-2xl font-semibold text-gray-900">{data.question}</h2>
      ) : null}
      <p className="text-lg leading-relaxed text-gray-900">
        {parts.map((part, i) => {
          const gapIndex = i;
          const gap = data.gaps[gapIndex];
          return (
            <span key={i}>
              {part}
              {i < parts.length - 1 && gap ? (
                <select
                  value={picks[gapIndex] ?? ""}
                  onChange={(e) => {
                    if (committed) return;
                    const v = e.target.value;
                    setPicks((prev) => ({ ...prev, [gapIndex]: Number(v) }));
                  }}
                  disabled={committed}
                  className={cn(
                    "mx-1 inline-block rounded-md border-2 bg-white px-2 py-0.5 text-base font-semibold focus:outline-none",
                    !committed && "border-blue-500 text-blue-700",
                    committed &&
                      picks[gapIndex] === gap.correctIndex &&
                      "border-green-500 text-green-700",
                    committed &&
                      picks[gapIndex] !== gap.correctIndex &&
                      "border-red-500 text-red-700",
                  )}
                >
                  <option value="" disabled>
                    …
                  </option>
                  {gap.options.map((opt, optIdx) => (
                    <option key={optIdx} value={optIdx}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : null}
            </span>
          );
        })}
      </p>
      {committed ? (
        <ul className="space-y-1 text-sm text-gray-600">
          {data.gaps.map((g, i) => {
            const gapOk = picks[i] === g.correctIndex;
            return (
              <li key={i}>
                <span className={gapOk ? "text-green-700" : "text-red-700"}>
                  Gap {i + 1}: {g.options[g.correctIndex]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {!committed && allFilled ? (
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

FillGapsExercise.displayName = "FillGapsExercise";
