import "server-only";

import { GoogleGenAI } from "@google/genai";

/**
 * Image generation via the Gemini API (@google/genai).
 *
 * Re-verified 2026-06-11 on the paid key (docs/harvest/media-generation.md was
 * measured on the OLD free key where image models were 429 `limit: 0`). On the
 * paid project both work now:
 *  - gemini-3.1-flash-image via generateContent + config.imageConfig: ~8.9s,
 *    returns mimeType image/jpeg (despite the doc's "image/png" note).
 *  - imagen-4.0-fast-generate-001 via generateImages: ~3.3s, returns image/png.
 *
 * We use generateContent (gemini-3.1-flash-image) as primary for a single API
 * shape, falling back to Imagen on failure. We return the raw bytes plus the
 * real mimeType so the caller can store with the correct extension.
 */

const PRIMARY_MODEL = "gemini-3.1-flash-image";
const FALLBACK_MODEL = "imagen-4.0-fast-generate-001";

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return _ai;
}

export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9";

export interface GenerateImageOptions {
  aspectRatio?: AspectRatio;
}

export interface GeneratedImage {
  /** Raw image bytes (PNG or JPEG depending on the model). */
  bytes: Buffer;
  /** Real MIME type reported by the API, e.g. image/png or image/jpeg. */
  mimeType: string;
}

async function geminiImageOnce(
  prompt: string,
  aspectRatio: AspectRatio
): Promise<GeneratedImage> {
  const r = await getAi().models.generateContent({
    model: PRIMARY_MODEL,
    contents: prompt,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize: "1K" },
    },
  });
  const parts = r.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData);
  const data = imgPart?.inlineData?.data;
  if (!data) {
    throw new Error("empty image response");
  }
  return {
    bytes: Buffer.from(data, "base64"),
    mimeType: imgPart?.inlineData?.mimeType ?? "image/png",
  };
}

async function imagenOnce(
  prompt: string,
  aspectRatio: AspectRatio
): Promise<GeneratedImage> {
  // Imagen only supports a subset of aspect ratios.
  const imagenRatio = (
    ["1:1", "3:4", "4:3", "9:16", "16:9"] as AspectRatio[]
  ).includes(aspectRatio)
    ? aspectRatio
    : "1:1";
  const r = await getAi().models.generateImages({
    model: FALLBACK_MODEL,
    prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: imagenRatio,
      // biome-ignore lint/suspicious/noExplicitAny: SDK enum typing
      personGeneration: "allow_adult" as any,
    },
  });
  const img = r.generatedImages?.[0]?.image;
  if (!img?.imageBytes) {
    throw new Error("empty image response");
  }
  return {
    bytes: Buffer.from(img.imageBytes, "base64"),
    mimeType: img.mimeType ?? "image/png",
  };
}

const RETRYABLE = /429|500|503|RESOURCE_EXHAUSTED|INTERNAL|empty image/;

/**
 * Generate an illustration for `prompt`. Retries on transient errors, honoring
 * the server's "retry in Ns" hint, and falls back to Imagen once.
 */
export async function generateImage(
  prompt: string,
  { aspectRatio = "1:1" }: GenerateImageOptions = {},
  maxAttempts = 5
): Promise<GeneratedImage> {
  let useFallback = false;
  for (let attempt = 1; ; attempt++) {
    try {
      return useFallback
        ? await imagenOnce(prompt, aspectRatio)
        : await geminiImageOnce(prompt, aspectRatio);
    } catch (e) {
      const msg = String(e);
      if (attempt >= maxAttempts) {
        throw e;
      }
      if (!RETRYABLE.test(msg)) {
        throw e;
      }
      // After two failures on the primary model, switch to Imagen once.
      if (!useFallback && attempt >= 2) {
        useFallback = true;
      }
      const hinted = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
      await new Promise((res) =>
        setTimeout(res, hinted ? +hinted[1] * 1000 + 250 : 1000 * attempt)
      );
    }
  }
}
