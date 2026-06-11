"use client";

import { useCallback, useMemo, useRef } from "react";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import type { PersistenceCallbacks } from "@/components/quiz/core/chain-runner";
import type { ChainStatistics } from "@/components/quiz/core/types";
import type { HomeworkContent } from "@/lib/quiz/homework-schema";

export function ShareHomework({
  homework,
  slug,
}: {
  homework: HomeworkContent;
  slug: string;
}) {
  // Guard against double-send (StrictMode re-invocation, re-finishes, etc.).
  const sentRef = useRef(false);

  // Map exercise id -> human title so the memory facts read naturally.
  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const ex of homework.exercises) {
      m.set(ex.id, ex.title);
    }
    return m;
  }, [homework.exercises]);

  const reportResults = useCallback(
    (statistics: ChainStatistics) => {
      if (sentRef.current) {
        return;
      }
      sentRef.current = true;

      // Only the graded (timed) results matter for the score.
      const perExercise = statistics.exerciseResults
        .slice(0, 30)
        .map((r) => ({
          title: (titleById.get(r.id) ?? r.id).slice(0, 200),
          type: r.type.slice(0, 200),
          correct: r.status === "correct",
          attempts: Math.max(0, Math.floor(r.attempts || 0)),
        }));

      const total = statistics.totalExercises;
      const score = perExercise.filter((e) => e.correct).length;

      // Fire-and-forget: never block the UI, swallow all errors.
      void fetch("/api/share-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, score, total, perExercise }),
        keepalive: true,
      }).catch(() => {
        // Intentionally ignored — results reporting is best-effort.
      });
    },
    [slug, titleById]
  );

  const persistence: PersistenceCallbacks = useMemo(
    () => ({
      onChainFinish: (statistics) => {
        reportResults(statistics);
      },
    }),
    [reportResults]
  );

  return (
    <QuizPlayer homework={homework} mode="play" persistence={persistence} />
  );
}
