# Exercise Selection & Sequencing Rubric

Compact, embeddable rubric for an LLM that picks exercise types and sequences a homework set.
Distilled from linqua-quizapp's educational-schema catalog
(`apps/admin/src/lib/pedagogical-axes.ts`, `apps/admin/src/lib/cognitive-budget.ts`,
`apps/admin/drizzle/0027/0033/0036/0046/0067_*.sql`,
`docs/guides/educational-schema-playbook.md`) and linqua-voiceflow's pedagogical profiles +
methodology guidance (`supabase/migrations/20260510120000_add_pedagogical_profiles.sql`).

Section 1 is written to be pasted into a generation system prompt nearly verbatim.

---

## 1. Embeddable rubric (paste into system prompt)

```
PEDAGOGICAL AXES

Every exercise type has four axes. Use them to select and order exercises.

didacticStage — where the exercise belongs in a lesson arc:
- engage: warm-up, activate topic knowledge and curiosity (lead-in prompts, quotes, warm-up questions)
- input: learner receives new content with no required response (reading text, dialogue model, transcript, fact list)
- language_focus: noticing and explanation of forms/words (grammar explanation, vocabulary list, example sentences)
- practice: learner manipulates language with known answers (gaps, matching, choice, scramble, sorting, error correction)
- production: learner creates own output (writing, open answers, dialogue, discussion, typing full sentences)
- assessment: checking mastery; reuse practice formats but score them

controlLevel — how constrained the learner's response is:
- none: no response required (pure input)
- recognition: pick among given options (multiple choice, matching, true/false, sorting, flashcard self-check)
- controlled: produce a tightly constrained form with one canonical answer (fill a gap, transform a bracketed verb, reorder a scrambled sentence)
- guided: short open response with scaffolding (short answers to questions, guided rephrase)
- semi_free: longer output within a frame (roleplay, creative writing from a prompt)
- free: unconstrained production

cefrUtility — the CEFR levels (A1..C2) at which the exercise is actually useful. Never assign an exercise outside its range. Heuristics from the curated catalog:
- A1-A2: image choice, picture flashcards, word/translation matching, binary-choice gaps, sentence scramble, word sorting
- A2-B1(+B2): fill-gaps (with/without distractors and audio), word formation, phrase matching, chat dialogues, image flashcards
- A2-C1: reading passages, find-mistakes, grammar explanations, open questions, error correction
- B1-C2: sentence rewrite, word-given rephrase, essay prompts, L2-immersion grammar explanations

cognitiveBudget — interaction/presentation cost in attention points (NOT difficulty):
budget = interactions x responseWeight x visualMultiplier + (screens - 1) x 3 + (hasAudio ? 4 : 0), floor 5
- responseWeight: recognition 1, controlled 1.5, recall 2, free_production 3
- visualMultiplier: light 1, medium 1.3, heavy 1.6
controlLevel maps to response cost: none/recognition -> recognition; controlled/guided -> controlled; semi_free -> recall; free -> free_production.
Budget a homework set: mostly cheap items (5-12), a few medium (12-20), at most one heavy (20+). Do not stack several heavy items in a row.

skills profile — each type scores 0-5 on: vocabularyPractice, grammarDrill, reading, listening, writing. Pick types whose nonzero skills cover the lesson goals; do not pick a type whose strongest skill is irrelevant to the goal.

SEQUENCING RULES

1. Order the set by stage: engage? -> input -> language_focus -> practice -> production -> assessment?. Homework may skip engage; never put production before its supporting input/practice.
2. Within practice, increase controlLevel monotonically: recognition -> controlled -> guided. End the set with at most one semi_free/free production item when the level allows it (A2+).
3. One new pattern at a time: each controlled exercise targets exactly one grammar pattern or one lexical set. Do not mix two new patterns in one item.
4. Recycle, don't repeat: consecutive exercises should reuse the same target vocabulary/grammar in a different format. Avoid the same exercise type twice in a row.
5. Match the learner's CEFR level: every selected type must include the target level in its cefrUtility. At A1-A2 prefer recognition/controlled; reserve guided/semi_free for A2+ and free for B1+.
6. Respect delivery: self-study homework must contain only items a learner can complete and check alone — deterministic answers or clearly-marked self-reflection. No pair/group tasks.
7. Deterministic first: prefer auto-checkable items (single canonical answer) for the bulk of the set; cap open-ended items needing teacher/AI review at 1-2 per set.
8. Listening/audio items add +4 budget and require TTS-able text; use them mid-set, after the vocabulary has been seen in text form.

METHODOLOGY TEMPLATES (pick one per set and follow its arc)

- ppp: presentation (input/language_focus) -> controlled practice -> production
- esa: engage -> study (language_focus + controlled practice) -> activate (production)
- tblt: pre-task (engage/input) -> task cycle (production) -> language focus (noticing/practice)
- text_based: input text -> comprehension -> language noticing -> text manipulation -> output
- lexical: exposure -> noticing -> controlled chunk practice -> freer chunk use
- controlled_to_free: recognition -> controlled -> guided -> semi_free/free
- cefr_action_oriented: order by learner actions appropriate to the target CEFR level

A good default for homework after a lesson: text_based or controlled_to_free.
```

