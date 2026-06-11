"use client";

import { format } from "date-fns";
import { FileTextIcon, GraduationCapIcon } from "lucide-react";
import useSWR from "swr";
import { useArtifact } from "@/hooks/use-artifact";
import type { Document } from "@/lib/db/schema";
import { fetcher } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function StudentArtifactsTab({ studentId }: { studentId: string }) {
  const { data: documents } = useSWR<Document[]>(
    `${BASE}/api/students/${studentId}/artifacts`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const { setArtifact } = useArtifact();

  const openInCanvas = async (doc: Document) => {
    // Fetch the latest version's content, then open the canvas.
    let content = doc.content ?? "";
    try {
      const res = await fetch(`${BASE}/api/document?id=${doc.id}`);
      if (res.ok) {
        const versions: Document[] = await res.json();
        content = versions.at(-1)?.content ?? content;
      }
    } catch {
      // Fall back to the list content.
    }

    setArtifact((current) => ({
      ...current,
      documentId: doc.id,
      title: doc.title,
      kind: doc.kind,
      content,
      isVisible: true,
      status: "idle",
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Lesson plans and homework created for this student.
      </p>

      {documents && documents.length === 0 ? (
        <p className="rounded-lg border border-border/50 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          No artifacts yet. Ask the AI to create a lesson plan or homework.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {documents?.map((doc) => (
          <li key={`${doc.id}-${new Date(doc.createdAt).getTime()}`}>
            <button
              className="flex w-full items-start gap-3 rounded-lg border border-border/50 px-3 py-2.5 text-left transition-colors hover:bg-muted"
              onClick={() => openInCanvas(doc)}
              type="button"
            >
              <span className="mt-0.5 text-muted-foreground">
                {doc.kind === "homework" ? (
                  <GraduationCapIcon className="size-4" />
                ) : (
                  <FileTextIcon className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {doc.title}
                </span>
                <span className="text-[11px] text-muted-foreground capitalize">
                  {doc.kind} · {format(new Date(doc.createdAt), "MMM d, yyyy")}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
