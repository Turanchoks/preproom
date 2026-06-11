# Harvested Prompt Assets (linqua-quizapp + linqua-voiceflow)

Source repos:
- `/Users/turanchoks/Code/linqua/linqua-quizapp` (planner→generator architecture, educational schema catalog)
- `/Users/turanchoks/Code/linqua/linqua-voiceflow/supabase/migrations/` (production prompt texts, versioned in DB)

All prompt texts below are quoted verbatim from migrations unless marked "distilled".
Template variables use `{{double_braces}}` and are substituted server-side before the LLM call.

---

## 1. Homework generation

### 1.1 `homework_generator` v1 (voiceflow)

Source: `supabase/migrations/20260418193000_add_homework_visibility_and_profile_sync.sql` (lines 102–169).
Stored in `homework_prompts` table with `min_exercises=3`, `max_exercises=5`,
`available_exercise_types = ['writing','grammar','vocabulary','speaking','reading']`,
`model_config = {"temperature":0.7,"topK":40,"topP":0.95,"maxOutputTokens":4096}`.

**text_part (user prompt):**

```
Generate language homework for {{student_name}}.
Context:
- Level: {{student_level}}
- Goal: {{learning_goal}}
- Native language: {{native_language}}
- Learning language: {{learning_language}}
- Generation language: {{generation_language}}
- Lesson topic: {{lesson_topic}}
- Grammar theme: {{grammar_theme}}
- Strengths: {{student_strengths}}
- Errors: {{student_errors}}
- Areas for improvement: {{areas_for_improvement}}
- Teacher comments: {{teacher_comments}}
- Student portrait: {{student_portrait}}
- Psychological profile: {{psychological_profile}}

Return JSON only with a short homework_title, lesson_summary, and 3-5 exercises.
```

**system_instruction:**

```
Return valid JSON only. Keep the response student-safe. Each exercise must contain id, type, title, instructions, and content. answer is optional.
```

**json_schema (output contract):**

```json
{
  "type": "object",
  "required": ["homework_title", "lesson_summary", "exercises"],
  "properties": {
    "homework_title": { "type": "string" },
    "lesson_summary": { "type": "string" },
    "exercises": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["id", "type", "title", "instructions", "content"],
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "title": { "type": "string" },
          "instructions": { "type": "string" },
          "content": {},
          "answer": {}
        }
      }
    }
  }
}
```

**Variable list (14):** `student_name, student_level, learning_goal, native_language, learning_language, generation_language, lesson_topic, grammar_theme, student_strengths, student_errors, areas_for_improvement, teacher_comments, student_portrait, psychological_profile`

**Why it works / limitations:** the strength is the *variable manifest*, not the wording — it
pipes the entire student model (level, goal, L1/L2, errors, strengths, portrait, psychological
profile, teacher comments) plus a separate `generation_language` (the language the homework UI
copy is written in, distinct from the language being learned). The output schema is deliberately
loose (`content: {}`); the later chain-creator generation (below) replaced it with typed
artifacts. Use the variable list; use the chain prompts for structure.

---

## 2. Exercise-chain planning (the production two-stage pipeline, voiceflow)

This is the mature successor of the homework generator: a **planner → creator** pair, exactly
the architecture proposed in quizapp's design doc (section 5 below). Both are Gemini prompts
with strict JSON schemas, stored as versioned `prompt_versions` rows.

### 2.1 Chain planner — `platform-admin-chain-step-planner` v5 (`v5-pedagogical-profiles-methodology`)

Source: `supabase/migrations/20260510143000_update_chain_prompts_for_pedagogical_profiles.sql`.
Model config: `temperature 1, topP 0.9, maxOutputTokens 6000`, Gemini batch mode.

**system_instruction:**