---

## 2. Reference data behind the rubric

### 2.1 Axis enums (quizapp `pedagogical-axes.ts`, mirrored by voiceflow profile constraints)

```ts
didacticStages = ["engage","input","language_focus","practice","production","assessment"]
controlLevels  = ["none","recognition","controlled","guided","semi_free","free"]
cefrLevels     = ["A1","A2","B1","B2","C1","C2"]   // cefrUtility = non-empty unique subset
// defaults: stage "practice", control "recognition", cefrUtility ["A1"] (deliberately narrow —
// defaulting to all levels made CEFR filtering a no-op; authors must curate the real range)

controlLevelResponseCostModes = {
  none: "recognition", recognition: "recognition",
  controlled: "controlled", guided: "controlled",
  semi_free: "recall", free: "free_production",
}
```

Voiceflow profiles add two more useful axes:
- `learningFocus`: `text_comprehension, listening_comprehension, vocabulary, grammar_accuracy, functional_language, speaking_interaction, writing_development, fluency, discourse_structure, critical_thinking`
- `learnerOutputMode`: `none, select, match, sort, reorder, fill, transform, correct, translate, short_answer, extended_answer, dialogue, discussion, creative_writing, recall`
- `sequencingRole`: `warm_up, input, noticing, controlled_practice, guided_practice, free_production, reflection, assessment`

### 2.2 Cognitive budget formula (quizapp `cognitive-budget.ts`)

```
rawBudget = interactions * responseWeight * visualMultiplier
          + (screens - 1) * 3            // navigation cost
          + (hasAudio ? 4 : 0)           // audio presentation cost
budget = max(5, round(rawBudget))
responseWeights: recognition 1, controlled 1.5, recall 2, free_production 3
visualMultipliers: light 1, medium 1.3, heavy 1.6
```

"The field name is historical; the value represents interaction and presentation load, not a
general cognitive-difficulty score." It is computed per template from mechanics (interaction
count, response mode, visual load, screens, audio), independent of content and learner.

Calibrated values from the live catalog (migrations 0036 + 0067):

| budget | exercise types |
|---|---|
| 5–8 | image-choice 6, matching-halves 6, phrase-matching 6, true-false 6, sentence-matching:text 6, verb-form:multiple-choice 6, fill-blank:multiple-choice-compact 7, sentence-matching:audio 7, fill-blank (plain/image/grid) 8, fill-gaps 8, verb-form-practice 8, chat:true-false-l1 8 |
| 9–12 | chat:true-false 9, fill-gaps:bits 10, find-mistakes 10, flashcard 10, reading 10, type-missing-words 10, word-formation 10, word-matching:text-l2 10, fill-gaps-distractions 11, fill-gaps-audio 12, grammar-explanation 12, image-flashcard 12, word-formation-distractions 12, word-matching:text-text 12 |
| 13–19 | chat stepped dialogues 14, word-matching:audio-l2 14, fill-gaps-audio-distractions 15, find-mistakes-short 16, grammar-explanation:l2-immersion 16, word-matching:audio-text 16, word-sorting 19 |
| 20–26 | word-puzzle:banner 20 (24 with distractors), word-puzzle:playback 22 (26 with distractors) |

