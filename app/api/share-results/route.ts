import { z } from "zod";
import {
  getSharedDocumentBySlug,
  saveStudentFact,
} from "@/lib/db/queries-studio";

/**
 * PUBLIC, UNAUTHENTICATED endpoint — closes the learning loop.
 *
 * A student finishes a shared homework on /s/[slug]; the player POSTs a
 * results summary here. We resolve the share slug -> documentId -> studentId
 * SERVER-SIDE (client-supplied ids are never trusted) and persist the outcome
 * as agentic memory facts via saveStudentFact, so the teacher's per-student
 * agent "knows" how the student did the next time it reads memory.
 *
 * Persists, with no schema change:
 *   - 1 'progress' fact: "Homework '<title>': scored X/Y on <date>"
 *   - 1 'error' fact per failed exercise: "Struggled with '<title>' (<type>) ..."
 *
 * NOTE on `source`: facts are tagged with the dedicated "homework_result"
 * source (a type-level varchar enum value; the underlying column has no CHECK
 * constraint so no migration is needed). The memory tab renders this as a
 * "from homework results" badge. sourceRef is the share slug for traceability.
 */

const SHORT = 200;

const perExerciseSchema = z.object({
  title: z.string().trim().min(1).max(SHORT),
  type: z.string().trim().min(1).max(SHORT),
  correct: z.boolean(),
  attempts: z.number().int().min(0).max(1000),
});

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(32),
  score: z.number().int().min(0).max(10000),
  total: z.number().int().min(0).max(10000),
  perExercise: z.array(perExerciseSchema).max(30),
});

export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Resolve the share SERVER-SIDE. Never trust a client-supplied studentId.
  const resolved = await getSharedDocumentBySlug({ slug: body.slug });
  if (!resolved) {
    return Response.json({ error: "Share not found." }, { status: 404 });
  }

  const studentId = resolved.share.studentId;
  if (!studentId) {
    // The share is not attributed to a student — nothing to remember.
    return Response.json({ ok: true, persisted: 0 }, { status: 200 });
  }

  const docTitle = resolved.document.title || "Homework";
  const date = new Date().toISOString().slice(0, 10);

  const factIds: string[] = [];

  // 1) One 'progress' fact summarizing the score.
  const progress = await saveStudentFact({
    studentId,
    category: "progress",
    fact: `Homework '${docTitle}': scored ${body.score}/${body.total} (${date})`,
    source: "homework_result",
    sourceRef: body.slug,
  });
  factIds.push(progress.id);

  // 2) One 'error' fact per failed exercise.
  for (const ex of body.perExercise) {
    if (ex.correct) {
      continue;
    }
    const err = await saveStudentFact({
      studentId,
      category: "error",
      fact: `Struggled with '${ex.title}' (${ex.type}) in homework '${docTitle}'`,
      source: "homework_result",
      sourceRef: body.slug,
    });
    factIds.push(err.id);
  }

  return Response.json(
    { ok: true, persisted: factIds.length, factIds },
    { status: 200 }
  );
}
