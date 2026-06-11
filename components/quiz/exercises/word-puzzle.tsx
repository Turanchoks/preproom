"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseFeedbackPayload, ExerciseResult } from "../core/types";
import { resolveFeedbackPresentation } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

/**
 * Word puzzle — arrange shuffled words into the correct sentence by
 * tapping word chips. Supports an optional audio prompt with two
 * display variants:
 *  - 'banner'   → small speaker-icon banner above the puzzle
 *  - 'playback' → full HTML5 audio player above the puzzle
 *
 * Distractors (extra wrong words mixed into the bank) are supported.
 */
export type WordPuzzleDisplayVariant = "banner" | "playback";

export interface WordPuzzlePayload {
  question?: string;
  /** Canonical correct sentence. */
  correctSentence: string;
  /** Alternative valid orderings (same words, different order). */
  alternativeAnswers?: string[];
  /** Words shown in the bank. */
  words: string[];
  /** Extra wrong-word distractors mixed into the bank. */
  distractors?: string[];
  audioUrl?: string;
  displayVariant?: WordPuzzleDisplayVariant;
}

function isValid(payload: unknown): payload is WordPuzzlePayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.correctSentence === "string" &&
    Array.isArray(p.words) &&
    p.words.length > 0 &&
    p.words.every((w) => typeof w === "string")
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

function normalizeSentence(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

interface BankItem {
  id: string;
  word: string;
  isDistractor: boolean;
}

export function WordPuzzleExercise(props: ExerciseComponentProps) {
  const { exerciseId, payload, interfaceLanguage, isMuted, onComplete, onStateChange } = props;
  const ok = isValid(payload);
  const data = ok ? payload : null;

  const bankItems = useMemo<BankItem[]>(() => {
    if (!data) return [];
    const real = data.words.map((w, i) => ({ id: `w${i}`, word: w, isDistractor: false }));
    const distract = (data.distractors ?? []).map((w, i) => ({
      id: `d${i}`,
      word: w,
      isDistractor: true,
    }));
    return shuffle([...real, ...distract]);
  }, [data, exerciseId]);

  const [placed, setPlaced] = useState<string[]>([]);
  const [committed, setCommitted] = useState(false);
  const startedAt = useRef(Date.now());
  const completedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    if (isMuted && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isMuted]);

  const built = useMemo(() => {
    const map = new Map(bankItems.map((b) => [b.id, b.word]));
    return placed.map((id) => map.get(id) ?? "").join(" ");
  }, [placed, bankItems]);

  const isCorrect = useMemo(() => {
    if (!data) return false;
    const candidate = normalizeSentence(built);
    if (candidate === normalizeSentence(data.correctSentence)) return true;
    return (data.alternativeAnswers ?? []).some((alt) => normalizeSentence(alt) === candidate);
  }, [built, data]);

  useEffect(() => {
    if (!ok) return;
    const ready = placed.length > 0;
    onStateChange?.({
      isReadyForCheck: !committed && ready,
      isReadyForNext: committed,
      mainActionType: committed ? "advance" : "check",
      hasPlacedAnswers: ready,
    });
  }, [ok, placed, committed, onStateChange]);

  const feedback: ExerciseFeedbackPayload | null = useMemo(() => {
    if (!committed || !data) return null;
    const status = isCorrect ? "correct" : "incorrect";
    const presentation = resolveFeedbackPresentation({ status, locale: interfaceLanguage });
    return {
      status,
      title: presentation.title,
      emoji: presentation.emoji,
      primaryText: isCorrect ? built : `Answer: ${data.correctSentence}`,
      score: isCorrect ? 1 : 0,
      attemptsExhausted: true,
      nextAction: "advance",
    };
  }, [committed, data, isCorrect, built, interfaceLanguage]);

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

  const variant: WordPuzzleDisplayVariant = data.displayVariant ?? "banner";
  const showAudio = !!data.audioUrl && !isMuted;

  function placeWord(id: string) {
    if (committed) return;
    if (placed.includes(id)) return;
    setPlaced((prev) => [...prev, id]);
  }

  function unplaceWord(id: string) {
    if (committed) return;
    setPlaced((prev) => prev.filter((x) => x !== id));
  }

  function reset() {
    if (committed) return;
    setPlaced([]);
  }

  const placedSet = new Set(placed);
  const placedItems = placed
    .map((id) => bankItems.find((b) => b.id === id))
    .filter((x): x is BankItem => !!x);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {data.question ? (
        <h2 className="text-2xl font-semibold text-gray-900">{data.question}</h2>
      ) : null}

      {showAudio && variant === "playback" ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <audio
            ref={audioRef}
            controls
            preload="auto"
            src={data.audioUrl}
            className="w-full"
            aria-label="Listen to the audio prompt"
          >
            Your browser does not support audio playback.
          </audio>
        </div>
      ) : null}

      {showAudio && variant === "banner" ? (
        <button
          type="button"
          onClick={() => audioRef.current?.play()}
          className="flex w-full items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-left text-blue-900 hover:bg-blue-100"
          aria-label="Play audio prompt"
        >
          <span className="text-2xl" aria-hidden>
            ▶
          </span>
          <span className="text-sm font-medium">Tap to listen</span>
          <audio ref={audioRef} preload="auto" src={data.audioUrl} className="hidden" />
        </button>
      ) : null}

      {/* Built sentence area */}
      <div
        className={cn(
          "min-h-[72px] rounded-xl border-2 border-dashed bg-white p-3",
          committed && isCorrect && "border-green-500 bg-green-50",
          committed && !isCorrect && "border-red-500 bg-red-50",
          !committed && "border-gray-300",
        )}
      >
        {placedItems.length === 0 ? (
          <p className="text-center text-sm text-gray-400">Tap words below to build the sentence</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {placedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => unplaceWord(item.id)}
                disabled={committed}
                className={cn(
                  "rounded-lg border-2 px-3 py-1.5 text-base font-medium transition",
                  !committed && "border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-100",
                  committed && "border-transparent",
                )}
              >
                {item.word}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bank */}
      {!committed ? (
        <div className="flex flex-wrap gap-2">
          {bankItems.map((item) => {
            const used = placedSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => placeWord(item.id)}
                disabled={used}
                className={cn(
                  "rounded-lg border-2 px-3 py-2 text-base font-medium transition",
                  used
                    ? "border-gray-100 bg-gray-50 text-gray-300"
                    : "border-gray-300 bg-white text-gray-900 hover:border-blue-400",
                )}
              >
                {item.word}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex gap-2">
        {!committed && placed.length > 0 ? (
          <>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border-2 border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setCommitted(true)}
              className="rounded-xl bg-blue-600 px-6 py-2 font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Check
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

WordPuzzleExercise.displayName = "WordPuzzleExercise";
