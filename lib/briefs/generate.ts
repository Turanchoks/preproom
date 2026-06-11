import "server-only";

import { GoogleGenAI } from "@google/genai";
import { format } from "date-fns";
import {
  getFactsByStudentId,
  getStudentById,
  getVideosByStudentId,
  getDocumentsByStudentId,
  saveStudentDocument,
} from "@/lib/db/queries-studio";
import { generateUUID } from "@/lib/utils";

const MODEL = "gemini-3.5-flash";

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey:
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        process.env.GOOGLE_API_KEY,
    });
  }
  return _ai;
}

const SYSTEM_PROMPT = `You are a professional language tutor writing a concise, warm, evidence-based Progress Brief for a student's parent or school administrator. Use first-person plural ("we") to convey a collaborative relationship between tutor and student. Tone: professional but approachable. Length: 350–500 words. Format: Markdown with these exact sections:

## Summary
A 2–3 sentence high-level picture of where the student is and the overall trajectory.

## Strengths
Bullet list. Each bullet cites the concrete evidence from the student's learning record (e.g., "(observed in lesson video, Jun 9)", "(from tutor memory, Jun 10)", "(homework score: 92%)"). At least 2 bullets required; if no evidence is available say so honestly.

## Working On
Bullet list of areas needing improvement, each with: (a) the specific error or gap, (b) the evidence it was observed, (c) what we are doing to address it. Example: "- Verb conjugation accuracy: student confused *ser* vs *estar* (noted in chat, Jun 8). We are drilling distinction exercises."

## Recent Progress
Reference specific scores, quiz results, or measurable outcomes. If no quiz data exists, note what recent activity was observed. Cite dates.

## Recommended Focus Next
1–3 concrete, actionable recommendations for the next 2–4 weeks.

IMPORTANT: Cite evidence inline for every claim. Use the dates and source types provided. If a data category is missing, omit that bullet rather than fabricating.`;

export interface GenerateBriefResult {
  documentId: string;
  title: string;
}

export async function generateProgressBrief(
  studentId: string,
  userId: string
): Promise<GenerateBriefResult> {
  // ── 1. Gather evidence ─────────────────────────────────────────────
  const student = await getStudentById({ id: studentId });
  if (!student) {
    throw new Error(`Student ${studentId} not found`);
  }

  const [facts, videos, documents] = await Promise.all([
    getFactsByStudentId({ studentId, limit: 100 }),
    getVideosByStudentId({ studentId }),
    getDocumentsByStudentId({ studentId }),
  ]);

  // Group facts by category
  const factsByCategory: Record<string, typeof facts> = {};
  for (const f of facts) {
    (factsByCategory[f.category] ??= []).push(f);
  }

  const fmt = (d: Date | string) => format(new Date(d), "MMM d, yyyy");

  // Build structured context string
  const lines: string[] = [];

  lines.push(`# Student: ${student.name}`);
  lines.push(`- Level: ${student.level ?? "not set"}`);
  lines.push(`- Native language: ${student.nativeLanguage ?? "not set"}`);
  lines.push(`- Target language: ${student.targetLanguage ?? "not set"}`);
  if (student.goals) {
    lines.push(`- Learning goals: ${student.goals}`);
  }
  lines.push("");

  for (const [category, categoryFacts] of Object.entries(factsByCategory)) {
    lines.push(`## Facts — ${category}`);
    for (const f of categoryFacts) {
      const sourceLabel =
        f.source === "video_analysis"
          ? "lesson video"
          : f.source === "chat"
            ? "tutor session"
            : "teacher note";
      const dateLabel = fmt(f.createdAt);
      const ref = f.sourceRef ? ` [${f.sourceRef}]` : "";
      lines.push(`- ${f.fact} (${sourceLabel}, ${dateLabel}${ref})`);
    }
    lines.push("");
  }

  if (videos.length > 0) {
    lines.push("## Lesson Videos");
    for (const v of videos) {
      const dateLabel = fmt(v.createdAt);
      const summaryText = v.summary
        ? ` — ${v.summary.slice(0, 200)}${v.summary.length > 200 ? "…" : ""}`
        : " (analysis pending)";
      lines.push(`- "${v.title}" (${dateLabel})${summaryText}`);
    }
    lines.push("");
  }

  if (documents.length > 0) {
    lines.push("## Artifacts Created");
    for (const doc of documents) {
      const dateLabel = fmt(doc.createdAt);
      lines.push(`- [${doc.kind}] "${doc.title}" (${dateLabel})`);
    }
    lines.push("");
  }

  const evidenceContext = lines.join("\n");

  // ── 2. Call Gemini ─────────────────────────────────────────────────
  const userPrompt = `Please write a Progress Brief for ${student.name} using the following learning record:\n\n${evidenceContext}\n\nToday's date: ${fmt(new Date())}.`;

  const response = await getAi().models.generateContent({
    model: MODEL,
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
  });

  const briefContent =
    response.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";

  if (!briefContent.trim()) {
    throw new Error("Gemini returned an empty brief");
  }

  // ── 3. Save document ───────────────────────────────────────────────
  const dateStr = format(new Date(), "MMM d, yyyy");
  const title = `Progress Brief — ${student.name} — ${dateStr}`;
  const documentId = generateUUID();

  await saveStudentDocument({
    id: documentId,
    title,
    kind: "text",
    content: briefContent,
    userId,
    studentId,
  });

  return { documentId, title };
}
