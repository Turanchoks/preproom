# Media Generation Guide: TTS + Image Gen via @google/genai (Gemini API key)

Verified 2026-06-11 against the key in `.env.local` (`GOOGLE_API_KEY`, Gemini API — **not** Vertex),
SDK `@google/genai@2.8.0` (installed). Reference test script: `docs/harvest/test-media-gen.ts`
(run `npx tsx docs/harvest/test-media-gen.ts [test-name...]` from the teachflow root; outputs in `docs/harvest/out/`).

## TL;DR — verified status on THIS key

| Capability | Model | Status on this key | Latency (measured) |
|---|---|---|---|
| TTS single voice | `gemini-2.5-flash-preview-tts` | **WORKS** | 1.5–3.2 s per clip |
| TTS single voice | `gemini-3.1-flash-tts-preview` | **WORKS** | ~3.9 s |
| TTS multi-speaker (2 voices) | `gemini-2.5-flash-preview-tts` | **WORKS** (one transient 500, retry succeeded) | ~2.7 s |
| Image (generateContent) | `gemini-3.1-flash-image`, `gemini-2.5-flash-image`, `nano-banana-pro-preview` | **BLOCKED — 429 `free_tier ... limit: 0`** | — |
| Image (generateImages) | `imagen-4.0-fast-generate-001` | **BLOCKED — 400 "only available on paid plans"** | — |

**Critical finding: this key's project is on the FREE TIER.** Image models are listed by
`models.list` but have **zero free-tier quota** (the 429 says `limit: 0` — that is "not offered
on free tier", not "quota used up"). Imagen rejects free tier outright with a 400.
**To demo images today you must enable billing on the project** (https://aistudio.google.com →
project settings → set up billing; takes effect in minutes and bumps you to Tier 1, which also
relaxes the tight TTS rate limit below). TTS works on the free tier right now.

**Recommendations** (once billed; TTS recs apply now):
- (a) Vocab/sentence TTS clips → **`gemini-2.5-flash-preview-tts`** (fastest verified, stable, auto-detects language incl. Spanish, 30 voices). Voice: `Kore` (firm/clear) or `Leda`/`Puck` for friendlier tone.
- (b) Flashcard illustrations → **`gemini-3.1-flash-image`** via `generateContent` ("optimized for speed and high-volume use" per docs, ~$0.04/image class, supports `1:1` + `512`/`1K` sizes). `imagen-4.0-fast-generate-001` is the cheap/fast alternative via the separate `generateImages` API, but it has fewer aspect/size options on Gemini API and no conversational editing. For a hackathon, one API shape (`generateContent`) for everything is simpler.

---

## 1. Text-to-speech

### 1.1 Single-speaker call (VERIFIED working)

```ts
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-preview-tts',
  // style instructions go in the text itself ("Say cheerfully: ...", "[whispers]", etc.)
  contents: [{ parts: [{ text: 'Say cheerfully: ¡Hola! ¿Cómo estás?' }] }],
  config: {
    responseModalities: ['AUDIO'],            // REQUIRED — TTS models only output audio
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      // languageCode: 'es-ES',               // optional; language is auto-detected from text
    },
  },
});

const inline = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
// inline.mimeType === 'audio/L16;codec=pcm;rate=24000'  (2.5-flash-preview-tts, verified)
//                  or 'audio/l16; rate=24000; channels=1' (3.1-flash-tts-preview, verified)
const pcm = Buffer.from(inline!.data!, 'base64'); // RAW PCM: 16-bit LE, 24 kHz, mono — NOT playable as-is
```

A bare string for `contents` also works (`contents: 'la manzana'` — verified in the burst test).

### 1.2 Output format and WAV wrapping (VERIFIED)

Output is **raw 16-bit little-endian PCM, 24,000 Hz, mono** — there is no MP3 option and no
container. Browsers can't play it raw; prepend a 44-byte WAV header (verified playable, `afinfo`
confirms `1 ch, 24000 Hz, Int16`):

```ts
function pcmToWav(pcm: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // fmt chunk size
  header.writeUInt16LE(1, 20);           // audio format 1 = PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
```

In a Next.js route handler, return it directly:

```ts
return new Response(new Uint8Array(pcmToWav(pcm)), {
  headers: { 'Content-Type': 'audio/wav' },
});
// or client-side data URL: `data:audio/wav;base64,${pcmToWav(pcm).toString('base64')}`
```

WAV at 24 kHz/16-bit is ~48 KB/s (~240 KB for a 5 s clip) — fine for a demo. Skip MP3; encoding
would need ffmpeg/lamejs for marginal gain.

### 1.3 Voices (30 prebuilt; names are case-sensitive)

