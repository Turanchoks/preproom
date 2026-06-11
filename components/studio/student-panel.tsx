"use client";

import {
  ActivityIcon,
  BrainIcon,
  FileTextIcon,
  UserIcon,
  VideoIcon,
} from "lucide-react";
import { useState } from "react";
import { useArtifactSelector } from "@/hooks/use-artifact";
import type { Student } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { AgentTrace } from "./agent-trace";
import { avatarColorClass } from "./avatar";
import { ProgressBriefButton } from "./progress-brief-button";
import { StudentArtifactsTab } from "./student-artifacts-tab";
import { StudentFormDialog } from "./student-form-dialog";
import { StudentMemoryTab } from "./student-memory-tab";
import { StudentVideosTab } from "./student-videos-tab";

type Tab = "profile" | "memory" | "artifacts" | "videos" | "activity";

const TABS: { id: Tab; label: string; icon: typeof UserIcon }[] = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "memory", label: "Memory", icon: BrainIcon },
  { id: "artifacts", label: "Artifacts", icon: FileTextIcon },
  { id: "videos", label: "Videos", icon: VideoIcon },
  { id: "activity", label: "Activity", icon: ActivityIcon },
];

export function StudentPanel({ student }: { student: Student }) {
  const isArtifactVisible = useArtifactSelector((s) => s.isVisible);
  const [tab, setTab] = useState<Tab>("profile");

  // The canvas takes over the right side when an artifact is open.
  if (isArtifactVisible) {
    return null;
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-10 hidden h-dvh w-[360px] flex-col border-border/40 border-l bg-sidebar lg:flex">
      <div className="flex items-center gap-3 border-border/40 border-b px-5 py-4">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full font-semibold text-sm text-white",
            avatarColorClass(student.avatarColor)
          )}
        >
          {student.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-sm">{student.name}</div>
          <div className="text-muted-foreground text-xs">
            {student.level ? `Level ${student.level}` : "No level set"}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-border/40 border-b px-2 py-2">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-md py-1.5 text-[11px] transition-colors",
              tab === id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "profile" && <ProfileTab student={student} />}
        {tab === "memory" && <StudentMemoryTab studentId={student.id} />}
        {tab === "artifacts" && <StudentArtifactsTab studentId={student.id} />}
        {tab === "videos" && <StudentVideosTab studentId={student.id} />}
        {tab === "activity" && <AgentTrace />}
      </div>
    </aside>
  );
}

function ProfileTab({ student }: { student: Student }) {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <Field label="Level" value={student.level ?? "—"} />
      <Field label="Native language" value={student.nativeLanguage ?? "—"} />
      <Field label="Target language" value={student.targetLanguage ?? "—"} />
      <div className="flex flex-col gap-1">
        <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          Goals
        </span>
        <p className="whitespace-pre-wrap text-foreground/90">
          {student.goals?.trim() || "No goals set yet."}
        </p>
      </div>

      <StudentFormDialog
        student={student}
        trigger={
          <button
            className="mt-1 rounded-lg border border-border/60 px-3 py-2 text-center font-medium text-[13px] transition-colors hover:bg-muted"
            type="button"
          >
            Edit profile
          </button>
        }
      />

      <ProgressBriefButton studentId={student.id} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}