```
You plan language-learning chains from student-facing step contracts.

Use only the provided StudentStepContracts. Never select, mention, or infer teacher tools. Never return teacher tool slugs, teacher tool titles, teacher tool input payloads, prompt families, or output block contracts. A material step shows content to the student. An activity step asks the student to respond. Deterministic activity steps require the creator to produce complete private answer data later. Non-deterministic activity steps must not invent answer keys.

Every StudentStepContract contains a pedagogicalProfile. Use its categories, didacticStage, learningFocus, controlLevel, learnerOutputMode, cefrUtility, participationModes, methodologyRoles, sequencingRole, planningNotes, and delivery constraints when choosing and ordering steps. The contract list is already filtered for deliveryMode and participationTarget, but your plan must still be coherent for those values.

Choose one methodologySlug from the supported methodology guidance and explain it in methodologyRationale. Do not return the legacy methodology field.

Return JSON only.
```

**text_part (user template):**

```
LessonChainContext:
{{lesson_chain_context}}

User-provided materials or instructions:
{{user_content_text}}

TargetStepCount:
{{target_step_count}}

PlanningMethodologyGuidance:
{{planning_methodology_guidance}}

StudentStepContracts:
{{student_step_contracts}}

Create a concise chain plan matching TargetStepCount. If TargetStepCount is a number, return exactly that many steps. If TargetStepCount is a range, choose the pedagogically appropriate length within that range. Choose stepType values only from StudentStepContracts. Use pedagogicalProfile data to sequence input, noticing, controlled practice, guided practice, production, reflection, and assessment steps. Every step must include title, instructions, artifactRequirement, rationale, and dependencyNotes so the creator can produce the required artifacts without seeing any teacher tool catalog.
```

**json_schema (planner output):**

```json
{
  "type": "object",
  "required": ["title", "description", "methodologySlug", "methodologyRationale", "steps"],
  "properties": {
    "title": { "type": "string" },
    "description": { "type": "string" },
    "methodologySlug": {
      "type": "string",
      "enum": ["ppp", "esa", "tblt", "text_based", "lexical", "controlled_to_free", "cefr_action_oriented"]
    },
    "methodologyRationale": { "type": "string" },
    "stagePlan": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["stage", "stepRange", "rationale"],
        "properties": {
          "stage": { "type": "string" },
          "stepRange": { "type": "string" },
          "rationale": { "type": "string" }
        },
        "additionalProperties": false
      }
    },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["stepType", "artifactType", "title", "instructions", "artifactRequirement", "rationale", "dependencyNotes"],
        "properties": {
          "stepType": { "type": "string" },
          "artifactType": { "type": "string" },
          "title": { "type": "string" },
          "instructions": { "type": "string" },
          "artifactRequirement": { "type": "string" },
          "rationale": { "type": "string" },
          "dependencyNotes": { "type": "string" }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

**Variables (5):** `lesson_chain_context, user_content_text, target_step_count, planning_methodology_guidance, student_step_contracts`

**`planning_methodology_guidance` injected text** (from
`20260510120000_add_pedagogical_profiles.sql`, function
`platform_admin_chain_planning_methodology_guidance()`):

```
Supported methodology slugs: ppp, esa, tblt, text_based, lexical, controlled_to_free, cefr_action_oriented. PPP moves from presentation/input or language focus to controlled practice and production. ESA moves from engage to study and activate. TBLT uses pre-task, task cycle, and language focus when task-based planning fits. Text-based planning uses input text, comprehension, language noticing, text manipulation, and output. Lexical planning moves from exposure and noticing to controlled chunk practice and freer chunk use. Controlled-to-free planning orders recognition and controlled practice before guided, semi-free, or free output. CEFR action-oriented planning prioritizes learner actions appropriate to the target level.
```

**`LessonChainContext` shape** (validated server-side; relevant keys):
`language` (required), `cefrLevel` (required, A1–C2), `deliveryMode`
(`self_study` | `teacher_led_class`, default `teacher_led_class`), `participationTarget`
(`solo` | `pair` | `group`, default `solo`; self_study forces solo), `topic`, `requiredWords[]`,
optional `source` (`{type: "recording_report", sessionId, analysisId}` — chains generated from a
lesson-analysis report). Later versions also carry `learningLanguage`, `explanationLanguage`,
`studentL1` (see hygiene block in 2.2). `userContent` is stripped from the context and passed
separately as `user_content_text`.

**What makes it effective:**
- Per-step `rationale` + `dependencyNotes` + chain-level `stagePlan` force the model to
  externalize sequencing logic that the creator can follow blindly.
- Methodology is an enum with one short, authoritative definition per slug — the model picks a
  recipe rather than inventing pedagogy.
- The planner never sees payload schemas; it sees "contracts" (compact cards) already filtered
  by CEFR/delivery, so prompt size stays flat as the catalog grows.
- Hard rule splitting deterministic vs non-deterministic activities ("must not invent answer
  keys") is repeated in both stages.

### 2.2 Chain creator — `platform-admin-chain-artifact-creator` v5 base + v8–v10 hardening

Base source: `20260510143000_update_chain_prompts_for_pedagogical_profiles.sql`. The active
prompt is the v5 text plus three appended blocks (v8, v9, v10 below). Model config after v8:
`temperature 0.45, topP 0.9, maxOutputTokens 65535`.

**system_instruction (v5 base):**

```
You create the content for a planned student-facing language-learning chain.

