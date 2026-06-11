// Generates standalone HTML pages (title cards + architecture full-screen) into
// /tmp/preproom-video/cards. Recorded/screenshotted by the recorder.
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const CARDS = "/tmp/preproom-video/cards";
mkdirSync(CARDS, { recursive: true });

// Copy architecture.png next to the arch card so file:// can load it.
copyFileSync(resolve("docs/architecture.png"), `${CARDS}/architecture.png`);

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;

function titleCard(opts: { title: string; subtitle?: string; kicker?: string; file: string; accent?: string }) {
  const accent = opts.accent ?? "#3b82f6";
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1440px; height:810px; overflow:hidden; }
  body { background:#0a0a0f; color:#fff; font-family:${FONT};
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    background-image: radial-gradient(circle at 50% 35%, rgba(59,130,246,0.16), transparent 60%); }
  .kicker { font-size:18px; letter-spacing:0.28em; text-transform:uppercase; color:${accent};
    font-weight:600; margin-bottom:28px; }
  h1 { font-size:64px; font-weight:700; line-height:1.08; text-align:center; max-width:1040px;
    letter-spacing:-0.02em; }
  p { margin-top:26px; font-size:26px; color:#9ca3af; text-align:center; max-width:880px; line-height:1.4; }
  .dot { position:absolute; bottom:54px; display:flex; align-items:center; gap:12px; color:#6b7280; font-size:18px; }
  .logo { width:34px; height:34px; border-radius:9px; background:#111827; display:flex; align-items:center; justify-content:center;
    color:#fff; font-weight:700; font-size:18px; border:1px solid #1f2937; }
  .brand { font-weight:600; color:#e5e7eb; } .brand span{ color:${accent}; }
  </style></head><body>
  ${opts.kicker ? `<div class="kicker">${opts.kicker}</div>` : ""}
  <h1>${opts.title}</h1>
  ${opts.subtitle ? `<p>${opts.subtitle}</p>` : ""}
  <div class="dot"><span class="logo">P</span><span class="brand">Prep<span>Room</span></span></div>
  </body></html>`;
  writeFileSync(`${CARDS}/${opts.file}`, html);
}

// Architecture full-screen card: image centered on dark bg with a caption.
function archCard() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1440px; height:810px; overflow:hidden; background:#0a0a0f; font-family:${FONT}; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; }
  .cap { color:#9ca3af; font-size:20px; letter-spacing:0.04em; }
  .cap b { color:#fff; font-weight:600; }
  .frame { width:1320px; background:#fff; border-radius:14px; padding:14px; box-shadow:0 24px 80px rgba(0,0,0,0.6); }
  img { width:100%; display:block; border-radius:6px; }
  </style></head><body>
  <div class="cap"><b>One Cloud Run service.</b> ADK · MCP · Gemini multimodal · Cloud SQL · GCS · Pub/Sub</div>
  <div class="frame"><img src="architecture.png" /></div>
  </body></html>`;
  writeFileSync(`${CARDS}/arch.html`, html);
}

// Evals card — the trust numbers.
function evalsCard() {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1440px; height:810px; overflow:hidden; background:#0a0a0f; color:#fff; font-family:${FONT}; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .kicker { font-size:18px; letter-spacing:0.28em; text-transform:uppercase; color:#3b82f6; font-weight:600; margin-bottom:48px; }
  .row { display:flex; gap:64px; }
  .stat { text-align:center; }
  .num { font-size:88px; font-weight:700; letter-spacing:-0.03em; background:linear-gradient(180deg,#fff,#9ca3af); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .lbl { margin-top:14px; font-size:22px; color:#9ca3af; max-width:300px; line-height:1.35; }
  .foot { margin-top:64px; font-size:20px; color:#6b7280; }
  .foot b { color:#e5e7eb; font-weight:600; }
  </style></head><body>
  <div class="kicker">Validated, not vibes</div>
  <div class="row">
    <div class="stat"><div class="num">100%</div><div class="lbl">schema validity — every exercise parsed against a Zod schema</div></div>
    <div class="stat"><div class="num">4.47<span style="font-size:44px;color:#6b7280">/5</span></div><div class="lbl">pedagogy score on a 10-case golden eval, judged by Gemini</div></div>
  </div>
  <div class="foot"><b>A second agent</b> reviews every homework set before it reaches the student.</div>
  </body></html>`;
  writeFileSync(`${CARDS}/evals.html`, html);
}

titleCard({ file: "card-open.html", kicker: "AI Teaching Studio", title: "PrepRoom",
  subtitle: "A persistent teaching agent for every language learner." });
titleCard({ file: "card-autonomous.html", kicker: "The autonomous beat",
  title: "Your copilot worked\nwhile you were away.".replace("\n", "<br/>"),
  subtitle: "It watched the lesson video, found the struggles, and drafted the next lesson — unprompted." });
titleCard({ file: "card-closing.html", kicker: "PrepRoom",
  title: "45 minutes of prep,\ndown to zero.".replace("\n", "<br/>"),
  subtitle: "Watches lessons. Remembers evidence. Turns it into the next teaching action — automatically." });
archCard();
evalsCard();

console.log("cards written to", CARDS);