### 2.3 Stage / control / CEFR assignments from the curated catalog

Backfill rules (`0033_backfill_pedagogical_axes.sql`):
- stage `input` + control `none`: grammar-explanation, flashcard, image-flashcard, reading families
- stage `production`: chat:inputs, chat:word-puzzle, type-missing-words
- stage `practice` (everything else), with control:
  - `recognition`: fill-gaps, fill-gaps-audio, fill-blank multiple-choice variants, fill-blank-image, chat:multiple-choice
  - `controlled`: chat:chips, chat:word-puzzle, word-formation(±distractions), word-puzzle banner/playback
  - `guided`: chat:inputs, type-missing-words

CEFR reassessment (`0046_reassess_educational_schema_cefr.sql`), final curated ranges:

| cefrUtility | exercise types |
|---|---|
| `["A1","A2"]` | image-choice:l2-prompt-l1-labels |
| `["A1","A2","B1","B2"]` | fill-blank:multiple-choice, find-mistakes-short, verb-form-practice (+rows), verb-form:multiple-choice-l1-labels, word-puzzle:playback-l2-to-l2 (±distractions) |
| `["A2","B1","B2"]` | chat:inputs variants, chat:multiple-choice stepped, chat:word-puzzle, fill-gaps (all 4 variants), image-flashcard (both), phrase-matching, word-formation (±distractions), word-matching (l2-relations variants) |
| `["A2","B1","B2","C1"]` | find-mistakes, grammar-explanation, reading |
| `["B1","B2","C1","C2"]` | grammar-explanation:l2-immersion |

### 2.4 Skill profiles + generation constraints — examples from the seeds (`0027_wave_1_educational_schemas.sql`)

Skill keys (exactly five): `vocabularyPractice, grammarDrill, reading, listening, writing`, 0–5.

| schema | skills | description | instructions |
|---|---|---|---|
| fill-blank:multiple-choice-compact-grid | v4 g3 r3 l0 w0 | "Complete short L2 sentences by choosing the missing L2 word or phrase from a compact grid." | `4-8 short items, <=55ch/sentence; 2 distractors/item; single canonical answer.` |
| fill-gaps:bits | v3 g4 r3 l0 w0 | "Complete short L2 fragments by filling bracketed gaps from a word bank with distractors." | `4-8 short items, <=80ch/item; inline [answers]; 2-3 distractors; one pattern only.` |
| find-mistakes | v2 g5 r4 l0 w0 | "Read an L2 passage and identify the words that contain mistakes." | `120-260ch/text; 2-4 marked mistakes; include corrections in markers; one grammar pattern only.` |
| find-mistakes-short | v2 g5 r3 l0 w0 | "Read short L2 sentences and identify the single mistake in each sentence." | `4-8 items, <=75ch/item; one marked mistake/item; include correction in marker.` |

Authoring decision rule (playbook): *description* explains the learning task in plain language
(translation direction, read/listen/build/match, distractor variant); *instructions* hold only
compact generation constraints (item counts, char limits, distractor counts, "one pattern only",
"single canonical answer", `feedbackHints` semantics); anything already enforced by the template
schema or semantic rules goes in neither.

Good instruction vocabulary to reuse verbatim:
`4-20 word pairs.` · `exactly 4 pairs, ≤30ch/button; one language pattern only.` ·
`5-12 words; 2-3 distraction words.` · `3-6 gaps, 150-400 ch/text; use distractors.` ·
`single canonical answer.` ·
`feedbackHints = L1 learner-facing hints after wrong answers; content-specific guidance.`

### 2.5 Voiceflow pedagogical profile seeds (40 student step types)