Use the chain plan and selected student step contracts. Return typed artifacts and ordered student step instances. Never return teacher tool slugs, teacher tool input payloads, outputBlock objects, prompt families, or internal generator instructions. Public artifact payloads must not contain answer keys or correctness fields. Deterministic activity artifacts must include complete privateEvaluationPayload.answerKey data. Non-deterministic artifacts may include review criteria, but must not include fake correct answers.

Every SelectedStudentStepContract contains a pedagogicalProfile. Use it to keep the artifact content aligned with the planned didactic stage, learning focus, control level, learner output mode, CEFR utility, participation target, sequencing role, and methodology roles.

Always adapt the generated content to deliveryMode and participationTarget in LessonChainContext: self_study must be usable without live teacher facilitation and must be solo; teacher_led_class may include teacher-led classroom interaction and may target solo, pair, or group work according to the selected contracts.

Return JSON only.
```

**text_part (v5 base):**

```
LessonChainContext:
{{lesson_chain_context}}

User-provided materials or instructions:
{{user_content_text}}

ChainPlan:
{{chain_plan}}

SelectedStudentStepContracts:
{{selected_student_step_contracts}}

Create the complete chain content immediately. Preserve the planned step count, step order, artifactType, and stepType values exactly. Preserve or refine the planned student-facing title and instructions for each step. For each step, return an artifact object with artifactType, title, publicPayload, and privateEvaluationPayload when required by the evaluation mode. Use each selected contract's pedagogicalProfile and artifactInstructions when shaping the student-facing content.
```

**json_schema (creator output):**

```json
{
  "type": "object",
  "required": ["title", "description", "steps"],
  "properties": {
    "title": { "type": "string" },
    "description": { "type": "string" },
    "steps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["stepType", "title", "instructions", "artifact"],
        "properties": {
          "stepType": { "type": "string" },
          "title": { "type": "string" },
          "instructions": { "type": "string" },
          "artifact": {
            "type": "object",
            "required": ["artifactType", "title", "publicPayload"],
            "properties": {
              "artifactType": { "type": "string" },
              "title": { "type": "string" },
              "publicPayload": { "type": "object", "additionalProperties": true },
              "privateEvaluationPayload": { "type": ["object", "null"], "additionalProperties": true }
            },
            "additionalProperties": false
          }
        },
        "additionalProperties": false
      }
    }
  },
  "additionalProperties": false
}
```

**Variables (4):** `lesson_chain_context, user_content_text, chain_plan, selected_student_step_contracts`

**v8 appended to text_part** (`20260510214500_raise_chain_creator_strict_output_budget.sql`,
also sets maxOutputTokens 65535, temperature 0.45):

```
Keep each generated step concise and complete. Prefer short A2-safe texts, short prompts, and compact answer keys over long explanations. Never spend output budget on hidden reasoning or commentary.
```

**v9 appended** (`20260510220500_require_complete_chain_creator_answer_keys.sql`):

system addition:
```
Use full JSON objects inside arrays. Never flatten records into key/value arrays such as ["id", "a", "text", "..."]; return [{"id": "a", "text": "..."}] instead. For every deterministic activity artifact, privateEvaluationPayload.answerKey.items must contain exactly one answer object for every student-answerable public question, item, leftItem, or card in that artifact. Partial answer keys are invalid.
```

user addition:
```
Before returning JSON, verify every deterministic artifact: the answerKey item ids must exactly match the public ids that the student answers. For choice steps this means every public question id; for matching steps every leftItems id; for text-input, sorting, scramble, word-bank, and rewrite steps every public items id; for flashcards every cards id. Return canonical object arrays only.
```

**v10 appended** (`20260511133000_harden_chain_creator_language_and_gap_hygiene.sql`) —
**this is the best L1/L2 hygiene block found anywhere in either repo**:

system addition:
```
Language and text hygiene:
- LessonChainContext.learningLanguage is the language being learned.
- LessonChainContext.explanationLanguage and LessonChainContext.studentL1 are the only allowed support languages.
- Student-facing titles, instructions, and publicPayload text must use only those languages. If English is not one of them, do not use English source sentences, examples, UI copy, or hidden scaffolding.
- Do not translate through literal English. Write natural sentences in the allowed language; if a literal translation sounds artificial, choose the natural equivalent that preserves the learning point.
- For sentence-scramble prompts, use the explanation language as the meaning cue or the learning language as the target cue. Never use English unless English is explicitly the learning or explanation language.
- Never output [[gap]] or any bracketed technical placeholder. A student-visible blank must be written as ____.
```

user addition (self-check pattern):
```
Before returning JSON, self-check every student-facing string:
1. No [[gap]] appears anywhere in title, instructions, or publicPayload.
2. If English is not LessonChainContext.learningLanguage, explanationLanguage, or studentL1, no English sentence appears in title, instructions, or publicPayload.
3. Translation and meaning prompts sound natural in the support language, not like word-for-word English.
```

### 2.3 Per-artifact-type payload contracts ("artifactInstructions")

Source: `20260511133000_harden_chain_creator_language_and_gap_hygiene.sql`,
`platform_admin_chain_creator_contract_payload()`. Each selected contract sent to the creator
embeds one of these exact-payload strings — this is how they get reliable typed payloads out of
an `additionalProperties: true` schema:

| artifact type(s) | artifactInstructions (verbatim) |
|---|---|
| `reading_text` | `Exact payload: publicPayload = {body: non-empty string, optional title: string, optional format: "plain_text"}. Do not use text, content, paragraphs, items, or questions for the main reading text. privateEvaluationPayload must be null or omitted.` |
| `abcd_questions_activity`, `binary_choice_gap_activity`, `multiple_choice_gap_activity`, `odd_one_out_activity`, `single_choice_summary_activity`, `single_choice_title_activity`, `true_false_activity` | `Exact payload: publicPayload = {instruction?: string, questions: [{id: string, prompt: string, options: [{id: string, text: string}]}]}. Use questions, not options as the top-level response list. Use ____ as the student-visible blank in gap prompts when needed. Never output [[gap]]. privateEvaluationPayload = {answerKey: {items: [{id: matching question id, correct: matching option id}]}}.` |
| `matching_halves_activity`, `matching_pairs_activity`, `translation_matching_activity`, `image_word_matching_activity` | `Exact payload: publicPayload = {instruction?: string, leftItems: [{id: string, text: string}], rightItems: [{id: string, text: string}]}. Do not use pairs as the public payload. privateEvaluationPayload = {answerKey: {items: [{id: matching left item id, correct: matching right item id}]}}.` |
| `word_bank_gap_activity` | `Exact payload: publicPayload = {instruction?: string, items: [{id: string, prompt: string}], options: [{id: string, text: string}]}. Use ____ as the student-visible blank inside each prompt. Never output [[gap]]. privateEvaluationPayload = {answerKey: {items: [{id: matching item id, correct: matching option id}]}}.` |
| `word_sorting_activity` | `Exact payload: publicPayload = {instruction?: string, items: [{id: string, text: string}], categories: [{id: string, label: string}]}. privateEvaluationPayload = {answerKey: {items: [{id: matching item id, correct: matching category id}]}}.` |
| `sentence_scramble_activity` | `Exact payload: publicPayload = {instruction?: string, items: [{id: string, prompt: string, tokens: [{id: string, text: string}]}]}. The prompt must be in learningLanguage or explanationLanguage only; never use English unless English is one of those languages. privateEvaluationPayload = {answerKey: {items: [{id: matching item id, correct: complete sentence string}]}}.` |
| `flashcard_deck_activity` | `Exact payload: publicPayload = {instruction?: string, cards: [{id: string, front: string}]}. privateEvaluationPayload = {answerKey: {items: [{id: matching card id, correct: private card back string}]}}.` |
| `bracket_gap_activity`, `error_correction_activity`, `gap_fill_activity`, `open_gap_activity`, `sentence_rewrite_activity`, `word_given_rephrase_activity` | `Exact payload: publicPayload = {instruction?: string, items: [{id: string, prompt: string}]}. Do not use sentences, questions, or prompts as the top-level response list. Use ____ as the student-visible blank in gap prompts when needed. Never output [[gap]]. privateEvaluationPayload = {answerKey: {items: [{id: matching item id, correct: accepted answer string or accepted answer array}]}}.` |
| any non-deterministic activity | `Exact payload: publicPayload = {instruction?: string, items: [{id: string, prompt: string}]}. Optional privateEvaluationPayload may include reviewCriteria, but must not include answerKey, correct, correctness, solution, or answers.` |
| any other material | `Exact payload: return a student-visible publicPayload object using canonical renderer fields only. privateEvaluationPayload must be null or omitted.` |

Note the public/private split: **publicPayload is student-visible and must never contain
correctness data; answer keys live only in privateEvaluationPayload.** That separation is worth
copying into any homework schema.

### 2.4 Earlier "unconstrained" chain creator (`admin-tool-chain-creator`)

Source: `20260507014000_clarify_unconstrained_chain_creator_prompt.sql` (the schema was set to
`{"type":"object","description":"linqua:unconstrained-json","additionalProperties":true}` in
`20260507014500_*`). Kept here because the anti-failure-mode wording is reusable:

system_instruction:
```
You create the complete content for a planned language-learning exercise chain.

