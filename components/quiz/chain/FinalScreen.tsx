"use client";

import { CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { useMemo } from "react";
import { useChainRunner } from "../core/chain-runner";

export function FinalScreen({ onClose }: { onClose?: () => void }) {
  const config = useChainRunner((s) => s.finalScreen);
  // NOTE: `getStatistics()` builds a fresh object (with new arrays) on every
  // call. Selecting it directly makes zustand's `useSyncExternalStore` snapshot
  // change every render → "getSnapshot should be cached" infinite loop (React
  // error #185). Select the stable function + its reactive inputs and memoize.
  const getStatistics = useChainRunner((s) => s.getStatistics);
  const exerciseStates = useChainRunner((s) => s.exerciseStates);
  const finishedAt = useChainRunner((s) => s.finishedAt);
  const stats = useMemo(
    () => getStatistics(),
    [getStatistics, exerciseStates, finishedAt],
  );

  const percent =
    stats.totalExercises === 0 ? 0 : Math.round((stats.correctCount / stats.totalExercises) * 100);

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        {config?.title ?? "All done!"}
      </h1>
      <p className="mt-2 text-gray-600">
        {config?.congratsMessage ?? "Great work finishing the homework."}
      </p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-5xl font-bold text-blue-600">{percent}%</span>
        <span className="text-sm text-gray-500">
          {stats.correctCount} / {stats.totalExercises} correct
        </span>
      </div>

      <ul className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {stats.exerciseResults.map((r, i) => {
          const Icon =
            r.status === "correct"
              ? CheckCircle2
              : r.status === "incorrect"
                ? XCircle
                : MinusCircle;
          const color =
            r.status === "correct"
              ? "text-green-600"
              : r.status === "incorrect"
                ? "text-red-600"
                : "text-gray-400";
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <Icon className={`h-5 w-5 ${color}`} />
              <span className="flex-1 truncate text-gray-700">
                Question {i + 1}{" "}
                <span className="text-gray-400">
                  ({r.type.replace(/-/g, " ")})
                </span>
              </span>
              <span className="text-gray-500">{Math.round(r.score * 100)}%</span>
            </li>
          );
        })}
      </ul>

      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:translate-y-0"
        >
          Done
        </button>
      ) : null}
    </div>
  );
}
