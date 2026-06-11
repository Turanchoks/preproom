"use client";

import { QuizPlayer } from "@/components/quiz/quiz-player";
import type { HomeworkContent } from "@/lib/quiz/homework-schema";

export function ShareHomework({ homework }: { homework: HomeworkContent }) {
  return <QuizPlayer homework={homework} mode="play" />;
}
