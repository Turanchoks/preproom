// Fallback chat scenes that DON'T depend on a live /api/chat response (which is
// gated by a 10-msg/hour IP limit and streams unreliably headless). Each scene
// types the real question into the composer, then pans the REAL PROD evidence
// that the agent's answer is grounded in:
//   chat-focus   -> question + Memory facts (errors w/ source badges)
//   chat-homework-> question + Artifacts (the homework set) + share canvas
//   chat-results -> question + Memory "from homework results" facts
// This keeps every pixel real PROD data; only the streamed answer bubble is
// substituted by the evidence pan. Used if live capture fails.
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
async function typeQuestion(page: Page, text: string) {
  const box = page.locator("textarea").first();
  await moveClickLoc(page, box);
  await page.waitForTimeout(300);
  await typeHuman(page, text, 30);
  await page.waitForTimeout(900);
}

async function focus(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await gotoAnna(page);
  await typeQuestion(page, "What should we focus on next with Anna?");
  // reveal the evidence the agent reasons over: Memory error facts w/ sources
  await clickTab(page, "Memory");
  await page.waitForTimeout(1300);
  const aside = page.locator("aside");
  await moveToLoc(page, aside.getByText("from lesson video").first());
  await page.waitForTimeout(1500);
  await aside.evaluate((el) => el.scrollBy({ top: 220, behavior: "smooth" })).catch(() => {});
  await page.waitForTimeout(1500);
  await moveToLoc(page, aside.getByText("from homework results").first()).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("clip:", await finishScene(ctx, page, "chat-focus"));
}

async function homework(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await gotoAnna(page);
  await typeQuestion(page, "Create homework targeting her past-tense errors — include a listening exercise and an image flashcard.");
  // show the homework artifact the agent produces (real one in Artifacts)
  await clickTab(page, "Artifacts");
  await page.waitForTimeout(1300);
  const aside = page.locator("aside");
  await moveToLoc(page, aside.getByText("Past Tenses & Cooking Vocabulary", { exact: false }).first()).catch(() => {});
  await page.waitForTimeout(1500);
  await moveToLoc(page, aside.getByText("Professional Phrasing Practice", { exact: false }).first()).catch(() => {});
  await page.waitForTimeout(2200);
  console.log("clip:", await finishScene(ctx, page, "chat-homework"));
}

async function results(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await gotoAnna(page);
  await typeQuestion(page, "How did Anna do on her homework?");
  await clickTab(page, "Memory");
  await page.waitForTimeout(1300);
  const aside = page.locator("aside");
  await moveToLoc(page, aside.getByText("from homework results").first()).catch(() => {});
  await page.waitForTimeout(2400);
  await aside.evaluate((el) => el.scrollBy({ top: 200, behavior: "smooth" })).catch(() => {});
  await page.waitForTimeout(2000);
  console.log("clip:", await finishScene(ctx, page, "chat-results"));
}

async function main() {
  const browser = await launch();
  try {
    if (args.includes("focus")) await focus(browser);
    else if (args.includes("homework")) await homework(browser);
    else if (args.includes("results")) await results(browser);
    else { await focus(browser); await homework(browser); await results(browser); }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
