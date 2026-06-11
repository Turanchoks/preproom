import type { ChainJSON } from "@/components/quiz/core/types";
import type { HomeworkContent } from "./homework-schema";

/**
 * Map a validated HomeworkContent document into the quiz player's ChainJSON
 * input. The homework contract has no timer / final-screen config of its own,
 * so we use sensible defaults: no time limit, skip allowed, and a generic
 * congratulatory final screen.
 *
 * Every exercise `type` (including the media-backed `listening` and
 * `image-flashcard`) and its `payload` pass straight through to the player's
 * exercise registry. Media-backed payloads already carry their resolved
 * `audioUrl` / `imageUrl` (attached by lib/media/enrich.ts before persistence);
 * exercises whose media failed to resolve are dropped upstream by parseHomework.
 */
export function toChainJSON(homework: HomeworkContent): ChainJSON {
  return {
    locale: "en",
    chainSettings: {
      timeLimitSec: 0,
      allowSkip: true,
    },
    welcomeScreen: {
      title: homework.title,
      description: homework.lessonSummary,
      startButtonText: "Start homework",
    },
    finalScreen: {
      title: "Homework complete!",
      congratsMessage: "Great work — you've finished all the exercises.",
    },
    exercises: homework.exercises.map((ex) => ({
      id: ex.id,
      type: ex.type,
      payload: ex.payload,
    })),
  };
}
