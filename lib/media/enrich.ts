import "server-only";

import type { HomeworkContent } from "@/lib/quiz/homework-schema";
import { getOrCreateImageUrl } from "./store";
import { getOrCreateSpeechUrl } from "./store";

/**
 * Post-generation media enrichment for homework.
 *
 * The LLM only generates text (`prompt` for listening, `imagePrompt` for
 * image-flashcard). Here we synthesize the actual media and attach the public
 * URLs (`payload.audioUrl` / `payload.imageUrl`) so the player can render them.
 *
 * Enrichment is best-effort: a failure on one exercise leaves its media URL
 * unset, and parseHomework then drops that exercise (its payload schema
 * requires a non-empty url). It never throws — homework is always returned.
 */

// Re-verified 2026-06-11: parallel bursts of 5 TTS clips finished in ~1.8s with
// no 429s on the paid tier; image gen ~9s each. Concurrency 4 is comfortable.
const CONCURRENCY = 4;

type Job = () => Promise<void>;

async function runWithConcurrency(jobs: Job[], limit: number): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor++;
      await jobs[index]();
    }
  }
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, worker);
  await Promise.all(workers);
}

export async function enrichHomework(
  homework: HomeworkContent
): Promise<HomeworkContent> {
  const jobs: Job[] = [];

  for (const ex of homework.exercises) {
    if (ex.type === "listening") {
      const p = ex.payload as Record<string, unknown>;
      const prompt = typeof p.prompt === "string" ? p.prompt : "";
      if (!prompt) {
        continue;
      }
      jobs.push(async () => {
        try {
          p.audioUrl = await getOrCreateSpeechUrl(prompt, { voice: "Kore" });
        } catch (err) {
          // Leave audioUrl unset → exercise dropped by parseHomework.
          console.error(`[enrich] TTS failed for ${ex.id}:`, err);
        }
      });
    } else if (ex.type === "image-flashcard") {
      const p = ex.payload as Record<string, unknown>;
      const imagePrompt = typeof p.imagePrompt === "string" ? p.imagePrompt : "";
      if (!imagePrompt) {
        continue;
      }
      jobs.push(async () => {
        try {
          p.imageUrl = await getOrCreateImageUrl(imagePrompt, {
            aspectRatio: "1:1",
          });
        } catch (err) {
          // Leave imageUrl unset → exercise dropped by parseHomework.
          console.error(`[enrich] image gen failed for ${ex.id}:`, err);
        }
      });
    }
  }

  if (jobs.length > 0) {
    await runWithConcurrency(jobs, CONCURRENCY);
  }

  return homework;
}
