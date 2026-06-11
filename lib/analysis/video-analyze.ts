import "server-only";

import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type File as GenAIFile,
  FileState,
  GoogleGenAI,
} from "@google/genai";

import {
  getStudentById,
  getVideoById,
  saveStudentDocument,
  saveStudentFact,
  updateVideo,
} from "@/lib/db/queries-studio";
import { isGcsMode, localPathFor, readFile } from "@/lib/gcs";
import { generateUUID } from "@/lib/utils";

const MODEL = "gemini-3.5-flash";

type AnalysisResult = {
  summary: string;
  topicsCovered: string[];
  studentStrengths: string[];
  studentStruggles: string[];
  vocabularyIntroduced: string[];
  suggestedNextFocus: string;
};

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-4 sentence overview of the lesson and how it went.",
    },
    topicsCovered: {
      type: "array",
      items: { type: "string" },
      description: "Grammar / topics / skills covered in the lesson.",
    },
    studentStrengths: {
      type: "array",
      items: { type: "string" },
      description: "Concrete things the student did well.",
    },
    studentStruggles: {
      type: "array",
      items: { type: "string" },
      description: "Concrete mistakes or areas the student struggled with.",
    },
    vocabularyIntroduced: {
      type: "array",
      items: { type: "string" },
      description: "New vocabulary or phrases introduced during the lesson.",
    },
    suggestedNextFocus: {
      type: "string",
      description: "What the teacher should focus on in the next lesson.",
    },
  },
  required: [
    "summary",
    "topicsCovered",
    "studentStrengths",
    "studentStruggles",
    "vocabularyIntroduced",
    "suggestedNextFocus",
  ],
};

function buildPrompt(opts: {
  studentName: string;
  level?: string | null;
  nativeLanguage?: string | null;
  targetLanguage?: string | null;
  goals?: string | null;
}): string {
  return [
    "You are an expert language-lesson observer evaluating a recorded lesson video.",
    "Watch and listen carefully to the whole clip and analyze it as a teaching observer would.",
    "",
    "Student profile:",
    `- Name: ${opts.studentName}`,
    opts.level ? `- Level: ${opts.level}` : null,
    opts.targetLanguage ? `- Target language: ${opts.targetLanguage}` : null,
    opts.nativeLanguage ? `- Native language: ${opts.nativeLanguage}` : null,
    opts.goals ? `- Goals: ${opts.goals}` : null,
    "",
    "Rubric — assess:",
    "1. Topics / grammar / skills covered.",
    "2. The student's strengths (what they did well, with specifics).",
    "3. The student's struggles (mistakes, hesitations, gaps — be specific).",
    "4. New vocabulary or phrases introduced.",
    "5. A suggested focus for the next lesson.",
    "",
    "Return ONLY the structured JSON described by the schema. Be concrete and",
    "actionable; quote what the student actually said where useful.",
  ]
    .filter(Boolean)
    .join("\n");
}

function markdownReport(video: { title: string }, r: AnalysisResult): string {
  const list = (items: string[]) =>
    items.length ? items.map((i) => `- ${i}`).join("\n") : "_None noted._";

  return [
    `# Lesson analysis — ${video.title}`,
    "",
    "## Summary",
    r.summary,
    "",
    "## Topics covered",
    list(r.topicsCovered),
    "",
    "## Strengths",
    list(r.studentStrengths),
    "",
    "## Struggles",
    list(r.studentStruggles),
    "",
    "## Vocabulary introduced",
    list(r.vocabularyIntroduced),
    "",
    "## Suggested next focus",
    r.suggestedNextFocus,
    "",
  ].join("\n");
}

async function waitUntilActive(
  ai: GoogleGenAI,
  file: GenAIFile,
  timeoutMs = 120_000
): Promise<GenAIFile> {
  const start = Date.now();
  let current = file;
  while (current.state === FileState.PROCESSING) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for video file to become ACTIVE");
    }
    await new Promise((r) => setTimeout(r, 2000));
    if (!current.name) {
      throw new Error("Uploaded file has no name");
    }
    current = await ai.files.get({ name: current.name });
  }
  if (current.state !== FileState.ACTIVE) {
    throw new Error(`Video file processing failed: state=${current.state}`);
  }
  return current;
}

/**
 * Analyze a lesson video with Gemini and persist the results:
 *  - a readable markdown Document (kind 'text')
 *  - StudentFact rows for each strength/struggle
 *  - the Video row updated to status 'ready' with a summary.
 */
export async function analyzeVideo(videoId: string): Promise<void> {
  const video = await getVideoById({ id: videoId });
  if (!video) {
    console.error(`[analyzeVideo] video ${videoId} not found`);
    return;
  }

  let tempPath: string | null = null;
  try {
    const student = await getStudentById({ id: video.studentId });
    if (!student) {
      throw new Error(`student ${video.studentId} not found`);
    }
    if (!video.gcsUri) {
      throw new Error("video has no gcsUri (upload not completed)");
    }

    const apiKey =
      process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY not set");
    }
    const ai = new GoogleGenAI({ apiKey });

    // Resolve a local file path to feed the Files API.
    let uploadPath: string;
    if (isGcsMode()) {
      // Download bytes from GCS to a temp file (videos are short demos).
      const bytes = await readFile(video.gcsUri);
      tempPath = join(tmpdir(), `teachflow-${videoId}`);
      await writeFile(tempPath, bytes);
      uploadPath = tempPath;
    } else {
      uploadPath = localPathFor(video.gcsUri);
    }

    const uploaded = await ai.files.upload({
      file: uploadPath,
      config: { mimeType: video.mimeType ?? "video/mp4" },
    });
    const active = await waitUntilActive(ai, uploaded);

    const prompt = buildPrompt({
      studentName: student.name,
      level: student.level,
      nativeLanguage: student.nativeLanguage,
      targetLanguage: student.targetLanguage,
      goals: student.goals,
    });

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              fileData: {
                fileUri: active.uri,
                mimeType: active.mimeType ?? video.mimeType ?? "video/mp4",
              },
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Gemini returned no text");
    }
    const result = JSON.parse(text) as AnalysisResult;

    // (a) Markdown report document.
    const documentId = generateUUID();
    await saveStudentDocument({
      id: documentId,
      title: `Lesson analysis — ${video.title}`,
      kind: "text",
      content: markdownReport(video, result),
      userId: student.userId,
      studentId: student.id,
    });

    // (b) Facts for each strength / struggle.
    for (const strength of result.studentStrengths) {
      await saveStudentFact({
        studentId: student.id,
        category: "strength",
        fact: strength,
        source: "video_analysis",
        sourceRef: videoId,
      });
    }
    for (const struggle of result.studentStruggles) {
      await saveStudentFact({
        studentId: student.id,
        category: "error",
        fact: struggle,
        source: "video_analysis",
        sourceRef: videoId,
      });
    }

    // (c) Mark the video ready.
    await updateVideo({
      id: videoId,
      status: "ready",
      summary: result.summary,
      analysisDocumentId: documentId,
    });
  } catch (error) {
    console.error(`[analyzeVideo] failed for ${videoId}:`, error);
    await updateVideo({ id: videoId, status: "failed" }).catch((e) =>
      console.error(`[analyzeVideo] could not mark failed:`, e)
    );
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {
        // best effort cleanup
      });
    }
  }
}
