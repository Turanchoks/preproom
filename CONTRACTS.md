# PrepRoom — Build Contracts (internal, for parallel implementation)

PrepRoom = teacher's AI studio. Teacher picks a student; per-student agent chat
(left) + artifact canvas (right). Artifacts: lesson plans (kind `text`) and
homework (kind `homework`, interactive quiz JSON). Public share links at
`/s/[slug]`. Lesson videos → GCS → Pub/Sub → Gemini analysis → memory facts.

Base: vercel/ai-chatbot (commit 2becdb4, Next 16, AI SDK v6 `ai@6.0.116`,
NextAuth v5 guest auth, Drizzle + postgres-js, Tailwind v4 + shadcn).
Model provider swapped to `@ai-sdk/google` (see `lib/ai/providers.ts`,
`lib/ai/models.ts`). Default model `gemini-3.5-flash` — verified working with
the configured `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`.

## Hard rules
- Do NOT add/remove npm deps — everything needed is preinstalled
  (`@google/adk`, `@google/genai`, `@ai-sdk/google`, `zustand`, `immer`,
  `@google-cloud/storage`, `@google-cloud/pubsub`, `google-auth-library`,
  `@modelcontextprotocol/sdk`, `@mikro-orm/postgresql`).
- Do NOT touch files owned by another track (ownership map below).
- Postgres is local: `POSTGRES_URL` in `.env.local`; schema already pushed
  (`pnpm db:push`). DON'T run db:push unless you changed `lib/db/schema.ts`
  (only Track owner of schema may — i.e. nobody; ask orchestrator).
- Typecheck your own files compile: `npx tsc --noEmit` may show PRE-EXISTING
  errors in `components/ai-elements/reasoning.tsx` (template bug) and
  `components/chat/document-preview.tsx` (mock Document missing `studentId`;
  integration fixes). Don't chase those two; do fix errors in YOUR files.

## DB (done — `lib/db/schema.ts`, `lib/db/queries-studio.ts`)
Tables: `Student`, `StudentFact` (memory), `Video`, `Share` (+ `Chat.studentId`,
`Document.studentId`, Document kind enum now includes `"homework"`).
Use the exported query helpers in `lib/db/queries-studio.ts` — do not write raw
clients. Template queries stay in `lib/db/queries.ts` (`saveDocument`, etc.).

## Artifact streaming contract (CRITICAL — template-native)
Canvas opens when these data parts arrive on the chat stream, in order:
1. `{type:"data-kind", data:<kind>, transient:true}`
2. `{type:"data-id", data:<documentId>, transient:true}`
3. `{type:"data-title", data:<title>, transient:true}`
4. `{type:"data-clear", data:null, transient:true}`
5. N× content deltas: `data-textDelta` (text kind) / `data-homeworkDelta`
   (homework kind; data is a string chunk of the homework JSON)
6. `{type:"data-finish", data:null, transient:true}`
Persist content via `saveDocument` (template) or `saveStudentDocument`
(queries-studio, sets studentId). `CustomUIDataTypes` in `lib/types.ts` already
declares `homeworkDelta` + `toolActivity`.

## Homework content contract (done — `lib/quiz/homework-schema.ts`)
`homeworkSchema` = `{title, lessonSummary, exercises:[{id,type,title,
instructions,payload}]}` with 5 exercise types: multiple-choice, fill-blank,
word-matching, fill-gaps, word-puzzle. Track A may amend payload schemas to
match the real ported player components — everyone else imports from this file.

## Route map (Track B owns moves)
- `/` landing (public) · `/app` → redirect to first student
- `/app/student/[studentId]` new chat · `.../chat/[chatId]` resume
- `/s/[slug]` public share (no auth) · API under `app/(chat)/api/*`
- `proxy.ts` must allow `/`, `/s/*` unauthenticated.

## File ownership
- **Track A (quiz):** `components/quiz/**`, `lib/quiz/**`, `app/s/**`
- **Track B (students+routes+landing):** `app/(marketing)/**`,
  `app/(chat)/app/**`, `app/(chat)/page.tsx` (moves), `app/(chat)/chat/**`
  (moves), `proxy.ts`, `app/(chat)/api/students/**`, `app/(chat)/api/history/`
  (adds ?studentId=), `components/chat/app-sidebar.tsx`,
  `components/studio/**` (student-list, student-form-dialog, student-panel)
- **Track C (homework artifact + share):** `artifacts/homework/**`,
  `components/chat/artifact.tsx` (register kind), `lib/artifacts/server.ts`
  (register handler), `components/chat/artifact-actions.tsx` (share action),
  `app/(chat)/api/share/**`, `lib/ai/tools/create-document.ts` (kind enum desc)
- **Track D (ADK agent):** `lib/agent/**`, `app/(chat)/api/chat/route.ts`,
  `lib/ai/prompts.ts` (system prompt + student context)
- **Track E (video):** `lib/analysis/**`, `lib/gcs.ts`,
  `app/(chat)/api/videos/**`, `app/(chat)/api/uploads/**`,
  `app/api/pubsub/**`, `app/(chat)/api/files/upload/route.ts` (GCS re-point)
- Shared read-only: `lib/types.ts`, `lib/db/*`, `lib/quiz/homework-schema.ts`
  (A may edit), `lib/ai/providers.ts`, `lib/ai/models.ts`

## Env (`.env.local` exists)
`POSTGRES_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_API_KEY`, `USE_ADK=1`,
`PUBSUB_MODE=direct`. GCS/PubSub vars unset locally — all GCP code must
degrade gracefully (local fallback) when unset.
