// Shared recording helpers: a smooth synthetic cursor, eased mouse moves,
// typing, and per-scene context creation with video recording.
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync, existsSync, rmSync } from "node:fs";

export const HOST = "https://teachflow-gk7n6cfu6a-uc.a.run.app";
export const CANON = "https://teachflow-759438277418.us-central1.run.app";
export const ANNA = "1dfb4c86-06da-4033-b91f-1826589471b0";
export const EMAIL = "demo@teachflow.app";
export const PASS = "TeachFlow!Demo2026";
export const VIEW = { width: 1440, height: 810 };
export const CLIPS = "/tmp/teachflow-video/clips";

export async function launch(): Promise<Browser> {
  return chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--force-prefers-reduced-motion"] });
}

export async function newScene(browser: Browser): Promise<{ ctx: BrowserContext; page: Page }> {
  mkdirSync(CLIPS, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    recordVideo: { dir: CLIPS, size: { width: VIEW.width * 2, height: VIEW.height * 2 } },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await installCursor(page);
  return { ctx, page };
}

// Save the recorded webm to a deterministic filename.
export async function finishScene(ctx: BrowserContext, page: Page, name: string): Promise<string> {
  const video = page.video();
  await page.close();
  await ctx.close();
  const tmp = await video?.path();
  const dest = `${CLIPS}/${name}.webm`;
  if (tmp && existsSync(tmp)) {
    if (existsSync(dest)) rmSync(dest);
    renameSync(tmp, dest);
  }
  return dest;
}

// --- synthetic cursor -------------------------------------------------------
// Playwright's real mouse leaves no visible pointer in the recording, so we
// inject a DOM cursor and move it ourselves, then drive the real mouse to match.
export async function installCursor(page: Page) {
  await page.addInitScript(() => {
    const ensure = () => {
      if (document.getElementById("__cursor")) return;
      const c = document.createElement("div");
      c.id = "__cursor";
      c.style.cssText =
        "position:fixed;left:-50px;top:-50px;width:22px;height:22px;z-index:2147483647;pointer-events:none;" +
        "transition:transform 0.05s linear;will-change:left,top;";
      c.innerHTML =
        '<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M3 2l13 6.5-5.2 1.4L8.2 16 3 2z" fill="#111" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></svg>';
      document.documentElement.appendChild(c);
      (window as any).__moveCursor = (x: number, y: number) => {
        const el = document.getElementById("__cursor");
        if (el) { el.style.left = x + "px"; el.style.top = y + "px"; }
      };
      (window as any).__clickPulse = (x: number, y: number) => {
        const p = document.createElement("div");
        p.style.cssText =
          `position:fixed;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;` +
          "border:2px solid rgba(59,130,246,0.9);z-index:2147483646;pointer-events:none;" +
          "animation:__pulse 0.5s ease-out forwards;";
        document.documentElement.appendChild(p);
        setTimeout(() => p.remove(), 520);
      };
      if (!document.getElementById("__cursorStyle")) {
        const s = document.createElement("style");
        s.id = "__cursorStyle";
        s.textContent = "@keyframes __pulse{from{transform:scale(0.4);opacity:1}to{transform:scale(1.4);opacity:0}}";
        document.documentElement.appendChild(s);
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensure);
    else ensure();
    new MutationObserver(ensure).observe(document.documentElement, { childList: true });
  });
}

let cur = { x: 720, y: 405 };
function ease(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

export async function moveTo(page: Page, x: number, y: number, steps = 26) {
  const from = { ...cur };
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    const nx = from.x + (x - from.x) * t;
    const ny = from.y + (y - from.y) * t;
    await page.mouse.move(nx, ny);
    await page.evaluate(([px, py]) => (window as any).__moveCursor?.(px, py), [nx, ny]);
    await page.waitForTimeout(12);
  }
  cur = { x, y };
}

import type { Locator } from "@playwright/test";

// Move the cursor to a Playwright Locator. Returns false if not found (never throws).
export async function moveToLoc(page: Page, loc: Locator, opts: { steps?: number; timeout?: number } = {}): Promise<boolean> {
  try {
    const el = loc.first();
    await el.waitFor({ state: "visible", timeout: opts.timeout ?? 4000 });
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const box = await el.boundingBox();
    if (!box) return false;
    await moveTo(page, box.x + box.width / 2, box.y + box.height / 2, opts.steps);
    return true;
  } catch {
    return false;
  }
}

export async function moveClickLoc(page: Page, loc: Locator, opts: { steps?: number; timeout?: number } = {}): Promise<boolean> {
  const ok = await moveToLoc(page, loc, opts);
  if (!ok) return false;
  await page.waitForTimeout(160);
  await clickHere(page);
  return true;
}

export async function moveToEl(page: Page, selector: string, opts: { steps?: number } = {}) {
  return moveToLoc(page, page.locator(selector), opts);
}

export async function clickHere(page: Page) {
  await page.evaluate(([x, y]) => (window as any).__clickPulse?.(x, y), [cur.x, cur.y]);
  await page.mouse.click(cur.x, cur.y);
}

export async function moveClick(page: Page, selector: string, steps = 26) {
  return moveClickLoc(page, page.locator(selector), { steps });
}

export async function typeHuman(page: Page, text: string, perChar = 42) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(perChar + Math.random() * 30);
  }
}

export async function login(page: Page, host = HOST) {
  await page.goto(`${host}/login`, { waitUntil: "networkidle" });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[name="password"]').fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(4500);
}

export async function clickTab(page: Page, name: string) {
  const tab = page.locator("aside").getByRole("button", { name, exact: true });
  await moveClickLoc(page, tab);
  await page.waitForTimeout(1000);
}
