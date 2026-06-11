import type { UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { codeDocumentHandler } from "@/artifacts/code/server";
import { homeworkDocumentHandler } from "@/artifacts/homework/server";
import { sheetDocumentHandler } from "@/artifacts/sheet/server";
import { textDocumentHandler } from "@/artifacts/text/server";
import type { ArtifactKind } from "@/components/chat/artifact";
import { saveDocument } from "../db/queries";
import { saveStudentDocument } from "../db/queries-studio";
import type { Document } from "../db/schema";
import type { ChatMessage } from "../types";

export type SaveDocumentProps = {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
};

export type CreateDocumentCallbackProps = {
  id: string;
  title: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  session: Session;
  modelId: string;
  studentId?: string | null;
  studentContext?: string;
};

export type UpdateDocumentCallbackProps = {
  document: Document;
  description: string;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  session: Session;
  modelId: string;
  studentId?: string | null;
  studentContext?: string;
};

export type DocumentHandler<T = ArtifactKind> = {
  kind: T;
  onCreateDocument: (args: CreateDocumentCallbackProps) => Promise<void>;
  onUpdateDocument: (args: UpdateDocumentCallbackProps) => Promise<void>;
};

export function createDocumentHandler<T extends ArtifactKind>(config: {
  kind: T;
  onCreateDocument: (params: CreateDocumentCallbackProps) => Promise<string>;
  onUpdateDocument: (params: UpdateDocumentCallbackProps) => Promise<string>;
}): DocumentHandler<T> {
  return {
    kind: config.kind,
    onCreateDocument: async (args: CreateDocumentCallbackProps) => {
      const draftContent = await config.onCreateDocument({
        id: args.id,
        title: args.title,
        dataStream: args.dataStream,
        session: args.session,
        modelId: args.modelId,
        studentId: args.studentId,
        studentContext: args.studentContext,
      });

      if (args.session?.user?.id) {
        if (args.studentId) {
          await saveStudentDocument({
            id: args.id,
            title: args.title,
            content: draftContent,
            kind: config.kind,
            userId: args.session.user.id,
            studentId: args.studentId,
          });
        } else {
          await saveDocument({
            id: args.id,
            title: args.title,
            content: draftContent,
            kind: config.kind,
            userId: args.session.user.id,
          });
        }
      }

      return;
    },
    onUpdateDocument: async (args: UpdateDocumentCallbackProps) => {
      const draftContent = await config.onUpdateDocument({
        document: args.document,
        description: args.description,
        dataStream: args.dataStream,
        session: args.session,
        modelId: args.modelId,
        studentId: args.studentId,
        studentContext: args.studentContext,
      });

      if (args.session?.user?.id) {
        if (args.studentId ?? args.document.studentId) {
          await saveStudentDocument({
            id: args.document.id,
            title: args.document.title,
            content: draftContent,
            kind: config.kind,
            userId: args.session.user.id,
            studentId: args.studentId ?? args.document.studentId,
          });
        } else {
          await saveDocument({
            id: args.document.id,
            title: args.document.title,
            content: draftContent,
            kind: config.kind,
            userId: args.session.user.id,
          });
        }
      }

      return;
    },
  };
}

export const documentHandlersByArtifactKind: DocumentHandler[] = [
  textDocumentHandler,
  codeDocumentHandler,
  sheetDocumentHandler,
  homeworkDocumentHandler,
];

export const artifactKinds = ["text", "code", "sheet", "homework"] as const;
