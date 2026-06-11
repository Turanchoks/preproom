"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StudentFormDialog } from "./student-form-dialog";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function StudentsEmptyState() {
  const router = useRouter();
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);

  const handleDemoStudent = async () => {
    setIsCreatingDemo(true);
    try {
      const res = await fetch(`${BASE}/api/students/demo`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to create demo student");
      const student = await res.json();
      router.push(`/app/student/${student.id}`);
    } catch {
      toast.error("Could not create demo student — please try adding one manually.");
      setIsCreatingDemo(false);
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="overflow-hidden rounded-2xl bg-muted/60 shadow-sm">
        <Image
          alt="No students yet"
          className="size-[180px] object-cover"
          height={180}
          priority
          src="/brand/empty-students.png"
          width={180}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-xl tracking-tight">
          Add your first student
        </h1>
        <p className="max-w-xs text-muted-foreground text-sm">
          Your AI copilot starts learning about them immediately — memory,
          lesson plans, and homework tailored just for them.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <StudentFormDialog
          trigger={
            <Button size="lg" variant="default">
              Add a student
            </Button>
          }
        />
        <Button
          disabled={isCreatingDemo}
          onClick={handleDemoStudent}
          size="lg"
          variant="outline"
        >
          {isCreatingDemo ? "Setting up…" : "✨ Try with a demo student"}
        </Button>
      </div>

      <p className="text-muted-foreground/60 text-xs">
        The demo creates &quot;Anna García&quot; — a pre-filled B1 student with 9 memory facts so
        you can see the AI in action right away.
      </p>
    </div>
  );
}
