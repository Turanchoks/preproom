/**
 * Feedback presentation: pick a title + emoji for a given correctness status.
 * Trimmed-down port of the reference repo's lib/feedback-presentation.ts.
 */

import type { SupportedLocale } from "./i18n";

export type FeedbackPresentationStatus = "correct" | "almost" | "incorrect";

export type FeedbackEmojiName =
  | "cool"
  | "halo"
  | "inlove"
  | "kiss"
  | "stars"
  | "hmm"
  | "nope"
  | "oops"
  | "smile"
  | "wink"
  | "cry"
  | "ohno"
  | "reallysad"
  | "sigh";

const EMOJI_GLYPHS: Record<FeedbackEmojiName, string> = {
  cool: "😎",
  halo: "😇",
  inlove: "🥰",
  kiss: "😘",
  stars: "🤩",
  hmm: "🤔",
  nope: "🙃",
  oops: "😅",
  smile: "🙂",
  wink: "😉",
  cry: "😢",
  ohno: "😬",
  reallysad: "😭",
  sigh: "😞",
};

export function emojiGlyph(name: FeedbackEmojiName): string {
  return EMOJI_GLYPHS[name] ?? "🙂";
}

export const feedbackEmojiPools: Record<FeedbackPresentationStatus, readonly FeedbackEmojiName[]> =
  {
    correct: ["cool", "halo", "inlove", "kiss", "stars"],
    almost: ["hmm", "nope", "oops", "smile", "wink"],
    incorrect: ["cry", "ohno", "reallysad", "sigh"],
  };

const TITLE_POOLS: Record<
  SupportedLocale,
  Record<FeedbackPresentationStatus, readonly string[]>
> = {
  en: {
    correct: ["Nice!", "Perfect!", "Spot on!", "Great job!", "You got it!"],
    almost: ["Almost!", "So close!", "Not quite", "Try again"],
    incorrect: ["Not yet", "Keep trying", "That's not it", "Hmm, no"],
  },
  es: {
    correct: ["¡Bien!", "¡Perfecto!", "¡Excelente!", "¡Lo lograste!"],
    almost: ["¡Casi!", "Casi lo tienes", "Inténtalo otra vez"],
    incorrect: ["No todavía", "Sigue intentando", "No es esto"],
  },
  ru: {
    correct: ["Отлично!", "В точку!", "Молодец!", "Так держать!"],
    almost: ["Почти!", "Чуть-чуть", "Попробуй ещё"],
    incorrect: ["Пока нет", "Не совсем", "Попробуй снова"],
  },
  fr: {
    correct: ["Bravo !", "Parfait !", "Excellent !", "Bien joué !"],
    almost: ["Presque !", "Pas tout à fait", "Réessaie"],
    incorrect: ["Pas encore", "Continue", "Non, pas ça"],
  },
};

function pick<T>(items: readonly T[]): T {
  if (items.length === 0) {
    throw new Error("Feedback presentation pool cannot be empty.");
  }
  return items[Math.floor(Math.random() * items.length)]!;
}

export function resolveFeedbackPresentation({
  status,
  locale,
}: {
  status: FeedbackPresentationStatus;
  locale: SupportedLocale;
}): { title: string; emoji: FeedbackEmojiName } {
  const titles = TITLE_POOLS[locale]?.[status] ?? TITLE_POOLS.en[status];
  return {
    title: pick(titles),
    emoji: pick(feedbackEmojiPools[status]),
  };
}
