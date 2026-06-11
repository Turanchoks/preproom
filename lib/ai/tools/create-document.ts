import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type CreateDocumentProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  modelId: string;
  studentId?: string | null;
  studentContext?: string;
};

export const createDocument = ({
  session,
  dataStream,
  modelId,
  studentId,
  studentContext,
}: CreateDocumentProps) =>
  tool({
    description:
      "Create an artifact. You MUST specify kind: use 'code' for any programming/algorithm request (creates a script), 'text' for essays/writing/lesson plans (creates a document), 'sheet' for spreadsheets/data, 'homework' for an interactive exercise set for a student — use for homework/quiz requests.",
    inputSchema: z.object({
      title: z.string().describe("The title of the artifact"),
      kind: z
        .enum(artifactKinds)
        .describe(
          "REQUIRED. 'code' for programming/algorithms, 'text' for essays/writing/lesson plans, 'sheet' for spreadsheets, 'homework' for an interactive exercise set / quiz for a student"
        ),
    }),
    execute: async ({ title, kind }) => {
      const id = generateUUID();

      dataStream.write({
        type: "data-kind",
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: title,
        transient: true,
      });

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        id,
        title,
        dataStream,
        session,
        modelId,
        studentId,
        studentContext,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      let content: string;
      if (kind === "code") {
        content = "A script was created and is now visible to the user.";
      } else if (kind === "homework") {
        content =
          "An interactive homework exercise set was created and is now visible to the user.";
      } else {
        content = "A document was created and is now visible to the user.";
      }

      return {
        id,
        title,
        kind,
        content,
      };
    },
  });
