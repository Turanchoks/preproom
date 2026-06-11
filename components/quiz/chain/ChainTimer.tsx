"use client";

import { useEffect } from "react";
import { Timer } from "lucide-react";
import { useChainRunner } from "../core/chain-runner";

export function ChainTimer() {
  const remainingSeconds = useChainRunner((s) => s.remainingSeconds);
  const phase = useChainRunner((s) => s.phase);
  const tick = useChainRunner((s) => s.timerTick);

  useEffect(() => {
    if (phase !== "exercise" || remainingSeconds === null) return;
    const id = setInterval(() => tick(), 1000);
    return () => clearInterval(id);
  }, [phase, remainingSeconds, tick]);

  if (remainingSeconds === null || phase !== "exercise") return null;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const isLow = remainingSeconds < 30;
  return (
    <div
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium " +
        (isLow ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700")
      }
    >
      <Timer className="h-3 w-3" />
      {mins}:{secs.toString().padStart(2, "0")}
    </div>
  );
}
