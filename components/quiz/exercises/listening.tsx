"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

export interface ListeningPayload {
  /** Spoken text — never rendered; only the audio is presented. */
  prompt: string;
  question: string;
  options: string[];
  correctIndex: number;
  /** Public URL of the pre-generated audio clip (attached in post-processing). */
  audioUrl: string;
  explanation?: string;
}

function isValid(payload: unknown): payload is ListeningPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.audioUrl === "string" &&
    p.audioUrl.length > 0 &&
    typeof p.question === "string" &&
    Array.isArray(p.options) &&
    p.options.every((o) => typeof o === "string") &&
    typeof p.correctIndex === "number"
  );
}

/**
 * Listening comprehension: the student plays an audio clip, then picks the
 * correct option. Standard single-attempt multiple-choice flow underneath.
 */
export function ListeningExercise(props: ExerciseComponentProps) {
  const { exerciseId, payload, interfaceLanguage, isMuted, onComplete, onStateChange } =
    props;
  const ok = isValid(payload);
  const data = ok ? payload : null;
  const [selected, setSelected] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  // Auto-play once on mount (unless muted) so the clip is immediately heard.
  useEffect(() => {
    if (!ok || isMuted) return;
    const el = audioRef.current;
    if (!el) return;
    el.play().catch(() => {
      // Autoplay may be blocked — the student can press play manually.
    });
  }, [ok, isMuted]);

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

  const play = () => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.play().catch(() => {
      /* ignore */
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">{data.question}</h2>

      {/* biome-ignore lint/a11y/useMediaCaption: spoken-word clip, transcript is the answer */}
      <audio
        ref={audioRef}
        src={data.audioUrl}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
      />
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={play}
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-full text-white shadow-sm transition",
            playing ? "bg-blue-700" : "bg-blue-600 hover:bg-blue-700",
          )}
          aria-label="Play audio"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <span className="text-base text-gray-500">
          {playing ? "Playing…" : "Tap to listen"}
        </span>
      </div>

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

ListeningExercise.displayName = "ListeningExercise";
