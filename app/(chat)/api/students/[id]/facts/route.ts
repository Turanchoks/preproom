import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  deleteStudentFact,
  getFactsByStudentId,
  getStudentById,
} from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";

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

  return { session };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireOwnedStudent(id);

  if ("error" in result) {
    return result.error;
  }

  const facts = await getFactsByStudentId({ studentId: id });
  return Response.json(facts, { status: 200 });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const result = await requireOwnedStudent(id);

  if ("error" in result) {
    return result.error;
  }

  const factId = request.nextUrl.searchParams.get("factId");

  if (!factId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter factId is required."
    ).toResponse();
  }

  await deleteStudentFact({ id: factId });
  return Response.json({ success: true }, { status: 200 });
}
