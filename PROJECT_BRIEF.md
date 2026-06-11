# TeachFlow — Full Project Brief

*Written for someone with zero prior context. State as of June 11, 2026, ~22:30 CEST (deadline day).*

## 1. What is this and why does it exist

We are competing in the **Google Cloud (for Startups) AI Agents Challenge** on Devpost.
**Submission deadline: TODAY, June 11, 2026, 5:00 PM Pacific** (= 02:00 June 12 CEST).

- **Prize pool:** $60,000 cash + $37,500 GCP credits; Grand Prize $15k, plus per-track and regional prizes.
- **Our track:** **Track 1 — Build (Net-New Agents)**: build a brand-new autonomous agent with Google's **Agent Development Kit (ADK)**, ideally using **MCP** (Model Context Protocol) to connect tools.
- **Judging:** Technical Implementation **30%**, Business Case **30%**, Innovation & Creativity **20%**, Demo & Presentation **20%**.
- **Required deliverables:** code, demo video, architecture diagram, testing access (live URL).

## 2. The product

**TeachFlow — "Your AI teaching studio."** A workspace for private teachers/tutors
(language tutors are the focus) to manage their students with an AI copilot that
*actually remembers each student*.

Core concept: **one persistent AI agent per student.**

- The teacher picks a student in the sidebar and chats with that student's agent
  (left panel). The agent knows the student's level, goals, strengths, recurring
  errors, interests — accumulated **agentic memory** (the agent itself decides
  what's worth remembering via a `save_fact` tool; facts persist across chats).
- The agent creates **artifacts** that appear on a live canvas (right panel),
  streaming in as they're generated:
  - **Lesson plans** — markdown documents.
  - **Homework** — *interactive* exercise sets: multiple choice, fill-the-blank,
    word matching, gap fill, word puzzles, sentence matching, **listening
    exercises (audio generated with Gemini TTS)** and **image flashcards
    (illustrations generated with Gemini image models)**.
- **Video pipeline:** the teacher uploads a lesson recording → it goes to cloud
  storage → an async pipeline has **Gemini watch the actual video** and extract
  what was covered, where the student struggled/shone → that lands as a report
  artifact + new memory facts. Next time the teacher opens the chat, the agent
  already knows what happened in yesterday's lesson.
- **Share links:** any artifact can be made public with one click. The student
  opens `teachflow.../s/abc123` — no account — and does the homework in a
  polished quiz player with **instant feedback**. (Currently teacher-only
  accounts; students access via links.)
- Plus a **marketing landing page** at `/` so the product feels real.

### Why it can win
- It's a genuinely *agentic* product (memory with agency, tools, async pipelines
  feeding the agent), not a chat wrapper.
- It uses the full sponsored stack credibly: ADK (TypeScript), MCP, Gemini
  (text + structured output + multimodal video + TTS + image gen), Cloud Run,
  Cloud SQL, Cloud Storage, Pub/Sub.
- Strong business case: tutoring is a huge fragmented market; tutors do hours
  of unpaid prep; per-student memory is a real moat vs. generic ChatGPT use.
- It demos beautifully in 3 minutes (see demo flow, §7).

## 3. Architecture

```
Teacher ──► Cloud Run (one service: Next.js 16 app + embedded ADK agent runtime)
              ├─ /api/chat → ADK LlmAgent (gemini-3.5-flash) with tools:
              │     save_fact / search_memory          (agentic memory, per student)
              │     create_lesson_plan / create_homework / update_artifact
              │     get_student_profile / list_videos / get_video_analysis
              │     generate_illustration / generate_audio_snippet
              │     exercise catalog via MCP server (Model Context Protocol)
              ├─ Cloud SQL Postgres: students, memory facts, chats, artifacts, share slugs
              ├─ Cloud Storage: lesson videos, generated audio (WAV) & images (PNG)
              ├─ Pub/Sub: video-analyze topic → OIDC-authenticated push back into
              │     the service → Gemini multimodal analyzes the video → report + facts
              └─ /s/[slug]: public share pages (quiz player, no auth)
Student ──► share link
```

Key engineering details:
- **ADK ↔ UI bridge:** the chat UI is the Vercel AI SDK streaming protocol; we
  wrote a bridge that converts ADK's event stream (text deltas, tool calls)
  into AI SDK UI message parts, including the artifact-canvas streaming
  choreography. Token-level streaming UX with an ADK agent underneath.
- **Homework generation:** Gemini structured output against strict Zod schemas
  per exercise type; invalid exercises are filtered, never break the player.
  Audio/images are generated *after* the JSON (the LLM writes a `prompt`/
  `imagePrompt`; a media post-processor generates WAV/PNG, caches by content
  hash, uploads, and injects URLs).
- **Local-dev parity:** everything runs with zero GCP resources (files on disk,
  in-process analysis instead of Pub/Sub) — same code, mode flags.

## 4. Where the code came from (honest provenance)

- Base: **vercel/ai-chatbot** template (chat UI, auth, artifact canvas) — heavily adapted.
- The **quiz player** was ported from our own earlier project (linqua monorepo /
  linqua-quizapp — 37 exercise types existed there; we ported 6 + added 2 new media ones).
- **Prompts/pedagogy:** we harvested production prompts from our earlier
  language-learning projects (homework generation with student-profile
  variables, lesson-recording analysis rubrics, answer-key verification rules)
  and a **pedagogy rubric** (didactic stages, CEFR guidance, controlled→free
  sequencing) that's embedded in the generation prompts.
- Everything else (students UX, memory, ADK agent, video pipeline, share
  system, landing) was built today from scratch.

## 5. Current status (what exists right now)

**Done and verified:**
- Full app builds and runs; committed on `main` (local git repo at
  `~/Code/linqua/teachflow`, no remote yet).
