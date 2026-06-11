import { auth } from "@/app/(auth)/auth";
import { getStudentById } from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";
import { generateProgressBrief } from "@/lib/briefs/generate";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const student = await getStudentById({ id });

  if (!student || student.userId !== session.user.id) {
    return new ChatbotError("not_found:api").toResponse();
  }

  try {
    const result = await generateProgressBrief(id, session.user.id);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[brief] generation failed:", err);
    return Response.json(
      { error: "Brief generation failed. Please try again." },
      { status: 500 }
    );
  }
}
