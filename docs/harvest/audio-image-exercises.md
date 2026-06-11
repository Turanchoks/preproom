# Audio (TTS) & Image Exercise Payloads — how linqua-quizapp wires media

Source: `/Users/turanchoks/Code/linqua/linqua-quizapp`
- Semantic rules engine: `apps/admin/src/lib/semantic-rules.ts`
- Authoring rules: `docs/guides/educational-schema-playbook.md`
- Runtime audio: `apps/web/src/exercises/shared/audio-capability.ts`, `apps/web/src/types/quiz.ts`
- Image exercise schemas: `apps/web/src/exercises/{image-flashcard,image-choice,fill-blank-image-multiple-choice}/schema.ts` + `index.tsx`

## 0. The core principle

> "External generation returns media files or descriptors, not final URLs. Linqua assigns final
> `audioUrl`, `audioUrls`, `imageUrl`, `imageUrls`, or runtime image URL values after media
> storage and assembly." — educational-schema-playbook.md

The LLM generates **text only**. Two metadata maps stored per educational schema
(`semantic_rules_json`) tell the platform what to do with that text afterwards:

1. `linguisticRoles` — which text paths are L1 (learner's language) vs L2 (target language).
   Drives voice selection, translation direction, and language hygiene.
2. `ttsMappings` — which text path gets synthesized, with which voice role, and **where in the
   payload** the resulting audio URLs are written.

Media URL fields are deliberately **absent from the LLM-facing schema** and the UI template
schema; they exist only in the runtime payload after assembly. Image fields are the partial
exception: `image` may exist as an optional string in runtime payloads, but the LLM schema omits
it and the renderer substitutes a placeholder when missing.

## 1. Semantic rules format (`semantic_rules_json`, version 1)

Canonical top-level keys are exactly: `version`, `linguisticRoles`, `ttsMappings`.

```json
{
  "version": 1,
  "linguisticRoles": {
    "wordPairs[*].targetWord": "l2",
    "wordPairs[*].sourceWord": "l1"
  },
  "ttsMappings": [
    {
      "sourcePath": "wordPairs[*].targetWord",
      "destinationPath": "wordPairs[*].audioUrls",
      "voiceRole": "l2"
    }
  ]
}
```

TypeScript contract (`semantic-rules.ts`):

```ts
type SemanticLanguageRole = 'l1' | 'l2';

type SemanticTtsMapping = {
  id: string;                 // "mapping-1", assigned at parse time
  sourcePath: string;         // text path discovered in the UI schema, e.g. "wordPairs[*].targetWord"
  destinationPath: string;    // runtime payload location for stored media URLs, e.g. "wordPairs[*].audioUrls"
  voiceRole: SemanticLanguageRole;  // which voice (L1 or L2) reads the text
};
```

Path syntax: dot-separated property paths; array items are `[*]` (e.g.
`items[*].text`, `bankDistractors[*]`, plain `text` for a root string).

Rules from the playbook:
- `linguisticRoles` keys must be **text paths reported by the schema validator** — never image
  URLs, ids, speaker labels, booleans, answer indexes, layout fields, or any generated field
  named `title`.
- `ttsMappings[].sourcePath` must be a discovered text path; `destinationPath` is **not part of
  the UI schema or exported LLM schema** — "it names the runtime payload location where Linqua
  may attach stored media URLs after generated media files or descriptors are resolved."
- Forbidden legacy keys (replace on sight): `promptPath`, `answerPath`, `spokenPath`,
  `fieldRoles`, `audioMappings`, `sourceAudio`, and any invented media URL fields inside the UI
  schema.
- Never add `audioUrl`, `audioUrls`, `imageUrl`, `imageUrls`, or URL-valued `image` to the UI
  schema "to make media work".

### How destinations/fields are auto-discovered (`analyzeUiSchema`)

The admin walks the UI JSON schema (including `anyOf/oneOf/allOf` and array items) and
classifies properties:

- **audio destination**: property key matching `/audiourls?$/i` → valueType
  `'audio-string'` (schema type string) or `'audio-object'` (anything else, i.e. the
  `{male,female}` object).
- **image field**: property key exactly `image`, `imageurl`, or `imageurls`
  (case-insensitive) with string or string-array type.
- **text field**: any other string / string-array → candidate for `linguisticRoles` and TTS
  `sourcePath`.
- Each carries `requirement: 'required' | 'optional'` from the schema's `required` arrays.

## 2. Audio payload shapes at runtime

The standard audio attachment is a **voice-variant object** (`audio-capability.ts`):

```ts
export interface VoiceAudioUrls {
  male?: string;    // URL of male-voice TTS render
  female?: string;  // URL of female-voice TTS render
}
// resolution: prefer female, fall back to male, else "" (no audio)
```

Example — word-matching-audio runtime payload (validated in
`apps/web/src/exercises/word-matching-audio/contract.ts`; `WordPair` in `types/quiz.ts`):

```jsonc
{
  "title": "Match what you hear",
  "wordPairs": [
    {
      "targetWord": "der Hund",          // l2 — TTS source
      "sourceWord": "собака",            // l1
      "audioUrls": {                      // attached by platform, required at runtime here
        "female": "https://cdn.../hund-f.mp3",
        "male": "https://cdn.../hund-m.mp3"
      }
    }
  ]
}
```

The corresponding LLM-facing schema contains **only** `targetWord`/`sourceWord`; the semantic
rules say `targetWord` is l2 and map it to `wordPairs[*].audioUrls` with `voiceRole: "l2"`.

Some legacy/simpler templates use a single string instead (`audio-string` valueType), e.g.
word-puzzle's `sentenseAudio?: string` and core `audioUrl?: string` — prefer the
`{male,female}` object for new schemas.

Audio exercises whose *text* the LLM generates normally (audio is added later):
- `fill-gaps-audio` LLM/UI schema (`fill-gaps-audio/schema.ts`):
  ```json
  {
    "type": "object", "additionalProperties": false,
    "required": ["text"],
    "properties": {
      "text": { "type": "string", "minLength": 1, "pattern": "\\[[^\\][\\n]*\\D[^\\][\\n]*\\]" },
      "bankDistractors": { "type": "array", "items": { "type": "string", "minLength": 1 }, "minItems": 1 }
    }
  }
  ```
  (inline `[answer]` markers in the text; audio of the full sentence attached by TTS mapping.)
- `sentence-matching:audio`, `word-puzzle:playback` work the same way: generate L2 sentences,
  map them to audio destinations.

Pipeline summary:

```
LLM payload (text only, L1/L2 roles known)
  → for each ttsMapping: read sourcePath text → TTS with voiceRole voice(s)
  → store files → write {male,female} URLs at destinationPath
  → assembled runtime payload (validated, playable)
```

Budget note: audio presentation costs +4 cognitive-budget points (see pedagogy-rubric.md).

## 3. Image exercise payload schemas (exact)

Pattern for all three: the **generated** schema has no image URLs. The runtime adapter accepts
an optional `image`/`imageUrl` string and falls back to
`DEFAULT_PREVIEW_IMAGE_URL = '/placeholders/placeholder.svg'` when absent — so payloads are
renderable before image assembly completes.

### 3.1 `image-flashcard` (and `image-flashcard:4-options`)

LLM/UI schema (`image-flashcard/schema.ts`) — for the `:4-options` variant `options` is pinned
`minItems: 4, maxItems: 4`:

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["cards"],
  "properties": {
    "cards": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["word", "correctAnswer", "options"],
        "properties": {
          "word": { "type": "string", "minLength": 1 },
          "transcription": { "type": "string", "minLength": 1 },
          "wordType": { "type": "string", "minLength": 1 },
          "definition": { "type": "string", "minLength": 1 },
          "correctAnswer": { "type": "string", "minLength": 1 },
          "options": { "type": "array", "items": { "type": "string", "minLength": 1 }, "minItems": 1 }
        }
      }
    }
  }
}
```

Runtime payload (`image-flashcard/index.tsx`): same plus optional `title`, `maxAttempts`, and
per-card `image?: string` (URL; placeholder substituted when empty). Semantics: the card shows
an image; learner picks the matching `word`/`definition` answer from `options`;
`correctAnswer` must be one of `options`. Catalog variants:
`image-flashcard:l2-definition-l1-options`, `image-flashcard-meaning:l1-definition-l2-options`
(budget 12, CEFR A2–B2).

### 3.2 `image-choice`

LLM/UI schema (`image-choice/schema.ts`):

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["word", "correctAnswer", "options"],
        "properties": {
          "word": { "type": "string", "minLength": 1 },
          "correctAnswer": { "type": "string", "minLength": 1 },
          "options": {
            "type": "array", "minItems": 2,
            "items": {
              "type": "object", "additionalProperties": false,
              "required": ["label"],
              "properties": { "label": { "type": "string", "minLength": 1 } }
            }
          }
        }
      }
    }
  }
}
```

