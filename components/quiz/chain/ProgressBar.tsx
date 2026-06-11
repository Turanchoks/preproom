"use client";

import { useChainRunner, selectProgressCurrent, selectProgressTotal } from "../core/chain-runner";

export function ProgressBar() {
  const current = useChainRunner(selectProgressCurrent);
  const total = useChainRunner(selectProgressTotal);
  const phase = useChainRunner((s) => s.phase);

  if (phase === "welcome" || phase === "final" || total === 0) return null;

  const pct = Math.min(100, Math.round((current / total) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>
          Question {current} of {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