Use the chain-level LessonChainContext, the user-provided materials or instructions, the chain plan, and the selected exercise contracts. Always consider the user-provided materials, assignment text, and preferences when present. Always adapt the generated exercise content to deliveryMode and audienceMode: self_study must be usable without live teacher facilitation, teacher_led_class may include teacher-led classroom interaction, individual targets one learner, and group targets multiple learners.

Return one JSON object only. The response must contain a steps array with the same length and order as the chain plan. Each step must contain the planned toolSlug and an outputBlock JSON object. The outputBlock must contain actual completed exercise content that follows that tool's outputSchema from the selected exercise contract, including the required blockType value. Do not return schema descriptions, lists of field names, JSON strings, arrays in place of objects, or draft input parameters.

Do not create intermediate generations. Do not include per-step language, CEFR level, topic, required words, source refs, parent run ids, or dependencies on previous exercise output.
```

text_part ends with an inline output example plus:
```
Top-level title and description are optional because the planner already owns them. Preserve the planned step order and toolSlug values exactly. For every outputBlock, use the matching selected exercise outputSchema as the authoritative shape. Fill required arrays with useful learner-facing items, not placeholders. Arrays of objects must contain JSON objects, never JSON-encoded strings. Do not add fields that the selected exercise contract does not allow.
```

---

## 3. Lesson recording analysis (two-call SGR pipeline, voiceflow)

The `analysis-runtime` prompt family is a **two-call pipeline**: call 1 (evidence extraction,
high recall) produces a durable internal artifact; call 2 (report, high precision) curates it
into the teacher-facing report. The compiled spec stores the evidence call under
`reasoning.evidence_spec` (strategy `two_call`) — infrastructure in
`20260421006000_add_analysis_runtime_sgr_prompt_contract.sql`.

### 3.1 Evidence extraction — `durable-sgr-high-recall-extraction-v2`

Source: `20260424183000_add_high_recall_sgr_extraction_prompt_copy.sql`.
Evidence model config: `{"temperature":0.2,"topK":40,"topP":0.95,"maxOutputTokens":24576}`.
The compact pre-high-recall variant was later restored as a separate `recording-evidence`
prompt family (`20260424190000_*`, `20260425143000_*`).

**evidence_system_instruction:**

```
You are the high-recall evidence-extraction stage in a two-call lesson-analysis pipeline for {{learning_language}} lessons taught through {{teaching_language}}.

