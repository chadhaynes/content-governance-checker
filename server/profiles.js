/* ==========================================================================
   Content Governance Checker — rule profiles

   A "rule profile" bundles the settings the AI-powered checks need but that
   don't fit as simple on/off toggles: the target tone for the channel, the
   compliance keyword lists, and free-form reviewer notes. There's no
   profile-management UI yet, so the client can optionally send a partial
   profile in the request body and any missing fields fall back to
   DEFAULT_PROFILE.
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

function sanitizeKeywordList(list, fallback) {
  if (!Array.isArray(list)) return fallback;
  const cleaned = list.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim());
  return cleaned.length ? cleaned : fallback;
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

module.exports = { DEFAULT_PROFILE, resolveProfile };
