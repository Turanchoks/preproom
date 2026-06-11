/**
 * Seed a demo homework share + a demo lesson-plan share so the public
 * /s/[slug] pages can be exercised end to end.
 *
 * Run with: npx tsx --require ./scripts/_no-server-only.cjs scripts/seed-share-fixture.ts
 *
 * (The require hook neutralizes the `server-only` guard so the media enrichment
 * pipeline — TTS + image generation — can run outside Next.)
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { document, share, user } from "../lib/db/schema";
import type { HomeworkContent } from "../lib/quiz/homework-schema";
import { enrichHomework } from "../lib/media/enrich";

config({ path: ".env.local" });

const DEMO_EMAIL = "demo-teacher@teachflow.app";

const homework: HomeworkContent = {
  title: "Past Tenses — Mixed Practice",
  lessonSummary:
    "A quick mixed-skills review of the simple past, past continuous, and common irregular verbs from today's lesson.",
  exercises: [
    {
      id: "ex-mc",
      type: "multiple-choice",
      title: "Choose the correct verb",
      instructions: "Pick the option that completes the sentence correctly.",
      payload: {
        question: "Yesterday she ___ to the market before it started raining.",
        options: ["go", "went", "gone", "goes"],
        correctIndex: 1,
        explanation: "Simple past of 'go' is 'went'.",
      },
    },
    {
      id: "ex-fb",
      type: "fill-blank",
      title: "Fill in the blank",
      instructions: "Type the missing word.",
      payload: {
        sentence: "When the phone rang, I ___ dinner.",
        answers: ["was cooking", "was making"],
        hint: "Use the past continuous (was + -ing).",
      },
    },
    {
      id: "ex-fg",
      type: "fill-gaps",
      title: "Complete the story",
      instructions: "Choose the right word for each gap.",
      payload: {
        paragraph:
          "Last summer we ___ to Spain. The weather ___ wonderful and we ___ every day.",
        gaps: [
          { options: ["travel", "travelled", "travelling"], correctIndex: 1 },
          { options: ["was", "were", "is"], correctIndex: 0 },
          { options: ["swim", "swam", "swum"], correctIndex: 1 },
        ],
        hint: "Watch out for irregular past forms.",
      },
    },
    {
      id: "ex-wm",
      type: "word-matching",
      title: "Match the verbs",
      instructions: "Match each base verb with its past-simple form.",
      payload: {
        question: "Match the verb to its past tense.",
        pairs: [
          { source: "go", target: "went" },
          { source: "see", target: "saw" },
          { source: "buy", target: "bought" },
          { source: "eat", target: "ate" },
        ],
      },
    },
    {
      id: "ex-wp",
      type: "word-puzzle",
      title: "Build the sentence",
      instructions: "Tap the words in the correct order.",
      payload: {
        question: "Arrange the words into a correct sentence.",
        correctSentence: "I did not see him yesterday",
        words: ["I", "did", "not", "see", "him", "yesterday"],
        distractors: ["seen", "was"],
      },
    },
    {
      id: "ex-sm",
      type: "sentence-matching",
      title: "Pick the best response",
      instructions: "Choose the sentence that best answers the prompt.",
      payload: {
        question: "Which reply fits best?",
        prompt: "What did you do last weekend?",
        options: [
          "I will go to the cinema.",
          "I went hiking with my friends.",
          "I am going hiking now.",
        ],
        correctIndex: 1,
      },
    },
    {
      id: "ex-listen",
      type: "listening",
      title: "Listen and choose",
      instructions: "Play the clip, then pick the word you heard.",
      payload: {
        prompt: "manzana",
        question: "Which word did you hear?",
        options: ["manzana", "naranja", "plátano", "fresa"],
        correctIndex: 0,
        explanation: "'manzana' means apple.",
        // audioUrl attached by enrichHomework below.
        audioUrl: "",
      },
    },
    {
      id: "ex-flash",
      type: "image-flashcard",
      title: "Name the picture",
      instructions: "Look at the picture and pick the matching word.",
      payload: {
        imagePrompt:
          "Simple flat vector-style illustration of a single red apple, centered on a plain white background, bright friendly colors, no text, minimal detail",
        word: "manzana",
        options: ["manzana", "perro", "casa", "libro"],
        correctIndex: 0,
        // imageUrl attached by enrichHomework below.
        imageUrl: "",
      },
    },
  ],
};

const lessonPlan = `# Lesson Plan — Past Tenses

## Objective
Students review and contrast the **simple past** and **past continuous**, and
practise common **irregular verbs**.

## Warm-up (5 min)
- Ask students what they did last weekend.
- Board the irregular verbs that come up.

## Presentation (15 min)
1. Timeline of simple past vs. past continuous.
2. Form: \`was/were + -ing\` for interrupted actions.

## Practice (20 min)
- Gap-fill worksheet.
- Pair speaking: "When the phone rang, I was ..."

## Wrap-up (5 min)
- Quick homework quiz (shared via TeachFlow).
`;

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL not set (load .env.local).");
  }
  const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(sql);

  // 1. Reuse or create a demo teacher user.
  let [demoUser] = await db.select().from(user).where(eq(user.email, DEMO_EMAIL));
  if (!demoUser) {
    [demoUser] = await db
      .insert(user)
      .values({ email: DEMO_EMAIL, name: "Demo Teacher" })
      .returning();
    console.log(`Created demo user ${demoUser.id}`);
  } else {
    console.log(`Reusing demo user ${demoUser.id}`);
  }

  // 2. Homework document + share slug 'demo-homework'.
  // Enrich the media-backed exercises (TTS clip + flashcard image) so the
  // payloads carry real audioUrl / imageUrl before persistence.
  console.log("Enriching homework media (TTS + image)...");
  await enrichHomework(homework);
  await seedShare({
    db,
    userId: demoUser.id,
    slug: "demo-homework",
    title: homework.title,
    kind: "homework",
    content: JSON.stringify(homework, null, 2),
  });

  // 3. Lesson-plan (text) document + share slug 'demo-plan'.
  await seedShare({
    db,
    userId: demoUser.id,
    slug: "demo-plan",
    title: "Lesson Plan — Past Tenses",
    kind: "text",
    content: lessonPlan,
  });

  await sql.end();
  console.log("\nDone. Visit /s/demo-homework and /s/demo-plan");
}

async function seedShare({
  db,
  userId,
  slug,
  title,
  kind,
  content,
}: {
  db: ReturnType<typeof drizzle>;
  userId: string;
  slug: string;
  title: string;
  kind: "text" | "homework";
  content: string;
}) {
  // Remove any prior share for an idempotent re-seed.
  await db.delete(share).where(eq(share.slug, slug));

  const createdAt = new Date();
  const [doc] = await db
    .insert(document)
    .values({ title, kind, content, userId, createdAt })
    .returning();

  await db.insert(share).values({ slug, documentId: doc.id });
  console.log(`Seeded ${kind} share '/s/${slug}' (document ${doc.id})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
