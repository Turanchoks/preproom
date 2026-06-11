/**
 * PrepRoom — Homework generation eval harness.
 *
 *   npx tsx --require ./scripts/_no-server-only.cjs evals/homework-eval.ts
 *
 * (The require hook neutralizes the `server-only` import guard so the REAL
 * artifact handler code in artifacts/homework/server.ts runs outside Next.)
 *
 * Exercises THE REAL generation path: `homeworkDocumentHandler.onCreateDocument`
 * with the same system prompt (incl. the pedagogy block) + media enrichment
 * (TTS / image gen) that production uses. We pattern-match the offline shim in
 * scripts/test-homework-handler.ts (fake next-auth Session + a capturing
 * UIMessageStreamWriter) so no UI/HTTP is involved.
 *
 * For each of 10 golden briefs (CEFR A1-C1, >=3 languages, varied
 * grammar/vocab topics + student-context strings) we score:
 *   (1) schema validity     — parses with parseHomework against homeworkSchema
 *   (2) structural checks    — deterministic: >=4 exercises, >=3 distinct types,
 *                              MC exactly one correctIndex in range, fill-blank
 *                              answers nonempty, listening/image have media URLs
 *   (3) LLM-judge rubric     — gemini-3.5-flash scores level-appropriateness,
 *                              topic-relevance, instruction-clarity 1-5 against
 *                              docs/harvest/pedagogy-rubric.md (strict JSON);
 *                              the brief score is the average of the 3 dims.
 *
 * Concurrency 3. Prints a per-brief table + aggregate, and writes docs/EVALS.md
 * with methodology, rubric, dataset, the REAL numbers, and the reproduce command.
 */
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Session } from "next-auth";
import postgres from "postgres";
import { GoogleGenAI } from "@google/genai";

loadEnv({ path: ".env.local" });

import { user } from "@/lib/db/schema";
import {
  EXERCISE_TYPES,
  type ExerciseType,
  type HomeworkContent,
  parseHomework,
} from "@/lib/quiz/homework-schema";

// ---------------------------------------------------------------------------
// Dataset — 10 golden briefs. CEFR A1..C1; languages: Spanish, French, German,
// Italian, English, Portuguese, Japanese, Mandarin; varied grammar/vocab topics
// and student-context strings carrying strengths + recurring errors.
// ---------------------------------------------------------------------------
type Brief = {
  id: string;
  /** title passed to the handler */
  title: string;
  /** language being learned (for the judge) */
  language: string;
  /** target CEFR level (for the judge + structural notes) */
  level: string;
  /** topic / grammar focus (for the judge) */
  topic: string;
  /** studentContext string passed to the handler verbatim */
  studentContext: string;
};

