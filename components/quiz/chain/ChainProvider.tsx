"use client";

import { useEffect, useMemo } from "react";
import { useChainRunner, type PersistenceCallbacks } from "../core/chain-runner";
import type { ChainJSON } from "../core/types";
import { registerAllExercises } from "../exercises/register-all";
import { normalizeLocale, type SupportedLocale } from "../lib/i18n";
import { WelcomeScreen } from "./WelcomeScreen";
import { ExerciseShell } from "./ExerciseShell";
import { FinalScreen } from "./FinalScreen";
import { TimesUpScreen } from "./TimesUpScreen";

interface Props {
  chain: ChainJSON;
  locale?: SupportedLocale;
  persistence?: PersistenceCallbacks;
  onClose?: () => void;
}

/**
 * Top-level entry point for rendering a homework. Loads the chain into the
 * Zustand store on mount, registers all exercise types, and renders the
 * appropriate phase screen.
 *
 * Persistence callbacks are forwarded to the runner so the host page can
 * call tRPC mutations when the chain starts/finishes — see the my-homework
 * player page for the wiring.
 */
export function ChainProvider({ chain, locale, persistence, onClose }: Props) {
  const initialize = useChainRunner((s) => s.initialize);
  const reset = useChainRunner((s) => s.reset);
  const setPersistenceCallbacks = useChainRunner((s) => s.setPersistenceCallbacks);
  const phase = useChainRunner((s) => s.phase);

  const interfaceLanguage = useMemo(
    () => normalizeLocale(locale ?? chain.locale),
    [locale, chain.locale],
  );

  useEffect(() => {
    registerAllExercises();
    initialize(chain);
    return () => {
      reset();
    };
  }, [chain, initialize, reset]);

  useEffect(() => {
    if (persistence) setPersistenceCallbacks(persistence);
  }, [persistence, setPersistenceCallbacks]);

  return (
    <div className="space-y-6">
      {phase === "welcome" ? <WelcomeScreen /> : null}
      {phase === "exercise" || phase === "practice" ? (
        <ExerciseShell interfaceLanguage={interfaceLanguage} />
      ) : null}
      {phase === "times-up" ? <TimesUpScreen /> : null}
      {phase === "final" ? <FinalScreen onClose={onClose} /> : null}
    </div>
  );
}
