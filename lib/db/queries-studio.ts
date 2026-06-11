import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  chat,
  type Chat,
  document,
  type Document,
  share,
  type Share,
  student,
  type Student,
  studentFact,
  type StudentFact,
  video,
  type Video,
} from "./schema";

import { createPgClient } from "./client";

const client = createPgClient();
const db = drizzle(client);

// ── Students ─────────────────────────────────────────────────────────

export async function getStudentsByUserId({
  userId,
}: {
  userId: string;
}): Promise<Student[]> {
  return await db
    .select()
    .from(student)
    .where(eq(student.userId, userId))
    .orderBy(desc(student.createdAt));
}

export async function getStudentById({
  id,
}: {
  id: string;
}): Promise<Student | undefined> {
  const [row] = await db.select().from(student).where(eq(student.id, id));
  return row;
}

export async function createStudent(
  data: Omit<Student, "id" | "createdAt">
): Promise<Student> {
  const [row] = await db.insert(student).values(data).returning();
  return row;
}

export async function updateStudent({
  id,
  ...data
}: Partial<Omit<Student, "createdAt" | "userId">> & {
  id: string;
}): Promise<Student> {
  const [row] = await db
    .update(student)
    .set(data)
    .where(eq(student.id, id))
    .returning();
  return row;
}

export async function deleteStudent({ id }: { id: string }) {
  return await db.delete(student).where(eq(student.id, id));
}

// ── Student facts (agentic memory) ───────────────────────────────────

export async function saveStudentFact(
  data: Omit<StudentFact, "id" | "createdAt">
): Promise<StudentFact> {
  const [row] = await db.insert(studentFact).values(data).returning();
  return row;
}

// High-signal categories that should never be crowded out of the injected
// memory window by a flood of recent low-signal `note` facts. Ordered by
// teaching value. `note` is intentionally excluded — notes are the bulk and
// the ones we let scroll out of the window when memory grows long.
const PRIORITY_CATEGORIES = new Set(["error", "progress", "interest", "strength"]);

/**
 * Returns durable facts for a student. By default (`prioritize: true`) the
 * window is NOT a pure most-recent slice: every high-signal fact (error,
 * progress, interest, strength) is retained, and remaining slots are filled
 * with the most recent `note` facts. This keeps the single most important
 * observations (e.g. a recurring error, an exam date stored as progress) inside
 * the injected memory window even after dozens of low-value notes accumulate
 * over a long teaching relationship. Within each tier, newest first.
 *
 * Pass `prioritize: false` for callers that genuinely want a raw recency slice
 * (e.g. the public facts list endpoint).
 */
export async function getFactsByStudentId({
  studentId,
  limit = 50,
  prioritize = true,
}: {
  studentId: string;
  limit?: number;
  prioritize?: boolean;
}): Promise<StudentFact[]> {
  if (!prioritize) {
    return await db
      .select()
      .from(studentFact)
      .where(eq(studentFact.studentId, studentId))
      .orderBy(desc(studentFact.createdAt))
      .limit(limit);
  }

  // Over-fetch (cheap on a per-student index), then rank in JS: priority
  // categories first (newest-first), then recent notes filling the remainder.
  const rows = await db
    .select()
    .from(studentFact)
    .where(eq(studentFact.studentId, studentId))
    .orderBy(desc(studentFact.createdAt))
    .limit(Math.max(limit * 5, 100));

  const priority = rows.filter((r) => PRIORITY_CATEGORIES.has(r.category));
  const rest = rows.filter((r) => !PRIORITY_CATEGORIES.has(r.category));
  return [...priority, ...rest].slice(0, limit);
}

export async function searchStudentFacts({
  studentId,
  query,
  limit = 10,
}: {
  studentId: string;
  query: string;
  limit?: number;
}): Promise<StudentFact[]> {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2)
    .slice(0, 8);

  if (terms.length === 0) {
    return [];
  }

  return await db
    .select()
    .from(studentFact)
    .where(
      and(
        eq(studentFact.studentId, studentId),
        or(...terms.map((t) => ilike(studentFact.fact, `%${t}%`)))
      )
    )
    .orderBy(desc(studentFact.createdAt))
    .limit(limit);
}

/**
 * Cheap near-duplicate guard for save_fact: returns an existing fact in the
 * SAME category whose text substantially overlaps the candidate, so the agent
 * doesn't pile up ten paraphrases of "hates grammar drills" over a long
 * relationship and crowd the memory window. Uses a couple of the candidate's
 * longest content words as ILIKE probes (cheap, index-free is fine at this
 * scale). Returns the first match or undefined.
 */