Runtime (`image-choice/index.tsx`): each option gains `image?: string` (URL, placeholder
fallback). Semantics: prompt `word` (L2), learner taps the image whose `label` equals
`correctAnswer`. Catalog: `image-choice:l2-prompt-l1-labels` — budget 6, CEFR A1–A2 (the
cheapest, most beginner-friendly item in the catalog).

### 3.3 `fill-blank-image:multiple-choice`

LLM/UI schema (`fill-blank-image-multiple-choice/schema.ts` + `schema-helpers.ts`):

```json
{
  "type": "object", "additionalProperties": false,
  "required": ["items"],
  "properties": {
    "imageTitle": { "type": "string" },
    "items": {
      "type": "array", "minItems": 1,
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["sentence", "distractors"],
        "properties": {
          "sentence": {
            "type": "string", "minLength": 1,
            "pattern": "^(?![\\s\\S]*\\[[^\\][\\n]+\\][\\s\\S]*\\[[^\\][\\n]+\\])[\\s\\S]*\\[[^\\][\\n]+\\][\\s\\S]*$"
          },
          "distractors": { "type": "array", "items": { "type": "string", "minLength": 1 }, "minItems": 1 }
        }
      }
    }
  }
}
```

The `sentence` pattern enforces **exactly one inline `[answer]`** per sentence — the correct
answer is embedded in brackets, options = bracketed answer + `distractors`, so no separate
answer key is needed. Runtime (`index.tsx`) adds `imageUrl: string` (one image for the whole
exercise; defaults to the placeholder, but an explicitly empty `imageUrl` invalidates the
payload) plus optional `imageTitle`. Catalog budget 8, CEFR A1–B2 territory (grouped with
fill-blank multiple-choice variants).