Your output is not a teacher-facing report. It is a durable internal evidence artifact that later systems may mine for reports, longitudinal patterns, student profile updates, and custom teacher views.

Primary objective:
- Preserve the maximum set of concrete, source-supported facts.
- Under-extraction is a serious failure. Do not summarize away useful details.
- The later report pass is responsible for selection and compression. Your job is recall, attribution, and structure.

Extraction rules:
- Output only JSON that matches the schema.
- Use empty arrays when there is no supported evidence for an array field. Do not return null.
- Capture both negative and positive evidence: errors, corrections, successful usage, self-correction, correct answers, comprehension wins, task completion, and words or forms the student uses correctly.
- Preserve exact target-language phrases when audible. If exact wording is uncertain, keep the best supported paraphrase and mark confidence below high.
- Keep timestamps or timestamp spans whenever possible.
- Prefer many atomic facts over broad bullets. One observation should contain one distinct fact, error, correction, success, or teacher intervention.
- Do not merge separate vocabulary, grammar, pronunciation, fluency, comprehension, profile, or emotional-state signals into one generic statement.
- Keep weak but potentially useful signals when they are clearly labeled as low confidence.
- Keep attribution risks explicit. If speaker identity is uncertain, use a stable speaker label and explain the uncertainty.
- Use {{teaching_language}} for analytical explanations, but preserve names, learner quotes, target-language phrases, and corrected examples in the language used in the lesson.
```

**evidence_text_part:**

```
Extract a high-recall durable evidence artifact from this lesson audio.

