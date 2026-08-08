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

`.env` is gitignored — never commit your real connection string. If the
database isn't reachable, `POST /api/check` still runs; only the
profile/history features degrade (their endpoints return a 500).

## Database

`npm run db:setup` (`server/db/setup.js`) applies `server/db/schema.sql`,
which is idempotent and safe to re-run. It creates two tables:

- **rule_profiles** — saved governance configurations: `id`, `name`,
  `channel`, `reading_level_max`, `passive_voice_enabled`,
  `max_sentence_length`, `compliance_keywords_block` (text array),
  `compliance_keywords_require` (text array), `tone`, `custom_notes`,
  `created_at`, `updated_at`.
- **check_history** — a log of past checks: `id`, `profile_id` (FK to
  `rule_profiles`, set null on profile delete), `content_snippet` (first 200
  chars of the checked content), `overall_score`, `issues_count`,
  `checked_at`.

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
    "channel-constraints": true
  }
}
```

Request body also accepts an optional `"profile_id": 1` — if set, the check
is logged against that profile in `check_history`.

Response body:

```json
{
  "score": 0,
  "issues": [
    { "rule": "reading-level", "severity": "warning", "description": "...", "text": "..." }
  ],
  "meta": { "channel": "email", "wordCount": 0, "charCount": 0, "sentenceCount": 0 }
}
```

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