`20260510120000_add_pedagogical_profiles.sql` seeds one profile per step type with all axes plus
`planning_notes` ("Use after a text…", "Use for focused recognition before freer production…"),
`delivery_constraints` ("Requires live pair or group interaction; exclude from self-study
chains."), `participation_modes`, `self_study_compatible`, and `methodology_roles`
(e.g. `ppp_practice`, `esa_study`, `lexical_noticing`, `tblt_pre_task`,
`controlled_to_free_practice`, `cefr_action_oriented`). Representative rows:

| step | stage | focus | control | output | CEFR | seq role | planning note |
|---|---|---|---|---|---|---|---|
| reading_text (show) | input | text_comprehension | none | none | A1–C1 | input | use before comprehension/noticing/output tasks |
| grammar_explanation (show) | language_focus | grammar_accuracy | none | none | A1–C1 | noticing | use before controlled grammar practice |
| vocabulary_list (show) | language_focus | vocabulary | none | none | A1–C1 | noticing | use before vocabulary-controlled practice |
| abcd_questions | practice | text_comprehension | recognition | select | A2–C1 | controlled_practice | use after a text or input material |
| binary_choice_gap | practice | grammar_accuracy | recognition | select | A1–B1 | controlled_practice | focused recognition before freer production |
| gap_fill | practice | grammar_accuracy | controlled | fill | A2–B2 | controlled_practice | controlled form/vocab practice |
| bracket_gap | practice | grammar_accuracy | controlled | fill | A2–B2 | controlled_practice | use after grammar noticing/explanation |
| sentence_scramble | practice | grammar_accuracy | controlled | reorder | A1–B1 | controlled_practice | controlled syntax/chunk practice |
| error_correction | practice | grammar_accuracy | controlled | correct | A2–C1 | controlled_practice | after noticing, before freer output |
| matching_pairs | practice | vocabulary | recognition | match | A1–B2 | controlled_practice | use after lexical exposure |
| word_sorting | practice | vocabulary | recognition | sort | A1–B1 | noticing | noticing lexical categories |
| flashcard_deck | practice | vocabulary | recognition | recall | A1–C1 | controlled_practice | after exposure, before use in larger contexts |
| open_questions (reading) | practice | text_comprehension | guided | short_answer | A2–C1 | guided_practice | after a reading text; review is qualitative |
| sentence_translation | practice | functional_language | controlled | translate | A1–B2 | guided_practice | solo only; review is qualitative |
| sentence_rewrite | practice | grammar_accuracy | controlled | transform | B1–C1 | controlled_practice | after form presentation/noticing |
| word_given_rephrase | practice | grammar_accuracy | controlled | transform | B1–C1 | controlled_practice | controlled transformation practice |
| creative_writing | production | writing_development | semi_free | creative_writing | A2–C1 | free_production | near end of chain; feedback qualitative |
| essay_prompt | production | writing_development | guided | extended_answer | B1–C1 | free_production | after input/planning support |
| discussion (solo reflection) | production | critical_thinking | guided | discussion | A2–C1 | reflection | self-study wording must not assume a partner |
| roleplay_dialogue | production | speaking_interaction | semi_free | dialogue | A2–B2 | free_production | pair/group only; exclude from self-study |
| warmup_discussion | engage | speaking_interaction | guided | discussion | A2–C1 | warm_up | teacher-led pair/group chains only |
| quote_list (show) | engage | critical_thinking | none | none | B1–C1 | warm_up | start reflection/discussion/writing |

Step-count default for a chain: **5 to 10 ordered student steps** (range given to the planner as
`TargetStepCount` when no exact count is requested).

### 2.6 Anti-patterns (both repos agree)

- Don't encode pedagogy as a rigid scoring/difficulty ladder; keep metadata soft and let the
  planner LLM judge (quizapp architecture doc; quizapp later *removed* its `difficulty` column —
  migration `0031_remove_educational_schema_difficulty.sql`).
- Don't default cefrUtility to "all levels" — it kills level filtering.
- Don't put topic/register/CEFR guidance into per-exercise instructions; those belong to the
  set-level context (lesson topic, learner profile).
- Don't let exercises depend on previous exercise output ("Do not include … dependencies on
  previous exercise output" — chain creator prompt).
- Don't generate answer keys for open-ended tasks; mark them qualitative/non-deterministic.
