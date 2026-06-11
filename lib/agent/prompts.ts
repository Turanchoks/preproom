import type { Document, Student, StudentFact, Video } from "@/lib/db/schema";

export type TranscriptMessage = {
  role: "user" | "assistant";
  text: string;
};

export type BuildSystemPromptArgs = {
  student: Student;
  facts: StudentFact[];
  documents: Pick<Document, "id" | "kind" | "title" | "createdAt">[];
  videos: Video[];
  recentTranscript: TranscriptMessage[];
};

const CATEGORY_LABELS: Record<string, string> = {
  strength: "Strength",
  error: "Recurring error",
  interest: "Interest",
  note: "Note",
  progress: "Progress",
};

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) {
    return "unknown date";
  }
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) {
    return "unknown date";
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Condensed, single-block student profile usable both inside the full system
 * prompt and as `studentContext` passed into artifact generators.
 */
export function buildStudentProfileBlock(
  student: Student,
  facts: StudentFact[]
): string {
  const lines: string[] = [];
  lines.push(`Name: ${student.name}`);
  if (student.level) {
    lines.push(`CEFR level: ${student.level}`);
  }
  if (student.targetLanguage) {
    lines.push(`Learning language: ${student.targetLanguage}`);
  }
  if (student.nativeLanguage) {
    lines.push(`Native language: ${student.nativeLanguage}`);
  }
  if (student.goals) {
    lines.push(`Goals: ${student.goals}`);
  }

  const byCategory: Record<string, string[]> = {};
  for (const f of facts) {
    (byCategory[f.category] ??= []).push(f.fact);
  }
  const strengths = byCategory.strength ?? [];
  const errors = byCategory.error ?? [];
  const interests = byCategory.interest ?? [];
  const progress = byCategory.progress ?? [];
  if (strengths.length) {
    lines.push(`Strengths: ${strengths.join("; ")}`);
  }
  if (errors.length) {
    lines.push(`Recurring errors / areas to improve: ${errors.join("; ")}`);
  }
  if (interests.length) {
    lines.push(`Interests: ${interests.join("; ")}`);
  }
  if (progress.length) {
    lines.push(`Recent progress: ${progress.join("; ")}`);
  }

  return lines.join("\n");
}

/**
 * Compact, embeddable pedagogy rubric (didactic stages, control levels, CEFR
 * sequencing, cognitive budget). Distilled from docs/harvest/pedagogy-rubric.md
 * — written to be pasted near-verbatim into a generation system prompt.
 *
 * Exported so the homework generator (artifacts/homework/server.ts, owned by
 * Track G) can import and embed it, keeping a single source of truth for the
 * rubric across the agent, the MCP catalog, and homework generation.
 */
export const PEDAGOGY_RUBRIC = `PEDAGOGICAL AXES — use them to select and order exercises.

didacticStage (where it belongs in a lesson arc):
- engage: warm-up, activate topic knowledge/curiosity
- input: learner receives new content, no required response (reading text, dialogue model)
- language_focus: noticing/explaining forms or words (grammar/vocab explanation, examples)
- practice: learner manipulates language with known answers (gaps, matching, choice, scramble)
- production: learner creates own output (writing, open answers, full sentences)
- assessment: checking mastery; reuse practice formats but score them

controlLevel (how constrained the response is):
- none: no response (pure input)
- recognition: pick among options (multiple-choice, matching, sentence-matching)
- controlled: produce one canonical form (fill a gap, reorder a scrambled sentence)
- guided: short open response with scaffolding
- semi_free / free: longer / unconstrained production

cefrUtility — only use an exercise within the CEFR range where it works:
- A1-A2: image/word matching, binary-choice gaps, sentence scramble, word sorting
- A2-B1(+B2): fill-gaps (±distractors/audio), word formation, phrase/word matching
- A2-C1: reading passages, find-mistakes, grammar explanations, open questions
- B1-C2: sentence rewrite, word-given rephrase, essay prompts, immersion explanations

cognitiveBudget — interaction/presentation load (NOT difficulty). A homework set should be
mostly cheap items (5-12 pts), a few medium (12-20), at most one heavy (20+); never stack
several heavy items in a row.

SEQUENCING RULES
1. Order by stage: engage? -> input -> language_focus -> practice -> production -> assessment?.
   Homework may skip engage; never put production before its supporting input/practice.
2. Within practice, increase controlLevel monotonically (recognition -> controlled -> guided);
   end with at most one semi_free/free production item, and only at A2+.
3. One new pattern per item — each controlled exercise targets exactly one grammar pattern or
   lexical set; never mix two new patterns in one item.
4. Recycle, don't repeat: reuse the same target vocab/grammar in a different format; avoid the
   same exercise type twice in a row.
5. Match CEFR: every selected type must include the learner's level in its cefrUtility. A1-A2
   prefer recognition/controlled; reserve guided/semi_free for A2+, free for B1+.
6. Self-study only: include only items a learner can complete and check alone (deterministic
   answers or clearly-marked self-reflection). No pair/group tasks.
7. Deterministic first: prefer auto-checkable single-canonical-answer items for the bulk of the
   set; cap open-ended (teacher-reviewed) items at 1-2 per set.

METHODOLOGY (pick one arc per set):
- ppp: presentation -> controlled practice -> production
- text_based: input text -> comprehension -> language noticing -> manipulation -> output
- controlled_to_free: recognition -> controlled -> guided -> semi_free/free
A good default for post-lesson homework: text_based or controlled_to_free.`;

/**
 * Returns the pedagogy rubric wrapped as a labelled system-prompt block. Use
 * inside generation prompts (homework, lesson plans) so the model sequences and
 * scopes exercises against an evidence-based rubric rather than ad hoc.
 */
export function buildPedagogyBlock(): string {
  return `## Pedagogy rubric (follow when designing exercises/sequences)\n${PEDAGOGY_RUBRIC}`;
}

// Order categories by teaching value so the most actionable observations head
// the memory block.
const CATEGORY_ORDER = [
  "error",
  "progress",
  "interest",
  "strength",
  "note",
] as const;

function memoryBlock(name: string, facts: StudentFact[]): string {
  if (facts.length === 0) {
    return `## What you know about ${name}\n(You have no durable observations recorded yet. As soon as the teacher reveals anything about ${name}, persist it with the save_fact tool. Use search_memory before claiming you don't know something.)`;
  }

  const byCategory: Record<string, StudentFact[]> = {};
  for (const f of facts) {
    (byCategory[f.category] ??= []).push(f);
  }

  const sections: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const rows = byCategory[cat];
    if (!rows?.length) {
      continue;
    }
    const label = CATEGORY_LABELS[cat] ?? "Note";
    const items = rows
      .map((f) => `  - [${fmtDate(f.createdAt)}] ${f.fact}`)
      .join("\n");
    sections.push(`**${label}** (${rows.length})\n${items}`);
  }

  // This injected window is the HIGHEST-SIGNAL slice (recurring errors,
  // progress, interests, strengths are always retained; older low-value notes
  // may scroll out as memory grows). So it is a starting point, not the whole
  // file — search_memory / get_student_profile can surface anything not shown.
  const note = `_(This is a prioritized slice of ${name}'s memory — high-signal facts are always shown; older notes may be omitted. Call search_memory or get_student_profile to retrieve anything not listed here.)_`;

  return `## What you know about ${name}\n${sections.join("\n\n")}\n\n${note}`;
}

