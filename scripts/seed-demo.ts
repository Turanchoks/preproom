/**
 * Demo seed script — creates a believable demo teacher account with two
 * students, memory facts, lesson plan, homework (with media), a share, and a
 * video-analysis document for the /app demo flow.
 *
 * Run with:
 *   npx tsx --require ./scripts/_no-server-only.cjs scripts/seed-demo.ts
 *
 * Idempotent: re-running is safe; the teacher user is skipped if present,
 * students are wiped+recreated to guarantee fresh state.
 */

import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import {
  user,
  student,
  studentFact,
  document,
  share,
  video,
} from "../lib/db/schema";
import { generateHashedPassword } from "../lib/db/utils";
import type { HomeworkContent } from "../lib/quiz/homework-schema";
import { enrichHomework } from "../lib/media/enrich";

config({ path: ".env.local" });

// ── Credentials (printed prominently at the end) ──────────────────────────────
const DEMO_EMAIL = "demo@teachflow.app";
const DEMO_PASSWORD = "TeachFlow!Demo2026";
const DEMO_NAME = "Alex Rivera";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a Date that is `daysAgo` days before now, with a small time offset. */
function daysAgo(days: number, hourOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(d.getHours() - hourOffset);
  return d;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL not set — load .env.local first.");
  }

  const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
  const db = drizzle(sql);

  // ── 1. Demo teacher user ──────────────────────────────────────────────────

  let [demoUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, DEMO_EMAIL));

  if (!demoUser) {
    const hashedPassword = generateHashedPassword(DEMO_PASSWORD);
    [demoUser] = await db
      .insert(user)
      .values({
        email: DEMO_EMAIL,
        password: hashedPassword,
        name: DEMO_NAME,
        emailVerified: true,
        isAnonymous: false,
      })
      .returning();
    console.log(`✓ Created demo teacher: ${demoUser.id} (${DEMO_EMAIL})`);
  } else {
    console.log(`→ Reusing demo teacher: ${demoUser.id} (${DEMO_EMAIL})`);
  }

  const userId = demoUser.id;

  // ── 2. Students — idempotent by name+teacher ──────────────────────────────
  // Delete existing students owned by this teacher (cascades facts + videos).
  const existingStudents = await db
    .select()
    .from(student)
    .where(eq(student.userId, userId));

  for (const s of existingStudents) {
    // Delete share rows that reference documents for this student first
    const docs = await db
      .select()
      .from(document)
      .where(eq(document.studentId, s.id));
    for (const d of docs) {
      await db.delete(share).where(eq(share.documentId, d.id));
    }
    await db.delete(student).where(eq(student.id, s.id));
  }
  console.log(
    `→ Cleared ${existingStudents.length} existing student(s) for fresh seed.`
  );

  // ── 3. Anna García ───────────────────────────────────────────────────────
  const [anna] = await db
    .insert(student)
    .values({
      userId,
      name: "Anna García",
      level: "B1",
      nativeLanguage: "Spanish",
      targetLanguage: "English",
      goals: "Conversational fluency for work calls",
      avatarColor: "#f97316", // orange
      createdAt: daysAgo(21),
    })
    .returning();
  console.log(`✓ Created student Anna García: ${anna.id}`);

  // Anna's StudentFact memory history — 13 facts spread over 3 weeks
  const annaFacts: Array<{
    category: "strength" | "error" | "interest" | "note" | "progress";
    fact: string;
    source: "chat" | "video_analysis" | "teacher";
    sourceRef?: string;
    createdAt: Date;
  }> = [
    {
      category: "error",
      fact: "Confuses past simple with present perfect in irregular verbs (e.g. 'I have went' instead of 'I went').",
      source: "video_analysis",
      sourceRef: "Lesson Jun 9 — transcript timestamp 04:32",
      createdAt: daysAgo(2, 1),
    },
    {
      category: "interest",
      fact: "Loves cooking — engages strongly with food vocabulary and recipe-based tasks. Lights up when ingredients or meal prep come up.",
      source: "chat",
      createdAt: daysAgo(18, 3),
    },
    {
      category: "progress",
      fact: "Homework 'Past tense practice': scored 6/8. Solid on regular verbs; missed 'brought' and 'caught'.",
      source: "teacher",
      createdAt: daysAgo(5),
    },
    {
      category: "strength",
      fact: "Strong reading comprehension at B1 level — can extract key facts from authentic texts without support.",
      source: "teacher",
      createdAt: daysAgo(14, 2),
    },
    {
      category: "error",
      fact: "Drops the third-person 's' under pressure in spontaneous speech (e.g. 'she work' not 'she works').",
      source: "video_analysis",
      sourceRef: "Lesson May 28 — transcript timestamp 12:07",
      createdAt: daysAgo(14),
    },
    {
      category: "interest",
      fact: "Works in marketing — responds well to business English scenarios (email writing, presenting data, client calls).",
      source: "chat",
      createdAt: daysAgo(16),
    },
    {
      category: "note",
      fact: "Prefers visual prompts (images, videos) over audio-only exercises. Responds better when context is rich.",
      source: "teacher",
      createdAt: daysAgo(19),
    },
    {
      category: "progress",
      fact: "Completed 'Food & restaurant vocabulary' unit with 90% accuracy. Ready for idiomatic expressions next.",
      source: "chat",
      createdAt: daysAgo(10),
    },
    {
      category: "error",
      fact: "Tends to over-translate Spanish collocations (e.g. 'make a photo' instead of 'take a photo').",
      source: "video_analysis",
      sourceRef: "Lesson Jun 4 — transcript timestamp 08:15",
      createdAt: daysAgo(7),
    },
    {
      category: "strength",
      fact: "Excellent at word-matching exercises — fast pattern recognition and strong vocabulary retention from previous week.",
      source: "chat",
      createdAt: daysAgo(9),
    },
    {
      category: "interest",
      fact: "Mentioned wanting to prepare for a job interview in English next month. Highly motivated for professional language.",
      source: "chat",
      createdAt: daysAgo(3),
    },
    {
      category: "note",
      fact: "Best learning time: Tuesday/Thursday evenings. Tends to rush exercises on Mondays.",
      source: "teacher",
      createdAt: daysAgo(21),
    },
    {
      category: "progress",
      fact: "Speaking task on work call roleplay: fluency improved notably vs. 3 weeks ago. Filler words down from ~8/min to ~3/min.",
      source: "video_analysis",
      sourceRef: "Lesson Jun 9 — teacher rubric",
      createdAt: daysAgo(2),
    },
  ];

  for (const f of annaFacts) {
    await db.insert(studentFact).values({
      studentId: anna.id,
      category: f.category,
      fact: f.fact,
      source: f.source,
      sourceRef: f.sourceRef ?? null,
      createdAt: f.createdAt,
    });
  }
  console.log(`  ✓ Inserted ${annaFacts.length} facts for Anna`);

  // ── 4. Marco Rossi ───────────────────────────────────────────────────────
  const [marco] = await db
    .insert(student)
    .values({
      userId,
      name: "Marco Rossi",
      level: "A2",
      nativeLanguage: "Italian",
      targetLanguage: "English",
      goals: "Travel English and everyday conversation",
      avatarColor: "#3b82f6", // blue
      createdAt: daysAgo(12),
    })
    .returning();
  console.log(`✓ Created student Marco Rossi: ${marco.id}`);

  const marcoFacts: Array<{
    category: "strength" | "error" | "interest" | "note" | "progress";
    fact: string;
    source: "chat" | "video_analysis" | "teacher";
    sourceRef?: string;
    createdAt: Date;
  }> = [
    {
      category: "error",
      fact: "Uses present simple where English requires present continuous (e.g. 'I go to the shop now' instead of 'I'm going').",
      source: "video_analysis",
      sourceRef: "Lesson Jun 6 — transcript timestamp 02:50",
      createdAt: daysAgo(5),
    },
    {
      category: "interest",
      fact: "Big football fan — immediately engaged when vocabulary exercises used sports contexts. Goal-scoring metaphors land well.",
      source: "chat",
      createdAt: daysAgo(10),
    },
    {
      category: "progress",
      fact: "Homework 'Directions & transport': scored 5/7. Struggled with prepositions (on/at/in) in addresses.",
      source: "teacher",
      createdAt: daysAgo(8),
    },
    {
      category: "strength",
      fact: "Pronunciation is a strong point — clear vowels and good intonation thanks to Italian phonetic background.",
      source: "video_analysis",
      sourceRef: "Lesson Jun 6 — teacher note",
      createdAt: daysAgo(5),
    },
    {
      category: "note",
      fact: "Learns quickly with repetition and game-style exercises. Word puzzles and matching keep him focused.",
      source: "teacher",
      createdAt: daysAgo(12),
    },
    {
      category: "error",
      fact: "Confuses 'much' vs. 'many' — applies 'much' to countable nouns (e.g. 'much people').",
      source: "chat",
      createdAt: daysAgo(7),
    },
    {
      category: "interest",
      fact: "Planning a trip to Australia — travel scenarios (airports, hotels, restaurants) are his primary motivation.",
      source: "chat",
      createdAt: daysAgo(11),
    },
    {
      category: "progress",
      fact: "Can now handle a simulated hotel check-in dialogue with minimal hesitation. Clear A2→B1 trajectory on functional tasks.",
      source: "teacher",
      createdAt: daysAgo(3),
    },
  ];

  for (const f of marcoFacts) {
    await db.insert(studentFact).values({
      studentId: marco.id,
      category: f.category,
      fact: f.fact,
      source: f.source,
      sourceRef: f.sourceRef ?? null,
      createdAt: f.createdAt,
    });
  }
  console.log(`  ✓ Inserted ${marcoFacts.length} facts for Marco`);

  // ── 5. Anna's lesson plan document ───────────────────────────────────────

  const lessonPlanContent = `# Lesson Plan — Jun 11: Past Tenses & Cooking Vocabulary

**Student:** Anna García · B1 · Spanish → English
**Focus:** Past simple vs. present perfect (irregular verbs) + food/cooking vocabulary
**Duration:** 50 minutes

---

## Warm-Up (8 min)

Start with a quick **"What did you cook last weekend?"** discussion prompt. Encourage Anna to narrate the steps she took — this activates prior vocabulary and surfaces the past tense in natural use.

- Listen for filler phrases and tally verb errors without interrupting fluency.
- Board any interesting food words she uses; revisit at the vocabulary stage.

*Target: relax speaking register; establish cooking theme.*

---

## Error Review — Past Simple vs. Present Perfect (15 min)

Anna's video analysis (Jun 9) flagged consistent confusion between past simple and present perfect with irregular verbs. Address this directly before new input.

**Key errors from recording (timestamp 04:32):**
- "I have went to the market" → "I went to the market"
- "She has ate the whole cake" → "She ate / She has eaten the whole cake"

**Mini-input (5 min):** Draw a simple timeline on screen:
- Past simple = specific point in the past (**yesterday**, **last week**, **in 2020**)
- Present perfect = unspecified past / result still relevant (**I have cooked / I have eaten**)

**Controlled practice (10 min):** Eight gap-fill sentences alternating between the two tenses, all in cooking/food contexts (e.g. "She ___ (make) pasta for the first time last Tuesday."). Check answers together; elicit self-correction before correcting.

---

## Cooking Vocabulary Activity (15 min)

Present a **recipe card** for a simple dish (e.g. Spanish omelette / tortilla). Tasks:

1. **Pre-teach vocabulary:** chop, whisk, fry, drain, season, simmer, fold — match to images.
2. **Sequencing task:** Jumbled recipe steps → put in order using past simple narration ("First she chopped the onions, then she whisked the eggs…").
3. **Pair speaking:** Anna retells the recipe from memory using her own words. Teacher prompts with "What happened next?" to sustain the narrative.

*Vocabulary source: Anna loves cooking; engagement is predictably high here. Use it to consolidate irregular verbs in a meaningful context.*

---

## Production Task — Mini Monologue (8 min)

**Prompt:** "Tell me about the best meal you've ever cooked or eaten — what happened, who was there, and what made it special?"

- Record the response (screen share/mic) for future video analysis.
- Allow 1 minute planning; then 2–3 minutes speaking without interruption.
- Light feedback notes on irregular verb accuracy and third-person agreement.

---

## Wrap-Up & Homework Preview (4 min)

- Quick recap: 3 irregular verbs Anna used correctly today → positive reinforcement.
- Assign homework via TeachFlow share link (**anna-homework**): focuses on past tense gap-fills, a word-matching activity for cooking verbs, plus a listening clip.
- Next session goal: introduce present perfect for life experiences ("Have you ever…?").

---

*Teacher notes: watch for 'she work' (→ 'she works') in wrap-up; low priority today but flag in memory for next session.*`;

  const lessonPlanCreatedAt = daysAgo(0, 2); // created ~2h ago today
  const [lessonPlanDoc] = await db
    .insert(document)
    .values({
      title: "Lesson Plan — Jun 11: Past Tenses & Cooking Vocabulary",
      kind: "text",
      content: lessonPlanContent,
      userId,
      studentId: anna.id,
      createdAt: lessonPlanCreatedAt,
    })
    .returning();
  console.log(`✓ Created lesson plan document: ${lessonPlanDoc.id}`);

  // ── 6. Anna's homework document (with media enrichment) + share ───────────

  const annaHomework: HomeworkContent = {
    title: "Past Tenses & Cooking Vocabulary — Practice Set",
    lessonSummary:
      "Practice the past simple and present perfect with irregular verbs, then review today's cooking vocabulary. Listen carefully to the audio clip and match the images!",
    exercises: [
      {
        id: "ex-mc-1",
        type: "multiple-choice",
        title: "Past simple or present perfect?",
        instructions:
          "Choose the correct verb form to complete the sentence.",
        payload: {
          question:
            "She ___ pasta for the first time last Tuesday — it turned out amazing!",
          options: [
            "has made",
            "made",
            "has been making",
            "makes",
          ],
          correctIndex: 1,
          explanation:
            "'Last Tuesday' is a specific past time marker — use the past simple: 'made'.",
        },
      },
      {
        id: "ex-mc-2",
        type: "multiple-choice",
        title: "Choose the irregular past form",
        instructions: "Which sentence uses the correct irregular past tense?",
        payload: {
          question: "Which sentence is correct?",
          options: [
            "I have went to that restaurant before.",
            "I went to that restaurant last year.",
            "I goed to that restaurant yesterday.",
            "I have go to that restaurant before.",
          ],
          correctIndex: 1,
          explanation:
            "The past simple of 'go' is 'went'. With 'last year' (specific time) we need simple past, not present perfect.",
        },
      },
      {
        id: "ex-fb",
        type: "fill-blank",
        title: "Fill in the cooking verb",
        instructions:
          "Complete the sentence with the correct past simple form of the verb in brackets.",
        payload: {
          sentence:
            "She carefully ___ the onions before adding them to the pan. (chop)",
          answers: ["chopped"],
          hint: "Regular verb — just add -ped.",
        },
      },
      {
        id: "ex-wm",
        type: "word-matching",
        title: "Cooking verbs — past forms",
        instructions:
          "Match each cooking verb to its correct past simple form.",
        payload: {
          question: "Match the base form to the past simple.",
          pairs: [
            { source: "chop", target: "chopped" },
            { source: "fry", target: "fried" },
            { source: "stir", target: "stirred" },
            { source: "season", target: "seasoned" },
            { source: "bring", target: "brought" },
          ],
        },
      },
      {
        id: "ex-fg",
        type: "fill-gaps",
        title: "Complete the recipe story",
        instructions:
          "Choose the right word for each gap to complete the recipe narration.",
        payload: {
          paragraph:
            "Last Sunday I ___ a traditional Spanish omelette. First, I ___ the potatoes and ___ them in olive oil for 20 minutes.",
          gaps: [
            {
              options: ["make", "made", "have made"],
              correctIndex: 1,
            },
            {
              options: ["chop", "chopped", "have chopped"],
              correctIndex: 1,
            },
            {
              options: ["fry", "fried", "have fried"],
              correctIndex: 1,
            },
          ],
          hint: "'Last Sunday' tells you to use past simple throughout.",
        },
      },
      {
        id: "ex-listen",
        type: "listening",
        title: "Listen and identify the dish",
        instructions:
          "Listen to the audio clip carefully, then choose the word you heard.",
        payload: {
          prompt: "tortilla",
          question: "Which Spanish dish did you hear?",
          options: ["paella", "tortilla", "gazpacho", "churros"],
          correctIndex: 1,
          explanation:
            "'Tortilla' is a Spanish omelette made with eggs and potatoes.",
          audioUrl: "",
        },
      },
      {
        id: "ex-flash",
        type: "image-flashcard",
        title: "Name the cooking action",
        instructions: "Look at the picture and choose the matching verb.",
        payload: {
          imagePrompt:
            "Simple flat vector-style illustration of a chef's knife chopping vegetables on a wooden cutting board, bright clean colors, no text, top-down view, minimal detail, white background",
          word: "chop",
          options: ["boil", "chop", "fry", "bake"],
          correctIndex: 1,
          imageUrl: "",
        },
      },
    ],
  };

  // Enrich with real TTS audio and AI-generated image
  console.log("Enriching Anna homework media (TTS + image)...");
  await enrichHomework(annaHomework);

  const homeworkCreatedAt = daysAgo(0, 1); // 1h ago
  const [homeworkDoc] = await db
    .insert(document)
    .values({
      title: "Past Tenses & Cooking Vocabulary — Practice Set",
      kind: "homework",
      content: JSON.stringify(annaHomework, null, 2),
      userId,
      studentId: anna.id,
      createdAt: homeworkCreatedAt,
    })
    .returning();
  console.log(`✓ Created homework document: ${homeworkDoc.id}`);

  // Idempotent share: delete any existing slug then re-create
  await db.delete(share).where(eq(share.slug, "anna-homework"));
  await db
    .insert(share)
    .values({ slug: "anna-homework", documentId: homeworkDoc.id, studentId: anna.id });
  console.log(`✓ Created share: /s/anna-homework → document ${homeworkDoc.id}`);

  // ── 7. Anna's video + analysis document ──────────────────────────────────

  const analysisContent = `# Video Analysis — Lesson Jun 9: Past Tenses & Cooking Vocabulary

**Student:** Anna García · B1 · Spanish → English
**Video:** Lesson recording, approx. 45 minutes
**Analysed by:** TeachFlow AI (Gemini)

---

## Fluency & Delivery

Anna demonstrated confident, natural-sounding English for most of the session. Speech rate was appropriate for B1 (approx. 110 wpm sustained). Filler words (um, like, you know) occurred at approximately 3 per minute — a significant improvement from 8/min three weeks ago. Turn-taking was smooth; she rarely talked over the teacher.

**Score: 4/5**

---

## Grammar Accuracy

| Area | Observation | Severity |
|---|---|---|
| Past simple vs. present perfect | Repeated confusion with irregular verbs ("I have went", "she has ate") | High priority |
| Third-person agreement | Drops -s under pressure in spontaneous speech | Medium |
| Articles | Occasional omission before countable nouns | Low |

**Score: 3/5**

---

## Vocabulary Range

Anna used a pleasing variety of cooking-related vocabulary (sauté, chop, simmer, drain) with correct collocation in most cases. One recurring L1 transfer error: "make a photo" (Spanish: hacer una foto) instead of "take a photo". Overall vocabulary breadth is at the high end of B1.

**Score: 4/5**

---

## Pronunciation

Clear vowels throughout; consonant clusters handled well. The Spanish dental /t/ occasionally surfaces before vowels but does not impede comprehension. Sentence stress and intonation were natural.

**Score: 4.5/5**

---

## Key Observations for Next Session

1. **Priority grammar focus:** past simple vs. present perfect — create structured practice before moving to new input.
2. **Leverage cooking theme:** engagement and vocabulary retention are noticeably stronger in food contexts.
3. **Positive reinforcement:** fluency improvement is real and measurable — share this data with Anna to boost motivation.
4. **L1 interference:** collocations (make vs. take, do vs. make) need dedicated attention within the next 2–3 sessions.

---

*Analysis generated automatically from video transcript. Reviewed 2026-06-09.*`;

  const analysisCreatedAt = daysAgo(2, 3);
  const [analysisDoc] = await db
    .insert(document)
    .values({
      title: "Video Analysis — Lesson Jun 9",
      kind: "text",
      content: analysisContent,
      userId,
      studentId: anna.id,
      createdAt: analysisCreatedAt,
    })
    .returning();
  console.log(`✓ Created analysis document: ${analysisDoc.id}`);

  const [videoRow] = await db
    .insert(video)
    .values({
      studentId: anna.id,
      title: "Lesson — Jun 9: Past tenses & cooking vocab",
      gcsUri: null,
      mimeType: null,
      status: "ready",
      summary:
        "45-minute lesson focusing on past simple vs. present perfect errors and cooking vocabulary. Anna showed strong fluency gains (filler words down from 8/min to ~3/min) but consistently confused irregular verb forms in the present perfect. The cooking theme produced noticeably higher engagement and better vocabulary retention. Three key grammar errors logged for next session planning.",
      analysisDocumentId: analysisDoc.id,
      createdAt: daysAgo(2, 4),
    })
    .returning();
  console.log(`✓ Created video record: ${videoRow.id}`);

  // ── Done ──────────────────────────────────────────────────────────────────

  await sql.end();

  console.log("\n" + "=".repeat(60));
  console.log("DEMO SEED COMPLETE");
  console.log("=".repeat(60));
  console.log(`\n  Email:    ${DEMO_EMAIL}`);
  console.log(`  Password: ${DEMO_PASSWORD}`);
  console.log("\nCreated IDs:");
  console.log(`  Teacher user:       ${userId}`);
  console.log(`  Student Anna:       ${anna.id}`);
  console.log(`  Student Marco:      ${marco.id}`);
  console.log(`  Lesson plan doc:    ${lessonPlanDoc.id}`);
  console.log(`  Homework doc:       ${homeworkDoc.id}`);
  console.log(`  Analysis doc:       ${analysisDoc.id}`);
  console.log(`  Video:              ${videoRow.id}`);
  console.log(`\nPublic share: /s/anna-homework`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
