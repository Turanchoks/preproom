"use client";

import { useEffect, useRef } from "react";
import type { ExerciseComponentProps } from "../core/exercise-contract";

/**
 * Rendered when ExerciseSlot receives a `type` that no exercise has been
 * registered for. We log to the console (so authors notice) and auto-skip
 * the exercise so the chain doesn't deadlock.
 */
export function FallbackExercise({ exerciseId, payload, onComplete }: ExerciseComponentProps) {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;
    const type = (payload as { type?: string })?.type ?? "unknown";
    console.warn(
      `[homework] No exercise component registered for "${type}" (id=${exerciseId}); skipping.`,
    );
    onComplete({
      score: 0,
      outcome: "unassessed",
      endReason: "error",
      attempts: 0,
      timeSpentMs: 0,
    });
  }, [exerciseId, payload, onComplete]);

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
      Unsupported exercise type. Skipping…
    </div>
  );
}
