"use client";

import { FileTextIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useArtifact } from "@/hooks/use-artifact";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface ProgressBriefButtonProps {
  studentId: string;
}

export function ProgressBriefButton({ studentId }: ProgressBriefButtonProps) {
  const [loading, setLoading] = useState(false);
  const { setArtifact } = useArtifact();

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${BASE}/api/students/${studentId}/brief`,
        { method: "POST" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }

      const { documentId, title } = await res.json() as {
        documentId: string;
        title: string;
      };

      // Fetch the full content then open it in the canvas.
      let content = "";
      try {
        const docRes = await fetch(`${BASE}/api/document?id=${documentId}`);
        if (docRes.ok) {
          const versions = await docRes.json();
          content = versions.at(-1)?.content ?? "";
        }
      } catch {
        // non-fatal; we'll show an empty canvas and user can navigate to it
      }

      setArtifact((current) => ({
        ...current,
        documentId,
        title,
        kind: "text",
        content,
        isVisible: true,
        status: "idle",
      }));

      toast.success("Progress Brief ready", {
        description: title,
      });
    } catch (err) {
      console.error("[ProgressBriefButton]", err);
      toast.error("Could not generate brief", {
        description: String(err instanceof Error ? err.message : err),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="flex w-full items-center gap-2 rounded-lg border border-border/60 px-3 py-2 font-medium text-[13px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading}
      onClick={handleGenerate}
      type="button"
    >
      <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
      <span>{loading ? "Writing brief…" : "Generate progress brief"}</span>
    </button>
  );
}