const BRIEFS: Brief[] = [
  {
    id: "es-a1-greetings",
    title: "Spanish A1: greetings & introductions",
    language: "Spanish",
    level: "A1",
    topic: "greetings, introductions, the verb ser, basic personal-info vocabulary",
    studentContext:
      "A1 Spanish learner (native English). Goal: hold a first self-introduction. Strengths: enthusiastic, good with cognates. Recurring errors: confuses ser/estar, forgets gender agreement on adjectives.",
  },
  {
    id: "fr-a2-passe-compose",
    title: "French A2: passé composé with avoir",
    language: "French",
    level: "A2",
    topic: "passé composé with the auxiliary avoir, weekend-activity vocabulary",
    studentContext:
      "A2 French learner (native English). Goal: narrate past weekend activities. Strengths: solid present-tense conjugation, broad food vocabulary. Recurring errors: drops past participle agreement, picks être instead of avoir.",
  },
  {
    id: "de-b1-dative",
    title: "German B1: dative case & two-way prepositions",
    language: "German",
    level: "B1",
    topic: "dative case, two-way (Wechsel) prepositions, describing locations in a home",
    studentContext:
      "B1 German learner (native Spanish). Goal: describe where furniture is in an apartment. Strengths: strong vocabulary, confident speaker. Recurring errors: uses accusative where dative is required, wrong article endings after in/auf/an.",
  },
  {
    id: "it-a2-reflexive",
    title: "Italian A2: reflexive verbs & daily routine",
    language: "Italian",
    level: "A2",
    topic: "reflexive verbs (svegliarsi, vestirsi), daily-routine vocabulary, time expressions",
    studentContext:
      "A2 Italian learner (native French). Goal: describe a typical morning routine. Strengths: good ear for pronunciation, transfers French cognates well. Recurring errors: forgets reflexive pronoun, mixes up essere/avere in compound tenses.",
  },
  {
    id: "en-b2-conditionals",
    title: "English B2: second & third conditionals",
    language: "English",
    level: "B2",
    topic: "second and third conditionals, hypothetical situations, regret",
    studentContext:
      "B2 English learner (native Mandarin). Goal: discuss hypotheticals and express regret fluently. Strengths: rich vocabulary, strong reading. Recurring errors: mixes up second and third conditional, omits 'would have' in the result clause.",
  },
  {
    id: "pt-a1-articles",
    title: "Portuguese A1: definite articles & noun gender",
    language: "Portuguese (Brazilian)",
    level: "A1",
    topic: "definite articles (o/a/os/as), noun gender, everyday-object vocabulary",
    studentContext:
      "A1 Brazilian Portuguese learner (native English). Goal: name everyday objects with correct articles. Strengths: motivated, learns vocabulary fast. Recurring errors: defaults every article to 'o', no plural agreement.",
  },
  {
    id: "ja-a1-particles",
    title: "Japanese A1: particles は and を",
    language: "Japanese",
    level: "A1",
    topic: "topic particle は (wa) and object particle を (o), simple SOV sentences, food vocabulary",
    studentContext:
      "A1 Japanese learner (native English), reads hiragana. Goal: build simple 'I eat X' sentences. Strengths: knows hiragana, disciplined. Recurring errors: swaps は and を, forgets the verb at the end of the sentence.",
  },
  {
    id: "es-b1-subjunctive",
    title: "Spanish B1: present subjunctive after wishes",
    language: "Spanish",
    level: "B1",
    topic: "present subjunctive triggered by wishes/emotion (espero que, quiero que), travel vocabulary",
    studentContext:
      "B1 Spanish learner (native English). Goal: express wishes and hopes about an upcoming trip. Strengths: fluent in past tenses, big travel vocabulary. Recurring errors: uses indicative after 'espero que', irregular subjunctive stems (tener, hacer).",
  },
  {
    id: "fr-c1-connectors",
    title: "French C1: discourse connectors & argumentation",
    language: "French",
    level: "C1",
    topic: "advanced discourse connectors (néanmoins, en revanche, par conséquent), building a written argument",
    studentContext:
      "C1 French learner (native English). Goal: write a nuanced argumentative paragraph. Strengths: near-native vocabulary, excellent listening. Recurring errors: overuses 'mais', misplaces 'néanmoins', register slips into informal in formal writing.",
  },
  {
    id: "zh-a2-measure-words",
    title: "Mandarin A2: measure words (量词)",
    language: "Mandarin Chinese",
    level: "A2",
    topic: "common measure words (个, 本, 只, 杯), number + measure word + noun, shopping vocabulary",
    studentContext:
      "A2 Mandarin learner (native English), reads pinyin and basic characters. Goal: count and buy items at a market. Strengths: good tones, solid number vocabulary. Recurring errors: defaults every measure word to 个, drops the measure word entirely.",
  },
];

// ---------------------------------------------------------------------------
// Concurrency helper (limit 3).
// ---------------------------------------------------------------------------
const GEN_CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

// ---------------------------------------------------------------------------
// (2) Deterministic structural checks.
// ---------------------------------------------------------------------------
type StructuralResult = {
  pass: boolean;
  checks: { name: string; pass: boolean; detail?: string }[];
};

