// Records all NON-chat scenes (no /api/chat hits → no rate limit):
//  - card-open       : opening title card
//  - landing         : hero + pricing scroll
//  - studio-anna     : Anna profile + Memory (source badges) + Activity
//  - share           : /s/anna-homework — start, MCQ feedback, listening audio, image flashcard
//  - autonomous      : Anna Artifacts (proactive prep) + Memory note
//  - evals           : evals trust card
//  - arch            : architecture full-screen
//  - card-closing    : closing card
// Each is a separate recordVideo context → separate webm clip.
import {
  launch, newScene, finishScene, login, moveToLoc, moveClickLoc,
  clickTab, HOST, ANNA, CLIPS,
} from "./helpers";
import type { Browser, Page, Locator } from "@playwright/test";

const only = process.argv.slice(2);
const want = (n: string) => only.length === 0 || only.includes(n);

async function card(browser: Browser, file: string, name: string, holdMs: number) {
  const { ctx, page } = await newScene(browser);
  await page.goto(`file:///tmp/tutorroom-video/cards/${file}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(holdMs);
  console.log("clip:", await finishScene(ctx, page, name));
}

async function recordLanding(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await page.goto(`${HOST}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const maxY = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
  // Locate the pricing heading (h2/h3 only — avoid matching the whole body).
  const pricingY = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("h1,h2,h3")).find((e) =>
      /pricing/i.test(e.textContent || "")
    );
    return el ? (el as HTMLElement).getBoundingClientRect().top + window.scrollY - 70 : null;
  });
  const target = Math.min(pricingY ?? maxY, maxY);
  // Two-stage scroll: glide to pricing, dwell, then a small nudge to reveal the
  // full price cards ($19 / $49 / $199).
  const steps = 80;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.evaluate((y) => window.scrollTo(0, y), eased * target);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(3200); // dwell on pricing cards
  console.log("clip:", await finishScene(ctx, page, "landing"));
}

async function recordStudioAnna(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await login(page);
  await page.goto(`${HOST}/app/student/${ANNA}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const aside = page.locator("aside");
  await moveToLoc(page, aside.getByText("Conversational fluency", { exact: false }));
  await page.waitForTimeout(1100);
  await clickTab(page, "Memory");
  await page.waitForTimeout(1500);
  await moveToLoc(page, aside.getByText("Proactive prep ready", { exact: false }));
  await page.waitForTimeout(1600);
  await aside.evaluate((el) => el.scrollBy({ top: 240, behavior: "smooth" })).catch(() => {});
  await page.waitForTimeout(1400);
  await moveToLoc(page, aside.getByText("from lesson video").first());
  await page.waitForTimeout(1600);
  await clickTab(page, "Activity");
  await page.waitForTimeout(1800);
  console.log("clip:", await finishScene(ctx, page, "studio-anna"));
}

async function recordAutonomous(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await login(page);
  await page.goto(`${HOST}/app/student/${ANNA}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2800);
  const aside = page.locator("aside");
  await clickTab(page, "Artifacts");
  await page.waitForTimeout(1700);
  await moveToLoc(page, aside.getByText("Polite Business Calls", { exact: false }).first());
  await page.waitForTimeout(1600);
  await moveToLoc(page, aside.getByText("Business English", { exact: false }).first());
  await page.waitForTimeout(1500);
  await aside.evaluate((el) => el.scrollBy({ top: 180, behavior: "smooth" })).catch(() => {});
  await page.waitForTimeout(1300);
  await clickTab(page, "Memory");
  await page.waitForTimeout(1400);
  await moveToLoc(page, aside.getByText("Proactive prep ready", { exact: false }));
  await page.waitForTimeout(2200);
  console.log("clip:", await finishScene(ctx, page, "autonomous-artifacts"));
}

async function clickLoc(page: Page, loc: Locator) {
  return moveClickLoc(page, loc);
}

async function recordShare(browser: Browser) {
  const { ctx, page } = await newScene(browser);
  await page.goto(`${HOST}/s/anna-homework`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await clickLoc(page, page.getByRole("button", { name: /Start homework/i }));
  await page.waitForTimeout(1900);

  const optionBtns = () => page.locator("main button").filter({ hasText: /^[A-D]/ });
  const pick = async (idx: number) => {
    const el = optionBtns().nth(idx);
    await moveClickLoc(page, el);
  };
  // NB: Check is inside <main>; the feedback "Continue" button renders in a
  // modal OUTSIDE <main>, so scope page-wide and take the last match.
  const clickByName = async (re: RegExp) =>
    moveClickLoc(page, page.getByRole("button", { name: re }).last(), { timeout: 2500 });

  // Q0 MCQ — pick a (likely wrong) option, Check → feedback, Continue
  await pick(0);
  await page.waitForTimeout(700);
  await clickByName(/^Check$/i);
  await page.waitForTimeout(2500); // hold on feedback
  await clickByName(/Continue/i);
  await page.waitForTimeout(1500);

  // Advance via Skip to the listening exercise (Q6: "Which Spanish dish did you hear?")
  const bodyText = () =>
    page.evaluate(() => document.querySelector("main")?.textContent?.replace(/\s+/g, " ").slice(0, 200) || "");
  for (let i = 0; i < 5; i++) {
    const t = await bodyText();
    if (/dish did you hear|Listen and identify/i.test(t)) break;
    await moveClickLoc(page, page.getByRole("button", { name: /Skip/i }).last());
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(900);

  // Listening: press Play, hold while audio plays
  const playBtn = page.locator("main button").filter({ hasText: /play/i }).first();
  if (await playBtn.count().catch(() => 0)) {
    await moveClickLoc(page, playBtn);
  } else {
    await page.evaluate(() => (document.querySelector("audio") as HTMLAudioElement)?.play?.());
  }
  await page.waitForTimeout(3800);

  // Skip to the image flashcard (Q7) — hold on the generated illustration
  await moveClickLoc(page, page.getByRole("button", { name: /Skip/i }).last());
  await page.waitForTimeout(1400);
  await page.locator("main img").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  await moveToLoc(page, page.locator("main img").first());
  await page.waitForTimeout(2600);

  console.log("clip:", await finishScene(ctx, page, "share"));
}

async function main() {
  const browser = await launch();
  try {
    if (want("card-open")) await card(browser, "card-open.html", "card-open", 3200);
    if (want("landing")) await recordLanding(browser);
    if (want("studio-anna")) await recordStudioAnna(browser);
    if (want("share")) await recordShare(browser);
    if (want("autonomous")) await recordAutonomous(browser);
    if (want("evals")) await card(browser, "evals.html", "evals", 5200);
    if (want("arch")) await card(browser, "arch.html", "arch", 4400);
    if (want("card-closing")) await card(browser, "card-closing.html", "card-closing", 5200);
  } finally {
    await browser.close();
  }
  console.log("DONE. clips in", CLIPS);
}
main().catch((e) => { console.error(e); process.exit(1); });
