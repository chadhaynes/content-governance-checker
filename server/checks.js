/* ==========================================================================
   Content Governance Checker — rule logic (no AI, pure heuristics)

   Each check function returns an array of "issue" objects shaped as:
     { rule, severity, description, text }
   where severity is one of "error" | "warning" | "info".
   ========================================================================== */

"use strict";

const SENTENCE_LENGTH_LIMIT = 25; // words
const READING_LEVEL_TARGET = 8; // grade

const CHANNEL_LIMITS = {
  sms: { charLimit: 160 },
  push: { titleLimit: 50, bodyLimit: 100 },
};

// Rules that will eventually need AI analysis — not implemented yet.
// Tone of voice and compliance keywords are now covered by the AI-powered
// checks in ai-checker.js (see the "ai-review" rule and server.js).
const UNIMPLEMENTED_RULES = {
  accessibility: "Accessibility",
};

// Past-participle forms that don't end in the regular "-ed" pattern, used
// alongside the regular pattern to catch common irregular passive verbs.
const IRREGULAR_PARTICIPLES = [
  "done", "made", "given", "taken", "written", "seen", "known", "shown",
  "held", "built", "sent", "found", "told", "brought", "bought", "caught",
  "taught", "thought", "kept", "left", "felt", "meant", "read", "paid",
  "said", "heard", "put", "set", "cut", "hit", "hurt", "let", "chosen",
  "driven", "eaten", "forgotten", "broken", "spoken", "stolen", "worn",
  "torn", "sworn", "born", "drawn", "grown", "thrown", "flown", "sold",
  "understood", "stood", "won", "begun", "sung", "run", "come", "become",
  "gone", "lost", "sent", "spent",
];

const PASSIVE_RE = new RegExp(
  "\\b(am|is|are|was|were|be|been|being)\\s+(?:\\w+ly\\s+)?(\\w+ed|" +
    IRREGULAR_PARTICIPLES.join("|") +
    ")\\b",
  "i"
);

/**
 * Splits text into words, ignoring empty tokens.
 * @param {string} text
 * @returns {string[]}
 */
function getWords(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

/**
 * Splits text into sentences using terminal punctuation as boundaries.
 * @param {string} text
 * @returns {string[]}
 */
function getSentences(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?]+[.!?]*/g) || [];
  return matches.map((s) => s.trim()).filter(Boolean);
}

/**
 * Estimates syllable count for a single word using a vowel-group heuristic.
 * @param {string} word
 * @returns {number}
 */
function countSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  let reduced = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  reduced = reduced.replace(/^y/, "");

  const matches = reduced.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

/**
 * Estimates Flesch-Kincaid grade level for the given words/sentences.
 * @param {string[]} words
 * @param {string[]} sentences
 * @returns {number|null} grade level, or null if there isn't enough text
 */
function fleschKincaidGrade(words, sentences) {
  const wordCount = words.length;
  const sentenceCount = sentences.length || (wordCount > 0 ? 1 : 0);
  if (wordCount === 0 || sentenceCount === 0) return null;

  const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade =
    0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59;

  return Math.max(0, grade);
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + "...";
}

function checkReadingLevel(words, sentences) {
  const grade = fleschKincaidGrade(words, sentences);
  if (grade === null) return [];

  const rounded = Math.round(grade * 10) / 10;

  if (grade > 12) {
    return [
      {
        rule: "reading-level",
        severity: "error",
        description: `Estimated reading level is Grade ${rounded}, well above the Grade ${READING_LEVEL_TARGET} target`,
        text: "",
      },
    ];
  }

  if (grade > READING_LEVEL_TARGET) {
    return [
      {
        rule: "reading-level",
        severity: "warning",
        description: `Estimated reading level is Grade ${rounded}, above the Grade ${READING_LEVEL_TARGET} target`,
        text: "",
      },
    ];
  }

  return [
    {
      rule: "reading-level",
      severity: "info",
      description: `Estimated reading level is Grade ${rounded}`,
      text: "",
    },
  ];
}

function checkPassiveVoice(sentences) {
  const issues = [];
  const MAX_ISSUES = 8;

  for (const sentence of sentences) {
    if (issues.length >= MAX_ISSUES) break;

    const match = PASSIVE_RE.exec(sentence);
    if (match) {
      issues.push({
        rule: "passive-voice",
        severity: "warning",
        description: `Possible passive voice construction ("${match[0]}")`,
        text: truncate(sentence, 160),
      });
    }
  }

  return issues;
}

