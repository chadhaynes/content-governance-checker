/* ==========================================================================
   Content Governance Checker — Claude-powered content analysis

   Sends the draft content, channel type, and active rule profile to Claude
   and asks it to review the copy the way a human content-governance editor
   would: tone alignment, plain language, compliance risk, whether the copy
   is written for the reader or the organisation, and whether the reader
   knows what to do next.

   Returns structured issues shaped like:
     { category, severity, description, originalText, suggestedFix }
   so they can be merged with the rule-based issues in checks.js.
   ========================================================================== */

"use strict";

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

// Keep in sync with the enum in ISSUES_SCHEMA below and with the category
// labels the frontend uses to group issues.
const CATEGORIES = ["tone", "plain-language", "compliance", "customer-centricity", "actionability", "accessibility"];
const SEVERITIES = ["error", "warning", "info"];

// Maps each governance-rule toggle the client can send to the AI review
// category (or categories) it should turn on. "ai-review" is the original
// bundle of five categories; "accessibility" is independent so it can run
// (or be skipped) without the rest of the AI review.
const RULE_TO_CATEGORIES = {
  "ai-review": ["tone", "plain-language", "compliance", "customer-centricity", "actionability"],
  accessibility: ["accessibility"],
};

/**
 * Derives which AI review categories are active from the enabled rule
 * toggles.
 * @param {Object<string, boolean>} rules
 * @returns {string[]}
 */
function categoriesForRules(rules) {
  const categories = [];
  for (const [rule, ruleCategories] of Object.entries(RULE_TO_CATEGORIES)) {
    if (rules[rule]) categories.push(...ruleCategories);
  }
  return categories;
}

const CATEGORY_SECTIONS = {
  tone: ({ profile }) =>
    `TONE ALIGNMENT\n   The target tone for this content is: "${profile.targetTone}".\n   Does the content match that target tone? Flag language that is too corporate or jargon-heavy, too casual or unprofessional for the channel, or hedging/wishy-washy phrasing that undermines confidence (e.g. "we might be able to", "in some cases", "please try to").`,
  "plain-language": () =>
    `PLAIN LANGUAGE\n   Flag jargon, nominalisations (an action turned into an abstract noun — e.g. "the utilization of" instead of "using", "make a determination" instead of "decide"), and unnecessarily complex vocabulary. For each, the suggested fix should be a simpler, plainer alternative.`,
  compliance: ({ profile }) => {
    const blocked = formatKeywordList(profile.complianceKeywords.blocked);
    const required = formatKeywordList(profile.complianceKeywords.required);
    return `COMPLIANCE REVIEW\n   Blocked terms/phrases that must NOT appear: ${blocked}\n   Required terms/phrases that MUST appear somewhere in the content: ${required}\n   Check for these exact terms, but also flag synonyms, paraphrases, or other phrasing that would create the same compliance risk even when the exact keyword isn't present — for example, if "guaranteed" is blocked, "you're sure to see results" carries the same risk and should be flagged too. If a required term is missing entirely, flag that as an issue against the content as a whole (originalText can be the first sentence or an empty string).`;
  },
  "customer-centricity": () =>
    `CUSTOMER-CENTRICITY\n   Is the content written for the reader's benefit, or for the organisation's convenience? Flag self-serving language (e.g. "we need you to...", "to help us process your request...", "as per our policy...") and suggest a reader-first rewrite that leads with what the reader gets or needs to know.`,
  actionability: () =>
    `ACTIONABILITY\n   Does the reader know exactly what to do next after reading this? Flag content that describes a situation, policy, or status without giving the reader a clear, concrete next step — a link to click, a reply to send, a deadline, a specific action.`,
  accessibility: () =>
    `ACCESSIBILITY\n   Flag content-level accessibility issues: images or media referenced without accompanying alt text (e.g. a markdown image or an embedded media placeholder with no description), instructions that rely on visual or positional cues alone (e.g. "click the button on the right", "see the box below", "the green link"), link or button text that isn't descriptive out of context (e.g. "click here", "read more"), unexplained acronyms or abbreviations on first use, and long unbroken walls of text that should be split into shorter paragraphs or lists for screen-reader and cognitive accessibility.`,
};

/**
 * Builds the structured-output schema restricted to the categories actually
 * in play for this request, so Claude can't return issues for a category
 * the caller didn't ask for.
 * @param {string[]} categories
 * @returns {Object}
 */
function buildIssuesSchema(categories) {
  return {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string", enum: categories },
            severity: { type: "string", enum: SEVERITIES },
            description: { type: "string" },
            originalText: { type: "string" },
            suggestedFix: { type: "string" },
          },
          required: ["category", "severity", "description", "originalText", "suggestedFix"],
          additionalProperties: false,
        },
      },
    },
    required: ["issues"],
    additionalProperties: false,
  };
}

