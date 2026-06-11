import { auth } from "@/app/(auth)/auth";
import {
  deleteStudent,
  getStudentById,
  updateStudent,
} from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

type RouteParams = { params: Promise<{ id: string }> };

async function requireOwnedStudent(id: string) {
  const session = await auth();

  if (!session?.user) {
    return { error: new ChatbotError("unauthorized:chat").toResponse() };
  }

  const student = await getStudentById({ id });

  if (!student || student.userId !== session.user.id) {
    return { error: new ChatbotError("not_found:api").toResponse() };
  }

  return { session, student };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireOwnedStudent(id);

  if ("error" in result) {
    return result.error;
  }

  return Response.json(result.student, { status: 200 });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireOwnedStudent(id);

  if ("error" in result) {
    return result.error;
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Invalid request body."
    ).toResponse();
  }

  const updates: {
    id: string;
    name?: string;
    level?: string | null;
    goals?: string | null;
    nativeLanguage?: string | null;
    targetLanguage?: string | null;
  } = { id };

  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return new ChatbotError(
        "bad_request:api",
        "Student name cannot be empty."
      ).toResponse();
    }
    updates.name = name;
  }

  if (typeof body.level === "string") {
    updates.level = LEVELS.includes(body.level) ? body.level : null;
  }
  if (typeof body.goals === "string") {
    updates.goals = body.goals;
  }
  if (typeof body.nativeLanguage === "string") {
    updates.nativeLanguage = body.nativeLanguage;
  }
  if (typeof body.targetLanguage === "string") {
    updates.targetLanguage = body.targetLanguage;
  }

  const updated = await updateStudent(updates);
  return Response.json(updated, { status: 200 });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireOwnedStudent(id);

  if ("error" in result) {
    return result.error;
  }

  await deleteStudent({ id });
  return Response.json({ success: true }, { status: 200 });
}
