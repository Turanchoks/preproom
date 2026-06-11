/**
 * Generate TutorRoom brand/interface imagery via the Gemini image API.
 *
 *   npx tsx scripts/gen-brand-images.ts            # all images
 *   npx tsx scripts/gen-brand-images.ts hero og    # only named targets
 *
 * Primary model: gemini-3.1-flash-image (generateContent, inlineData base64 PNG).
 * Fallback: imagen-4.0-fast-generate-001 (generateImages, imageBytes).
 * Outputs land in public/brand/.
 */
import { config as loadEnv } from "dotenv";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GoogleGenAI } from "@google/genai";

loadEnv({ path: ".env.local" });

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("GOOGLE_API_KEY missing from .env.local");
  process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const OUT_DIR = join(process.cwd(), "public", "brand");
mkdirSync(OUT_DIR, { recursive: true });

const STYLE =
  "Premium modern flat vector illustration, warm education-tech aesthetic, " +
  "gentle smooth gradients, soft rounded geometric shapes, indigo and teal palette " +
  "with warm coral accents, clean uncluttered composition. " +
  "Absolutely no text, no letters, no numbers, no typography, no logos, no watermark, no signature.";

interface Spec {
  name: string;
  file: string;
  aspectRatio: string;
  imageSize: "512" | "1K";
  prompt: string;
}

const SPECS: Spec[] = [
  {
    name: "hero",
    file: "hero.png",
    aspectRatio: "16:9",
    imageSize: "1K",
    prompt:
      "Wide abstract-but-warm hero illustration of an AI teaching studio. " +
      "Split-panel motif: on the left, a stylized conversation panel made of rounded empty speech bubbles " +
      "stacked vertically; on the right, a lesson-materials canvas with abstract blank document cards, " +
      "a small chart shape and flashcard tiles. A soft glowing four-point sparkle bridges the two panels " +
      "in the middle, with thin flowing connector lines. Background is a gentle diagonal gradient from " +
      "deep indigo to teal with a subtle warm coral glow in one corner. One or two tiny stylized human " +
      "silhouettes (no facial detail, seen from afar) near the panels for scale. Calm, airy, balanced. " +
      STYLE,
  },
  {
    name: "og",
    file: "og.png",
    aspectRatio: "16:9",
    imageSize: "1K",
    prompt:
      "Calm social-card background. A single smooth, velvety, evenly blended diagonal gradient from " +
      "deep indigo (top-left) to soft teal (bottom-right) filling the whole frame, with a faint warm " +
      "coral glow only in the extreme bottom-right corner. No light beams, no streaks, no bands, " +
      "no rainbow effect, no lens flares — just one seamless quiet gradient. " +
      "In the right third only: a sparse, subtle cluster of minimal education motifs — a small open book, " +
      "a rounded empty speech bubble, and a glowing four-point sparkle — drawn as soft translucent flat " +
      "shapes, slightly luminous, floating gently. The entire left and center of the image must remain " +
      "completely clean, empty gradient space with no shapes at all (a headline will be overlaid there later). " +
      STYLE,
  },
  {
    name: "empty-students",
    file: "empty-students.png",
    aspectRatio: "1:1",
    imageSize: "512",
    prompt:
      "Small friendly spot illustration that reads clearly at 200 pixels: a single stylized teacher " +
      "figure (simple rounded geometric body, minimal dot-style face, no detailed features) sitting at a " +
      "small simple desk, with one softly glowing four-point AI sparkle floating beside their shoulder. " +
      "Centered subject with generous empty margins on all sides. Very light, near-white plain background " +
      "(no scene, no floor line clutter, at most a soft shadow ellipse under the desk). Minimal detail, " +
      "thick simple shapes. " +
      STYLE,
  },
  {
    name: "empty-canvas",
    file: "empty-canvas.png",
    aspectRatio: "1:1",
    imageSize: "512",
    prompt:
      "Small friendly spot illustration that reads clearly at 200 pixels: a simple wooden-style artist " +
      "easel holding a completely blank white canvas, with a single softly glowing four-point sparkle " +
      "floating just above one corner of the canvas. Centered subject with generous empty margins. " +
      "Very light, near-white plain background, at most a soft shadow ellipse under the easel. " +
      "Minimal detail, thick simple shapes, the canvas surface must be empty white. " +
      STYLE,
  },
];

