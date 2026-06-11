// Assembles the final demo video from recorded webm clips + per-scene narration.
// For each scene: normalize the clip to 1080p H.264, retime it to the narration
// duration (speed up long app clips with setpts; freeze-pad short ones), trim a
// per-scene head offset (to skip login lead-ins), then mux that scene's narration.
// Finally concat all scenes with a tiny crossfade-free hard cut and export mp4.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const FF = "/opt/homebrew/bin/ffmpeg";
const FP = "/opt/homebrew/bin/ffprobe";
const CLIPS = "/tmp/teachflow-video/clips";
const AUDIO = "/tmp/teachflow-video/audio";
const SCENES = "/tmp/teachflow-video/scenes";
const FINAL = "/tmp/teachflow-video/final";
mkdirSync(SCENES, { recursive: true });
mkdirSync(FINAL, { recursive: true });

const W = 1920, H = 1080, FPS = 30;

type Scene = {
  name: string;          // narration key
  clip: string;          // webm basename (without ext) OR card png/none
  head?: number;         // seconds to trim from clip start (skip login)
  tail?: number;         // seconds to trim from clip end
  pad?: number;          // extra seconds of narration silence appended (breathing room)
  minSpeed?: number;     // don't speed up faster than this (keep readable). default 1
  maxSpeed?: number;     // cap speed-up. default 8
};

// Scene order = final video order.
const ORDER: Scene[] = [
  { name: "card-open", clip: "card-open", pad: 1.2 },
  { name: "landing", clip: "landing", pad: 1.4 },
  // App clips: keep speed gentle (cap at 1.6x) so the UI stays readable; the
  // recorded footage is long enough to fill the narration at near-1x.
  { name: "studio-anna", clip: "studio-anna", head: 6.5, pad: 1.2, maxSpeed: 1.6 },
  { name: "chat-focus", clip: "chat-focus", head: 5.5, pad: 1.2, maxSpeed: 1.6 },
  { name: "chat-homework", clip: "chat-homework", head: 5.5, pad: 1.2, maxSpeed: 1.6 },
  { name: "share", clip: "share", pad: 1.0, maxSpeed: 2.6 },
  { name: "chat-results", clip: "chat-results", head: 5.5, pad: 1.2, maxSpeed: 1.6 },
  { name: "autonomous-artifacts", clip: "autonomous-artifacts", head: 6.5, pad: 1.2, maxSpeed: 1.6 },
  { name: "evals", clip: "evals", pad: 1.0 },
  { name: "arch", clip: "arch", pad: 1.2 },
  { name: "card-closing", clip: "card-closing", pad: 1.4 },
];

function dur(path: string): number {
  return parseFloat(execFileSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString().trim());
}
function dims(path: string): { w: number; h: number } {
  const out = execFileSync(FP, ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path]).toString().trim();
  const [w, h] = out.split("x").map(Number);
  return { w, h };
}
function run(args: string[]) { execFileSync(FF, args, { stdio: ["ignore", "ignore", "inherit"] }); }

const manifest = JSON.parse(readFileSync(`${AUDIO}/manifest.json`, "utf8")) as Record<string, { duration: number }>;

function buildScene(s: Scene): string {
  const out = `${SCENES}/${s.name}.mp4`;
  const narr = `${AUDIO}/${s.name}.wav`;
  const narrDur = manifest[s.name].duration;
  const pad = s.pad ?? 0.4;
  const targetVisual = narrDur + pad; // video should last this long

  const clipPath = `${CLIPS}/${s.clip}.webm`;
  if (!existsSync(clipPath)) throw new Error(`missing clip ${clipPath}`);

  const rawDur = dur(clipPath);
  const { w: rawW, h: rawH } = dims(clipPath);
  const head = s.head ?? 0;
  const tail = s.tail ?? 0;
  const usable = Math.max(0.5, rawDur - head - tail);

  // Decide retiming. If the usable footage is longer than target, speed it up
  // (PTS factor < 1). If shorter, slow slightly or freeze-pad the last frame.
  const minSpeed = s.minSpeed ?? 1;
  const maxSpeed = s.maxSpeed ?? 8;
  let speed = usable / targetVisual; // playback speed multiplier
  speed = Math.min(Math.max(speed, minSpeed), maxSpeed);
  const ptsFactor = 1 / speed; // setpts multiplier

  // After speeding, the clip lasts usable/speed. If still shorter than target,
  // we tpad (freeze last frame) to reach target. If longer (speed capped), we
  // trim to target.
  const afterSpeed = usable / speed;
  const needPad = Math.max(0, targetVisual - afterSpeed);

  // Build narration audio: the scene narration + (pad) silence so audio matches targetVisual.
  const sceneAudio = `${SCENES}/${s.name}.audio.wav`;
  run(["-y", "-i", narr, "-af", `apad=pad_dur=${pad.toFixed(3)}`, sceneAudio]);

  // The recorded webm canvas is 2880x1620 but the page (deviceScaleFactor 2,
  // CSS viewport 1440x810) only fills the top-left 2880x1620 quadrant... no:
  // the content fills the top-left HALF in each axis -> a 1440x810 region at
  // 0,0. Crop that region, then upscale to 1920x1080. Cards are authored at
  // 1440x810 so they have the SAME quadrant layout — crop applies uniformly.
  const cw = Math.round(rawW / 2);
  const ch = Math.round(rawH / 2);
  const vf = [
    `trim=start=${head.toFixed(3)}:duration=${usable.toFixed(3)}`,
    `setpts=(PTS-STARTPTS)*${ptsFactor.toFixed(5)}`,
    `crop=${cw}:${ch}:0:0`,
    `fps=${FPS}`,
    `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos`,
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0a0a0f`,
    needPad > 0.05 ? `tpad=stop_mode=clone:stop_duration=${needPad.toFixed(3)}` : null,
    `trim=duration=${targetVisual.toFixed(3)}`,
    `setsar=1`,
  ].filter(Boolean).join(",");

  run([
    "-y",
    "-i", clipPath,
    "-i", sceneAudio,
    "-filter_complex", `[0:v]${vf}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-shortest", "-movflags", "+faststart",
    out,
  ]);
  const od = dur(out);
  console.log(`scene ${s.name}: raw=${rawDur.toFixed(1)} usable=${usable.toFixed(1)} narr=${narrDur.toFixed(1)} speed=${speed.toFixed(2)}x pad=${needPad.toFixed(1)} -> ${od.toFixed(1)}s`);
  return out;
}

