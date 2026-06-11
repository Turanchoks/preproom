import { nanoid } from "nanoid";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  createShare,
  deleteShareByDocumentId,
  getLatestDocumentById,
  getShareByDocumentId,
} from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";

const bodySchema = z.object({
  documentId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  let documentId: string;
  try {
    documentId = bodySchema.parse(await request.json()).documentId;
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Invalid request body."
    ).toResponse();
  }

  const document = await getLatestDocumentById({ id: documentId });

  if (!document) {
    return new ChatbotError("not_found:document").toResponse();
  }

  if (document.userId !== session.user.id) {
    return new ChatbotError("forbidden:document").toResponse();
  }

  const existing = await getShareByDocumentId({ documentId });
  const shareRow =
    existing ??
    (await createShare({
      slug: nanoid(10),
      documentId,
      studentId: document.studentId,
    }));

  return Response.json(
    { slug: shareRow.slug, url: `/s/${shareRow.slug}` },
    { status: 200 }
  );
}

export async function DELETE(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:document").toResponse();
  }

  let documentId: string;
  try {
    documentId = bodySchema.parse(await request.json()).documentId;
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Invalid request body."
    ).toResponse();
  }

  const document = await getLatestDocumentById({ id: documentId });

  if (!document) {
    return new ChatbotError("not_found:document").toResponse();
  }

  if (document.userId !== session.user.id) {
    return new ChatbotError("forbidden:document").toResponse();
  }

  await deleteShareByDocumentId({ documentId });

  return Response.json({ success: true }, { status: 200 });
}