let _client = null;

/**
 * Lazily constructs the Anthropic client so a missing API key only breaks
 * the AI-powered checks, not the whole server on startup.
 */
function getClient() {
  if (!_client) {
    _client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
  }
  return _client;
}

function formatKeywordList(list) {
  if (!list || !list.length) return "(none configured)";
  return list.map((kw) => `"${kw}"`).join(", ");
}

/**
 * Builds the system prompt that positions Claude as a content governance
 * reviewer and instructs it on the active review categories, folding in the
 * active rule profile's target tone, compliance keyword lists, and any
 * custom_notes.
 * @param {{channelType: string, profile: Object, categories: string[]}} params
 * @returns {string}
 */
function buildSystemPrompt({ channelType, profile, categories }) {
  const customNotesBlock = profile.customNotes
    ? `\nADDITIONAL REVIEWER INSTRUCTIONS (from the "${profile.name}" rule profile)\nTreat these as extra review criteria on top of the categories above:\n${profile.customNotes}\n`
    : "";

  const sections = categories
    .map((category, i) => `${i + 1}. ${CATEGORY_SECTIONS[category]({ profile })}`)
    .join("\n\n");

  const categoryCount = categories.length === 1 ? "this category" : `these ${categories.length} categories`;
  const categoryList = categories.map((c) => `"${c}"`).join(", ");

  return `You are an expert content governance reviewer for a company that ships customer-facing copy — emails, SMS, push notifications, in-app messages, and support articles. Your job is to catch issues that automated readability and passive-voice checks miss, before content ships. You are reviewing content for the "${channelType}" channel.

Review the content against ${categoryCount}. Only flag genuine, specific issues grounded in the actual text — do not invent problems in copy that already reads well, and do not pad the list with restatements of the same issue.

${sections}
${customNotesBlock}
For every issue you find, provide:
- category: one of ${categoryList}
- severity: "error" for something that must be fixed before publishing (e.g. a compliance risk), "warning" for something that should be fixed, or "info" for a minor or optional improvement
- description: a one- or two-sentence explanation of the issue
- originalText: the exact snippet from the content the issue applies to (empty string if the issue is about something missing, like a required compliance term)
- suggestedFix: a concrete rewritten alternative the author could use instead`;
}

function normalizeIssues(rawIssues) {
  if (!Array.isArray(rawIssues)) return [];

  return rawIssues
    .filter((issue) => issue && typeof issue === "object")
    .map((issue) => ({
      source: "ai",
      rule: null,
      category: CATEGORIES.includes(issue.category) ? issue.category : "tone",
      severity: SEVERITIES.includes(issue.severity) ? issue.severity : "info",
      description: typeof issue.description === "string" ? issue.description : "",
      originalText: typeof issue.originalText === "string" ? issue.originalText : "",
      suggestedFix: typeof issue.suggestedFix === "string" ? issue.suggestedFix : "",
    }))
    .filter((issue) => issue.description);
}

/**
 * Runs the AI-powered governance checks against a piece of content. Which
 * categories run is derived from the enabled rule toggles (see
 * RULE_TO_CATEGORIES) — e.g. the "accessibility" rule runs only the
 * accessibility category without requiring "ai-review" to also be on.
 * Never throws — failures (missing API key, network error, refusal, etc.)
 * are reported back as `{ issues: [], error: "..." }` so the caller can
 * still return the rule-based results.
 * @param {{content: string, channelType: string, profile: Object, rules: Object<string, boolean>}} params
 * @returns {Promise<{issues: Array, error: string|null}>}
 */
async function runAIChecks({ content, channelType, profile, rules }) {
  if (!content || !content.trim()) {
    return { issues: [], error: null };
  }

  const categories = categoriesForRules(rules || {});
  if (!categories.length) {
    return { issues: [], error: null };
  }

  try {
    const client = getClient();
    const system = buildSystemPrompt({ channelType, profile, categories });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: buildIssuesSchema(categories) },
      },
      messages: [
        {
          role: "user",
          content: `Review the following ${channelType} content and return the issues you find.\n\nContent to review:\n"""\n${content}\n"""`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return { issues: [], error: "Claude declined to review this content." };
    }

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock) {
      return { issues: [], error: "No response text returned from Claude." };
    }

    const parsed = JSON.parse(textBlock.text);
    return { issues: normalizeIssues(parsed.issues), error: null };
  } catch (err) {
    return { issues: [], error: (err && err.message) || "AI review failed unexpectedly." };
  }
}

module.exports = { runAIChecks, categoriesForRules, CATEGORIES, SEVERITIES };
