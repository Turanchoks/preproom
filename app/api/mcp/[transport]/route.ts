import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  getDocumentsByStudentId,
  getFactsByStudentId,
  getLatestDocumentById,
  getStudentById,
  getStudentsByUserId,
  saveStudentFact,
} from "@/lib/db/queries-studio";
import { generateProgressBrief } from "@/lib/briefs/generate";
import { type McpAuth, resolveMcpAuth } from "@/lib/mcp-public/auth";
import {
  ensureShareUrl,
  generateStudentArtifact,
} from "@/lib/mcp-public/generation";

// Homework / lesson-plan / brief generation calls Gemini and can take a while.
export const maxDuration = 120;

const SERVER_INSTRUCTIONS = `TeachFlow is a language teacher's AI studio. Each teacher owns a roster of students; every student has a profile (CEFR level, native/target language, goals) and a durable memory of facts (strengths, recurring errors, interests, progress notes) built up from chats, lesson-video analysis, and teacher observations.

Use these tools to inspect a student, record what you observe, and GENERATE teaching materials:
- list_students / get_student to orient yourself, then save_observation to persist anything lasting you notice.
- create_lesson_plan drafts the next lesson; create_homework builds an interactive exercise set (multiple-choice, fill-blank, matching, etc.).
- create_homework ALSO returns a public, student-shareable URL (https://.../s/<slug>): the homework is immediately playable by the student in a browser, no login required. Hand that link to the learner.
- get_teaching_pack / list_teaching_packs read back the artifacts you (or the teacher) have created.
- get_progress_brief writes a parent/admin-ready progress report citing the student's learning record.

Every tool is scoped to the authenticated teacher's OWN students; you cannot see or touch another teacher's roster. Lesson-plan and homework generation calls a model and may take 20-60 seconds.`;

/** Tag a tool result as an MCP error payload. */
function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function jsonResult(value: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
    ],
  };
}

