import { auth } from "@/app/(auth)/auth";
import {
  createStudent,
  getStudentsByUserId,
  saveStudentFact,
} from "@/lib/db/queries-studio";
import { ChatbotError } from "@/lib/errors";

const DEMO_NAME = "Anna García";

/**
 * POST /api/students/demo
 *
 * Creates (or returns existing) the demo student "Anna García" for the current
 * session user, pre-loaded with 9 StudentFact rows so the AI agent has rich
 * memory to show off immediately.
 *
 * Idempotent: if a student named "Anna García" already exists for this user,
 * return that one without creating duplicate facts.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const userId = session.user.id;

  // Idempotent check — return existing demo student if found
  const existing = await getStudentsByUserId({ userId });
  const alreadyExists = existing.find((s) => s.name === DEMO_NAME);
  if (alreadyExists) {
    return Response.json(alreadyExists, { status: 200 });
  }

  // Create the demo student
  const student = await createStudent({
    userId,
    name: DEMO_NAME,
    level: "B1",
    nativeLanguage: "Spanish",
    targetLanguage: "English",
    goals:
      "Pass the B2 Cambridge exam by December. Needs to improve written accuracy and expand vocabulary for professional settings.",
    avatarColor: "violet",
  });

  // Seed believable memory facts spread over the past 3 weeks
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  const facts: Array<{
    category: "strength" | "error" | "interest" | "note" | "progress";
    fact: string;
    source: "chat" | "video_analysis" | "teacher";
    sourceRef?: string;
    daysAgo: number;
  }> = [
    {
      category: "interest",
      fact: "Anna is passionate about sustainable fashion and often uses it as a topic to practise writing.",
      source: "teacher",
      daysAgo: 21,
    },
    {
      category: "error",
      fact: "Consistently confuses present perfect and simple past: says 'I have seen him yesterday' instead of 'I saw him yesterday'.",
      source: "chat",
      daysAgo: 18,
    },
    {
      category: "strength",
      fact: "Strong reading comprehension — correctly infers meaning of unfamiliar vocabulary from context with high accuracy.",
      source: "video_analysis",
      sourceRef: "lesson-video-2024-11",
      daysAgo: 17,
    },
    {
      category: "note",
      fact: "Prefers homework with real-world scenarios (emails, news articles) over abstract grammar drills.",
      source: "teacher",
      daysAgo: 15,
    },
    {
      category: "error",
      fact: "Overuses 'very' as an intensifier — needs exposure to alternatives: extremely, particularly, remarkably, etc.",
      source: "chat",
      daysAgo: 14,
    },
    {
      category: "progress",
      fact: "Went from A2 to B1 in 4 months of twice-weekly lessons. Listening comprehension improved most dramatically.",
      source: "teacher",
      daysAgo: 10,
    },
    {
      category: "interest",
      fact: "Plans to attend a design conference in London next spring — motivated to practise professional spoken English for networking.",
      source: "chat",
      daysAgo: 7,
    },
    {
      category: "error",
      fact: "Has trouble with articles (a/an/the) before countable nouns in writing — omits 'the' in generic statements.",
      source: "chat",
      daysAgo: 5,
    },
    {
      category: "strength",
      fact: "Excellent pronunciation — near-native stress patterns on multi-syllable words; minimal Spanish accent interference.",
      source: "video_analysis",
      sourceRef: "lesson-video-2024-12",
      daysAgo: 2,
    },
  ];

  // Insert facts with spread timestamps (no override of DB defaultNow — insert explicit createdAt via raw drizzle not available here, so we use approximate timestamps)
  for (const { daysAgo, ...rest } of facts) {
    // We pass only the fields saveStudentFact expects; createdAt defaults to now().
    // Spread timestamps aren't critical for the demo — the content is what matters.
    void daysAgo; // intentionally unused; kept for documentation
    await saveStudentFact({
      studentId: student.id,
      category: rest.category,
      fact: rest.fact,
      source: rest.source,
      sourceRef: rest.sourceRef ?? null,
    });
  }

  return Response.json(student, { status: 201 });
}
