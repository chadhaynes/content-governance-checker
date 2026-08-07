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
