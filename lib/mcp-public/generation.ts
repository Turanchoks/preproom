import "server-only";

import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { nanoid } from "nanoid";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import {
  createShare,
  getFactsByStudentId,
  getShareByDocumentId,
} from "@/lib/db/queries-studio";
import type { Student, StudentFact } from "@/lib/db/schema";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

const MODEL_ID = "gemini-3.5-flash";

/**
 * A UIMessageStreamWriter whose writes are discarded — no client is attached to
 * an MCP-driven generation run. The artifact handlers persist the document via
 * saveStudentDocument regardless of the stream (the parts are only the
 * live-canvas choreography). Mirrors lib/agent/proactive.ts.
 */
function buildNoopWriter(): UIMessageStreamWriter<ChatMessage> {
  return {
    write() {
      // discard — no client is attached to this run.
    },
    merge() {
      // discard
    },
    onError: undefined,
  } as unknown as UIMessageStreamWriter<ChatMessage>;
}

/**
 * Compact, embeddable student-context block used to personalize generation.
 * Self-contained here (lib/agent/prompts.ts is another track's file) but mirrors
 * its buildStudentProfileBlock shape: profile fields + memory facts grouped by
 * category.
 */
export function buildStudentContext(
  student: Student,
  facts: StudentFact[]
): string {
  const lines: string[] = [];
  lines.push(`Name: ${student.name}`);
  if (student.level) {
    lines.push(`CEFR level: ${student.level}`);
  }
  if (student.targetLanguage) {
    lines.push(`Learning language: ${student.targetLanguage}`);
  }
  if (student.nativeLanguage) {
    lines.push(`Native language: ${student.nativeLanguage}`);
  }
  if (student.goals) {
    lines.push(`Goals: ${student.goals}`);
  }

  const byCategory: Record<string, string[]> = {};
  for (const f of facts) {
    (byCategory[f.category] ??= []).push(f.fact);
  }
  const push = (label: string, key: string) => {
    const items = byCategory[key];
    if (items?.length) {
      lines.push(`${label}: ${items.join("; ")}`);
    }
  };
  push("Strengths", "strength");
  push("Recurring errors / areas to improve", "error");
  push("Interests", "interest");
  push("Recent progress", "progress");

  return lines.join("\n");
}

export type GeneratedDocument = {
  documentId: string;
  title: string;
  kind: "text" | "homework";
};

/**
 * Generate an artifact (lesson plan = `text`, homework = `homework`) for a
 * student by driving the SAME production generation path the chat agent uses:
 * the kind's handler in documentHandlersByArtifactKind, fed a no-op stream
 * writer, a synthetic teacher session, and the student context. The handler
 * persists the document to the DB via saveStudentDocument.
 */
export async function generateStudentArtifact(opts: {
  kind: "text" | "homework";
  studentId: string;
  student: Student;
  title: string;
  brief: string;
  session: Session;
  userId: string;
}): Promise<GeneratedDocument> {
  const facts = await getFactsByStudentId({
    studentId: opts.studentId,
    limit: 100,
  });
  const studentContext = `${buildStudentContext(opts.student, facts)}\n\nBrief from the teacher: ${opts.brief}`;

  const handler = documentHandlersByArtifactKind.find(
    (h) => h.kind === opts.kind
  );
  if (!handler) {
    throw new Error(`No document handler found for kind: ${opts.kind}`);
  }

  const documentId = generateUUID();
  await handler.onCreateDocument({
    id: documentId,
    // Handlers read intent from the title; fold the brief in so generation is
    // steered even though title is the only free-text field a handler receives.
    title: opts.title,
    dataStream: buildNoopWriter(),
    session: opts.session,
    modelId: MODEL_ID,
    studentId: opts.studentId,
    studentContext,
  });

  return { documentId, title: opts.title, kind: opts.kind };
}

/**
 * Ensure a public share link exists for a document and return its `/s/<slug>`
 * path. Idempotent (reuses an existing share). Mirrors app/(chat)/api/share.
 */
export async function ensureShareUrl(
  documentId: string,
  studentId: string | null
): Promise<string> {
  const existing = await getShareByDocumentId({ documentId });
  const shareRow =
    existing ??
    (await createShare({
      slug: nanoid(10),
      documentId,
      studentId,
    }));
  return `/s/${shareRow.slug}`;
}
