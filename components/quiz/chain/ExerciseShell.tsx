"use client";

import { useChainRunner } from "../core/chain-runner";
import type { SupportedLocale } from "../lib/i18n";
import { ChainTimer } from "./ChainTimer";
import { ProgressBar } from "./ProgressBar";
import { ExerciseSlot } from "./ExerciseSlot";
import { FeedbackDialog } from "./FeedbackDialog";

interface Props {
  interfaceLanguage: SupportedLocale;
}

/**
 * Wraps the active exercise with chrome: progress bar, timer, skip button,
 * and the bottom-anchored feedback dialog.
 */
export function ExerciseShell({ interfaceLanguage }: Props) {
  const phase = useChainRunner((s) => s.phase);
  const allowSkip = useChainRunner((s) => s.chainSettings.allowSkip);
  const skip = useChainRunner((s) => s.skipExercise);

  if (phase !== "exercise" && phase !== "practice") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <ProgressBar />
        </div>
        <ChainTimer />
        {allowSkip ? (
          <button
            type="button"
            onClick={() => skip()}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Skip
          </button>
        ) : null}
      </div>

      <ExerciseSlot interfaceLanguage={interfaceLanguage} />

      <FeedbackDialog />
    </div>
  );
}
