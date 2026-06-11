import { chromium } from "@playwright/test";
import { login, HOST, ANNA } from "./helpers";
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 810 } });
  const page = await ctx.newPage();
  await login(page);
  const sess = await page.evaluate(() => fetch("/api/auth/session").then(r => r.json()));
  console.log("session:", JSON.stringify(sess).slice(0, 160));
  await page.goto(`${HOST}/app/student/${ANNA}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  console.log("url:", page.url());
  const asideText = await page.locator("aside").first().innerText().catch(() => "NO ASIDE");
  console.log("aside head:", asideText.slice(0, 220).replace(/\n/g, " | "));
  await b.close();
})();