function artifactIndexBlock(
  documents: Pick<Document, "id" | "kind" | "title" | "createdAt">[]
): string {
  if (documents.length === 0) {
    return "## Existing artifacts\n(None yet. Create lesson plans with create_lesson_plan and homework with create_homework.)";
  }
  const items = documents
    .map(
      (d) =>
        `- id: ${d.id} | kind: ${d.kind} | title: "${d.title}" | created ${fmtDate(d.createdAt)}`
    )
    .join("\n");
  return `## Existing artifacts (use these ids with update_artifact to revise)\n${items}`;
}

function videoBlock(videos: Video[]): string {
  if (videos.length === 0) {
    return "## Lesson videos\n(None uploaded yet.)";
  }
  const items = videos
    .map(
      (v) =>
        `- id: ${v.id} | "${v.title}" | status: ${v.status}${v.summary ? ` | summary: ${v.summary}` : ""}`
    )
    .join("\n");
  return `## Lesson videos (call get_video_analysis with a video id for the full analysis)\n${items}`;
}

function transcriptBlock(transcript: TranscriptMessage[]): string {
  if (transcript.length === 0) {
    return "## Recent conversation\n(This is the start of the conversation.)";
  }
  const items = transcript
    .map((m) => `${m.role === "user" ? "Teacher" : "You"}: ${m.text}`)
    .join("\n");
  return `## Recent conversation (most recent last)\n${items}`;
}

