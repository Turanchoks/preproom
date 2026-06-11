import type { ComponentType, ForwardRefExoticComponent, RefAttributes } from "react";
import type { ExerciseComponentProps, ExerciseImperativeHandle } from "./exercise-contract";

type ExerciseComponent =
  | ComponentType<ExerciseComponentProps>
  | ForwardRefExoticComponent<ExerciseComponentProps & RefAttributes<ExerciseImperativeHandle>>;

const registry = new Map<string, ExerciseComponent>();

export function registerExercise(type: string, component: ExerciseComponent): void {
  if (!type.trim()) {
    throw new Error("[ExerciseRegistry] Cannot register an exercise with an empty type key.");
  }
  registry.set(type, component);
}

export function getExercise(type: string): ExerciseComponent | null {
  return registry.get(type) ?? null;
}

export function hasExercise(type: string): boolean {
  return registry.has(type);
}

export function getRegisteredTypes(): string[] {
  return Array.from(registry.keys());
}