export async function findSimilarFact({
  studentId,
  category,
  fact,
}: {
  studentId: string;
  category: StudentFact["category"];
  fact: string;
}): Promise<StudentFact | undefined> {
  const STOP = new Set([
    "the", "and", "for", "with", "that", "this", "his", "her", "she",
    "they", "but", "not", "has", "have", "are", "was", "when", "their",
    "marco", "student", "english", "about",
  ]);
  const words = fact
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  if (words.length < 2) {
    return undefined;
  }
  const [row] = await db
    .select()
    .from(studentFact)
    .where(
      and(
        eq(studentFact.studentId, studentId),
        eq(studentFact.category, category),
        // Require ALL probe words present → high-precision dedup (low false
        // positives), so genuinely new facts are never silently dropped.
        ...words.map((w) => ilike(studentFact.fact, `%${w}%`))
      )
    )
    .limit(1);
  return row;
}

export async function deleteStudentFact({ id }: { id: string }) {
  return await db.delete(studentFact).where(eq(studentFact.id, id));
}

// ── Videos ───────────────────────────────────────────────────────────

export async function createVideo(
  data: Omit<Video, "id" | "createdAt" | "summary" | "analysisDocumentId"> & {
    summary?: string | null;
  }
): Promise<Video> {
  const [row] = await db.insert(video).values(data).returning();
  return row;
}

export async function getVideosByStudentId({
  studentId,
}: {
  studentId: string;
}): Promise<Video[]> {
  return await db
    .select()
    .from(video)
    .where(eq(video.studentId, studentId))
    .orderBy(desc(video.createdAt));
}

export async function getVideoById({
  id,
}: {
  id: string;
}): Promise<Video | undefined> {
  const [row] = await db.select().from(video).where(eq(video.id, id));
  return row;
}

export async function updateVideo({
  id,
  ...data
}: Partial<Omit<Video, "id" | "createdAt" | "studentId">> & {
  id: string;
}): Promise<Video> {
  const [row] = await db
    .update(video)
    .set(data)
    .where(eq(video.id, id))
    .returning();
  return row;
}

// ── Shares ───────────────────────────────────────────────────────────

export async function createShare(data: {
  slug: string;
  documentId: string;
  studentId?: string | null;
}): Promise<Share> {
  const [row] = await db.insert(share).values(data).returning();
  return row;
}

export async function getShareByDocumentId({
  documentId,
}: {
  documentId: string;
}): Promise<Share | undefined> {
  const [row] = await db
    .select()
    .from(share)
    .where(eq(share.documentId, documentId));
  return row;
}

export async function deleteShareByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  return await db.delete(share).where(eq(share.documentId, documentId));
}

/**
 * Public path: resolves a share slug to the LATEST version of the document.
 * No userId check — shared documents are public by design.
 */
export async function getSharedDocumentBySlug({
  slug,
}: {
  slug: string;
}): Promise<{ document: Document; share: Share } | null> {
  const [shareRow] = await db.select().from(share).where(eq(share.slug, slug));

  if (!shareRow) {
    return null;
  }

  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, shareRow.documentId))
    .orderBy(desc(document.createdAt))
    .limit(1);

  if (!doc) {
    return null;
  }

  return { document: doc, share: shareRow };
}

// ── Chats / documents by student ─────────────────────────────────────

export async function getChatsByStudentId({
  studentId,
  limit = 50,
}: {
  studentId: string;
  limit?: number;
}): Promise<Chat[]> {
  return await db
    .select()
    .from(chat)
    .where(eq(chat.studentId, studentId))
    .orderBy(desc(chat.createdAt))
    .limit(limit);
}

export async function setChatStudent({
  chatId,
  studentId,
}: {
  chatId: string;
  studentId: string;
}) {
  return await db
    .update(chat)
    .set({ studentId })
    .where(eq(chat.id, chatId));
}

/**
 * Latest version of each document belonging to a student.
 */
export async function getDocumentsByStudentId({
  studentId,
}: {
  studentId: string;
}): Promise<Document[]> {
  const rows = await db
    .select()
    .from(document)
    .where(eq(document.studentId, studentId))
    .orderBy(desc(document.createdAt));

  const seen = new Set<string>();
  const latest: Document[] = [];
  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      latest.push(row);
    }
  }
  return latest;
}

/**
 * Latest version of a single document by id (no version filter).
 */
export async function getLatestDocumentById({
  id,
}: {
  id: string;
}): Promise<Document | undefined> {
  const [row] = await db
    .select()
    .from(document)
    .where(eq(document.id, id))
    .orderBy(desc(document.createdAt))
    .limit(1);
  return row;
}

/**
 * Save a document attributed to a student (used by agent tools).
 */
export async function saveStudentDocument({
  id,
  title,
  kind,
  content,
  userId,
  studentId,
}: {
  id: string;
  title: string;
  kind: Document["kind"];
  content: string;
  userId: string;
  studentId: string | null;
}): Promise<Document> {
  const [row] = await db
    .insert(document)
    .values({
      id,
      title,
      kind,
      content,
      userId,
      studentId,
      createdAt: new Date(),
    })
    .returning();
  return row;
}
