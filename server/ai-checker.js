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
const CATEGORIES = ["tone", "plain-language", "compliance", "customer-centricity", "actionability"];
const SEVERITIES = ["error", "warning", "info"];

const ISSUES_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: CATEGORIES },
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
 * reviewer and instructs it on the five review categories, folding in the
 * active rule profile's target tone, compliance keyword lists, and any
 * custom_notes.
 * @param {{channelType: string, profile: Object}} params
 * @returns {string}
 */
function buildSystemPrompt({ channelType, profile }) {
  const blocked = formatKeywordList(profile.complianceKeywords.blocked);
  const required = formatKeywordList(profile.complianceKeywords.required);

  const customNotesBlock = profile.customNotes
    ? `\nADDITIONAL REVIEWER INSTRUCTIONS (from the "${profile.name}" rule profile)\nTreat these as extra review criteria on top of the five categories above:\n${profile.customNotes}\n`
    : "";

  return `You are an expert content governance reviewer for a company that ships customer-facing copy — emails, SMS, push notifications, in-app messages, and support articles. Your job is to catch issues that automated readability and passive-voice checks miss, before content ships. You are reviewing content for the "${channelType}" channel.

Review the content against these five categories. Only flag genuine, specific issues grounded in the actual text — do not invent problems in copy that already reads well, and do not pad the list with restatements of the same issue.

1. TONE ALIGNMENT
   The target tone for this content is: "${profile.targetTone}".
   Does the content match that target tone? Flag language that is too corporate or jargon-heavy, too casual or unprofessional for the channel, or hedging/wishy-washy phrasing that undermines confidence (e.g. "we might be able to", "in some cases", "please try to").

2. PLAIN LANGUAGE
   Flag jargon, nominalisations (an action turned into an abstract noun — e.g. "the utilization of" instead of "using", "make a determination" instead of "decide"), and unnecessarily complex vocabulary. For each, the suggested fix should be a simpler, plainer alternative.

3. COMPLIANCE REVIEW
   Blocked terms/phrases that must NOT appear: ${blocked}
   Required terms/phrases that MUST appear somewhere in the content: ${required}
   Check for these exact terms, but also flag synonyms, paraphrases, or other phrasing that would create the same compliance risk even when the exact keyword isn't present — for example, if "guaranteed" is blocked, "you're sure to see results" carries the same risk and should be flagged too. If a required term is missing entirely, flag that as an issue against the content as a whole (originalText can be the first sentence or an empty string).

4. CUSTOMER-CENTRICITY
   Is the content written for the reader's benefit, or for the organisation's convenience? Flag self-serving language (e.g. "we need you to...", "to help us process your request...", "as per our policy...") and suggest a reader-first rewrite that leads with what the reader gets or needs to know.

5. ACTIONABILITY
   Does the reader know exactly what to do next after reading this? Flag content that describes a situation, policy, or status without giving the reader a clear, concrete next step — a link to click, a reply to send, a deadline, a specific action.
${customNotesBlock}
For every issue you find, provide:
- category: one of "tone", "plain-language", "compliance", "customer-centricity", "actionability"
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
 * Runs the AI-powered governance checks against a piece of content.
 * Never throws — failures (missing API key, network error, refusal, etc.)
 * are reported back as `{ issues: [], error: "..." }` so the caller can
 * still return the rule-based results.
 * @param {{content: string, channelType: string, profile: Object}} params
 * @returns {Promise<{issues: Array, error: string|null}>}
 */
async function runAIChecks({ content, channelType, profile }) {
  if (!content || !content.trim()) {
    return { issues: [], error: null };
  }

  try {
    const client = getClient();
    const system = buildSystemPrompt({ channelType, profile });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: ISSUES_SCHEMA },
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

module.exports = { runAIChecks, CATEGORIES, SEVERITIES };
