/**
 * Standalone end-to-end test for the homework document handler — runs the
 * generation pipeline WITHOUT the chat UI.
 *
 *   npx tsx --require ./scripts/_no-server-only.cjs scripts/test-homework-handler.ts
 *
 * (The require hook neutralizes the `server-only` guard so handler code can run
 * outside Next.)
 *
 * The handler streams full-snapshot deltas (each `data-homeworkDelta` carries
 * the complete current partial object) and persists the final JSON. We capture
 * the last snapshot via the stub stream and assert it parses with
 * parseHomework into >= 3 valid exercises.
 */
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Session } from "next-auth";
import postgres from "postgres";

loadEnv({ path: ".env.local" });

import { user } from "@/lib/db/schema";
import { parseHomework } from "@/lib/quiz/homework-schema";

async function main() {
  // Load the handler registry FIRST so the (template-native) handler<->registry
  // import cycle settles (createDocumentHandler is defined before the registry
  // array reads homeworkDocumentHandler).
  await import("@/lib/artifacts/server");
  const { homeworkDocumentHandler } = await import(
    "@/artifacts/homework/server"
  );

  // Real user id from DB — create one if needed.
  const client = postgres(process.env.POSTGRES_URL ?? "");
  const db = drizzle(client);
  const email = `tester-${Date.now()}@tutorroom.local`;
  const [guest] = await db
    .insert(user)
    .values({ email, isAnonymous: true })
    .returning();

  const session = {
    user: { id: guest.id, email: guest.email, type: "guest" },
    expires: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as Session;

  // Capturing stub stream — keeps the latest full snapshot.
  let content = "";
  const dataStream = {
    write: (part: { type: string; data: unknown }) => {
      if (part.type === "data-homeworkDelta") {
        content = part.data as string;
      }
    },
  };

  const start = Date.now();

  await homeworkDocumentHandler.onCreateDocument({
    id: crypto.randomUUID(),
    title: "Past simple practice",
    // biome-ignore lint: stub stream for offline test
    dataStream: dataStream as any,
    session,
    modelId: "gemini-3.5-flash",
    studentId: null,
    studentContext: "B1 student, struggles with irregular verbs",
  });

  const latencyMs = Date.now() - start;
  await client.end();

  if (process.env.DEBUG_HW) {
    const fs = await import("node:fs");
    fs.writeFileSync("/tmp/hw-debug.json", content);
  }

  const homework = parseHomework(content);

  if (!homework) {
    throw new Error("FAIL: streamed content did not parse with parseHomework");
  }

  if (homework.exercises.length < 3) {
    throw new Error(
      `FAIL: expected >= 3 valid exercises, got ${homework.exercises.length}`
    );
  }

  // biome-ignore lint: test script output
  console.log(
    JSON.stringify(
      {
        ok: true,
        latencyMs,
        title: homework.title,
        exerciseCount: homework.exercises.length,
        exerciseTypes: homework.exercises.map((e) => e.type),
      },
      null,
      2
    )
  );

  process.exit(0);
}

main().catch((err) => {
  // biome-ignore lint: test script output
  console.error(err);
  process.exit(1);
});
