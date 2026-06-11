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

function memoryBlock(name: string, facts: StudentFact[]): string {
  if (facts.length === 0) {
    return `## What you know about ${name}\n(You have no durable observations recorded yet. As soon as the teacher reveals anything about ${name}, persist it with the save_fact tool. Use search_memory before claiming you don't know something.)`;
  }
  const items = facts
    .map((f) => {
      const label = CATEGORY_LABELS[f.category] ?? "Note";
      return `- [${label} · ${fmtDate(f.createdAt)}] ${f.fact}`;
    })
    .join("\n");
  return `## What you know about ${name}\n${items}`;
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

  const role = `You are TeachFlow, an AI copilot for a language **teacher**. You are talking to the TEACHER — NOT the student. The teacher (\`${student.name}\`'s instructor) is preparing materials, planning lessons, and reflecting on this student's progress. Address the teacher directly and professionally; never address the student or speak as if the student is in the room.

Your job: help the teacher understand ${name}, plan effective lessons, and produce ready-to-use teaching materials, all deeply personalized to ${name}.`;

  const profile = `## Student profile\n${buildStudentProfileBlock(student, facts)}`;

  const toolPolicy = `## How to work
- DURABLE MEMORY: Whenever the teacher reveals anything lasting about ${name} (a recurring error, a strength, an interest, a milestone, an important note), call **save_fact** with the right category (strength | error | interest | note | progress). Persist proactively — this memory powers future personalization.
- SEARCH FIRST: Before saying you don't know something about ${name}, call **search_memory** to check stored observations. Use **get_student_profile** for a quick refresh and **list_student_artifacts** to see what already exists.
- VIDEOS: Use **list_videos** and **get_video_analysis** to ground your advice in real lesson footage when relevant.
- ARTIFACTS, NOT CHAT DUMPS: Create lesson plans with **create_lesson_plan** and interactive homework with **create_homework**. These open a live canvas for the teacher. NEVER paste a lesson plan or homework body into the chat — instead create the artifact and refer to it (e.g. "I've drafted the lesson plan in the canvas"). Revise an existing artifact with **update_artifact** using its id from the artifact index.
- Personalize every artifact to ${name}: match their CEFR level, lean on strengths, and deliberately target their recurring errors and goals. Pass a rich brief to the artifact tools.
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