function checkWordAndCharCount(content, words) {
  return [
    {
      rule: "word-count",
      severity: "info",
      description: `${words.length} words, ${content.length} characters`,
      text: "",
    },
  ];
}

function checkSentenceLength(sentences) {
  const issues = [];

  for (const sentence of sentences) {
    const wordCount = getWords(sentence).length;
    if (wordCount > SENTENCE_LENGTH_LIMIT) {
      issues.push({
        rule: "sentence-length",
        severity: wordCount > 40 ? "error" : "warning",
        description: `Sentence is ${wordCount} words long (limit ${SENTENCE_LENGTH_LIMIT})`,
        text: truncate(sentence, 160),
      });
    }
  }

  return issues;
}

function checkChannelConstraints(content, channel) {
  const issues = [];
  const trimmed = (content || "").trim();

  if (channel === "sms") {
    const { charLimit } = CHANNEL_LIMITS.sms;
    if (trimmed.length > charLimit) {
      issues.push({
        rule: "channel-constraints",
        severity: "error",
        description: `SMS content is ${trimmed.length} characters, exceeding the ${charLimit} character limit`,
        text: truncate(trimmed, 160),
      });
    }
  } else if (channel === "push") {
    const { titleLimit, bodyLimit } = CHANNEL_LIMITS.push;
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0] || "";
    const body = lines.slice(1).join(" ").trim();

    if (title.length > titleLimit) {
      issues.push({
        rule: "channel-constraints",
        severity: "error",
        description: `Push notification title is ${title.length} characters, exceeding the ${titleLimit} character limit`,
        text: truncate(title, 160),
      });
    }

    if (body.length > bodyLimit) {
      issues.push({
        rule: "channel-constraints",
        severity: "error",
        description: `Push notification body is ${body.length} characters, exceeding the ${bodyLimit} character limit`,
        text: truncate(body, 160),
      });
    }
  }

  return issues;
}

function checkUnimplementedRules(rules) {
  const issues = [];
  for (const [key, label] of Object.entries(UNIMPLEMENTED_RULES)) {
    if (rules[key]) {
      issues.push({
        rule: key,
        severity: "info",
        description: `${label} checking requires AI analysis and isn't available yet.`,
        text: "",
      });
    }
  }
  return issues;
}

// Each additional issue costs a bit less than the last (multiplicative decay
// rather than flat subtraction), so a handful of issues lands in a
// meaningful mid-range instead of instantly saturating at 0 — only content
// with a genuinely large number of errors/warnings approaches the floor.
const ERROR_DECAY = 0.85;
const WARNING_DECAY = 0.93;

function computeScore(issues) {
  let errorCount = 0;
  let warningCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errorCount++;
    else if (issue.severity === "warning") warningCount++;
  }

  const score = 100 * Math.pow(ERROR_DECAY, errorCount) * Math.pow(WARNING_DECAY, warningCount);
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Runs all enabled governance checks against a piece of content.
 * @param {{content: string, channel: string, rules: Object<string, boolean>}} params
 * @returns {{score: number, issues: Array, meta: Object}}
 */
function runChecks({ content, channel, rules }) {
  const words = getWords(content);
  const sentences = getSentences(content);
  const issues = [];

  if (rules["word-count"]) {
    issues.push(...checkWordAndCharCount(content, words));
  }

  if (rules["reading-level"]) {
    issues.push(...checkReadingLevel(words, sentences));
  }

  if (rules["passive-voice"]) {
    issues.push(...checkPassiveVoice(sentences));
  }

  if (rules["sentence-length"]) {
    issues.push(...checkSentenceLength(sentences));
  }

  if (rules["channel-constraints"]) {
    issues.push(...checkChannelConstraints(content, channel));
  }

  issues.push(...checkUnimplementedRules(rules));

  const taggedIssues = issues.map((issue) => ({ source: "rule", ...issue }));

  return {
    score: computeScore(taggedIssues),
    issues: taggedIssues,
    meta: {
      channel,
      wordCount: words.length,
      charCount: content.length,
      sentenceCount: sentences.length,
    },
  };
}

module.exports = {
  runChecks,
  computeScore,
  fleschKincaidGrade,
  countSyllables,
  getWords,
  getSentences,
};
