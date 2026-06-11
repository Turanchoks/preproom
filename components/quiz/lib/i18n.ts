/**
 * Minimal locale layer for the homework runtime. The reference quizapp had
 * a much larger i18n surface; we trim it to the four locales we actually
 * support today and let the UI fall back to English when an unknown locale
 * is encountered.
 */

export type SupportedLocale = "en" | "es" | "ru" | "fr";

export const DEFAULT_LOCALE: SupportedLocale = "en";

export function normalizeLocale(input: string | undefined | null): SupportedLocale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("ru")) return "ru";
  if (lower.startsWith("fr")) return "fr";
  return DEFAULT_LOCALE;
}
