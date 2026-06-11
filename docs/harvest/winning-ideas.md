# Winning Ideas — Google for Startups AI Agent Challenge 2026 (due TODAY 5 PM PT)

## 1. What the research says

### Judging (confirmed)
Technical Implementation **30%** · Business Case **30%** · Innovation & Creativity **20%** · Demo & Presentation **20%**.
The official hackathon page (devpost.team) is behind a login wall, but coverage of the challenge
([DevShelfHub deep-dive](https://www.devshelfhub.com/articles/google-startups-ai-agent-challenge-2026/),
[Google Cloud startups blog](https://cloud.google.com/blog/topics/startups/startups-are-building-the-agentic-future-with-google-cloud))
is consistent on what judges reward:

- **"Production rigor over demo-stage polish."** Explicitly: evaluation pipelines with a dataset + rubric + *numerical results*, guardrails (input filters, output validation, tool permission scoping), observability (queryable logs of all tool calls), cost/token controls, reproducible deployment (Cloud Run counts), security via service accounts/OIDC.
- **"Lead with a metric."** "Cut response time by 73%" beats a feature list. Vague business cases are the #1 cited pitfall.
- **Real MCP integration, not hardcoded** — explicitly called out as a winning tip. (We already have a real stdio MCP server — say so loudly.)
- **Submission components judges expect:** ~3-min video (problem → agent → results), ONE clear architecture diagram, eval documentation, open repo, **public demo URL judges can test**, business narrative with a measurable success metric and roadmap.
- Emphasized tech: Gemini, **ADK** (lowest-friction path, aligns with judging tooling), **MCP** (explicitly highlighted), Agent Engine, Cloud Marketplace / Gemini Enterprise (Track 3 only — not our problem).
- Cited pitfalls: "submitting a chatbot demo instead of a deployed agent", cherry-picked outputs with no eval data, no guardrails, no security/deployment narrative.

### What won comparable Google agent hackathons (2025–26)
[ADK Hackathon results](https://cloud.google.com/blog/products/ai-machine-learning/adk-hackathon-results-winners-and-highlights/) (10,400 participants, 477 projects):

- **Grand prize: SalesShortcut** — multi-agent SDR that runs an *entire job autonomously* (lead gen → research → proposal → outreach). Pattern: "the agent did work while no human was in the loop."
- **Two of five winners were education**: Edu.AI (autonomous essay grading + personalized study plans + mock exams) and Nexora-AI (personalized lessons with visuals + quizzes). Our domain is proven winner territory — *judges like education agents that close the personalization loop autonomously*.
- Honorable mentions leaned on **Agent Engine + Cloud Run + multi-agent orchestration** named explicitly in the writeup.

**Shared winner patterns:** (1) multi-agent / sub-agent orchestration visibly used, not just one LLM with tools; (2) an autonomous loop that produces business output without a human turn; (3) a clear business job being replaced/accelerated, stated as a metric; (4) breadth of GCP services named in the architecture diagram.

### Where TeachFlow stands
Strong already: real ADK LlmAgent + AgentTool sub-agent (web_search), real MCP toolset, agentic memory, multimodal video pipeline (GCS→Pub/Sub→Gemini), Cloud Run + Cloud SQL deploy, share links. **Gaps vs the rubric:** almost no Business Case artifacts (30%!), no evals, no stated observability/guardrails story, the loop is open (student results never come back), and nothing runs without a human turn.

---

## 2. Ideas, ranked by score-impact-per-hour

| # | Idea | Criterion moved | Effort | Demo-able in 3-min video? | Impact/hr |
|---|------|-----------------|--------|---------------------------|-----------|
| 1 | Business Case package (README + landing pricing + unit economics) | Business 30% | 1–1.5 h | Yes (closing slide + landing scroll) | ★★★★★ |
| 2 | Proactive post-video loop: agent drafts next lesson + homework while teacher is away | Tech + Innovation + Demo | 2–3 h | Yes — the killer beat | ★★★★★ |
| 3 | Close the loop: student homework results → memory facts → agent knows | Tech + Innovation + Business | ~2 h | Yes — second-best beat | ★★★★☆ |
| 4 | Eval harness for homework generation + EVALS.md with numbers | Tech 30% | ~2 h | Yes (10-sec table flash) | ★★★★☆ |
| 5 | Pedagogy-critic sub-agent (AgentTool, generator→critic→revise) | Tech + Innovation | 1–1.5 h | Yes (tool-activity chips show it) | ★★★★☆ |
| 6 | Observability: structured JSON tool-call logs + run trace IDs | Tech 30% | ~1 h | Marginal (Cloud Logging screenshot) | ★★★☆☆ |
| 7 | Production-readiness section: guardrails + security + cost controls + polished diagram | Tech + Business + Demo | ~1 h | Yes (diagram is required anyway) | ★★★★☆ |
| 8 | 3-min video script + demo URL polish (seeded demo student) | Demo 20% | 0.5–1 h | It IS the video | ★★★★☆ |
| 9 | A2A agent card: `/.well-known/agent.json` exposing TeachFlow as an A2A-discoverable agent | Tech + Innovation (buzzword coverage) | 1–2 h | Briefly (one diagram label) | ★★☆☆☆ |
| 10 | Cost/token budget guard in agent runner (per-run token cap + cost log line) | Tech | 0.5 h | No (README bullet) | ★★★☆☆ |

If time runs short after the MUST-DOs: do #7 and #8 (they harden the submission package itself), then #5, then #6/#10 as README bullets backed by small code, then #9 only if everything else is done.

---

## 3. MUST-DO top 4 — implementation briefs (executable by a coding agent)

### MUST-DO 1 — Business Case package (1–1.5 h, moves 30% of score)
Currently near-zero coverage of a criterion worth as much as all of Technical. **Brief:** Add a `## Business case` section to `/Users/turanchoks/Code/linqua/teachflow/README.md` containing: (a) the lead metric — "TeachFlow cuts per-student lesson prep from ~45 min to under 5 min" and "turns a 1-hour lesson recording into next-lesson plan + homework with zero teacher time"; (b) market sizing — global private tutoring ≈ $100B+ growing ~9% CAGR, online language learning ≈ $60B, tens of millions of independent tutors/teachers worldwide; ICP = independent language tutors and small tutoring studios; (c) unit economics — estimate per-action costs from our stack (gemini-3.5-flash chat turn: fractions of a cent; one homework generation: ~$0.01–0.03; one 30-min video analysis: ~$0.10–0.30; TTS/image cents each) vs pricing $19/teacher/mo (Solo, up to 15 students) and $49/mo (Studio, unlimited + video analysis) → ~85–90% gross margin at typical usage; include a small cost table; (d) go-to-market: tutor communities, marketplace integrations (Preply/iTalki teachers), school pilots; roadmap: parent reports, multi-teacher studios, Cloud Marketplace listing (Track 3 trajectory). Then add a matching `Pricing` section/component to the marketing landing page in `app/(marketing)/` (find the landing page file; add a simple 2-tier pricing block with shadcn Card styling consistent with the page). Keep numbers labeled as estimates. No new deps.

### MUST-DO 2 — Proactive post-video agent loop: "your copilot worked while you were away" (2–3 h)
This is the SalesShortcut pattern — autonomous output with no human turn — and our strongest demo beat. **Brief:** Create `/Users/turanchoks/Code/linqua/teachflow/lib/agent/proactive.ts` exporting `runProactivePrep({ videoId, studentId })`. It builds a no-op `UIMessageStreamWriter` (object whose `write()` discards data parts — artifact handlers in `lib/artifacts/server.ts` persist via `saveDocument` regardless of the stream, so artifacts still land in the DB) and reuses `buildAgentTools` from `lib/agent/tools.ts` with that writer, restricted to the relevant tools (`get_student_profile`, `get_video_analysis`, `create_lesson_plan`, `create_homework`, `save_fact`). Construct an `LlmAgent` (same pattern as `runStudioAgent` in `lib/agent/run.ts`, model `gemini-3.5-flash`) with an instruction: "A lesson video for {student} was just analyzed. Read the analysis, then (1) create a next-lesson plan targeting the struggles, (2) create a homework set drilling them, (3) save one 'note' fact: 'Proactive prep ready: <plan title> + <homework title> (drafted from video <title>)'." Drive it with a `Runner` + `InMemorySessionService` and a single synthetic user message. Hook: in `lib/analysis/video-analyze.ts`, after step (c) `updateVideo({status:"ready"...})`, call `runProactivePrep(...)` wrapped in try/catch (failures must never break analysis; honor a `PROACTIVE_PREP=0` env kill-switch). The note fact makes the agent itself announce the prep in the next chat ("While you were away I drafted..."), and the artifacts appear in the student's artifact list — verify via the demo flow: upload video (local `PUBSUB_MODE=direct`), wait, open student → two new artifacts exist. Also add a sentence + diagram edge ("autonomous prep loop") to README.

### MUST-DO 3 — Close the loop: student results flow back into agent memory (~2 h)
Turns "share a quiz" into a closed learning loop — strong for Business (engagement/retention story), Technical, and a clean demo beat. **Brief:** Add a public route `app/(chat)/api/share/[slug]/results/route.ts` (or `app/api/share-results/route.ts` if route-group auth interferes — must be reachable unauthenticated; check `proxy.ts` allows it like `/s/*`). POST body: `{slug, score, total, perExercise: [{title, type, correct, attempts}]}` validated with zod, hard caps (perExercise ≤ 30, strings ≤ 200 chars). Resolve the share by slug via the Share queries in `lib/db/queries-studio.ts` to get `studentId` — never trust client IDs. Persist WITHOUT schema changes as memory facts via `saveStudentFact`: one `progress` fact "Homework '<title>': scored X/Y on <date>", plus one `error` fact per failed exercise ("Struggled with '<ex title>' (<type>) in homework"), `source: "homework_results"`, `sourceRef: shareId`. Client side: in `components/quiz` the chain runner already computes results (`components/quiz/core/chain-runner.ts`, types in `core/types.ts` have score/attempts) — in `app/s/[slug]/share-homework.tsx`, on quiz completion fire a single `fetch POST` with the summary (fire-and-forget, errors swallowed; guard against double-send with a ref). Demo: do homework in incognito, return to chat, ask "How did Maria do on her homework?" → `search_memory` surfaces the results. Optionally add one line to the system prompt in `lib/agent/prompts.ts` noting that homework results arrive as memory facts with source `homework_results`.

### MUST-DO 4 — Eval harness + EVALS.md with real numbers (~2 h)
Judges explicitly demand "dataset, rubric, and numerical results"; "cherry-picked outputs without evaluation data" is a named pitfall. **Brief:** Create `/Users/turanchoks/Code/linqua/teachflow/evals/homework-eval.ts` (run with `npx tsx evals/homework-eval.ts`; no new deps — use `@google/genai` + `zod` + `lib/quiz/homework-schema.ts`). Dataset: 8–10 golden briefs inline in the file (varied CEFR A1–C1, languages, grammar topics — e.g. "A2 Spanish, past simple vs imperfect, food vocabulary"). For each brief, generate homework using the same generation path/prompt as the homework artifact handler (`artifacts/homework/` — import its generation function or replicate its prompt + `responseJsonSchema` call). Score each output on: (1) **schema validity** — parses against `homeworkSchema` (deterministic); (2) **structural checks** — ≥4 exercises, ≥3 distinct types, fill-blank answers actually fit their sentences, multiple-choice has exactly one correct option (deterministic); (3) **LLM-judge rubric** — gemini-3.5-flash judges level-appropriateness, topic relevance, and instruction clarity 1–5 using the rubric in `docs/harvest/pedagogy-rubric.md`. Print a per-brief table + aggregate pass rates, and write `docs/EVALS.md` with the methodology, the rubric, and the actual numbers from a real run (run it once, paste results). Add `## Evals` to README: "Homework generation passes 100% schema validity and X.X/5 mean pedagogy score across a 10-case golden set — `npx tsx evals/homework-eval.ts` to reproduce." If any check fails, that's a finding — fix the generation prompt and show before/after numbers (judges love before/after).

---

## 4. Remaining ideas — sketches

**#5 Pedagogy-critic sub-agent (1–1.5 h).** Clone the `buildWebSearchTool` AgentTool pattern in `lib/agent/tools.ts`: a `pedagogy_reviewer` LlmAgent whose instruction embeds `docs/harvest/pedagogy-rubric.md`, exposed as an AgentTool. Update `create_homework`'s tool description (and one line in `lib/agent/prompts.ts`) to instruct: after creating homework, call `pedagogy_reviewer` with the brief + exercise list; if the critique scores <4/5, call `update_artifact` with the fixes. The existing `data-toolActivity` chips make the generator→critic→revise loop *visible in the UI* — narrate "a second agent reviews every homework against a pedagogy rubric" in the video. Risk: adds latency to homework creation; cap at one revision cycle.

**#6 Observability (1 h).** In `lib/agent/run.ts`, generate a `runId` per `runStudioAgent` call; in `handleToolActivity` emit one structured JSON line per tool call/response: `console.log(JSON.stringify({severity:"INFO", runId, studentId, tool, phase, ms}))` — Cloud Run ships stdout JSON straight into Cloud Logging as queryable structured logs. Add a README "Observability" bullet with a sample log query (`jsonPayload.tool="create_homework"`). Screenshot Cloud Logging for the submission.

**#7 Production-readiness section + diagram polish (1 h).** README section "Production readiness" enumerating what ALREADY exists: zod validation of every homework JSON (output guardrail), OIDC-verified Pub/Sub push (security), per-student tool scoping — every tool closes over `studentId`, the agent physically cannot touch another student (tool permissioning!), unauthenticated surface limited to `/s/[slug]` slugs, graceful degradation paths (MCP fallback tool, direct-mode pipeline), reproducible deploy via `infra/deploy.sh`. Export the mermaid diagram as a clean PNG for the Devpost gallery (judges want one clear diagram, not a code wall). This is mostly *writing down* rigor we already built — extremely cheap points.

**#8 Video script (0.5–1 h).** Winning 3-min structure: 0:00–0:20 problem WITH metric ("45 min prep per student per lesson"); 0:20–1:00 chat → memory fact saved (show the tool chip) → lesson plan streams onto canvas; 1:00–1:30 homework streams in, share link, student completes it in incognito with instant feedback; 1:30–2:10 **the beat**: upload lesson video, cut to "20 minutes later" — agent has already drafted next lesson + homework and tells you so ("worked while you were away"); 2:10–2:35 ask "how did Maria do on her homework?" — agent answers from results memory (closed loop); 2:35–3:00 architecture diagram flash (name ADK, MCP, Gemini multimodal, Cloud Run, Cloud SQL, Pub/Sub) + eval table flash + pricing/unit-economics slide + roadmap one-liner. Seed the deployed demo with a believable student + history so judges who click the URL land in a living product; verify guest sign-in works on prod.

**#9 A2A agent card (1–2 h, only if time remains).** Cheap version: serve a static A2A AgentCard at `app/.well-known/agent.json/route.ts` (name, description, skills = lesson planning/homework generation/progress memory, auth note) and mention "A2A-discoverable; full A2A server on the roadmap via Agent Engine" in README. Honest, low effort, covers the buzzword. Risk: a judge probes it expecting a live A2A task endpoint — keep wording precise ("agent card published; task endpoint in progress"), or skip if it feels thin.

**#10 Token/cost guard (0.5 h).** In `runStudioAgent`, count events/characters streamed; abort the runner loop past a generous ceiling and log a `cost_guard_triggered` line. One README bullet: "per-run token budget enforced." Pairs with #6.

---

## 5. Submission checklist (from judge expectations)
- [ ] Repo public/access granted; README leads with the metric, not the stack
- [ ] ~3-min video: problem → agent → results; show autonomous beat + eval numbers + pricing slide
- [ ] One clean architecture diagram (PNG in Devpost gallery, mermaid in README)
- [ ] Public demo URL on Cloud Run, seeded demo student, guest login verified from incognito
- [ ] `docs/EVALS.md` with dataset, rubric, numerical results
- [ ] README sections: Business case, Production readiness, Observability, Evals
- [ ] Devpost text names: ADK (TypeScript), MCP (real stdio server), AgentTool sub-agents, Gemini 3.5 Flash multimodal, Gemini TTS + image gen, Cloud Run, Cloud SQL, GCS, Pub/Sub (OIDC)

Sources: [DevShelfHub — Google for Startups AI Agent Challenge 2026](https://www.devshelfhub.com/articles/google-startups-ai-agent-challenge-2026/) · [ADK Hackathon results — Google Cloud blog](https://cloud.google.com/blog/products/ai-machine-learning/adk-hackathon-results-winners-and-highlights/) · [Startups building the agentic future — Google Cloud blog](https://cloud.google.com/blog/topics/startups/startups-are-building-the-agentic-future-with-google-cloud) · [ADK Hackathon Devpost winners announcement](https://googlecloudmultiagents.devpost.com/updates/35783-and-the-winners-are) · [Google Cloud Rapid Agent Hackathon rules](https://rapid-agent.devpost.com/rules)