### 3.4 Voiceflow image counterpart

The chain pipeline has `image_word_matching_activity`, treated as a matching activity:
`publicPayload = {instruction?, leftItems: [{id, text}], rightItems: [{id, text}]}` +
`privateEvaluationPayload.answerKey.items = [{id: leftId, correct: rightId}]` — image URLs are,
again, attached outside generation.

## 4. Recipe for extending our homework schema

1. Generated payloads contain text only. Add media as **post-generation assembly**, never as
   LLM-generated URLs.
2. Per exercise type, store semantic rules:
   `{version: 1, linguisticRoles: {<textPath>: "l1"|"l2"}, ttsMappings: [{sourcePath, destinationPath, voiceRole}]}`.
3. Use `audioUrls: {male?, female?}` objects at destinations named `*audioUrls`; resolve
   female-first at playback; treat exercises without resolved audio as invalid only if the
   template requires audio.
4. For images, allow an optional `image`/`imageUrl` string in the runtime payload with a
   placeholder fallback, and have the LLM produce the *selection text* (word, label, sentence)
   that an image generator/picker can later target. If image descriptors are wanted from the
   LLM, keep them out of the renderer payload (descriptor → asset pipeline → URL).
5. Keep validator-discovered paths as the only legal keys for roles/mappings, and reject
   payloads containing media URL fields or generated `title` properties (quizapp bans both in
   LLM-facing schemas).
6. Single-blank trick: encode answers inline as `[answer]` with a one-blank regex
   (`fill-blank` family) or as `____` with a separate answer key (voiceflow chain family).
   Pick one convention per type and enforce it in the schema, not just the prompt.
