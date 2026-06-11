import "server-only";

/**
 * Thin bridge between the agent tools and Track G's media pipeline
 * (`lib/media/image`, `lib/media/tts`, `lib/media/store`).
 *
 * We lazy-import the store so that:
 *  - the agent module never eagerly pulls `server-only` media deps at import
 *    time (they're only needed when a media tool actually fires), and
 *  - if Track G's modules are absent/broken at runtime the failure is a
 *    friendly, tool-local error rather than a hard import crash of the agent.
 */

export type AspectRatio =
  | "1:1"
  | "2:3"
  | "3:2"
  | "3:4"
  | "4:3"
  | "9:16"
  | "16:9";

function friendly(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(
    `Media generation is unavailable right now (${msg}). Tell the teacher you couldn't generate the media this time and suggest trying again.`
  );
}

/**
 * Generate (or reuse a cached) illustration for `prompt` and return a public
 * URL. Throws a friendly error if the media pipeline is missing/unreachable.
 */
export async function generateIllustrationUrl(
  prompt: string,
  aspectRatio: AspectRatio = "1:1"
): Promise<string> {
  try {
    const { getOrCreateImageUrl } = await import("@/lib/media/store");
    return await getOrCreateImageUrl(prompt, { aspectRatio });
  } catch (err) {
    throw friendly(err);
  }
}

/**
 * Generate (or reuse a cached) TTS clip for `text` and return a public URL.
 * Throws a friendly error if the media pipeline is missing/unreachable.
 */
export async function generateAudioUrl(
  text: string,
  language?: string
): Promise<string> {
  try {
    const { getOrCreateSpeechUrl } = await import("@/lib/media/store");
    return await getOrCreateSpeechUrl(text, language ? { language } : {});
  } catch (err) {
    throw friendly(err);
  }
}
