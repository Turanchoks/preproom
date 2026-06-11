// Records the TWO live-chat scenes (each hits /api/chat once → IP rate limit
// is 10 msgs/hour, so run sparingly). Pass a scene name to record just one:
//   npx tsx scripts/video/record-chat.ts focus      -> "What should we focus on next with Anna?"
//   npx tsx scripts/video/record-chat.ts homework    -> "Create homework targeting her past-tense errors — include a listening exercise and an image flashcard"
//   npx tsx scripts/video/record-chat.ts results     -> "How did Anna do on her homework?"
// Default (no arg): records focus + results (2 messages). Run "homework" separately.
import {
  launch, newScene, finishScene, login, moveToLoc, moveClickLoc, typeHuman,
  clickTab, HOST, ANNA,
} from "./helpers";
import type { Browser, Page } from "@playwright/test";

const args = process.argv.slice(2);

async function gotoAnna(page: Page) {
  await login(page);
  await page.goto(`${HOST}/app/student/${ANNA}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
}

async function ask(page: Page, text: string) {
  const box = page.locator("textarea").first();
  await moveClickLoc(page, box);
  await page.waitForTimeout(300);
  await typeHuman(page, text, 30);
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");
}

// Wait for the assistant answer to finish streaming. Returns status string.
async function waitForAnswer(page: Page, maxS = 45): Promise<{ status: string; len: number }> {
  let status = "pending";
  page.on("response", (r) => { if (r.url().includes("/api/chat")) status = `${r.status()}`; });
  let prev = 0, stable = 0, len = 0;
  for (let i = 0; i < maxS; i++) {
    await page.waitForTimeout(1000);
    len = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[data-role="assistant"], .prose'));
      const t = nodes.map((n) => (n as HTMLElement).innerText).join("");
      return t.length || (document.querySelector("main")?.innerText || "").length;
    });
    if (len === prev && len > 0) stable++; else stable = 0;
    prev = len;
    if (stable >= 4 && i > 4) break;
  }
  return { status, len };
}

// Scene: focus question — show the answer + flip to Activity to reveal the trace.
async function recordFocus(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await gotoAnna(page);
  await ask(page, "What should we focus on next with Anna?");
  // flip to Activity tab to capture the live agent trace as it fills
  await page.waitForTimeout(900);
  await clickTab(page, "Activity");
  const res = await waitForAnswer(page, 40);
  console.log("focus chatStatus:", res.status, "answerLen:", res.len);
  await page.waitForTimeout(1200);
  // pan back to the answer text
  await clickTab(page, "Memory").catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await moveToLoc(page, page.locator('[data-role="assistant"]').first()).catch(() => {});
  await page.waitForTimeout(2600);
  console.log("clip:", await finishScene(ctx, page, "chat-focus"));
}

// Scene: homework creation — artifact streams into the canvas.
async function recordHomework(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await gotoAnna(page);
  await ask(page, "Create homework targeting her past-tense errors — include a listening exercise and an image flashcard.");
  // canvas should open; keep recording while it streams (30-60s). We'll speed up in post.
  const res = await waitForAnswer(page, 75);
  console.log("homework chatStatus:", res.status, "len:", res.len);
  await page.waitForTimeout(2500);
  // pan the finished homework canvas
  await page.evaluate(() => {
    const c = document.querySelector('[class*="artifact"], main');
    (c as HTMLElement)?.scrollTo?.({ top: 400, behavior: "smooth" });
  }).catch(() => {});
  await page.waitForTimeout(2200);
  console.log("clip:", await finishScene(ctx, page, "chat-homework"));
}

// Scene: results question — closed-loop answer citing the score.
async function recordResults(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await gotoAnna(page);
  await ask(page, "How did Anna do on her homework?");
  const res = await waitForAnswer(page, 40);
  console.log("results chatStatus:", res.status, "answerLen:", res.len);
  await page.waitForTimeout(1200);
  await moveToLoc(page, page.locator('[data-role="assistant"]').first()).catch(() => {});
  await page.waitForTimeout(2600);
  console.log("clip:", await finishScene(ctx, page, "chat-results"));
}

async function main() {
  const browser = await launch();
  try {
    if (args.includes("focus")) await recordFocus(browser);
    else if (args.includes("homework")) await recordHomework(browser);
    else if (args.includes("results")) await recordResults(browser);
    else { await recordFocus(browser); await recordResults(browser); }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
