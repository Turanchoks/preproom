"use client";

import { useCallback, useMemo, type ComponentType } from "react";
import { useChainRunner, selectCurrentExercise } from "../core/chain-runner";
import { getExercise } from "../core/exercise-registry";
import type { ExerciseComponentProps } from "../core/exercise-contract";
import type { ExerciseInteractionState, ExerciseResult } from "../core/types";
import type { SupportedLocale } from "../lib/i18n";
import { FallbackExercise } from "./FallbackExercise";

interface Props {
  interfaceLanguage: SupportedLocale;
}

/**
 * Renders the active exercise. Looks up the registered component, wires
 * `onComplete` and `onStateChange` to the chain runner. Falls back to the
 * generic FallbackExercise when no component is registered.
 */
export function ExerciseSlot({ interfaceLanguage }: Props) {
  const entry = useChainRunner(selectCurrentExercise);
  const chainSettings = useChainRunner((s) => s.chainSettings);
  const isMuted = useChainRunner((s) => s.isMuted);
  const completeExercise = useChainRunner((s) => s.completeExercise);
  const updateInteraction = useChainRunner((s) => s.updateInteraction);

  const Component = useMemo<ComponentType<ExerciseComponentProps>>(() => {
    if (!entry) return FallbackExercise;
    const c = getExercise(entry.type);
    return (c as ComponentType<ExerciseComponentProps>) ?? FallbackExercise;
  }, [entry]);

  const handleComplete = useCallback(
    (result: ExerciseResult) => completeExercise(result),
    [completeExercise],
  );

  const handleStateChange = useCallback(
    (state: ExerciseInteractionState) => updateInteraction(state),
    [updateInteraction],
  );

  if (!entry) return null;

  return (
    <Component
      key={entry.id}
      exerciseId={entry.id}
      payload={entry.payload}
      chainSettings={chainSettings}
      interfaceLanguage={interfaceLanguage}
      isMuted={isMuted}
      onComplete={handleComplete}
      onStateChange={handleStateChange}
    />
  );
}