{{session_context}}

{{students_info}}

What to preserve:
- Every distinct teacher correction, explanation, recast, prompt, drill, contrast, or clarification.
- Every distinct student error or gap that could matter later, including grammar, vocabulary, pronunciation, fluency, comprehension, and interaction.
- Every distinct positive signal: correct target-language use, successful answer, correct repetition, self-correction, comprehension, initiative, recovery after correction, and task completion.
- Every clearly supported personal fact, hobby, routine, preference, current-life detail, learning preference, or emotional/engagement cue.
- Important source-quality limits and attribution uncertainty.

Use `evidence_ledger` as the broad chronological memory of the lesson:
- Add one ledger item for each concrete fact, not one item per section.
- Include low-priority facts too if they are source-supported; the report pass will decide whether to show them.
- Prefer exact phrases and timestamps. If an item is useful but exact wording is unavailable, still preserve it with lower confidence.

Use student-specific arrays for structured mining:
- `vocabulary_to_review` and `grammar_errors_and_gaps` keep backward-compatible report-ready observations.
- `vocabulary_observations` and `grammar_observations` keep a broader ledger of mistakes, correct uses, taught items, explanations, and contrasts.
- `positive_language_evidence` captures correct answers, correct usage, self-corrections, comprehension wins, fluent moments, and successful task behavior.
- `teacher_corrections_received` pairs teacher intervention with student uptake when available.
- `profile_evidence` preserves personal facts and preferences with support, not just final profile updates.

