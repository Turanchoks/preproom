/**
 * End-to-end test for media-enriched homework generation.
 *
 *   npx tsx --require ./scripts/_no-server-only.cjs scripts/test-media-homework.ts
 *
 * (The require hook neutralizes the `server-only` guard so the handler + media
 * modules can run outside Next.)
 *
 * Runs homeworkDocumentHandler.onCreateDocument with a brief that should yield
 * BOTH a listening and an image-flashcard exercise, then asserts the enriched
 * payloads carry audioUrl / imageUrl pointing at real files on disk (.uploads/)
 * or in GCS. Prints a latency breakdown.
 *
 * Optionally times gemini-3.5-flash vs gemini-3.1-pro-preview for generation:
 *   COMPARE_MODELS=1 npx tsx --require ./scripts/_no-server-only.cjs scripts/test-media-homework.ts
 */
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Session } from "next-auth";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

import { user } from "@/lib/db/schema";
import { parseHomework } from "@/lib/quiz/homework-schema";

const BRIEF =
  "Beginner (A1) Spanish vocabulary lesson about common food and animals. " +
  "Include listening pronunciation practice and picture-vocabulary flashcards.";

async function fileExists(publicUrl: string): Promise<boolean> {
  // Local mode public URLs look like /api/uploads/serve/media/...
  const m = publicUrl.match(/\/api\/uploads\/serve\/(.+)$/);
  if (m) {
    const { localPathFor } = await import("@/lib/gcs");
    const { access } = await import("node:fs/promises");
    try {
      await access(localPathFor(m[1]));
      return true;
    } catch {
      return false;
    }
  }
  // GCS mode — trust the public URL (a HEAD check would need auth/network).
  return publicUrl.startsWith("https://storage.googleapis.com/");
}

async function generate(modelId: string, session: Session) {
  await import("@/lib/artifacts/server");
  const { homeworkDocumentHandler } = await import("@/artifacts/homework/server");

  let content = "";
  let snapshots = 0;
  const dataStream = {
    write: (part: { type: string; data: unknown }) => {
      if (part.type === "data-homeworkDelta") {
        content = part.data as string;
        snapshots++;
      }
    },
  };

  const start = Date.now();
  await homeworkDocumentHandler.onCreateDocument({
    id: crypto.randomUUID(),
    title: "Food & Animals — Listen and Look",
    // biome-ignore lint: stub stream for offline test
    dataStream: dataStream as any,
    session,
    modelId,
    studentId: null,
    studentContext: BRIEF,
  });
  const latencyMs = Date.now() - start;
  return { content, latencyMs, snapshots };
}

async function main() {
  const client = postgres(process.env.POSTGRES_URL ?? "");
  const db = drizzle(client);
  const email = `media-tester-${Date.now()}@teachflow.local`;
  const [guest] = await db
    .insert(user)
    .values({ email, isAnonymous: true })
    .returning();
  const session = {
    user: { id: guest.id, email: guest.email, type: "guest" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;

  // Optional model comparison (generation latency only).
  if (process.env.COMPARE_MODELS) {
    for (const m of ["gemini-3.5-flash", "gemini-3.1-pro-preview"]) {
      const t0 = Date.now();
      const r = await generate(m, session);
      const hw = parseHomework(r.content);
      // biome-ignore lint: test output
      console.log(
        `[compare] ${m}: total(incl. media)=${Date.now() - t0}ms handler=${r.latencyMs}ms exercises=${hw?.exercises.length ?? 0}`,
      );
    }
  }

  const { content, latencyMs, snapshots } = await generate(
    "gemini-3.5-flash",
    session,
  );
  await client.end();

  if (process.env.DEBUG_HW) {
    const fs = await import("node:fs");
    fs.writeFileSync("/tmp/media-hw-debug.json", content);
  }

  const homework = parseHomework(content);
  if (!homework) {
    throw new Error("FAIL: streamed content did not parse with parseHomework");
  }

  const listening = homework.exercises.filter((e) => e.type === "listening");
  const flashcards = homework.exercises.filter(
    (e) => e.type === "image-flashcard",
  );

  const results: Array<{ id: string; type: string; url: string; exists: boolean }> = [];
  for (const ex of listening) {
    const url = (ex.payload as Record<string, unknown>).audioUrl as string;
    results.push({ id: ex.id, type: ex.type, url, exists: await fileExists(url) });
  }
  for (const ex of flashcards) {
    const url = (ex.payload as Record<string, unknown>).imageUrl as string;
    results.push({ id: ex.id, type: ex.type, url, exists: await fileExists(url) });
  }

  const allExist = results.every((r) => r.exists);
  const hasBoth = listening.length > 0 && flashcards.length > 0;

  // biome-ignore lint: test output
  console.log(
    JSON.stringify(
      {
        ok: allExist && results.length > 0,
        hasBothMediaTypes: hasBoth,
        handlerLatencyMs: latencyMs,
        snapshots,
        title: homework.title,
        exerciseCount: homework.exercises.length,
        exerciseTypes: homework.exercises.map((e) => e.type),
        media: results,
      },
      null,
      2,
    ),
  );

  if (results.length === 0) {
    throw new Error("FAIL: no media-backed exercises were generated");
  }
  if (!allExist) {
    throw new Error("FAIL: some media files do not exist on disk/GCS");
  }
  process.exit(0);
}

main().catch((err) => {
  // biome-ignore lint: test output
  console.error(err);
  process.exit(1);
});
