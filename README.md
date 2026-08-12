# content-governance-checker

A tool for checking draft content against configurable governance rules.

## Structure

- `client/` — static frontend (HTML/CSS/JS), served by the Express server.
- `server/` — Express backend exposing `POST /api/check`.

## Running

```
cd server
npm install
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

`profile` is optional — any omitted fields fall back to the built-in default
profile (see `server/profiles.js`).

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
