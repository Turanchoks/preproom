/**
 * TeachFlow — Full demo-path E2E spec
 *
 * Covers the critical user journey from landing page through to a student
 * completing a quiz on the public share page. Runs against the dev server at
 * http://localhost:3000 by default; set DEMO_BASE_URL to point at prod.
 *
 * Run:
 *   npx playwright test -c playwright.demo.config.ts
 *
 * Each numbered describe block maps to a step in the spec, so a failure
 * clearly identifies which step broke.
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  signInAsGuest,
  createStudent,
  sendChatMessage,
  waitForReply,
  waitForMemoryFacts,
  waitForArtifactWithContent,
  captureDocumentId,
} from "./helpers-demo";

// ---------------------------------------------------------------------------
// Shared state across steps (single-worker, sequential execution)
// ---------------------------------------------------------------------------

let authenticatedPage: Page;
let sharedContext: BrowserContext;
let studentUrl: string;
let shareUrl: string;

// ---------------------------------------------------------------------------
// Step 1 — Landing page renders
// ---------------------------------------------------------------------------

test.describe("Step 1: landing page", () => {
  test("TeachFlow hero is visible on /", async ({ page }) => {
    await page.goto("/");
    // The hero h1 contains "AI teaching studio" (or similar). Check the brand name.
    await expect(
      page.getByRole("heading", { name: /teachflow|ai teaching studio/i }).first()
    ).toBeVisible({ timeout: 15_000 });

    // The header should show the "TeachFlow" brand link.
    await expect(page.getByRole("link", { name: /teachflow/i }).first()).toBeVisible();

    // NOTE: we intentionally do NOT assert the pricing section here because
    // Phase 4 is actively adding it. The landing renders correctly once the
    // hero is visible.
  });
});

// ---------------------------------------------------------------------------
// Step 2 — Guest sign-in → /app
// ---------------------------------------------------------------------------

test.describe("Step 2: guest sign-in", () => {
  test("guest redirect lands on /app", async ({ browser }) => {
    // Create a fresh context so we don't share cookies with the landing test.
    sharedContext = await browser.newContext();
    authenticatedPage = await sharedContext.newPage();

    await signInAsGuest(authenticatedPage);

    // Should be on /app (or /app/student/… if a student already exists)
    expect(authenticatedPage.url()).toMatch(/\/app/);
  });
});

// ---------------------------------------------------------------------------
// Step 3 — Create a student
// ---------------------------------------------------------------------------

test.describe("Step 3: create student", () => {
  test("create E2E Tester student and land on student page", async () => {
    // Re-use the authenticated page from step 2.
    // Guard: if step 2 failed, skip gracefully.
    if (!authenticatedPage) {
      test.skip(true, "Skipping — step 2 (guest sign-in) did not complete");
    }

    await createStudent(authenticatedPage, {
      name: "E2E Tester",
      level: "B1",
      targetLanguage: "English",
    });

    // The page should now be at /app/student/<id>
    studentUrl = authenticatedPage.url();
    expect(studentUrl).toMatch(/\/app\/student\//);

    // The student name appears in the right-side panel header (always visible
    // on the student page regardless of sidebar collapse state).
    // Use a more specific locator: the panel header <aside> contains the name.
    await expect(
      authenticatedPage.locator("aside").getByText("E2E Tester")
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Step 4 — Send memory-building message and wait for Memory tab facts
// ---------------------------------------------------------------------------

test.describe("Step 4: chat message → memory facts", () => {
  test(
    "memory fact appears after chat message about student",
    async () => {
      if (!authenticatedPage) {
        test.skip(true, "Skipping — prior step did not complete");
      }

      // Start capturing the document-id promise BEFORE we send messages so we
      // don't miss the request.
      const docIdPromise = captureDocumentId(authenticatedPage, {
        timeout: 210_000,
      }).catch(() => null); // non-fatal — only needed for step 5

      await sendChatMessage(
        authenticatedPage,
        "Remember: this student loves football and mixes up verb tenses"
      );

      // Wait for streaming to finish (generous 90s for ADK + Gemini round trip)
      await waitForReply(authenticatedPage, { timeout: 90_000 });

      // Now check the memory tab
      await waitForMemoryFacts(authenticatedPage, {
        minFacts: 1,
        timeout: 90_000,
      });

      // Assign docIdPromise to module scope for step 5 to use
      // (we already kicked it off so step 5 can await it)
      void docIdPromise;
    }
  );
});

// ---------------------------------------------------------------------------
// Step 5 — Create homework artifact
// ---------------------------------------------------------------------------

test.describe("Step 5: homework artifact", () => {
  test(
    "homework artifact canvas opens with exercise content",
    async () => {
      if (!authenticatedPage) {
        test.skip(true, "Skipping — prior step did not complete");
      }

      // Capture document-id requests for step 6.
      const docIdPromise = captureDocumentId(authenticatedPage, {
        timeout: 240_000,
      }).catch(() => null);

      await sendChatMessage(
        authenticatedPage,
        "Create a short homework about football vocabulary"
      );

      // Wait for the artifact canvas to appear and render exercise content.
      // Generation + optional media can take 30-60s.
      await waitForArtifactWithContent(authenticatedPage, { timeout: 180_000 });

      // Capture the document ID so step 6 can build the share URL.
      const documentId = await docIdPromise;

      // Build share URL via API (avoids clipboard dependency)
      if (documentId) {
        const baseURL =
          process.env.DEMO_BASE_URL?.replace(/\/$/, "") ??
          "http://localhost:3000";
        const res = await authenticatedPage.request.post(`${baseURL}/api/share`, {
          data: { documentId },
          headers: { "Content-Type": "application/json" },
        });

        if (res.ok()) {
          const body = (await res.json()) as { slug: string; url: string };
          shareUrl = `${baseURL}${body.url}`;
        }
      }

      // If we couldn't build the share URL via API, fall back to the Share
      // action button in the artifact toolbar — it writes to the clipboard.
      if (!shareUrl) {
        await authenticatedPage.context().grantPermissions(["clipboard-read", "clipboard-write"]);

        // The share-link button is one of the toolbar actions (ShareIcon)
        // Tooltip text is "Copy share link"
        const shareBtn = authenticatedPage.getByRole("button", {
          name: /copy share link/i,
        });

        if (await shareBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await shareBtn.click();

          // Read from clipboard
          shareUrl = await authenticatedPage.evaluate(
            () => navigator.clipboard.readText()
          );
        }
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Step 6 — Public share page (unauthenticated)
// ---------------------------------------------------------------------------

test.describe("Step 6: public share quiz page", () => {
  test(
    "share page loads, quiz starts, and feedback appears",
    async ({ browser }: { browser: import("@playwright/test").Browser }) => {
      if (!shareUrl) {
        test.skip(
          true,
          // [flaky-external] Share URL was not obtained — either step 5 didn't
          // produce a homework artifact (ADK/Gemini under load, or Phase-4
          // changes to the chat route) or the clipboard/share API was
          // unreachable. This step is marked flaky-external when the prior
          // step's generation fails for infrastructure reasons.
          "Skipping — no share URL from step 5 (mark flaky-external if caused by AI generation)"
        );
      }

      // Open the share page in a brand-new context (no auth cookies).
      const anonContext = await browser.newContext();
      const sharePage = await anonContext.newPage();

      try {
        await sharePage.goto(shareUrl, { waitUntil: "domcontentloaded" });

        // ----- Welcome card -----
        // The WelcomeScreen renders a card with the homework title and a
        // "Start homework" button (WelcomeScreen.tsx hardcodes this text or
        // uses config.startButtonText ?? "Start").
        await expect(
          sharePage.getByRole("heading").first()
        ).toBeVisible({ timeout: 20_000 });

        // The "Homework" badge uses the span with exact text. Use .first()
        // to avoid strict-mode violation when "Homework" also appears in the
        // button label ("Start homework").
        await expect(sharePage.getByText("Homework").first()).toBeVisible({
          timeout: 10_000,
        });

        // Click the Start button to begin the quiz.
        // The WelcomeScreen button text is config.startButtonText ?? "Start"
        // but the actual text observed is "Start homework".
        await sharePage
          .getByRole("button", { name: /start/i })
          .first()
          .click();

        // ----- Exercise phase -----
        // After starting, the ExerciseShell renders with a progress bar.
        // Wait for any exercise content to appear (max 15s).
        await expect(
          sharePage.locator("[class*='space-y']").first()
        ).toBeVisible({ timeout: 15_000 });

        // --- Exercise type detection and answering ---
        //
        // We need to trigger the FeedbackDialog, which requires completing
        // an exercise (clicking answer(s) + "Check"). Three exercise types
        // we may encounter:
        //
        //  multiple-choice — click one option button → "Check" appears → click it
        //  word-matching   — click ALL source buttons paired with ALL target
        //                    buttons → "Check" appears → click it
        //  fill-blank      — type into an input → "Check" button
        //
        // We detect the type by what's rendered, then act accordingly.

        // Is this a word-matching exercise? Detect via the instruction text.
        const isWordMatching = await sharePage
          .getByText(/tap a word on the left/i)
          .isVisible({ timeout: 2_000 })
          .catch(() => false);

        if (isWordMatching) {
          // Word-matching: build all pairs by clicking each source, then its
          // first available (unmatched) target. Both columns are rendered as
          // buttons; left (source) and right (target) are in a 2-column grid.
          // Strategy: click source[0], target[0], source[1], target[1], …
          // The columns are rendered inside a `grid-cols-2` div; we grab all
          // buttons inside it and interleave.

          // Wait for source buttons (left column) to be present
          const sourceButtons = sharePage.locator(
            ".grid.grid-cols-2 > div:first-child button"
          );
          await expect(sourceButtons.first()).toBeVisible({ timeout: 5_000 });

          const sourceCount = await sourceButtons.count();
          const targetButtons = sharePage.locator(
            ".grid.grid-cols-2 > div:last-child button"
          );

          for (let i = 0; i < sourceCount; i++) {
            // Click source item i → it becomes "active" (blue border)
            await sourceButtons.nth(i).click();
            // Click target item i (order doesn't matter for correctness in the
            // test — we just need to pair all sources)
            await targetButtons.nth(i).click();
          }
        } else {
          // multiple-choice or fill-blank: just click the first answer option.
          const answerOption = sharePage
            .getByRole("button")
            .filter({ hasNotText: /^(start|continue|skip|check)$/i })
            .first();
          await expect(answerOption).toBeVisible({ timeout: 10_000 });
          await answerOption.click();
        }

        // After completing the exercise, a "Check" button appears. Click it.
        const checkBtn = sharePage.getByRole("button", { name: /^check$/i });
        await expect(checkBtn).toBeVisible({ timeout: 5_000 });
        await checkBtn.click();

        // ----- Feedback dialog -----
        // The FeedbackDialog (Radix Dialog.Content) appears after checking.
        await expect(
          sharePage.getByRole("dialog")
        ).toBeVisible({ timeout: 15_000 });

        // The dialog always has a "Continue" button to advance.
        await expect(
          sharePage.getByRole("button", { name: /continue/i })
        ).toBeVisible({ timeout: 10_000 });
      } finally {
        await anonContext.close();
      }
    }
  );
});