Do not optimize for brevity. Optimize for concrete recall, source support, and future usefulness.
```

**Evidence JSON schema — top-level required keys** (full schema in the migration, ~350 lines):
`source_quality` (audio_quality, coverage_notes, speaker_resolution, confidence_limits),
`lesson_frame` (lesson_description_basis, grammar_topics, lexical_topics, activity_sequence,
materials_or_tasks), `evidence_ledger` (array of atomic facts:
`timestamp_or_span | student_id | student_name | speaker_label | evidence_type |
target_language_excerpt | surrounding_context | teacher_response | interpretation | confidence |
future_use`), `student_evidence` (per-student arrays incl. `vocabulary_to_review`,
`grammar_errors_and_gaps`, `pronunciation_errors`, `positive_language_evidence`,
`teacher_corrections_received`, `recommendation_candidates`, `homework_candidates`,
`cefr_level_estimate` + `cefr_level_rationale_points`, `psycho_emotional_state_evidence`,
`motivation_decline_signs`, `participation_and_activity`), `profile_update_inputs`
(personal_facts/topic_preferences/learning_preferences + a `do_not_store` privacy escape hatch),
`teacher_interventions`, `open_uncertainties`, and `report_generation_guards`
(`must_preserve`, `must_not_claim`, `selection_notes`).

Highly reusable patterns: pipe-delimited micro-format inside string arrays
(`timestamp | observed phrase | issue_or_success | target form | teaching context | confidence`),
the `evidence_type` taxonomy
(`grammar_error, grammar_success, vocabulary_gap, vocabulary_success, pronunciation, comprehension, profile_fact, learning_preference, task_completion, motivation, interaction, teacher_correction, uncertainty`),
the `future_use` routing field
(`report, profile, longitudinal_pattern, homework, next_lesson, low_priority_archive`),
and `report_generation_guards` as an explicit hand-off contract to the next LLM call.

### 3.2 Report curation — `durable-sgr-curated-report-v1`

Source: `20260424170000_add_curated_analysis_runtime_prompt.sql`. These blocks are *appended* to
the existing report prompt (the base report prompt is older and Gemini-report-shaped; the
appended policy is the valuable part):

system block:
```
Curated teacher-report policy:
- The internal evidence artifact may contain many more facts than a teacher should read.
- Select the most teacher-useful facts; do not format the report as a full evidence inventory.
- Prefer high-confidence, repeated, severe, teacher-corrected, or immediately actionable evidence.
- Include strengths and progress when they are supported and pedagogically useful.
- Leave low-priority facts, weak signals, and long-term pattern candidates out of teacher-facing fields.
- Respect uncertainty guards for speaker identity, weak audio, and unresolved participants.
- Do not mention internal extraction, durable artifacts, prompt strategy, schemas, or implementation details.
```

user block:
```
## Report Curation Rules
Before writing the teacher-facing report, rank the available evidence by teacher usefulness.

Use a bounded selection:
- vocabulary: include only the most important corrected or newly mastered items;
- grammar: include repeated, severe, or immediately teachable patterns;
- recommendations: include actions the teacher can realistically use in the next lesson;
- homework: keep assignments focused and directly supported by evidence;
- assessment text: summarize the lesson, do not dump the evidence artifact.

Positive evidence matters: preserve correct usage, self-correction, comprehension wins, and task completion when they change what the teacher should do next. Do not force positive claims when support is weak.
```

plus a usage bridge appended to the report user template
(`20260424183000`):
```
## High-Recall Evidence Artifact Usage
The internal evidence payload may contain an `evidence_ledger` and detailed student-specific observation arrays. Treat these as the source of truth for concrete facts.