function structuralChecks(hw: HomeworkContent): StructuralResult {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];

  // >= 4 exercises
  checks.push({
    name: ">=4 exercises",
    pass: hw.exercises.length >= 4,
    detail: `${hw.exercises.length} exercises`,
  });

  // >= 3 distinct types
  const types = new Set(hw.exercises.map((e) => e.type));
  checks.push({
    name: ">=3 distinct types",
    pass: types.size >= 3,
    detail: `${types.size} distinct (${[...types].join(", ")})`,
  });

  // every type is a known exercise type
  const known = new Set<ExerciseType>(EXERCISE_TYPES);
  const unknownType = hw.exercises.find(
    (e) => !known.has(e.type as ExerciseType)
  );
  checks.push({
    name: "all types known",
    pass: !unknownType,
    detail: unknownType ? `unknown: ${unknownType.type}` : undefined,
  });

  // multiple-choice: exactly one correctIndex, in range
  let mcOk = true;
  let mcDetail: string | undefined;
  for (const e of hw.exercises) {
    if (e.type === "multiple-choice" || e.type === "listening") {
      const p = e.payload as { options?: unknown[]; correctIndex?: number };
      const opts = Array.isArray(p.options) ? p.options.length : 0;
      const ci = p.correctIndex;
      if (typeof ci !== "number" || ci < 0 || ci >= opts) {
        mcOk = false;
        mcDetail = `${e.id} correctIndex ${ci} out of range (0..${opts - 1})`;
        break;
      }
    }
  }
  checks.push({
    name: "MC/listening correctIndex in range",
    pass: mcOk,
    detail: mcDetail,
  });

  // image-flashcard: correctIndex in range
  let imgOk = true;
  let imgDetail: string | undefined;
  for (const e of hw.exercises) {
    if (e.type === "image-flashcard") {
      const p = e.payload as { options?: unknown[]; correctIndex?: number };
      const opts = Array.isArray(p.options) ? p.options.length : 0;
      const ci = p.correctIndex;
      if (typeof ci !== "number" || ci < 0 || ci >= opts) {
        imgOk = false;
        imgDetail = `${e.id} correctIndex ${ci} out of range`;
        break;
      }
    }
  }
  checks.push({
    name: "image-flashcard correctIndex in range",
    pass: imgOk,
    detail: imgDetail,
  });

  // fill-blank: nonempty answers
  let fbOk = true;
  let fbDetail: string | undefined;
  for (const e of hw.exercises) {
    if (e.type === "fill-blank") {
      const p = e.payload as { answers?: unknown[] };
      const answers = Array.isArray(p.answers) ? p.answers : [];
      const nonempty =
        answers.length > 0 &&
        answers.every((a) => typeof a === "string" && a.trim().length > 0);
      if (!nonempty) {
        fbOk = false;
        fbDetail = `${e.id} has empty/missing answers`;
        break;
      }
    }
  }
  checks.push({
    name: "fill-blank answers nonempty",
    pass: fbOk,
    detail: fbDetail,
  });

  // listening / image exercises have resolved media URLs (media is NOT skipped
  // in this harness, so any such exercise that survived parseHomework must carry
  // a URL — parseHomework drops media exercises without one).
  let mediaOk = true;
  let mediaDetail: string | undefined;
  for (const e of hw.exercises) {
    if (e.type === "listening") {
      const url = (e.payload as { audioUrl?: unknown }).audioUrl;
      if (typeof url !== "string" || url.length === 0) {
        mediaOk = false;
        mediaDetail = `${e.id} listening missing audioUrl`;
        break;
      }
    } else if (e.type === "image-flashcard") {
      const url = (e.payload as { imageUrl?: unknown }).imageUrl;
      if (typeof url !== "string" || url.length === 0) {
        mediaOk = false;
        mediaDetail = `${e.id} image-flashcard missing imageUrl`;
        break;
      }
    }
  }
  checks.push({
    name: "listening/image media URLs present",
    pass: mediaOk,
    detail: mediaDetail,
  });

  return { pass: checks.every((c) => c.pass), checks };
}