const GEMINI_MODEL = "gemini-3.1-flash-image";
const IMAGEN_MODEL = "imagen-4.0-fast-generate-001";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(e: unknown): boolean {
  const msg = String(e);
  return /429|500|503|RESOURCE_EXHAUSTED|INTERNAL|UNAVAILABLE|no image part/i.test(msg);
}

/**
 * The Gemini image API has been observed returning JPEG bytes even when the
 * declared mimeType is image/png. Since our output files are .png, transcode
 * anything that isn't actually a PNG (PNG magic: 89 50 4E 47) using macOS sips.
 */
function ensurePng(buf: Buffer, outPath: string): void {
  writeFileSync(outPath, buf);
  const isPng = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) {
    if (process.platform === "darwin") {
      execFileSync("sips", ["-s", "format", "png", outPath, "--out", outPath], { stdio: "ignore" });
    } else {
      console.warn(`  WARNING: ${outPath} is not PNG-encoded (likely JPEG); convert manually.`);
    }
  }
}

async function genViaGemini(spec: Spec): Promise<Buffer> {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: spec.prompt,
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: spec.aspectRatio, imageSize: spec.imageSize },
    },
  });
  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData?.data) throw new Error("no image part in response");
  return Buffer.from(part.inlineData.data, "base64");
}

async function genViaImagen(spec: Spec): Promise<Buffer> {
  const response = await ai.models.generateImages({
    model: IMAGEN_MODEL,
    prompt: spec.prompt,
    config: {
      numberOfImages: 1,
      aspectRatio: spec.aspectRatio as "1:1" | "16:9",
      imageSize: "1K",
    },
  });
  const bytes = response.generatedImages?.[0]?.image?.imageBytes;
  if (!bytes) throw new Error("no image bytes in Imagen response");
  return Buffer.from(bytes, "base64");
}

async function generate(spec: Spec): Promise<{ model: string; ms: number; bytes: number }> {
  const start = Date.now();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const png = await genViaGemini(spec);
      const out = join(OUT_DIR, spec.file);
      ensurePng(png, out);
      return { model: GEMINI_MODEL, ms: Date.now() - start, bytes: png.length };
    } catch (e) {
      lastErr = e;
      console.warn(`  [${spec.name}] ${GEMINI_MODEL} attempt ${attempt} failed: ${String(e).slice(0, 200)}`);
      if (!isRetryable(e)) break;
      const hinted = String(e).match(/retry in (\d+(?:\.\d+)?)s/i);
      await sleep(hinted ? +hinted[1] * 1000 + 250 : 2000 * attempt);
    }
  }
  console.warn(`  [${spec.name}] falling back to ${IMAGEN_MODEL}`);
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const png = await genViaImagen(spec);
      const out = join(OUT_DIR, spec.file);
      ensurePng(png, out);
      return { model: IMAGEN_MODEL, ms: Date.now() - start, bytes: png.length };
    } catch (e) {
      lastErr = e;
      console.warn(`  [${spec.name}] ${IMAGEN_MODEL} attempt ${attempt} failed: ${String(e).slice(0, 200)}`);
      if (!isRetryable(e)) break;
      await sleep(2000 * attempt);
    }
  }
  throw lastErr;
}

async function main() {
  const wanted = process.argv.slice(2);
  const specs = wanted.length ? SPECS.filter((s) => wanted.includes(s.name)) : SPECS;
  if (!specs.length) {
    console.error(`No matching targets. Available: ${SPECS.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }
  const t0 = Date.now();
  for (const spec of specs) {
    console.log(`Generating ${spec.name} (${spec.aspectRatio}, ${spec.imageSize})...`);
    const r = await generate(spec);
    console.log(
      `  -> public/brand/${spec.file}  ${(r.bytes / 1024).toFixed(0)} KB  via ${r.model}  in ${(r.ms / 1000).toFixed(1)}s`,
    );
  }
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s total.`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