For the teacher-facing report, select the most useful facts. Do not copy the whole ledger, but do not ignore it. Positive evidence, correct usage, self-corrections, and newly mastered items are as important as errors when they affect the next lesson.
```

Note: chains can be generated **directly from a recording-analysis report**
(`source: {type: "recording_report", sessionId, analysisId}` in LessonChainContext,
`20260508110000_add_report_sourced_chain_generation.sql`) — the bridge from "what happened in
the lesson" to "what homework to generate".

---

## 4. Quizapp planner→generator architecture (distilled)

Source: `linqua-quizapp/docs/archive/development_docs/llm-exercise-generation-architecture.md`.
Design doc only (no prompt texts), but its decisions match what voiceflow later shipped:

1. **Two-stage pipeline**: a cheap *planner* picks exercise formats from **compact template
   cards** (type, schemaVersion, short description, constraints, media requirements,
   repeat-safety, 1–2 short examples — never full JSON schemas); a *generator* receives exact
   JSON schemas **only for the selected templates** and produces payloads. Rationale: smaller
   prompts, independent tuning, attributable failures, stable as the catalog grows.
2. **Planner output contract** (intentionally tiny):
   `{ selectedTemplates: [{type, schemaVersion, why}], sequenceGoal }` — e.g.
   `"sequenceGoal": "Move from low-friction recall to context-based listening."` Storing `why`
   per pick gives debuggable pedagogy.
3. **Don't over-encode pedagogy in metadata**: "soft and descriptive, not prescriptive" — a few
   soft tags and constraints, no rigid difficulty ladders "unless validated by real usage". The
   LLM does pedagogical judgment; the catalog does schema truth.
4. **Versioning**: top-level `quizFormatVersion` + per-exercise `schemaVersion`; every exercise
   entry is `{id, type, schemaVersion, payload}`.
5. **Validation is deterministic and non-optional**: valid → accept; invalid-but-repairable →
   repair pass; otherwise reject/retry. Same catalog-driven validation in generation and runtime
   ingestion.
6. Evaluation metrics for A/B of one-pass vs two-stage: schema pass rate, retry rate, repair
   rate, latency, token usage, manual chain quality.

The quizapp producer app stores prompts as versioned `prompt_definitions`/`prompt_versions`
with active bindings per routing profile
(`apps/producer/drizzle/0005_2026_04_10_prompt_versioning.sql`); seeded texts are trivial
defaults (`'Return a concise plain text response.'`, `'Return only valid JSON that matches the
requested schema.'`) — the real generation knowledge lives in the Admin educational-schema
catalog (see `pedagogy-rubric.md`).

### Effective LLM schema pattern (quizapp Admin)

`exportEducationalSchemasByIds()` (`apps/admin/src/server/repositories/educational-schemas.ts`)
builds the per-exercise generation contract sent to providers: the template UI schema enriched
with the educational schema's `description`, `instructions`, `linguisticRoles` and
`ttsMappings` *source hints* — and explicitly stripped of `$schema`, any generated `title`
property, runtime fields, and media URL destinations. I.e. **the LLM never generates media URLs
or runtime wrappers; it generates text content with language roles, and the platform attaches
audio/images afterwards** (details in `audio-image-exercises.md`).

---

## 5. Cross-cutting prompt patterns worth copying

1. **Plan → create with preserved order**: creator must "preserve the planned step count, step
   order, artifactType, and stepType values exactly" — makes validation a zip over two arrays.
2. **Public/private payload split**: answer keys only in `privateEvaluationPayload.answerKey.items`,
   ids must 1:1 match public ids; non-deterministic tasks get `reviewCriteria`, never answers.
3. **"Exact payload" strings per type** beat giant JSON schemas when the provider schema is
   unconstrained; combine both when the provider supports strict schemas.
4. **Self-check epilogues** ("Before returning JSON, verify/self-check…") for the failure modes
   actually observed: flattened arrays, `[[gap]]` placeholders, stray English, partial keys.
5. **Language hygiene triple**: `learningLanguage` / `explanationLanguage` / `studentL1`, with
   "no English unless English is one of those languages" and "don't translate through literal
   English".
6. **Two-call recall→curation**: extraction maximizes recall at temp 0.2 into a durable artifact
   with confidence + `future_use` routing; the report/homework pass curates with bounded
   selection rules. Append-only prompt versioning (each migration appends a block and bumps a
   semantic `prompt_version` like `v10-language-and-gap-hygiene`) keeps the history auditable.
7. **Token-budget hygiene**: "Never spend output budget on hidden reasoning or commentary";
   raise maxOutputTokens (65535) and lower temperature (0.45) for long strict-JSON generations.
