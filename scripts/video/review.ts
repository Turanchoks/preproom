// Uploads the demo mp4 to the Gemini Files API and asks gemini-3.5-flash to
// critique it as a hackathon-video judge. Prints a structured verdict.
import { config } from "dotenv";
config({ path: ".env.local" });

import { GoogleGenAI } from "@google/genai";
import { readFileSync } from "node:fs";

const MODEL = process.env.REVIEW_MODEL || "gemini-3.5-flash";
const VIDEO = process.argv[2] || "/tmp/tutorroom-video/final/tutorroom-demo.mp4";

const PROMPT = `You are a demanding hackathon-video judge reviewing a 3-minute product demo for "TutorRoom", an AI teaching studio. Watch the WHOLE video (audio + visuals) closely, roughly scene by scene.

Score it 1-10 overall, then give specific, actionable feedback. Be concrete with timestamps.

Check explicitly for each of these REQUIRED beats and say PRESENT/WEAK/MISSING for each:
1. Problem + metric (tutors lose ~45 min/student on prep)
2. Agent memory grounded in evidence (per-student facts with sources)
3. Homework generation (targeting errors, with media exercises)
4. Student does homework with instant feedback + real generated audio/image
5. Closed results loop (homework results flow back as memory facts)
6. The AUTONOMOUS beat (agent drafted next lesson + homework while teacher away)
7. Trust / evals (100% schema validity, 4.47/5 pedagogy)
8. Architecture (one Cloud Run service: ADK, MCP, Gemini, Cloud SQL, GCS, Pub/Sub)
9. Pricing shown
10. Strong closing line

Also flag: pacing problems, DEAD AIR (silence/static screens), UNREADABLE text (too fast/small), audio-narration sync issues, and any scene that drags or is too rushed.

End with a section "TOP 3 FIXES" — the three highest-impact changes, ranked. Keep it under 450 words.`;

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  console.error(`Uploading ${VIDEO} ...`);
  const uploaded = await ai.files.upload({ file: VIDEO, config: { mimeType: "video/mp4" } });
  // wait for ACTIVE
  let file = uploaded;
  for (let i = 0; i < 60; i++) {
    file = await ai.files.get({ name: uploaded.name! });
    if (file.state === "ACTIVE") break;
    if (file.state === "FAILED") throw new Error("file processing failed");
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error(`File state: ${file.state}. Asking ${MODEL} for review...\n`);

  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { role: "user", parts: [
        { fileData: { mimeType: "video/mp4", fileUri: file.uri! } },
        { text: PROMPT },
      ] },
    ],
  });
  console.log(resp.text);
}
main().catch((e) => { console.error("REVIEW ERROR:", String(e).slice(0, 400)); process.exit(1); });
