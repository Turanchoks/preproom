"use client";

import { UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudentFormDialog } from "./student-form-dialog";

export function StudentsEmptyState() {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <UsersIcon className="size-7" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-semibold text-xl tracking-tight">No students yet</h1>
        <p className="max-w-sm text-muted-foreground text-sm">
          Add your first student to start a per-student AI teaching session with
          lesson plans, homework, and memory.
        </p>
      </div>
      <StudentFormDialog
        trigger={<Button size="lg">Add your first student</Button>}
      />
    </div>
  );
}
