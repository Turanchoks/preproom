import type { ChainSettings } from "./types";

export function getAttemptsPerExercise(settings: ChainSettings): number | null {
  const limit = settings.attemptsPerExercise;
  return typeof limit === "number" && limit > 0 ? limit : null;
}

export function getQuizLives(settings: ChainSettings): number | null {
  const lives = settings.lives;
  return typeof lives === "number" && lives > 0 ? lives : null;
}
