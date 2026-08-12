# content-governance-checker

A tool for checking draft content against configurable governance rules.

## Structure

- `client/` — static frontend (HTML/CSS/JS), served by the Express server.
- `server/` — Express backend exposing `POST /api/check` plus profile and
  history endpoints, backed by PostgreSQL (`server/db/`).

## Running

Requires a PostgreSQL database (local or remote).

```
cd server
npm install
cp .env.example .env      # then edit .env with your DATABASE_URL
npm run db:setup          # creates the rule_profiles and check_history tables
npm start
```

Then open http://localhost:3000.

The AI Content Review rule calls the Claude API, so set `ANTHROPIC_API_KEY`
in `server/.env` (see `server/.env` — never commit real keys) to use it.
Without a key, that check simply reports an error in `meta.ai.error` and the
rule-based checks still run normally.

## API

`POST /api/check`

Request body:

```json
{
  "content": "string",
  "channel": "email|sms|push|in-app|support",
  "rules": {
    "reading-level": true,
    "passive-voice": true,
    "sentence-length": true,
    "word-count": true,
    "channel-constraints": true,
    "ai-review": true
  },
  "profile": {
    "name": "Default",
    "targetTone": "clear, warm, and professional",
    "complianceKeywords": { "blocked": ["guaranteed"], "required": [] },
    "customNotes": "Never mention specific pricing."
  }
}
```

<<<<<<< HEAD
`profile` is optional — any omitted fields fall back to the built-in default
profile (see `server/profiles.js`).
=======
Request body also accepts an optional `"profile_id": 1` — if set, the check
is logged against that profile in `check_history`.
>>>>>>> main

Response body:

```json
{
  "score": 0,
  "issues": [
    { "source": "rule", "rule": "reading-level", "severity": "warning", "description": "...", "text": "..." },
    { "source": "ai", "rule": null, "category": "tone", "severity": "warning", "description": "...", "originalText": "...", "suggestedFix": "..." }
  ],
  "meta": {
    "channel": "email",
    "wordCount": 0,
    "charCount": 0,
    "sentenceCount": 0,
    "ai": { "enabled": true, "issueCount": 0, "error": null }
  }
}
```

<<<<<<< HEAD
Implemented rule-based checks (no AI, pure logic): reading level
(Flesch-Kincaid grade estimate), passive voice detection, word/character
count, sentence length (flags sentences over 25 words), and channel
constraints (SMS 160 chars; push notification 50-char title / 100-char body,
based on the first line of content as the title).

The `ai-review` rule runs the rule-based checks and a Claude-powered review
in parallel (see `server/ai-checker.js`) and merges the results. Claude
reviews five categories against the active rule profile: tone alignment,
plain language, compliance risk (including synonyms of blocked/required
keywords, not just exact matches), customer-centricity, and actionability.
`accessibility` is still reserved for a future pass and just returns an
informational notice when enabled.
=======
Implemented checks (no AI, pure logic): reading level (Flesch-Kincaid grade
estimate), passive voice detection, word/character count, sentence length
(flags sentences over 25 words), and channel constraints (SMS 160 chars;
push notification 50-char title / 100-char body, based on the first line of
content as the title). `compliance-keywords`, `tone-of-voice`, and
`accessibility` are reserved for a future AI-backed pass and currently just
return an informational notice when enabled.

### Rule profiles

- `POST /api/profiles` — create a profile. Body: `name` (required), plus any
  of `channel`, `reading_level_max`, `passive_voice_enabled`,
  `max_sentence_length`, `compliance_keywords_block` (array),
  `compliance_keywords_require` (array), `tone`, `custom_notes`.
- `GET /api/profiles` — list all profiles, alphabetically by name.
- `GET /api/profiles/:id` — fetch one profile.
- `PUT /api/profiles/:id` — update a profile (partial updates supported).
- `DELETE /api/profiles/:id` — delete a profile.

### History

- `GET /api/history?limit=20` — most recent check_history entries (newest
  first), each including `profile_name` if the profile still exists.
>>>>>>> main