Good picks for language-learning clips: **Kore** (firm, clear — verified), **Puck** (upbeat),
**Zephyr** (bright), **Leda** (youthful), **Charon** (informative), **Aoede** (breezy).
Full list from ai.google.dev/gemini-api/docs/speech-generation: Zephyr, Puck, Charon, Kore,
Fenrir, Leda, Orus, Aoede, Callirrhoe, Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina,
Erinome, Algenib, Rasalgethi, Laomedeia, Achernar, Alnilam, Schedar, Gacrux, Pulcherrima, Achird,
Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat.
Language is auto-detected (60+ languages, all relevant ones incl. es/fr/de/ru). Style, accent,
pace are steered by natural-language instructions in the prompt text, not config fields.

### 1.4 Multi-speaker (VERIFIED working — exactly 2 speakers)

Speaker labels in the transcript must match `speaker` names in config. Useful for dialogue
exercises. Mutually exclusive with `voiceConfig`.

```ts
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash-preview-tts',
  contents: [{ parts: [{ text:
`TTS the following conversation between Ana and Ben:
Ana: ¿Dónde está la biblioteca?
Ben: Está al lado del parque.` }] }],
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
});
```

### 1.5 Rate limits — YES, they bite (MEASURED, not from docs)

A burst of 5 parallel single-word clips on this key returned 429s with the exact quota:

> `Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 3, model: gemini-2.5-flash-tts. Please retry in 2.5s`

