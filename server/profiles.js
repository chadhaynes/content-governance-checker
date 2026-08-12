/* ==========================================================================
   Content Governance Checker — rule profiles

   A "rule profile" bundles the settings the AI-powered checks need but that
   don't fit as simple on/off toggles: the target tone for the channel, the
   compliance keyword lists, and free-form reviewer notes. The client can
   send a partial profile directly in the request body (resolveProfile), or
   reference a profile saved in Postgres by id (fromSavedProfile converts the
   db/profiles.js row shape into the same input); either way, any missing
   fields fall back to DEFAULT_PROFILE.
   ========================================================================== */

"use strict";

const DEFAULT_PROFILE = {
  name: "Default",
  targetTone: "clear, warm, and professional — confident without being pushy or overly formal",
  complianceKeywords: {
    blocked: [
      "guaranteed",
      "guarantee",
      "risk-free",
      "no risk",
      "100% safe",
      "free money",
    ],
    required: [],
  },
  customNotes: "",
};

// The saved-profile "tone" column is a short category, not the free-form
// descriptive sentence the AI system prompt wants — expand it here.
const TONE_DESCRIPTIONS = {
  formal: "formal and professional — precise and respectful, avoiding contractions or casual language",
  conversational: "conversational and warm — like a helpful person talking directly to the reader, using contractions and plain language",
  neutral: "neutral and clear — matter-of-fact and straightforward, without being cold or overly casual",
};

function sanitizeKeywordList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const cleaned = list.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  return cleaned.length ? cleaned : fallback;
}

/**
 * Converts a rule_profiles row (see db/profiles.js) into the shape
 * resolveProfile() expects, so a profile saved via the profile-management
 * endpoints can be used to drive the AI checks the same way an inline
 * profile in the request body can.
 * @param {Object|null} row
 * @returns {Object}
 */
function fromSavedProfile(row) {
  if (!row || typeof row !== "object") return {};

  return {
    name: row.name,
    targetTone: (row.tone && TONE_DESCRIPTIONS[row.tone]) || undefined,
    complianceKeywords: {
      blocked: row.compliance_keywords_block,
      required: row.compliance_keywords_require,
    },
    customNotes: row.custom_notes || undefined,
  };
}

/**
 * Merges a partial, client-supplied profile over DEFAULT_PROFILE.
 * @param {Object} [input]
 * @returns {{name: string, targetTone: string, complianceKeywords: {blocked: string[], required: string[]}, customNotes: string}}
 */
function resolveProfile(input) {
  const profile = input && typeof input === "object" ? input : {};
  const keywords = profile.complianceKeywords && typeof profile.complianceKeywords === "object"
    ? profile.complianceKeywords
    : {};

  return {
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : DEFAULT_PROFILE.name,
    targetTone:
      typeof profile.targetTone === "string" && profile.targetTone.trim()
        ? profile.targetTone.trim()
        : DEFAULT_PROFILE.targetTone,
    complianceKeywords: {
      blocked: sanitizeKeywordList(keywords.blocked, DEFAULT_PROFILE.complianceKeywords.blocked),
      required: sanitizeKeywordList(keywords.required, DEFAULT_PROFILE.complianceKeywords.required),
    },
    customNotes: typeof profile.customNotes === "string" ? profile.customNotes.trim() : DEFAULT_PROFILE.customNotes,
  };
}

module.exports = { DEFAULT_PROFILE, resolveProfile, fromSavedProfile };
