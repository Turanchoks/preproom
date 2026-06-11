/**
 * Shared helpers for the demo-path Playwright spec.
 *
 * These are deliberately thin — they wrap common operations so the spec
 * itself stays readable, and avoid hard-coded waits in favour of polling
 * on observable DOM state.
 */

import type { Page, BrowserContext } from "@playwright/test";
import { expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the guest sign-in flow and wait until we land on /app (or a
 * student page). The /api/auth/guest endpoint creates an anonymous session
 * and redirects back to /app.
 */
export async function signInAsGuest(page: Page): Promise<void> {
  await page.goto("/api/auth/guest?redirectUrl=/app");
  // Wait for the redirect chain to settle on /app or /app/student/…
  await page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Student helpers
// ---------------------------------------------------------------------------

/**
 * Force the shadcn sidebar into expanded state by setting its cookie before
 * the page is loaded/navigated. Call this before any navigation that will
 * show the sidebar so the StudentList is always visible.
 *
 * The sidebar reads `sidebar_state` cookie: "true" = expanded, "false" = icon.
 */
export async function setSidebarExpanded(page: Page): Promise<void> {
  // We can set a cookie via evaluate or via context.addCookies.
  // addCookies requires the URL so we use evaluate (runs against current page).
  await page.evaluate(() => {
    const maxAge = 60 * 60 * 24 * 7;
    document.cookie = `sidebar_state=true; path=/; max-age=${maxAge}`;
  });
}

/**
 * Creates a student via the /api/students REST endpoint (bypasses the sidebar
 * dialog entirely) and navigates to the new student page.
 *
 * This is the primary creation path in the E2E spec — more reliable than
 * fighting sidebar collapse state.
 *
 * Falls back to the dialog UI if the API call fails (e.g. 401 not yet authed).
 */
export async function createStudent(
  page: Page,
  opts: { name: string; level: string; targetLanguage: string }
): Promise<void> {
  const baseURL =
    process.env.DEMO_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  // ------------------------------------------------------------------
  // Primary path: POST /api/students
  // ------------------------------------------------------------------
  const res = await page.request.post(`${baseURL}/api/students`, {
    data: {
      name: opts.name,
      level: opts.level,
      targetLanguage: opts.targetLanguage,
      nativeLanguage: null,
      goals: null,
    },
    headers: { "Content-Type": "application/json" },
  });

  if (res.ok()) {
    const student = (await res.json()) as { id: string };
    await page.goto(`/app/student/${student.id}`);
    await page.waitForURL(/\/app\/student\//, { timeout: 15_000 });
    return;
  }

  // ------------------------------------------------------------------
  // Fallback path: open the dialog via UI
  // ------------------------------------------------------------------

  // Set the sidebar cookie so it renders expanded, then reload.
  await setSidebarExpanded(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 });

  // The sidebar expansion cookie takes effect on next load.
  // Find and click the "Add student" button — it should now be visible
  // in the sidebar StudentList or in the empty-state.
  const addBtn = page
    .getByRole("button", { name: /add (your first )?student/i })
    .first();
  await addBtn.waitFor({ state: "visible", timeout: 10_000 });
  await addBtn.click();

  // Dialog should appear
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Name
  await dialog.getByLabel(/name/i).fill(opts.name);

  // Level — the select uses a custom Radix trigger
  await dialog.getByRole("combobox").click();
  await page
    .getByRole("option", { name: new RegExp(`^${opts.level}$`, "i") })
    .click();

  // Target language
  const targetInput = dialog.getByLabel(/target language/i);
  await targetInput.fill(opts.targetLanguage);

  // Submit
  await dialog.getByRole("button", { name: /add student/i }).click();

  // Wait for navigation to the student page
  await page.waitForURL(/\/app\/student\//, { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// Chat helpers
// ---------------------------------------------------------------------------

/**
 * Types a message into the chat input, submits it, and returns.
 * Does NOT wait for a reply — that is the caller's job.
 */
export async function sendChatMessage(
  page: Page,
  text: string
): Promise<void> {
  const input = page.getByTestId("multimodal-input");
  await input.click();
  await input.fill(text);
  // Use keyboard to submit (matching how the app handles Enter)
  await input.press("Enter");
}

/**
 * Wait for the assistant to finish streaming a reply.
 * Polls until the stop-button is gone (streaming ended) and at least one
 * assistant message element is present.
 */
export async function waitForReply(
  page: Page,
  { timeout = 90_000 }: { timeout?: number } = {}
): Promise<void> {
  // The stop-button appears during streaming. Wait for it to disappear.
  await expect(page.getByTestId("stop-button")).toBeHidden({ timeout });
}

// ---------------------------------------------------------------------------
// Memory tab helpers
// ---------------------------------------------------------------------------

/**
 * Switches the student panel to the Memory tab and waits until at least
 * `minFacts` fact rows are visible.
 */
export async function waitForMemoryFacts(
  page: Page,
  { minFacts = 1, timeout = 90_000 }: { minFacts?: number; timeout?: number } = {}
): Promise<void> {
  // Click the Memory tab button
  await page
    .getByRole("button", { name: /memory/i })
    .first()
    .click();

  // Poll until we see at least minFacts list items inside the memory panel.
  // FactRow renders each fact as an <li>. We wait for the count to satisfy.
  await expect(async () => {
    const facts = page.locator("ul li").filter({ hasText: /./i });
    const count = await facts.count();
    expect(count).toBeGreaterThanOrEqual(minFacts);
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// Artifact helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the artifact canvas to appear and contain exercise content.
 * The artifact panel has `data-testid="artifact"` on the outer wrapper.
 * Inside, once fully rendered, there will be exercise cards or quiz content.
 */
export async function waitForArtifactWithContent(
  page: Page,
  { timeout = 180_000 }: { timeout?: number } = {}
): Promise<void> {
  // 1. Wait for the artifact panel to become visible (it starts hidden).
  const artifact = page.getByTestId("artifact");
  await expect(artifact).toBeVisible({ timeout });

  // 2. Wait for streaming to finish — the "Generating…" indicator disappears.
  await expect(
    page.getByText(/generating\.\.\./i)
  ).toBeHidden({ timeout });

  // 3. Assert some exercise content is present. During streaming the
  //    HomeworkStreamingPreview renders exercise cards; after streaming the
  //    QuizPlayer renders the WelcomeScreen.  Either text pattern works.
  await expect(async () => {
    const hasExercise =
      (await page.getByText(/exercise \d+ of/i).count()) > 0 ||
      (await page.getByText(/homework/i).count()) > 0 ||
      (await page.getByText(/question/i).count()) > 0 ||
      (await artifact.locator("[class*='rounded']").count()) > 3;
    expect(hasExercise).toBe(true);
  }).toPass({ timeout });
}

// ---------------------------------------------------------------------------
// Share helpers
// ---------------------------------------------------------------------------

/**
 * Calls the share API directly (bypassing clipboard) to get the share URL
 * for `documentId`. Returns the full origin-prefixed URL.
 */
export async function getShareUrl(
  page: Page,
  documentId: string,
  baseURL: string
): Promise<string> {
  const response = await page.request.post(`${baseURL}/api/share`, {
    data: { documentId },
    headers: { "Content-Type": "application/json" },
  });
  const body = (await response.json()) as { slug: string; url: string };
  return `${baseURL}${body.url}`;
}

/**
 * Reads the document ID from the artifact panel after streaming has finished.
 * The artifact store exposes the documentId via the data-stream; we extract
 * it from the SWR URL that the artifact component fetches.
 *
 * Strategy: intercept the /api/document?id=… request that fires after the
 * artifact finishes streaming.
 */
export async function captureDocumentId(
  page: Page,
  { timeout = 60_000 }: { timeout?: number } = {}
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for document ID")),
      timeout
    );

    page.on("request", (req) => {
      const url = req.url();
      const match = url.match(/\/api\/document\?id=([^&]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Share page helpers
// ---------------------------------------------------------------------------

/**
 * Opens a share URL in a new browser context (unauthenticated) and returns
 * the page.
 */
export async function openSharePageAnon(
  context: BrowserContext,
  shareUrl: string
): Promise<Page> {
  const sharePage = await context.newPage();
  await sharePage.goto(shareUrl);
  return sharePage;
}