// ---------------------------------------------------------------------------
// (3) LLM-judge — gemini-3.5-flash, strict JSON responseSchema.
// ---------------------------------------------------------------------------
const JUDGE_MODEL = "gemini-3.5-flash";

const JUDGE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    levelAppropriateness: {
      type: "integer",
      description:
        "1-5: how well the exercise difficulty, vocabulary, and grammar match the target CEFR level (per cefrUtility heuristics).",
    },
    levelAppropriatenessReason: { type: "string" },
    topicRelevance: {
      type: "integer",
      description:
        "1-5: how well exercises target the stated topic/grammar focus and the student's recurring errors.",
    },
    topicRelevanceReason: { type: "string" },
    instructionClarity: {
      type: "integer",
      description:
        "1-5: how clear, unambiguous, and self-study-completable the instructions and items are.",
    },
    instructionClarityReason: { type: "string" },
  },
  required: [
    "levelAppropriateness",
    "levelAppropriatenessReason",
    "topicRelevance",
    "topicRelevanceReason",
    "instructionClarity",
    "instructionClarityReason",
  ],
};

type JudgeResult = {
  levelAppropriateness: number;
  topicRelevance: number;
  instructionClarity: number;
  average: number;
  reasons: {
    levelAppropriateness: string;
    topicRelevance: string;
    instructionClarity: string;
  };
};

const RUBRIC_FOR_JUDGE = `PEDAGOGICAL AXES (use to judge level-appropriateness, topic-relevance, clarity)

cefrUtility — an exercise type is only appropriate within the CEFR range where it works:
- A1-A2: image/word matching, picture flashcards, binary-choice gaps, sentence scramble, word sorting
- A2-B1(+B2): fill-gaps (±distractors/audio), word formation, phrase/word matching, image flashcards
- A2-C1: reading passages, find-mistakes, grammar explanations, open questions
- B1-C2: sentence rewrite, word-given rephrase, essay prompts, immersion-style explanations
At A1-A2 prefer recognition/controlled response; reserve guided/freer production for A2+ / B1+.

SEQUENCING & QUALITY
- A set should mix exercise types (avoid the same type twice in a row) and recycle the same
  target vocab/grammar across different formats.
- It must deliberately target the student's stated recurring errors, not just generic practice.
- Self-study only: every item must be completable and checkable alone (deterministic answers).
- Instructions must be concise, unambiguous, and in/about the correct target language.

SCORING (1-5 each):
- levelAppropriateness: difficulty, vocabulary, grammar, and exercise-type choice all sit at the
  target CEFR level (5 = perfectly calibrated; 1 = far too easy/hard or wrong type for the level).
- topicRelevance: items drill the stated topic/grammar focus AND the student's recurring errors
  (5 = laser-focused on the brief; 1 = off-topic / generic).
- instructionClarity: instructions and items are clear, unambiguous, self-study-completable
  (5 = crystal clear; 1 = confusing or under-specified).`;

function judgeContent(hw: HomeworkContent): string {
  // Compact rendering of the homework for the judge — drop media data URLs.
  const exercises = hw.exercises.map((e) => {
    const payload = { ...(e.payload as Record<string, unknown>) };
    delete payload.audioUrl;
    delete payload.imageUrl;
    return {
      id: e.id,
      type: e.type,
      title: e.title,
      instructions: e.instructions,
      payload,
    };
  });
  return JSON.stringify(
    { title: hw.title, lessonSummary: hw.lessonSummary, exercises },
    null,
    2
  );
}