- End-to-end flow verified locally: create student → chat → agent saves memory
  facts → lesson plan streams to canvas → homework generates (13–15s) → share
  link → public quiz play with instant feedback. 7 homework + 3 lesson-plan
  artifacts persisted during testing.
- Landing page, login/guest auth, student CRUD + profile/memory/artifacts/videos
  panel, video upload + Gemini video analysis (verified locally), share pages.
- GCP project **teachflow-hack-611** fully provisioned: Cloud SQL (schema
  pushed), GCS bucket, Pub/Sub topic, service accounts/IAM, **paid-tier Gemini
  key** (the original key was free-tier, 20 req/day — we hit that wall and
  minted a billed key from the project; images + TTS now unblocked).
- Brand imagery generated with Gemini image gen (hero, OG card, empty-states).
- README with mermaid architecture diagram; Dockerfile + deploy script.

**In flight right now (parallel agent teams):**
1. **Phase 3 workflow** (3 coding agents + finalizer): audio (TTS) listening
   exercises + image flashcards wired into homework generation and the quiz
   player; new agent tools (`generate_illustration`, `generate_audio_snippet`,
   web-search sub-agent, MCP exercise catalog); pedagogy-rubric prompt upgrade;
   screenshot-driven design polish pass (Playwright shoots every page, agent
   fixes what looks off, rebrands all leftover template strings); then a full
   live E2E test and commit.
2. **Investigator agent:** researching the hackathon page + past winning
   projects, producing a ranked list of high-impact agentic features we can
   still implement today (multi-agent patterns, proactive autonomous behaviors,
   eval harness, business-case artifacts).
3. **Cloud Run deployment:** two build attempts failed on environment issues
   (stale lockfile; a dependency version bump) — both fixed; final deploy goes
   out as soon as Phase 3 commits.

**Not done yet:**
- Final deploy + production E2E on the live URL.
- Implementation wave for the investigator's best ideas.
- Demo video (script is drafted in README §Demo flow; recording is on the human).
- Devpost submission text + screenshots.
- Possibly: GitHub repo push (needs a decision on which account/org).

## 6. Repo map (for orientation)

```
teachflow/
├─ app/(marketing)/        landing page
├─ app/(chat)/app/…        studio: student pages, chat
├─ app/(chat)/api/…        chat (ADK bridge), students, videos, share, history
├─ app/api/pubsub/…        Pub/Sub push endpoint (video analysis)
├─ app/s/[slug]/           public share pages
├─ artifacts/…             canvas artifact kinds (text, code, sheet, homework)
├─ components/quiz/        ported quiz player (chain runner + exercise components)
├─ components/studio/      student list/dialog/panel
├─ lib/agent/              ADK agent: prompts, tools, run bridge
├─ lib/media/              TTS + image generation + cache/enrichment
├─ lib/analysis/           video analysis pipeline
├─ lib/quiz/               homework Zod schemas, → player format mapping
├─ lib/db/                 Drizzle schema + queries (template + studio additions)
├─ mcp/                    MCP exercise-catalog server (stdio)
├─ infra/deploy.sh         Cloud Run deploy + Pub/Sub wiring
├─ docs/harvest/           research: prompts, pedagogy rubric, media APIs, ideas
├─ CONTRACTS.md            internal build contracts (file ownership, streaming protocol)
└─ README.md               submission-facing: pitch, architecture diagram, demo flow
```

## 7. The 3-minute demo flow (what the video will show)

1. Landing page → "Open studio".
2. Add student *Anna* (B1, Spanish→English, goal: conversational fluency).
3. Chat: "Anna kept mixing past simple and present perfect today, and she loves
   cooking" → watch the agent **save memory facts** (visible in the side panel:
   "What the AI knows").
4. "Plan our next 60-minute lesson" → lesson plan **streams onto the canvas**.
5. "Now make homework from it — include a listening exercise and an image
   flashcard" → homework streams in exercise-by-exercise; audio + images
   generate; preview is playable in place.
6. Click **Share** → open the link in an incognito window → do two exercises
   as the student, instant feedback, hear the TTS audio.
7. Upload a short lesson video → the analysis report appears + new memory facts.
8. Open a **new** chat: "What should we focus on next?" → the agent answers
   from memory + video analysis. *"The agent worked while you were away."*
9. Close on the architecture diagram (ADK + MCP + Gemini + Cloud Run/SQL/GCS/Pub/Sub).

## 8. Open questions / where a fresh brain helps

- **Business case (30% of judging!):** sharpest framing of market + pricing?
  Current thinking: solo tutors & micro-schools, $19–29/mo per teacher,
  prep-time savings (2–4 h/week) as the wedge; per-student memory as moat.
  Better angles welcome.
- **Innovation framing:** what single sentence makes judges go "oh, that's new"?
  Candidate: "Every student gets their own agent — memory with agency, fed by
  real lesson footage."
- **Demo beats:** anything in §7 that drags or is missing a wow moment?
- **Risks we're watching:** Gemini latency during live judging (mitigation:
  pre-seeded demo data + the recorded video); ADK streaming edge cases
  (mitigation: non-ADK fallback path behind an env flag); deploy freshness
  (mitigation: deploy early, keep dev URL as backup).
- **Naming/branding:** "TeachFlow" is a working title — better ideas accepted
  until the Devpost form is submitted.

## 9. How to run it

```bash
cd ~/Code/linqua/teachflow
pnpm install
cp .env.example .env.local   # needs POSTGRES_URL + a Gemini API key (both vars)
pnpm db:push && pnpm dev     # → http://localhost:3000
```

No GCP needed locally (disk storage + in-process video analysis). The live
Cloud Run URL will be in the README once the final deploy lands.
