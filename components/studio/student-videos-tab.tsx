"use client";

import { format } from "date-fns";
import { UploadIcon, VideoIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import type { Video } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const STATUS_STYLES: Record<string, string> = {
  uploading: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  processing: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ready: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

// Defensive fetcher: distinguishes "pipeline not configured" (404/501) from
// real data so the tab degrades gracefully when Track E isn't wired up.
async function videosFetcher(url: string): Promise<Video[]> {
  const res = await fetch(url);
  if (res.status === 404 || res.status === 501) {
    const err = new Error("not_configured");
    (err as Error & { notConfigured?: boolean }).notConfigured = true;
    throw err;
  }
  if (!res.ok) {
    throw new Error("Failed to load videos");
  }
  const data = await res.json();
  return Array.isArray(data) ? data : (data.videos ?? []);
}

export function StudentVideosTab({ studentId }: { studentId: string }) {
  const key = `${BASE}/api/videos?studentId=${studentId}`;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: videos, error, mutate } = useSWR<Video[]>(key, videosFetcher, {
    revalidateOnFocus: false,
    refreshInterval: (data) =>
      data?.some((v) => v.status === "processing" || v.status === "uploading")
        ? 5000
        : 0,
  });

  const notConfigured = (error as Error & { notConfigured?: boolean })
    ?.notConfigured;

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const initRes = await fetch(`${BASE}/api/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          title: file.name,
          mimeType: file.type || "video/mp4",
        }),
      });

      if (initRes.status === 404 || initRes.status === 501) {
        toast.error("Video pipeline not configured");
        return;
      }
      if (!initRes.ok) {
        throw new Error("init failed");
      }

      const { video, uploadUrl, method } = await initRes.json();

      if (uploadUrl) {
        const putRes = await fetch(uploadUrl, {
          method: method ?? "PUT",
          headers: { "Content-Type": file.type || "video/mp4" },
          body: file,
        });
        if (!putRes.ok) {
          throw new Error("upload failed");
        }
      }

      if (video?.id) {
        await fetch(`${BASE}/api/videos/${video.id}/complete`, {
          method: "POST",
        });
      }

      toast.success("Video uploaded — analysis started");
      mutate();
    } catch {
      toast.error("Video upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  if (notConfigured) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-border/50 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          Video pipeline not configured.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Upload a lesson recording to extract memory facts.
      </p>

      <input
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleUpload(file);
          }
          e.target.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />

      <button
        className="flex items-center justify-center gap-2 rounded-lg border border-border/60 px-3 py-2 font-medium text-[13px] transition-colors hover:bg-muted disabled:opacity-60"
        disabled={isUploading}
        onClick={() => fileInputRef.current?.click()}
        type="button"
      >
        <UploadIcon className="size-4" />
        {isUploading ? "Uploading…" : "Upload video"}
      </button>

      {videos && videos.length === 0 ? (
        <p className="rounded-lg border border-border/50 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          No videos yet.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {videos?.map((video) => (
          <li
            className="flex items-start gap-3 rounded-lg border border-border/50 px-3 py-2.5"
            key={video.id}
          >
            <span className="mt-0.5 text-muted-foreground">
              <VideoIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{video.title}</div>
              <div className="text-[11px] text-muted-foreground">
                {format(new Date(video.createdAt), "MMM d, yyyy")}
              </div>
            </div>
            <Badge
              className={cn(
                "px-1.5 py-0 text-[10px] capitalize",
                STATUS_STYLES[video.status] ?? STATUS_STYLES.processing
              )}
              variant="secondary"
            >
              {video.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
