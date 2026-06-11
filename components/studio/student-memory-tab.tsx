"use client";

import { formatDistanceToNow, format } from "date-fns";
import {
  MessageCircleIcon,
  VideoIcon,
  UserIcon,
  Trash2Icon,
  TrophyIcon,
} from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import type { StudentFact } from "@/lib/db/schema";
import { cn, fetcher } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// ── Category styles ──────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, string> = {
  strength: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  error: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  interest: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  progress: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  note: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

// ── Source badge ─────────────────────────────────────────────────────────────

type SourceConfig = {
  label: string;
  icon: React.ReactNode;
};

function prettifySource(raw: string): string {
  // e.g. "homework_result" → "homework result"
  return raw.replace(/_/g, " ");
}

const KNOWN_SOURCE_CONFIG: Record<string, SourceConfig> = {
  chat: {
    label: "from chat",
    icon: <MessageCircleIcon className="size-3" />,
  },
  video_analysis: {
    label: "from lesson video",
    icon: <VideoIcon className="size-3" />,
  },
  teacher: {
    label: "added by teacher",
    icon: <UserIcon className="size-3" />,
  },
};

function getSourceConfig(source: string): SourceConfig {
  if (source in KNOWN_SOURCE_CONFIG) {
    return KNOWN_SOURCE_CONFIG[source];
  }
  // Graceful degradation for future/unknown source values.
  // Special-case the anticipated "homework_result" label per spec.
  const label =
    source === "homework_result"
      ? "from homework results"
      : `from ${prettifySource(source)}`;
  return {
    label,
    icon: <MessageCircleIcon className="size-3" />,
  };
}

// ── Relative timestamp ───────────────────────────────────────────────────────

function RelativeTime({ date }: { date: Date }) {
  const relative = formatDistanceToNow(date, { addSuffix: true });
  const absolute = format(date, "MMM d, yyyy 'at' h:mm a");
  return (
    <time className="text-[10px] text-muted-foreground/70" title={absolute}>
      {relative}
    </time>
  );
}

// ── Fact row ─────────────────────────────────────────────────────────────────

function FactRow({
  fact,
  onDelete,
}: {
  fact: StudentFact;
  onDelete: (id: string) => void;
}) {
  const categoryStyle =
    CATEGORY_STYLES[fact.category] ?? CATEGORY_STYLES.note;
  const isProgress = fact.category === "progress";
  const src = getSourceConfig(fact.source);

  return (
    <li className="group flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2">
      {/* Left: trophy icon for progress, else nothing */}
      {isProgress && (
        <span className="mt-1 shrink-0 text-violet-500 dark:text-violet-400">
          <TrophyIcon className="size-3.5" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* Row 1: category chip + source badge */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <Badge
            className={cn("px-1.5 py-0 text-[10px] capitalize", categoryStyle)}
            variant="secondary"
          >
            {fact.category}
          </Badge>

          {/* Source badge */}
          <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
            {src.icon}
            {src.label}
          </span>
        </div>

        {/* Row 2: fact text */}
        <p
          className={cn(
            "text-foreground/90 text-sm",
            isProgress && "font-medium"
          )}
        >
          {fact.fact}
        </p>

        {/* Row 3: relative timestamp */}
        <div className="mt-1">
          <RelativeTime date={new Date(fact.createdAt)} />
        </div>
      </div>

      {/* Delete */}
      <button
        aria-label="Delete fact"
        className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
        onClick={() => onDelete(fact.id)}
        type="button"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function StudentMemoryTab({ studentId }: { studentId: string }) {
  const key = `${BASE}/api/students/${studentId}/facts`;
  const { data: facts, mutate } = useSWR<StudentFact[]>(key, fetcher, {
    revalidateOnFocus: false,
  });

  const handleDelete = async (factId: string) => {
    await mutate(
      (current) => current?.filter((f) => f.id !== factId) ?? [],
      false
    );
    await fetch(`${key}?factId=${factId}`, { method: "DELETE" });
    mutate();
  };

  // Sort newest first
  const sorted = facts
    ? [...facts].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Evidence the AI has gathered about this student — from chats, lesson
        videos, and teacher notes.
      </p>

      {sorted && sorted.length === 0 ? (
        <p className="rounded-lg border border-border/50 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          No memory yet. Facts appear as you teach and analyze lessons.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {sorted?.map((fact) => (
          <FactRow key={fact.id} fact={fact} onDelete={handleDelete} />
        ))}
      </ul>
    </div>
  );
}