So the free tier allows **3 requests/min** for the TTS model (sliding window — the "retry in
~2.5 s" hint shows it recovers quickly, and interleaved requests did succeed). For **~10 clips
per homework** on the free tier you MUST serialize with retry-on-429; expect **~3–4 minutes**
total. On Tier 1 (billing enabled) limits jump enough that a concurrency of 3–5 with the same
retry loop finishes in ~10–15 s. Working throttle pattern:

```ts
async function ttsWithRetry(text: string, voiceName = 'Kore', maxAttempts = 5): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: text,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      });
      const data = r.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!data) throw new Error('empty audio response'); // happens occasionally — retry (observed once)
      return Buffer.from(data, 'base64');
    } catch (e) {
      if (attempt >= maxAttempts) throw e;
      const msg = String(e);
      const hinted = msg.match(/retry in (\d+(?:\.\d+)?)s/i);     // server tells you how long
      const is429or5xx = /429|500|503|RESOURCE_EXHAUSTED|INTERNAL|empty audio/.test(msg);
      if (!is429or5xx) throw e;
      await new Promise((res) => setTimeout(res, hinted ? +hinted[1] * 1000 + 250 : 2000 * attempt));
    }
  }
}

// generate clips sequentially (free tier) — bump concurrency to ~4 once billing is on
for (const item of homeworkItems) {
  item.audio = pcmToWav(await ttsWithRetry(item.sentence));
}
```

Observed failure modes you must handle (all hit during testing): 429 RESOURCE_EXHAUSTED,
transient 500 INTERNAL (multi-speaker, succeeded on retry), and a 200 response with **no
inlineData part** (treat as retryable).

Latency: ~1.5–2 s for single words, ~3–4 s for a sentence (`gemini-2.5-flash-preview-tts`);
`gemini-3.1-flash-tts-preview` measured slightly slower (~3.9 s) with no quality need for short
clips — stick with 2.5.

---

## 2. Image generation

> **NOT runnable on this key until billing is enabled** — every image model 429s with
> `free_tier ... limit: 0` (Gemini image models) or 400 "only available on paid plans" (Imagen).
> The call shapes below are exact per the installed SDK 2.8.0 type definitions
> (`node_modules/@google/genai/dist/genai.d.ts`) and ai.google.dev docs; the requests were
> accepted by the API up to the quota check. After enabling billing, re-verify with
> `npx tsx docs/harvest/test-media-gen.ts img-gemini-3.1-flash-image img-imagen-4-fast`.

### 2.1 Gemini image models via `generateContent` (recommended)

`gemini-3.1-flash-image` (fast, recommended) / `gemini-2.5-flash-image` / `nano-banana-pro-preview`
(= gemini-3-pro-image: highest quality, slowest/priciest — overkill for flashcards).

```ts
const response = await ai.models.generateContent({
  model: 'gemini-3.1-flash-image',
  contents:
    'A simple, friendly flat-style flashcard illustration of a red apple on a plain white background, minimal, clean vector look',
  config: {
    responseModalities: ['IMAGE'],          // or ['TEXT', 'IMAGE'] to also get a caption part
    imageConfig: { aspectRatio: '1:1' },    // SDK 2.8.0 field name (see gotcha below)
  },
});

// Image arrives as an inlineData part (base64 PNG). With ['TEXT','IMAGE'] there may be a
// text part first — find the inlineData part, don't assume parts[0].
const imgPart = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
const png = Buffer.from(imgPart!.inlineData!.data!, 'base64'); // mimeType: image/png
```

- `imageConfig.aspectRatio` (SDK 2.8.0 .d.ts): `"1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "9:16" | "16:9" | "21:9"` (3.1-flash adds more, e.g. `4:5`, `5:4`).
- `imageConfig.imageSize`: `"1K"` (default) / `"2K"` / `"4K"`; 3.1-flash also accepts `"512"` — **uppercase K required**, lowercase is rejected. For flashcards use `'1:1'` + `'512'` or `'1K'` (fastest, smallest).
- `imageConfig.personGeneration`: `'ALLOW_ALL' | 'ALLOW_ADULT' | 'ALLOW_NONE'` (string, per .d.ts). Irrelevant for object/scene flashcards; leave unset.
- **Gotcha:** current ai.google.dev JS samples show `config.responseFormat.image.{aspectRatio,imageSize}` — that is a newer SDK's shape. The installed **2.8.0** exposes `config.imageConfig` (`GenerateContentConfig.imageConfig?: ImageConfig`, genai.d.ts line ~4742). Use `imageConfig`; don't paste docs samples blindly.
- Multi-turn editing works by passing prior images back as `inlineData` parts or via `ai.chats.create({ model: 'gemini-3.1-flash-image', ... })` — useful for "same character, different scene" consistency across a flashcard set.
- Cost/latency class: Gemini flash image models ≈ $0.04 per 1K image (1290 output tokens), typically 5–15 s per image. gemini-3-pro-image/nano-banana-pro ≈ 3× the price and slower, with thinking enabled by default.

### 2.2 Imagen via `ai.models.generateImages` (alternative)

Separate, purpose-built API. `imagen-4.0-fast-generate-001` is the cheapest/fastest (~$0.02/image).
Paid tier ONLY on Gemini API (verified: free tier → 400).

```ts
const response = await ai.models.generateImages({
  model: 'imagen-4.0-fast-generate-001',
  prompt: 'A simple flat-style flashcard illustration of a red apple, white background',
  config: {
    numberOfImages: 1,                      // 1–4
    aspectRatio: '1:1',                     // '1:1' | '3:4' | '4:3' | '9:16' | '16:9' (only these 5)
    personGeneration: 'allow_adult',        // 'dont_allow' | 'allow_adult' | 'allow_all'
    // imageSize: '1K',                     // '1K' | '2K'
    // outputMimeType: 'image/jpeg', outputCompressionQuality: 80,  // default is PNG
  },
});

const img = response.generatedImages?.[0]?.image;
const bytes = Buffer.from(img!.imageBytes!, 'base64');   // NOTE: field is imageBytes, not inlineData
```

Differences vs generateContent: response shape is `generatedImages[].image.imageBytes`
(+ `.mimeType`); supports `numberOfImages` natively (cheap way to get variants); no
conversational editing, no text part, prompt-only. Blocked images come back with
`raiFilteredReason` if you set `includeRaiReason: true`.

### 2.3 Which for flashcards?

**`gemini-3.1-flash-image`.** Reasons: docs position it as the speed/high-volume model; `512`
size option keeps flashcards fast and small; same `generateContent` + `inlineData` handling as
everything else in the app; conversational follow-ups for style consistency. Use
`imagen-4.0-fast-generate-001` instead if you need 4 variants per call or hit issues with the
preview model. Either way the image models share the project's per-minute quota — apply the same
retry-on-429 wrapper, concurrency ≤ 2 for a 10-card set.

Prompt template that suits flashcards (keeps backgrounds clean for UI overlay):
`"Simple flat vector-style illustration of {word}, single subject centered on a plain white background, bright friendly colors, no text, minimal detail"`.
Adding "no text" matters — these models love rendering captions.

---

## 3. Hackathon plan (today)

1. **Now, free tier:** ship TTS with `gemini-2.5-flash-preview-tts`, sequential generation + the
   retry wrapper (3 RPM → ~3.5 min for a 10-clip homework; generate at homework-creation time and
   cache the WAVs, never at click time).
2. **Enable billing on the project** (AI Studio → API keys → project → upgrade). This unblocks
   all image models AND lifts TTS to Tier-1 limits so a 10-clip homework takes seconds.
3. **Then:** images via `gemini-3.1-flash-image`, `imageConfig: { aspectRatio: '1:1', imageSize: '1K' }`,
   re-verify with the kept test script.
4. Cache everything by content hash (text+voice / prompt) — quota is the scarce resource today.
