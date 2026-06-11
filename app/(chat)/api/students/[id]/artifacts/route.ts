import { auth } from "@/app/(auth)/auth";
import {
  getDocumentsByStudentId,
  getStudentById,
} from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const student = await getStudentById({ id });

  if (!student || student.userId !== session.user.id) {
    return new ChatbotError("not_found:api").toResponse();
  }

  const documents = await getDocumentsByStudentId({ studentId: id });
  return Response.json(documents, { status: 200 });
}
