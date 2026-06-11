/**
 * Throwaway visual-QA script (Track I). Screenshots key surfaces in light/dark
 * + mobile/desktop and walks the public share quiz. Run with:
 *   npx tsx scripts/visual-qa.ts
 */
import { mkdirSync } from "node:fs";
import { type Browser, chromium, type Page } from "@playwright/test";

const BASE = process.env.QA_BASE ?? "http://localhost:3000";
const OUT = "/tmp/preproom-shots";

mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot:", name);
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t: "light" | "dark") => {
    const html = document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
  await page.waitForTimeout(300);
}

async function landing(browser: Browser) {
  // Desktop light + dark
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await setTheme(desktop, "light");
  await shot(desktop, "landing-desktop-light");
  await desktop.evaluate(() => window.scrollTo(0, 700));
  await desktop.waitForTimeout(300);
  await shot(desktop, "landing-desktop-light-features");
  await setTheme(desktop, "dark");
  await desktop.evaluate(() => window.scrollTo(0, 0));
  await desktop.waitForTimeout(300);
  await shot(desktop, "landing-desktop-dark");
  await desktop.close();

  // Mobile light + dark
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await setTheme(mobile, "light");
  await shot(mobile, "landing-mobile-light");
  await setTheme(mobile, "dark");
  await shot(mobile, "landing-mobile-dark");
  await mobile.close();
}

async function login(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await shot(page, "login-desktop");
  await page.close();
}

async function share(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`${BASE}/s/demo-homework`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "share-welcome");

  // Start the quiz
  const start = page.getByRole("button", { name: /start/i }).first();
  if (await start.count()) {
    await start.click();
    await page.waitForTimeout(600);
    await shot(page, "share-q1");

    // Try to answer 2-3 exercises (multiple-choice path).
    for (let i = 0; i < 3; i++) {
      // Pick first answer option if present.
      const opt = page.locator("[data-exercise-id]").first();
      if (await opt.count()) {
        await opt.click().catch(() => {});
        await page.waitForTimeout(300);
      }
      const check = page.getByRole("button", { name: /^check$/i }).first();
      if (await check.count()) {
        await check.click().catch(() => {});
        await page.waitForTimeout(400);
        await shot(page, `share-feedback-${i}`);
      }
      const cont = page.getByRole("button", { name: /continue/i }).first();
      if (await cont.count()) {
        await cont.click().catch(() => {});
        await page.waitForTimeout(500);
      }
    }
  }

  // Mobile share
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(`${BASE}/s/demo-homework`, { waitUntil: "networkidle" });
  await m.waitForTimeout(500);
  await shot(m, "share-mobile-welcome");
  await m.close();
  await page.close();
}

async function studio(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  // Guest auth flow.
  await page.goto(`${BASE}/api/auth/guest?redirectUrl=/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Create a student via the API so the studio shows the per-student panel.
  const created = await page.evaluate(async () => {
    const res = await fetch("/api/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Maria",
        level: "B1",
        nativeLanguage: "Spanish",
        targetLanguage: "English",
        goals: "Speak confidently in meetings and pass the B2 exam by spring.",
      }),
    });
    return res.ok ? await res.json() : null;
  });

  await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await shot(page, "studio-app");

  if (created?.id) {
    await page.goto(`${BASE}/app/student/${created.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await shot(page, "studio-student");
    // This polished shot feeds the landing hero.
    await page.screenshot({ path: "public/screenshot-studio.png" });
    console.log("wrote public/screenshot-studio.png");
  }
  await ctx.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    await landing(browser);
    await login(browser);
    await share(browser);
    await studio(browser);
  } finally {
    await browser.close();
  }
  console.log("done -> ", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