// Special arch scene: slow pan across the full-res architecture diagram so the
// labels are legible (the reviewer flagged the fit-whole diagram as too small).
function buildArchScene(): string {
  const out = `${SCENES}/arch.mp4`;
  const narr = `${AUDIO}/arch.wav`;
  const png = "/tmp/teachflow-video/cards/architecture.png";
  const narrDur = manifest["arch"].duration;
  const pad = 1.2;
  const total = narrDur + pad;
  const sceneAudio = `${SCENES}/arch.audio.wav`;
  run(["-y", "-i", narr, "-af", `apad=pad_dur=${pad}`, sceneAudio]);
  // architecture.png is ~2386x980. Scale it up so text is large, place on a dark
  // canvas, and slowly pan left→right with a gentle zoom (Ken Burns).
  const frames = Math.round(total * FPS);
  // Render the diagram at a height that fills most of the frame, white card behind.
  const vf =
    `scale=2600:-1:flags=lanczos,` +
    `pad=2680:1140:40:80:color=white,` +              // white card padding around diagram
    `scale=2680:-1,` +
    `zoompan=z='min(zoom+0.0002,1.18)':` +
    `x='(iw-iw/zoom)*(on/${frames})':y='ih/2-(ih/zoom)/2':` +
    `d=${frames}:s=${W}x${H}:fps=${FPS},` +
    `setsar=1`;
  run(["-y", "-loop", "1", "-i", png, "-i", sceneAudio,
    "-filter_complex", `[0:v]${vf}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-t", total.toFixed(3), "-movflags", "+faststart", out]);
  console.log(`scene arch (zoompan): -> ${dur(out).toFixed(1)}s`);
  return out;
}

// Concat with short crossfade transitions between every scene (video xfade +
// audio acrossfade). Builds the filter graph incrementally.
function concatXfade(scenes: string[], finalOut: string, xf = 0.4) {
  const durs = scenes.map(dur);
  const inputs: string[] = [];
  for (const s of scenes) { inputs.push("-i", s); }
  const fc: string[] = [];
  // normalize each input label
  scenes.forEach((_, i) => {
    fc.push(`[${i}:v]settb=AVTB,fps=${FPS},format=yuv420p[v${i}]`);
    fc.push(`[${i}:a]aresample=48000,asettb=AVTB[a${i}]`);
  });
  let vPrev = "v0", aPrev = "a0";
  let offset = durs[0] - xf;
  for (let i = 1; i < scenes.length; i++) {
    const vOut = i === scenes.length - 1 ? "vout" : `vx${i}`;
    const aOut = i === scenes.length - 1 ? "aout" : `ax${i}`;
    fc.push(`[${vPrev}][v${i}]xfade=transition=fade:duration=${xf}:offset=${offset.toFixed(3)}[${vOut}]`);
    fc.push(`[${aPrev}][a${i}]acrossfade=d=${xf}[${aOut}]`);
    vPrev = vOut; aPrev = aOut;
    offset += durs[i] - xf;
  }
  // Normalize narration loudness to ~ -16 LUFS for consistent playback volume.
  fc.push(`[aout]loudnorm=I=-16:TP=-1.5:LRA=11[aoutn]`);
  run(["-y", ...inputs, "-filter_complex", fc.join(";"),
    "-map", "[vout]", "-map", "[aoutn]",
    "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", finalOut]);
}

function main() {
  const built: string[] = [];
  for (const s of ORDER) {
    if (s.name === "arch") { built.push(buildArchScene()); continue; }
    if (!existsSync(`${CLIPS}/${s.clip}.webm`)) { console.log(`SKIP ${s.name} (no clip)`); continue; }
    built.push(buildScene(s));
  }
  const finalOut = `${FINAL}/teachflow-demo.mp4`;
  concatXfade(built, finalOut, 0.4);
  const total = dur(finalOut);
  console.log(`\nFINAL: ${finalOut}  ${Math.floor(total/60)}:${String(Math.round(total%60)).padStart(2,"0")} (${total.toFixed(1)}s), ${built.length} scenes`);
}
main();
