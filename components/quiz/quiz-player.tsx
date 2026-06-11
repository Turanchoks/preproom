"use client";

import { useMemo } from "react";
import { ChainProvider } from "./chain/ChainProvider";
import { toChainJSON } from "@/lib/quiz/to-chain";
import type { HomeworkContent } from "@/lib/quiz/homework-schema";

interface QuizPlayerProps {
  homework: HomeworkContent;
  /**
   * `preview` — embedded inside the artifact canvas while authoring.
   * `play`    — full student-facing experience on the public share page.
   * The underlying player is identical; the mode only tweaks chrome.
   */
  mode?: "preview" | "play";
  onClose?: () => void;
}

/**
 * Thin wrapper around the ported exercise-chain player. Converts a
 * HomeworkContent document into the player's ChainJSON input and renders the
 * chain runner.
 */
export function QuizPlayer({ homework, mode = "play", onClose }: QuizPlayerProps) {
  const chain = useMemo(() => toChainJSON(homework), [homework]);

  return (
    <div
      className={
        mode === "preview"
          ? "mx-auto w-full max-w-3xl px-4 py-6"
          : "mx-auto w-full max-w-3xl px-4 py-8"
      }
    >
      <ChainProvider chain={chain} locale="en" onClose={onClose} />
    </div>
  );
}