async function judge(
  ai: GoogleGenAI,
  brief: Brief,
  hw: HomeworkContent
): Promise<JudgeResult> {
  const prompt = `You are a strict CEFR-aligned language-pedagogy examiner. Score the homework set below against the rubric. Be critical — reserve 5 for genuinely excellent work.

${RUBRIC_FOR_JUDGE}

TARGET BRIEF
- Language: ${brief.language}
- CEFR level: ${brief.level}
- Topic / grammar focus: ${brief.topic}
- Student context (note the recurring errors this set should target): ${brief.studentContext}

HOMEWORK SET (JSON):
${judgeContent(hw)}

Return strict JSON matching the schema. Each score is an integer 1-5 with a one-sentence reason.`;

  const response = await ai.models.generateContent({
    model: JUDGE_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: JUDGE_RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Judge returned no text");
  }
  const parsed = JSON.parse(text) as {
    levelAppropriateness: number;
    levelAppropriatenessReason: string;
    topicRelevance: number;
    topicRelevanceReason: string;
    instructionClarity: number;
    instructionClarityReason: string;
  };
  const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));
  const la = clamp(parsed.levelAppropriateness);
  const tr = clamp(parsed.topicRelevance);
  const ic = clamp(parsed.instructionClarity);
  return {
    levelAppropriateness: la,
    topicRelevance: tr,
    instructionClarity: ic,
    average: (la + tr + ic) / 3,
    reasons: {
      levelAppropriateness: parsed.levelAppropriatenessReason,
      topicRelevance: parsed.topicRelevanceReason,
      instructionClarity: parsed.instructionClarityReason,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-brief evaluation: REAL generation + 3 scoring stages.
// ---------------------------------------------------------------------------
type BriefEval = {
  brief: Brief;
  latencyMs: number;
  valid: boolean;
  exerciseCount: number;
  exerciseTypes: string[];
  structural?: StructuralResult;
  judge?: JudgeResult;
  error?: string;
};

async function evalBrief(
  brief: Brief,
  session: Session,
  judgeAi: GoogleGenAI
): Promise<BriefEval> {
  const { homeworkDocumentHandler } = await import(
    "@/artifacts/homework/server"
  );

  // Capturing stub stream — keeps the latest full snapshot (same as the
  // homework artifact streaming contract).
  let content = "";
  const dataStream = {
    write: (part: { type: string; data: unknown }) => {
      if (part.type === "data-homeworkDelta") {
        content = part.data as string;
      }
    },
  };

  const start = Date.now();
  try {
    await homeworkDocumentHandler.onCreateDocument({
      id: crypto.randomUUID(),
      title: brief.title,
      // biome-ignore lint: stub stream for offline eval
      dataStream: dataStream as any,
      session,
      modelId: "gemini-3.5-flash",
      studentId: null,
      studentContext: brief.studentContext,
    });
  } catch (err) {
    return {
      brief,
      latencyMs: Date.now() - start,
      valid: false,
      exerciseCount: 0,
      exerciseTypes: [],
      error: `generation threw: ${(err as Error).message}`,
    };
  }
  const latencyMs = Date.now() - start;

  // (1) schema validity.
  const hw = parseHomework(content);
  if (!hw) {
    return {
      brief,
      latencyMs,
      valid: false,
      exerciseCount: 0,
      exerciseTypes: [],
      error: "did not parse with parseHomework",
    };
  }

  // (2) structural checks.
  const structural = structuralChecks(hw);

  // (3) LLM judge.
  let judgeResult: JudgeResult | undefined;
  let judgeError: string | undefined;
  try {
    judgeResult = await judge(judgeAi, brief, hw);
  } catch (err) {
    judgeError = `judge failed: ${(err as Error).message}`;
  }

  return {
    brief,
    latencyMs,
    valid: true,
    exerciseCount: hw.exercises.length,
    exerciseTypes: hw.exercises.map((e) => e.type),
    structural,
    judge: judgeResult,
    error: judgeError,
  };
}

// ---------------------------------------------------------------------------
// Reporting.
// ---------------------------------------------------------------------------
function pct(n: number, d: number): string {
  return d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`;
}

function fmtTable(rows: BriefEval[]): string {
  const header =
    "| Brief | Lang | CEFR | Valid | #Ex | #Types | Struct | LvlApp | Topic | Clarity | Judge avg |";
  const sep =
    "|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map((r) => {
    const structPass = r.structural
      ? `${r.structural.checks.filter((c) => c.pass).length}/${r.structural.checks.length}`
      : "—";
    const j = r.judge;
    return `| ${r.brief.id} | ${r.brief.language} | ${r.brief.level} | ${r.valid ? "✅" : "❌"} | ${r.exerciseCount} | ${new Set(r.exerciseTypes).size} | ${structPass} | ${j ? j.levelAppropriateness : "—"} | ${j ? j.topicRelevance : "—"} | ${j ? j.instructionClarity : "—"} | ${j ? j.average.toFixed(2) : "—"} |`;
  });
  return [header, sep, ...lines].join("\n");
}

type Aggregate = {
  total: number;
  validCount: number;
  validityPct: string;
  meanStructuralPassRate: number; // mean fraction of checks passing per brief
  fullStructuralPassCount: number; // briefs where ALL checks pass
  judgeCount: number;
  meanJudge: number;
  meanLevelApp: number;
  meanTopic: number;
  meanClarity: number;
  meanLatencyMs: number;
};

function aggregate(rows: BriefEval[]): Aggregate {
  const total = rows.length;
  const valid = rows.filter((r) => r.valid);
  const structuralRows = rows.filter((r) => r.structural);
  const meanStructuralPassRate =
    structuralRows.length === 0
      ? 0
      : structuralRows.reduce(
          (acc, r) =>
            acc +
            r.structural!.checks.filter((c) => c.pass).length /
              r.structural!.checks.length,
          0
        ) / structuralRows.length;
  const fullStructuralPassCount = structuralRows.filter(
    (r) => r.structural!.pass
  ).length;
  const judged = rows.filter((r) => r.judge);
  const mean = (sel: (j: JudgeResult) => number) =>
    judged.length === 0
      ? 0
      : judged.reduce((a, r) => a + sel(r.judge!), 0) / judged.length;
  return {
    total,
    validCount: valid.length,
    validityPct: pct(valid.length, total),
    meanStructuralPassRate,
    fullStructuralPassCount,
    judgeCount: judged.length,
    meanJudge: mean((j) => j.average),
    meanLevelApp: mean((j) => j.levelAppropriateness),
    meanTopic: mean((j) => j.topicRelevance),
    meanClarity: mean((j) => j.instructionClarity),
    meanLatencyMs:
      rows.reduce((a, r) => a + r.latencyMs, 0) / Math.max(1, rows.length),
  };
}

// ---------------------------------------------------------------------------
// EVALS.md writer.
// ---------------------------------------------------------------------------
function buildEvalsMd(rows: BriefEval[], agg: Aggregate): string {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const failingChecks: string[] = [];
  for (const r of rows) {
    if (!r.valid) {
      failingChecks.push(`- **${r.brief.id}**: ${r.error ?? "invalid"}`);
      continue;
    }
    if (r.structural && !r.structural.pass) {
      for (const c of r.structural.checks) {
        if (!c.pass) {
          failingChecks.push(
            `- **${r.brief.id}**: structural check "${c.name}" failed${c.detail ? ` (${c.detail})` : ""}`
          );
        }
      }
    }
    if (r.error && r.valid) {
      failingChecks.push(`- **${r.brief.id}**: ${r.error}`);
    }
  }

  return `# Homework Generation — Evaluation

> Auto-generated by \`evals/homework-eval.ts\`. Last real run: **${now}** (model \`gemini-3.5-flash\`).
> Reproduce: \`npx tsx --require ./scripts/_no-server-only.cjs evals/homework-eval.ts\`

## Headline numbers

- **Schema validity:** ${agg.validityPct} (${agg.validCount}/${agg.total} golden briefs parse against \`homeworkSchema\` after \`parseHomework\`).
- **Mean structural pass rate:** ${(agg.meanStructuralPassRate * 100).toFixed(0)}% of deterministic checks pass per brief (${agg.fullStructuralPassCount}/${agg.total} briefs pass **all** structural checks).
- **Mean pedagogy-judge score:** **${agg.meanJudge.toFixed(2)}/5** across ${agg.judgeCount} judged briefs (level-appropriateness ${agg.meanLevelApp.toFixed(2)}, topic-relevance ${agg.meanTopic.toFixed(2)}, instruction-clarity ${agg.meanClarity.toFixed(2)}).
- **Mean end-to-end generation latency:** ${(agg.meanLatencyMs / 1000).toFixed(1)}s per homework set (incl. live TTS + image generation for media exercises).

## Methodology

The harness exercises **the real production generation path** — \`homeworkDocumentHandler.onCreateDocument\`
in \`artifacts/homework/server.ts\` — via an offline shim (fake NextAuth session +
a capturing \`UIMessageStreamWriter\`, same pattern as \`scripts/test-homework-handler.ts\`).
The same system prompt (including the embedded pedagogy block from
\`lib/agent/prompts.ts\`) and the same media-enrichment step (live Gemini TTS for
\`listening\` exercises and image generation for \`image-flashcard\` exercises) run
exactly as in production. Generation concurrency is **3**.

Each generated homework set is scored on three stages:

1. **Schema validity (deterministic).** The streamed JSON must parse against the
   shared \`homeworkSchema\` (\`lib/quiz/homework-schema.ts\`) via \`parseHomework\`,
   which also per-type-validates every exercise payload and drops any invalid /
   media-less exercise.

2. **Structural checks (deterministic).** Per brief:
   - ≥4 exercises;
   - ≥3 distinct exercise types;
   - all exercise types are known catalog types;
   - every multiple-choice / listening exercise has exactly one \`correctIndex\` within \`options\` range;
   - every image-flashcard \`correctIndex\` is within range;
   - every fill-blank has non-empty accepted answers;
   - every \`listening\` / \`image-flashcard\` exercise carries a resolved media URL (\`audioUrl\` / \`imageUrl\`) — media is **not** skipped in this run.

3. **LLM-judge rubric (gemini-3.5-flash, strict JSON responseSchema).** A separate
   judge model scores three dimensions **1–5** against the pedagogy rubric
   (\`docs/harvest/pedagogy-rubric.md\`): **level-appropriateness**,
   **topic-relevance**, and **instruction-clarity**. The judge runs at
   temperature 0 and returns a one-sentence reason per dimension. The brief's
   judge score is the **average of the three dimensions**.

## Rubric (judge prompt, distilled from \`docs/harvest/pedagogy-rubric.md\`)

\`\`\`
${RUBRIC_FOR_JUDGE}
\`\`\`

## Dataset — 10 golden briefs

Spread across **CEFR A1–C1** and **8 languages** (Spanish, French, German,
Italian, English, Brazilian Portuguese, Japanese, Mandarin Chinese), with varied
grammar/vocabulary topics and student-context strings that each carry concrete
strengths + recurring errors the homework should target.

| Brief | Language | CEFR | Topic |
|---|---|---|---|
${BRIEFS.map((b) => `| ${b.id} | ${b.language} | ${b.level} | ${b.topic} |`).join("\n")}

## Results — per brief

${fmtTable(rows)}

_\`Struct\` = deterministic structural checks passing / total. \`LvlApp\` /
\`Topic\` / \`Clarity\` = LLM-judge dimension scores (1–5). \`Judge avg\` = mean of
the three._

## Aggregate

| Metric | Value |
|---|---|
| Schema validity | ${agg.validityPct} (${agg.validCount}/${agg.total}) |
| Mean structural pass rate | ${(agg.meanStructuralPassRate * 100).toFixed(0)}% |
| Briefs passing all structural checks | ${agg.fullStructuralPassCount}/${agg.total} |
| Mean level-appropriateness | ${agg.meanLevelApp.toFixed(2)}/5 |
| Mean topic-relevance | ${agg.meanTopic.toFixed(2)}/5 |
| Mean instruction-clarity | ${agg.meanClarity.toFixed(2)}/5 |
| **Mean pedagogy-judge score** | **${agg.meanJudge.toFixed(2)}/5** |
| Mean generation latency | ${(agg.meanLatencyMs / 1000).toFixed(1)}s |

${
  failingChecks.length === 0
    ? "## Findings\n\nNo systematic failures: every golden brief produced schema-valid homework that passed all deterministic structural checks."
    : `## Findings\n\n${failingChecks.join("\n")}`
}
`;
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main() {
  // Settle the handler<->registry import cycle first (template-native).
  await import("@/lib/artifacts/server");

  // Real guest user id for the fake session.
  const client = postgres(process.env.POSTGRES_URL ?? "");
  const db = drizzle(client);
  const email = `eval-${Date.now()}@preproom.local`;
  const [guest] = await db
    .insert(user)
    .values({ email, isAnonymous: true })
    .returning();
  const session = {
    user: { id: guest.id, email: guest.email, type: "guest" },
    expires: new Date(Date.now() + 600_000).toISOString(),
  } as unknown as Session;

  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const judgeAi = new GoogleGenAI({ apiKey });

  // biome-ignore lint: eval harness output
  console.log(
    `Running homework eval: ${BRIEFS.length} golden briefs, concurrency ${GEN_CONCURRENCY}…`
  );

  const rows = await mapWithConcurrency(BRIEFS, GEN_CONCURRENCY, async (b) => {
    const r = await evalBrief(b, session, judgeAi);
    // biome-ignore lint: eval harness progress
    console.log(
      `  • ${b.id}: ${r.valid ? "valid" : "INVALID"}${r.error ? ` (${r.error})` : ""}${r.judge ? ` judge ${r.judge.average.toFixed(2)}` : ""} [${(r.latencyMs / 1000).toFixed(1)}s]`
    );
    return r;
  });

  await client.end();

  const agg = aggregate(rows);

  // biome-ignore lint: eval harness output
  console.log(`\n${fmtTable(rows)}\n`);
  // biome-ignore lint: eval harness output
  console.log("Aggregate:");
  // biome-ignore lint: eval harness output
  console.log(`  schema validity:        ${agg.validityPct} (${agg.validCount}/${agg.total})`);
  // biome-ignore lint: eval harness output
  console.log(`  mean structural pass:   ${(agg.meanStructuralPassRate * 100).toFixed(0)}%  (${agg.fullStructuralPassCount}/${agg.total} briefs fully pass)`);
  // biome-ignore lint: eval harness output
  console.log(`  mean judge score:       ${agg.meanJudge.toFixed(2)}/5  (lvl ${agg.meanLevelApp.toFixed(2)}, topic ${agg.meanTopic.toFixed(2)}, clarity ${agg.meanClarity.toFixed(2)})`);
  // biome-ignore lint: eval harness output
  console.log(`  mean latency:           ${(agg.meanLatencyMs / 1000).toFixed(1)}s`);

  const md = buildEvalsMd(rows, agg);
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const outPath = path.join(process.cwd(), "docs", "EVALS.md");
  await fs.writeFile(outPath, md, "utf8");
  // biome-ignore lint: eval harness output
  console.log(`\nWrote ${outPath}`);

  process.exit(0);
}

main().catch((err) => {
  // biome-ignore lint: eval harness output
  console.error(err);
  process.exit(1);
});