const handler = createMcpHandler(
  (server) => {
    // Each tool resolves auth fresh per call from the request headers in
    // `extra.requestInfo` (via requireAuth) and enforces per-student ownership
    // via ownedStudent — mcp-handler runs in stateless mode with no shared
    // per-connection identity.

    // ── list_students ────────────────────────────────────────────────
    server.registerTool(
      "list_students",
      {
        title: "List students",
        description:
          "List all students on the authenticated teacher's roster (id, name, level, languages, goals).",
        inputSchema: {},
      },
      async (_args, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const students = await getStudentsByUserId({ userId: auth.userId });
        return jsonResult(
          students.map((s) => ({
            id: s.id,
            name: s.name,
            level: s.level,
            nativeLanguage: s.nativeLanguage,
            targetLanguage: s.targetLanguage,
            goals: s.goals,
          }))
        );
      }
    );

    // ── get_student ──────────────────────────────────────────────────
    server.registerTool(
      "get_student",
      {
        title: "Get student",
        description:
          "Get a student's full profile plus their memory facts (category, fact, source, createdAt).",
        inputSchema: {
          studentId: z.string().describe("The student's id"),
        },
      },
      async ({ studentId }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const student = await ownedStudent(studentId, auth.userId);
        if (!student) {
          return notOwned(studentId);
        }
        const facts = await getFactsByStudentId({ studentId, limit: 100 });
        return jsonResult({
          id: student.id,
          name: student.name,
          level: student.level,
          nativeLanguage: student.nativeLanguage,
          targetLanguage: student.targetLanguage,
          goals: student.goals,
          facts: facts.map((f) => ({
            category: f.category,
            fact: f.fact,
            source: f.source,
            createdAt: f.createdAt,
          })),
        });
      }
    );

    // ── save_observation ─────────────────────────────────────────────
    server.registerTool(
      "save_observation",
      {
        title: "Save observation",
        description:
          "Record a durable observation about a student in their memory. Persisted with source 'teacher'.",
        inputSchema: {
          studentId: z.string().describe("The student's id"),
          category: z
            .enum(["strength", "error", "interest", "note", "progress"])
            .describe("The kind of fact being recorded"),
          fact: z
            .string()
            .describe("The observation, as a concise standalone statement"),
        },
      },
      async ({ studentId, category, fact }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const student = await ownedStudent(studentId, auth.userId);
        if (!student) {
          return notOwned(studentId);
        }
        const row = await saveStudentFact({
          studentId,
          category,
          fact,
          source: "teacher",
          sourceRef: null,
        });
        return jsonResult({
          id: row.id,
          category: row.category,
          fact: row.fact,
          source: row.source,
          createdAt: row.createdAt,
        });
      }
    );

    // ── list_teaching_packs ──────────────────────────────────────────
    server.registerTool(
      "list_teaching_packs",
      {
        title: "List teaching packs",
        description:
          "List the artifacts (lesson plans, homework, briefs) created for a student (id, kind, title, createdAt).",
        inputSchema: {
          studentId: z.string().describe("The student's id"),
        },
      },
      async ({ studentId }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const student = await ownedStudent(studentId, auth.userId);
        if (!student) {
          return notOwned(studentId);
        }
        const docs = await getDocumentsByStudentId({ studentId });
        return jsonResult(
          docs.map((d) => ({
            id: d.id,
            kind: d.kind,
            title: d.title,
            createdAt: d.createdAt,
          }))
        );
      }
    );

    // ── get_teaching_pack ────────────────────────────────────────────
    server.registerTool(
      "get_teaching_pack",
      {
        title: "Get teaching pack",
        description:
          "Get the latest content of a single artifact (lesson plan or homework) by document id.",
        inputSchema: {
          documentId: z.string().describe("The document's id"),
        },
      },
      async ({ documentId }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const doc = await getLatestDocumentById({ id: documentId });
        if (!doc || doc.userId !== auth.userId) {
          return errorResult(
            `No teaching pack ${documentId} found on your account.`
          );
        }
        return jsonResult({
          id: doc.id,
          kind: doc.kind,
          title: doc.title,
          createdAt: doc.createdAt,
          content: doc.content,
        });
      }
    );

    // ── create_lesson_plan ───────────────────────────────────────────
    server.registerTool(
      "create_lesson_plan",
      {
        title: "Create lesson plan",
        description:
          "Generate a personalized next-lesson plan (text artifact) for a student from a brief. Takes 20-60s.",
        inputSchema: {
          studentId: z.string().describe("The student's id"),
          brief: z
            .string()
            .describe(
              "What the lesson should cover — objectives, target grammar/vocab, focus areas"
            ),
        },
      },
      async ({ studentId, brief }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const student = await ownedStudent(studentId, auth.userId);
        if (!student) {
          return notOwned(studentId);
        }
        const title = `Lesson plan — ${student.name}`;
        const result = await generateStudentArtifact({
          kind: "text",
          studentId,
          student,
          title,
          brief,
          session: auth.session,
          userId: auth.userId,
        });
        return jsonResult({
          documentId: result.documentId,
          title: result.title,
          kind: result.kind,
        });
      }
    );

    // ── create_homework ──────────────────────────────────────────────
    server.registerTool(
      "create_homework",
      {
        title: "Create homework",
        description:
          "Generate an interactive homework exercise set for a student and return a public, student-playable share URL. Takes 20-60s.",
        inputSchema: {
          studentId: z.string().describe("The student's id"),
          brief: z
            .string()
            .describe(
              "What the homework should drill — target grammar/vocab, focus areas, difficulty"
            ),
        },
      },
      async ({ studentId, brief }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const student = await ownedStudent(studentId, auth.userId);
        if (!student) {
          return notOwned(studentId);
        }
        const title = `Homework — ${student.name}`;
        const result = await generateStudentArtifact({
          kind: "homework",
          studentId,
          student,
          title,
          brief,
          session: auth.session,
          userId: auth.userId,
        });
        const path = await ensureShareUrl(result.documentId, studentId);
        const shareUrl = `${origin(extra)}${path}`;
        return jsonResult({
          documentId: result.documentId,
          title: result.title,
          kind: result.kind,
          shareUrl,
          note: "This URL is public and student-playable — no login required.",
        });
      }
    );

    // ── get_progress_brief ───────────────────────────────────────────
    server.registerTool(
      "get_progress_brief",
      {
        title: "Get progress brief",
        description:
          "Generate a parent/admin-ready progress brief for a student, citing their learning record. Returns the brief content. Takes 20-60s.",
        inputSchema: {
          studentId: z.string().describe("The student's id"),
        },
      },
      async ({ studentId }, extra) => {
        const auth = await requireAuth(extra);
        if ("error" in auth) {
          return auth.error;
        }
        const student = await ownedStudent(studentId, auth.userId);
        if (!student) {
          return notOwned(studentId);
        }
        const { documentId, title } = await generateProgressBrief(
          studentId,
          auth.userId
        );
        const doc = await getLatestDocumentById({ id: documentId });
        return jsonResult({
          documentId,
          title,
          content: doc?.content ?? "",
        });
      }
    );
  },
  {
    serverInfo: { name: "teachflow", version: "1.0.0" },
    instructions: SERVER_INSTRUCTIONS,
  },
  {
    basePath: "/api/mcp",
    maxDuration: 120,
    verboseLogs: false,
  }
);

// ── shared per-call auth + ownership helpers ─────────────────────────

type ToolExtra = {
  requestInfo?: {
    headers?: Record<string, string | string[] | undefined>;
  };
};

function headersFromExtra(extra: ToolExtra): Headers {
  const h = new Headers();
  const raw = extra.requestInfo?.headers ?? {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        h.append(k, item);
      }
    } else if (v != null) {
      h.set(k, v);
    }
  }
  return h;
}

function origin(extra: ToolExtra): string {
  const h = headersFromExtra(extra);
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    return `${proto}://${host}`;
  }
  return process.env.TEACHFLOW_PUBLIC_URL ?? "http://localhost:3000";
}

async function requireAuth(
  extra: ToolExtra
): Promise<McpAuth | { error: ReturnType<typeof errorResult> }> {
  const request = new Request("https://teachflow.local/api/mcp", {
    headers: headersFromExtra(extra),
  });
  const auth = await resolveMcpAuth(request);
  if (!auth) {
    return {
      error: errorResult(
        "Unauthorized. Provide an Authorization: Bearer header — either base64('email:password') of your TeachFlow account, or the demo token."
      ),
    };
  }
  return auth;
}

async function ownedStudent(studentId: string, userId: string) {
  const student = await getStudentById({ id: studentId });
  if (!student || student.userId !== userId) {
    return undefined;
  }
  return student;
}

function notOwned(studentId: string) {
  return errorResult(
    `No student ${studentId} found on your account (or you do not own it).`
  );
}

export { handler as GET, handler as POST, handler as DELETE };
