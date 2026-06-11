// Writes /tmp/tutorroom-video/scene-manifest.json describing the assembled video.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FP = "/opt/homebrew/bin/ffprobe";
const BASE = "/tmp/tutorroom-video";
const dur = (p: string) =>
  parseFloat(execFileSync(FP, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p]).toString().trim());

const audio = JSON.parse(readFileSync(`${BASE}/audio/manifest.json`, "utf8")) as Record<string, { duration: number; text: string }>;

const DESC: Record<string, string> = {
  "card-open": "Opening title card — product name + one-line promise",
  landing: "Landing page: hero scroll to pricing ($19/$49/$199 tiers)",
  "studio-anna": "Studio with Anna selected: Profile + Memory tab (facts w/ source badges) + Activity",
  "chat-focus": "Teacher asks “What should we focus on next?”; pans Memory error facts the answer is grounded in (evidence reconstruction)",
  "chat-homework": "Teacher asks to create homework targeting past-tense errors w/ listening + image; shows resulting Artifacts (evidence reconstruction)",
  share: "Public /s/anna-homework: Start, MCQ with instant red/green feedback, listening (Gemini TTS) + image flashcard (Gemini image)",
  "chat-results": "Teacher asks “How did Anna do?”; pans Memory “from homework results” facts — the closed loop (evidence reconstruction)",
  "autonomous-artifacts": "THE BEAT: Artifacts proactively drafted from video analysis + proactive memory note",
  evals: "Trust card: 100% schema validity, 4.47/5 pedagogy (golden eval)",
  arch: "Architecture diagram (Ken-Burns pan): one Cloud Run service — ADK, MCP, Gemini, Cloud SQL, GCS, Pub/Sub",
  "card-closing": "Closing card: “45 minutes of prep, down to zero.”",
};

const ORDER = ["card-open", "landing", "studio-anna", "chat-focus", "chat-homework", "share", "chat-results", "autonomous-artifacts", "evals", "arch", "card-closing"];
const XF = 0.4;
let start = 0;
const scenes = ORDER.map((name, i) => {
  const scenePath = `${BASE}/scenes/${name}.mp4`;
  const d = existsSync(scenePath) ? dur(scenePath) : 0;
  const entry = {
    idx: i + 1,
    scene: name,
    startApprox: Math.round(start * 10) / 10,
    durationSec: Math.round(d * 10) / 10,
    narrationSec: Math.round((audio[name]?.duration ?? 0) * 10) / 10,
    source: name === "arch" ? "clips/(architecture.png)" : `clips/${name}.webm`,
    description: DESC[name] || "",
    narration: audio[name]?.text ?? "",
  };
  start += d - XF;
  return entry;
});

const finalPath = `${BASE}/final/tutorroom-demo.mp4`;
const total = dur(finalPath);
const manifest = {
  video: "final/tutorroom-demo.mp4",
  recordedAgainst: "http://localhost:3000 (fully TutorRoom-branded dev server; viewport-only recording, URLs never visible)",
  resolution: "1920x1080",
  fps: 30,
  codec: "H.264 high / AAC stereo 48k loudnorm -16 LUFS",
  durationSec: Math.round(total * 10) / 10,
  duration: `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}`,
  transitions: "0.4s crossfades between all scenes",
  sceneCount: scenes.length,
  scenes,
};
writeFileSync(`${BASE}/scene-manifest.json`, JSON.stringify(manifest, null, 2));
console.log(`manifest written: ${BASE}/scene-manifest.json (${manifest.duration})`);
