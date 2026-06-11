import "server-only";

import { and, desc, eq, ilike, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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

// biome-ignore lint: server-only module
const client = postgres(process.env.POSTGRES_URL ?? "");
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

export async function getFactsByStudentId({
  studentId,
  limit = 50,
}: {
  studentId: string;
  limit?: number;
}): Promise<StudentFact[]> {
  return await db
    .select()
    .from(studentFact)
    .where(eq(studentFact.studentId, studentId))
    .orderBy(desc(studentFact.createdAt))
    .limit(limit);
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
