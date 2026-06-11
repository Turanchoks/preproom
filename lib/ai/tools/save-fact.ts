import { tool } from "ai";
import { z } from "zod";
import { saveStudentFact } from "@/lib/db/queries-studio";

type SaveFactProps = {
  studentId: string;
};

/**
 * Fallback-path (AI SDK) tool that persists a durable observation about the
 * student into long-term memory. Mirrors the ADK `save_fact` tool so the
 * non-ADK chat path can still build student memory.
 */
export const saveFactTool = ({ studentId }: SaveFactProps) =>
  tool({
    description:
      "Persist a durable observation about the student into long-term memory. Call whenever the teacher reveals something lasting about the student (a recurring error, a strength, an interest, a milestone, or an important note).",
    inputSchema: z.object({
      category: z
        .enum(["strength", "error", "interest", "note", "progress"])
        .describe("strength | error | interest | note | progress"),
      fact: z
        .string()
        .describe("The observation, written concisely as a standalone fact."),
    }),
    execute: async ({ category, fact }) => {
      const row = await saveStudentFact({
        studentId,
        category,
        fact,
        source: "chat",
        sourceRef: null,
      });
      return { saved: true, id: row.id, category, fact };
    },
  });
