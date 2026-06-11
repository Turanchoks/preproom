"use client";

import { useEffect, useRef, useState } from "react";
import { useDataStream } from "@/components/chat/data-stream-provider";
import type { ToolActivity } from "@/lib/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Tool-name → friendly label map.
// Covers every tool in lib/agent/tools.ts plus sub-agents and MCP fallbacks.
// ---------------------------------------------------------------------------
const TOOL_LABELS: Record<string, string> = {
  save_fact: "Saved a memory fact",
  search_memory: "Searched memory",
  get_student_profile: "Loaded student profile",
  list_videos: "Listed lesson videos",
  get_video_analysis: "Reviewed video analysis",
  list_student_artifacts: "Checked student artifacts",
  create_lesson_plan: "Created lesson plan",
  create_homework: "Created homework",
  update_artifact: "Updated artifact",
  generate_illustration: "Generated illustration",
  generate_audio_snippet: "Generated audio",
  get_exercise_catalog: "Consulted exercise catalog (MCP)",
  web_search: "Searched the web",
  pedagogy_reviewer: "Pedagogy check",
};

function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  // Prettify unknown names: underscores → spaces, capitalize each word.
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TraceEntry = ToolActivity & {
  id: string;
  ts: Date;
};

// ---------------------------------------------------------------------------
// Animated status dot
// ---------------------------------------------------------------------------
function StatusDot({ status }: { status: ToolActivity["status"] }) {
  if (status === "running") {
    return (
      <span
        aria-label="Running"
        className="relative mt-[3px] flex size-2 shrink-0"
      >
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-amber-400" />
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        aria-label="Error"
        className="mt-[3px] flex size-2 shrink-0 rounded-full bg-rose-500"
      />
    );
  }
  // done
  return (
    <span
      aria-label="Done"
      className="mt-[3px] flex size-2 shrink-0 rounded-full bg-emerald-500"
    />
  );
}

// ---------------------------------------------------------------------------
// Single trace row
// ---------------------------------------------------------------------------
function TraceRow({ entry }: { entry: TraceEntry }) {
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-border/40 px-3 py-2",
        "animate-in fade-in slide-in-from-bottom-1 duration-200"
      )}
    >
      <StatusDot status={entry.status} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-tight text-foreground/90">
          {toolLabel(entry.name)}
        </p>
        {entry.summary && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {entry.summary}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums mt-[2px]">
        {entry.ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// AgentTrace — main export
// ---------------------------------------------------------------------------
export function AgentTrace() {
  const { dataStream } = useDataStream();
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set<string>());
  const counterRef = useRef(0);

  // Consume incoming toolActivity data parts.
  useEffect(() => {
    if (!dataStream?.length) return;

    const incoming = dataStream.filter((p) => p.type === "data-toolActivity");
    if (!incoming.length) return;

    setEntries((prev) => {
      let next = [...prev];

      for (const part of incoming) {
        // part.data is ToolActivity
        const activity = part.data as ToolActivity;
        const { name, status, summary } = activity;

        // Try to update an existing running entry for the same tool name.
        const runningIdx = next.findLastIndex(
          (e) => e.name === name && e.status === "running"
        );

        if (runningIdx !== -1 && status !== "running") {
          // Transition running → done/error
          next = [
            ...next.slice(0, runningIdx),
            { ...next[runningIdx], status, summary: summary ?? next[runningIdx].summary },
            ...next.slice(runningIdx + 1),
          ];
        } else if (runningIdx === -1 || status === "running") {
          // New entry (or second simultaneous "running" call for the same tool)
          const id = `${name}-${++counterRef.current}`;
          if (!seenRef.current.has(id)) {
            seenRef.current.add(id);
            next = [...next, { id, name, status, summary, ts: new Date() }];
          }
        }
      }

      return next;
    });
  }, [dataStream]);

  // Auto-scroll to newest entry.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Live activity from the AI agent during this session.
      </p>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-border/50 border-dashed px-3 py-6 text-center text-muted-foreground text-xs">
          Agent activity will appear here while you chat.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {entries.map((entry) => (
            <TraceRow entry={entry} key={entry.id} />
          ))}
          <div ref={bottomRef} />
        </ul>
      )}
    </div>
  );
}
