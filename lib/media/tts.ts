import "server-only";

import { GoogleGenAI } from "@google/genai";

/**
 * Text-to-speech via the Gemini API (@google/genai).
 *
 * Verified call shape + WAV wrapping + retry wrapper come from
 * docs/harvest/media-generation.md (re-verified 2026-06-11 on the paid key:
 * gemini-2.5-flash-preview-tts ~3.7s/clip, parallel bursts of 5 succeed with
 * no 429s — Tier-1 limits are comfortable for concurrency 3-4).
 *
 * Output is raw 16-bit little-endian PCM, 24 kHz, mono. We wrap it in a 44-byte
 * WAV header so browsers can play it directly.
 */

const PRIMARY_MODEL = "gemini-2.5-flash-preview-tts";
const FALLBACK_MODEL = "gemini-3.1-flash-tts-preview";

let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!_ai) {
    _ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    });
  }
  return _ai;
}

export interface GenerateSpeechOptions {
  /** Prebuilt voice name (case-sensitive), e.g. Kore, Leda, Puck. */
  voice?: string;
  /** Optional BCP-47 language code; otherwise auto-detected from the text. */
  language?: string;
}

/** Prepend a 44-byte WAV header to raw PCM (16-bit LE, mono). */
export function pcmToWav(
  pcm: Buffer,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format 1 = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function ttsOnce(
  model: string,
  text: string,
  voiceName: string,
  language?: string
): Promise<Buffer> {
  const r = await getAi().models.generateContent({
    model,
    contents: text,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        ...(language ? { languageCode: language } : {}),
      },
    },
  });
  const data = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    // Observed: occasional 200 with no inlineData part — treat as retryable.
    throw new Error("empty audio response");
  }
  return Buffer.from(data, "base64");
}

const RETRYABLE = /429|500|503|RESOURCE_EXHAUSTED|INTERNAL|empty audio/;

/**
 * Generate speech for `text` and return a playable WAV buffer.
 * Retries on 429 / transient 5xx / empty responses, honoring the server's
 * "retry in Ns" hint, and falls back to the alternate TTS model once.
 */
export async function generateSpeech(
  text: string,
  { voice = "Kore", language }: GenerateSpeechOptions = {},
  maxAttempts = 5
): Promise<Buffer> {
  let model = PRIMARY_MODEL;
  let fellBack = false;
  for (let attempt = 1; ; attempt++) {
    try {
      const pcm = await ttsOnce(model, text, voice, language);
      return pcmToWav(pcm);
    } catch (e) {
      const msg = String(e);
      if (attempt >= maxAttempts) {
        throw e;
      }
      if (!RETRYABLE.test(msg)) {
        throw e;
      }
      // After two failures on the primary model, switch to the fallback once.
      if (!fellBack && attempt >= 2) {
        model = FALLBACK_MODEL;
        fellBack = true;
      }
      const hinted = msg.match(/retry in (\d+(?:\.\d+)?)s/i);
      await new Promise((res) =>
        setTimeout(res, hinted ? +hinted[1] * 1000 + 250 : 1000 * attempt)
      );
    }
  }
}