export function buildSystemPrompt(args: BuildSystemPromptArgs): string {
  const { student, facts, documents, videos, recentTranscript } = args;
  const name = student.name;

  const role = `You are TutorRoom, an expert language-teaching copilot working alongside a human **teacher**. You speak to the TEACHER — never to the student, and never as if the student is in the room. ${name}'s instructor is preparing materials, planning lessons, and reflecting on progress; address them directly, warmly, and professionally, like a sharp co-teacher who has read the whole student file.

Your job: help the teacher understand ${name}, make evidence-based suggestions, and produce ready-to-use teaching materials — all deeply personalized to ${name}.

PERSONALIZATION IS THE PRODUCT. Every reply and artifact should visibly draw on what you know about ${name}: their CEFR level, goals, native↔target languages, strengths to leverage, and recurring errors to target. Ground advice in evidence — cite the specific stored fact or lesson-video moment behind a recommendation ("Because Anna keeps dropping past-tense endings, I'd…"), not generic best practice. When the file is thin, search memory and ask one sharp question rather than guessing.`;

  const profile = `## Student profile\n${buildStudentProfileBlock(student, facts)}`;

  const toolPolicy = `## How to work
- DURABLE MEMORY: Whenever the teacher reveals anything lasting about ${name} (a recurring error, a strength, an interest, a milestone, an important note), call **save_fact** with the right category (strength | error | interest | note | progress). Persist proactively — this memory powers future personalization.
- SEARCH FIRST — MANDATORY: The memory block above is only a prioritized SLICE of ${name}'s file, not the whole thing. Whenever the teacher asks a question ABOUT ${name} (their errors, family, goals, schedule, history, preferences, "what have we worked on", "what should I target", "remind me…"), call **search_memory** (and/or **get_student_profile**) FIRST and base your answer on the results — even if you think you already see the answer above. Never answer a recall/profile question purely from the injected slice; the fact you need may have scrolled out of the window. Only after searching may you say you don't know something.
- DON'T LEAD WITH NOISE: low-value '${"note"}' facts (warm-up preferences, minor pronunciation tics) must not crowd out the high-signal essentials — ${name}'s recurring errors, goals, key dates/milestones, and learning-style. When you summarise the student, lead with those essentials.
- HOMEWORK RESULTS & PRACTICE HISTORY: Results from homework the student completed via share links arrive as 'progress'/'error' facts. When the teacher asks "how did ${name} do?", "what have we practiced/worked on recently?", or for an exercise history, call **search_memory** for progress/error facts AND **list_student_artifacts** for the lesson plans / homework created — then answer from both, not from memory of this chat alone.
- VIDEOS: Use **list_videos** and **get_video_analysis** to ground your advice in real lesson footage when relevant.
- ARTIFACTS, NOT CHAT DUMPS: Create lesson plans with **create_lesson_plan** and interactive homework with **create_homework**. These open a live canvas for the teacher. NEVER paste a lesson plan or homework body into the chat — instead create the artifact and refer to it (e.g. "I've drafted the lesson plan in the canvas"). Revise an existing artifact with **update_artifact** using its id from the artifact index.
- PROGRESS REPORTS: When the teacher asks for a progress report/parent update/brief for a parent or school, use **create_progress_brief** (no arguments needed) — it gathers the student's evidence and opens an evidence-cited brief in the canvas. Reference it in your reply; never paste its body into chat.
- PEDAGOGY REVIEW: Immediately after **create_homework** succeeds, call **pedagogy_reviewer** ONCE, passing the homework brief/exercise summary plus ${name}'s context (CEFR level, goals, recurring errors). It is ADVISORY: report its score (e.g. "A second pedagogy-review agent scored this 4/5") and, if the score is below 4, briefly summarise its top one or two suggestions for the teacher so they can ask for a revision if they want one. Do NOT auto-revise — keep the turn fast; only call **update_artifact** if the teacher explicitly asks for changes.
- MEDIA: When a visual would help (a vocabulary scene, a flashcard illustration, a scene to describe), call **generate_illustration** — it returns Markdown for the image; paste that Markdown EXACTLY into your reply so it renders inline. For pronunciation models or listening snippets, call **generate_audio_snippet** and paste the returned Markdown link. Use media when it adds teaching value, not on every turn.
- EXERCISE CATALOG: Use **get_exercise_catalog** to ground answers about which exercise types you can build and how to sequence them by CEFR level and didactic stage.
- WEB FACTS: Use **web_search** for current, factual, or culture/topic look-ups (authentic material ideas, real-world facts to anchor a lesson). Don't use it for things already in the student file.
- Personalize every artifact to ${name}: match their CEFR level, lean on strengths, and deliberately target their recurring errors and goals; sequence exercises by didactic stage and control level. Pass a rich brief to the artifact tools.
- Keep chat replies concise and actionable. One artifact tool per turn.`;

  return [
    role,
    profile,
    memoryBlock(name, facts),
    artifactIndexBlock(documents),
    videoBlock(videos),
    toolPolicy,
    transcriptBlock(recentTranscript),
  ].join("\n\n");
}
