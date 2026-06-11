"use client";

import { Trash2Icon } from "lucide-react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import type { StudentFact } from "@/lib/db/schema";
import { cn, fetcher } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const CATEGORY_STYLES: Record<string, string> = {
  strength: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  error: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  interest: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  progress: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  note: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
};

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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        What the AI knows about this student.
      </p>

      {facts && facts.length === 0 ? (
        <p className="rounded-lg border border-border/50 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          No memory yet. Facts appear as you teach and analyze lessons.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {facts?.map((fact) => (
          <li
            className="group flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2"
            key={fact.id}
          >
            <div className="min-w-0 flex-1">
              <Badge
                className={cn(
                  "mb-1 px-1.5 py-0 text-[10px] capitalize",
                  CATEGORY_STYLES[fact.category] ?? CATEGORY_STYLES.note
                )}
                variant="secondary"
              >
                {fact.category}
              </Badge>
              <p className="text-foreground/90 text-sm">{fact.fact}</p>
            </div>
            <button
              aria-label="Delete fact"
              className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
              onClick={() => handleDelete(fact.id)}
              type="button"
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
