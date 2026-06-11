"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Student } from "@/lib/db/schema";
import { LEVELS } from "./avatar";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type StudentFormDialogProps = {
  student?: Student;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved?: (student: Student) => void;
};

export function StudentFormDialog({
  student,
  trigger,
  open: controlledOpen,
  onOpenChange,
  onSaved,
}: StudentFormDialogProps) {
  const isEdit = Boolean(student);
  const router = useRouter();
  const { mutate } = useSWRConfig();

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [name, setName] = useState(student?.name ?? "");
  const [level, setLevel] = useState(student?.level ?? "");
  const [nativeLanguage, setNativeLanguage] = useState(
    student?.nativeLanguage ?? ""
  );
  const [targetLanguage, setTargetLanguage] = useState(
    student?.targetLanguage ?? ""
  );
  const [goals, setGoals] = useState(student?.goals ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        level: level || null,
        nativeLanguage: nativeLanguage || null,
        targetLanguage: targetLanguage || null,
        goals: goals || null,
      };

      const res = await fetch(
        isEdit ? `${BASE}/api/students/${student?.id}` : `${BASE}/api/students`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        throw new Error("Request failed");
      }

      const saved: Student = await res.json();

      await mutate(`${BASE}/api/students`);
      toast.success(isEdit ? "Student updated" : "Student added");
      setOpen(false);

      if (onSaved) {
        onSaved(saved);
      } else if (!isEdit) {
        router.push(`/app/student/${saved.id}`);
      } else {
        router.refresh();
      }
    } catch {
      toast.error("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this student's profile."
              : "Create a profile so the AI can tailor lessons."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-name">Name</Label>
            <Input
              autoFocus
              id="student-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maria"
              value={name}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-level">Level</Label>
            <Select onValueChange={setLevel} value={level || undefined}>
              <SelectTrigger id="student-level">
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="student-native">Native language</Label>
              <Input
                id="student-native"
                onChange={(e) => setNativeLanguage(e.target.value)}
                placeholder="e.g. Spanish"
                value={nativeLanguage}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="student-target">Target language</Label>
              <Input
                id="student-target"
                onChange={(e) => setTargetLanguage(e.target.value)}
                placeholder="e.g. English"
                value={targetLanguage}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="student-goals">Goals</Label>
            <Textarea
              id="student-goals"
              onChange={(e) => setGoals(e.target.value)}
              placeholder="What does this student want to achieve?"
              rows={3}
              value={goals}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={handleSubmit}>
            {isEdit ? "Save changes" : "Add student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
