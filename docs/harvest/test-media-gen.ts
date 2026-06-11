/**
 * Throwaway verification script for TTS + image generation via @google/genai (Gemini API key).
 * Run from teachflow root:  npx tsx docs/harvest/test-media-gen.ts
 * Outputs go to docs/harvest/out/
 */
import { GoogleGenAI } from '@google/genai';
import * as fs from 'node:fs';
import * as path from 'node:path';

// --- load GOOGLE_API_KEY from .env.local manually (no dotenv dependency needed) ---
const envFile = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const apiKey = envFile.match(/^GOOGLE_API_KEY=(.+)$/m)?.[1]?.trim();
if (!apiKey) throw new Error('GOOGLE_API_KEY not found in .env.local');

const ai = new GoogleGenAI({ apiKey });
const outDir = path.join(process.cwd(), 'docs/harvest/out');
fs.mkdirSync(outDir, { recursive: true });

// --- WAV wrapper: Gemini TTS returns raw 16-bit PCM, 24kHz, mono ---
function pcmToWav(pcm: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const r = await fn();
    console.log(`[OK] ${label}: ${Date.now() - t0}ms`);
    return r;
  } catch (e) {
    console.log(`[FAIL] ${label}: ${Date.now() - t0}ms ->`, (e as Error).message?.slice(0, 400));
    throw e;
  }
}

// ---------------- 1. TTS: single speaker ----------------
async function testTts(model: string, fileTag: string) {
  const response = await timed(`TTS ${model}`, () =>
    ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: 'Say cheerfully: ¡Hola! ¿Cómo estás? Welcome to your Spanish homework.' }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
      },
    }),
  );
  const part = response.candidates?.[0]?.content?.parts?.[0];
  const inline = part?.inlineData;
  if (!inline?.data) throw new Error('No audio inlineData in response');
  console.log(`  mimeType: ${inline.mimeType}`);
  const pcm = Buffer.from(inline.data, 'base64');
  console.log(`  pcm bytes: ${pcm.length} (~${(pcm.length / 48000).toFixed(1)}s at 24kHz/16-bit mono)`);
  fs.writeFileSync(path.join(outDir, `tts-${fileTag}.wav`), pcmToWav(pcm));
}

// ---------------- 1b. TTS: multi-speaker ----------------
async function testMultiSpeakerTts() {
  const response = await timed('TTS multi-speaker (gemini-2.5-flash-preview-tts)', () =>
    ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [
        {
          parts: [
            {
              text: `TTS the following conversation between Ana and Ben:
Ana: ¿Dónde está la biblioteca?
Ben: Está al lado del parque.`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: 'Ana', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } },
              { speaker: 'Ben', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
            ],
          },
        },
      },
    }),
  );
  const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inline?.data) throw new Error('No audio inlineData in multi-speaker response');
  console.log(`  mimeType: ${inline.mimeType}`);
  fs.writeFileSync(path.join(outDir, 'tts-multispeaker.wav'), pcmToWav(Buffer.from(inline.data, 'base64')));
}

// ---------------- 2a. Image via generateContent (Gemini image models) ----------------
async function testGeminiImage(model: string, fileTag: string) {
  const response = await timed(`Image ${model} (generateContent)`, () =>
    ai.models.generateContent({
      model,
      contents:
        'A simple, friendly flat-style flashcard illustration of a red apple on a plain white background, minimal, clean vector look',
      config: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '1:1' },
      },
    }),
  );
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData);
  if (!imgPart?.inlineData?.data) throw new Error('No image inlineData; parts: ' + JSON.stringify(parts.map((p) => Object.keys(p))));
  console.log(`  mimeType: ${imgPart.inlineData.mimeType}`);
  const buf = Buffer.from(imgPart.inlineData.data, 'base64');
  console.log(`  image bytes: ${buf.length}`);
  fs.writeFileSync(path.join(outDir, `img-${fileTag}.png`), buf);
}

// ---------------- 2b. Image via generateImages (Imagen models) ----------------
async function testImagen(model: string, fileTag: string) {
  const response = await timed(`Image ${model} (generateImages)`, () =>
    ai.models.generateImages({
      model,
      prompt:
        'A simple, friendly flat-style flashcard illustration of a red apple on a plain white background, minimal, clean vector look',
      config: {
        numberOfImages: 1,
        aspectRatio: '1:1',
        personGeneration: 'allow_adult' as any,
      },
    }),
  );
  const img = response.generatedImages?.[0]?.image;
  if (!img?.imageBytes) throw new Error('No imageBytes in generateImages response');
  console.log(`  mimeType: ${img.mimeType}`);
  const buf = Buffer.from(img.imageBytes, 'base64');
  console.log(`  image bytes: ${buf.length}`);
  fs.writeFileSync(path.join(outDir, `img-${fileTag}.png`), buf);
}

// ---------------- 1c. TTS burst: N short clips in parallel (rate-limit probe) ----------------
async function testTtsBurst(n = 5) {
  const words = ['la manzana', 'el perro', 'la casa', 'el libro', 'la escuela', 'el agua', 'la mesa', 'el gato', 'la flor', 'el sol'];
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    words.slice(0, n).map((w, i) =>
      ai.models
        .generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: w,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          },
        })
        .then((r) => {
          const d = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!d) throw new Error('no audio');
          return d.length;
        }),
    ),
  );
  settled.forEach((s, i) => {
    if (s.status === 'fulfilled') console.log(`  clip ${i}: OK, b64 len ${s.value}`);
    else console.log(`  clip ${i}: ${String(s.reason).slice(0, 800)}`);
  });
  console.log(`  burst of ${n} parallel done in ${Date.now() - t0}ms`);
}

async function main() {
  const only = process.argv.slice(2); // e.g. npx tsx test-media-gen.ts img-gemini-3.1-flash-image
  const results: Record<string, string> = {};
  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (only.length && !only.includes(label)) return;
    try {
      await fn();
      results[label] = 'OK';
    } catch (e) {
      results[label] = 'FAIL: ' + (e as Error).message?.slice(0, 200);
    }
  };

  await run('tts-2.5-flash', () => testTts('gemini-2.5-flash-preview-tts', '25flash'));
  await run('tts-3.1-flash', () => testTts('gemini-3.1-flash-tts-preview', '31flash'));
  await run('tts-multispeaker', () => testMultiSpeakerTts());
  await run('img-gemini-3.1-flash-image', () => testGeminiImage('gemini-3.1-flash-image', 'gemini31'));
  await run('img-gemini-2.5-flash-image', () => testGeminiImage('gemini-2.5-flash-image', 'gemini25'));
  await run('img-nano-banana-pro', () => testGeminiImage('nano-banana-pro-preview', 'nanobananapro'));
  await run('img-imagen-4-fast', () => testImagen('imagen-4.0-fast-generate-001', 'imagen4fast'));
  await run('tts-burst', () => testTtsBurst(5));

  console.log('\n=== SUMMARY ===');
  for (const [k, v] of Object.entries(results)) console.log(`${k}: ${v}`);
}

main();
