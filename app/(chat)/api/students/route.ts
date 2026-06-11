import { auth } from "@/app/(auth)/auth";
import { createStudent, getStudentsByUserId } from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";

const AVATAR_PALETTE = [
  "rose",
  "orange",
  "amber",
  "emerald",
  "teal",
  "sky",
  "indigo",
  "violet",
  "fuchsia",
];

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const students = await getStudentsByUserId({ userId: session.user.id });
  return Response.json(students, { status: 200 });
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: {
    name?: unknown;
    level?: unknown;
    goals?: unknown;
    nativeLanguage?: unknown;
    targetLanguage?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return new ChatbotError(
      "bad_request:api",
      "Invalid request body."
    ).toResponse();
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return new ChatbotError(
      "bad_request:api",
      "Student name is required."
    ).toResponse();
  }

  const level =
    typeof body.level === "string" && LEVELS.includes(body.level)
      ? body.level
      : null;

  const avatarColor =
    AVATAR_PALETTE[Math.floor(Math.random() * AVATAR_PALETTE.length)];

  const student = await createStudent({
    userId: session.user.id,
    name,
    level,
    goals: typeof body.goals === "string" ? body.goals : null,
    nativeLanguage:
      typeof body.nativeLanguage === "string" ? body.nativeLanguage : null,
    targetLanguage:
      typeof body.targetLanguage === "string" ? body.targetLanguage : null,
    avatarColor,
  });

  return Response.json(student, { status: 201 });
}
