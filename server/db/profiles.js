/* ==========================================================================
   Content Governance Checker — rule_profiles / check_history data access

   Thin query functions used by server.js. Field names match the database
   columns (snake_case) end-to-end, including in the JSON API, so there's no
   translation layer to keep in sync.
   ========================================================================== */

"use strict";

const { pool } = require("./index");

const PROFILE_COLUMNS = [
  "id",
  "name",
  "channel",
  "reading_level_max",
  "passive_voice_enabled",
  "max_sentence_length",
  "compliance_keywords_block",
  "compliance_keywords_require",
  "tone",
  "custom_notes",
  "created_at",
  "updated_at",
].join(", ");

/**
 * Inserts a new rule profile.
 * @param {Object} data - snake_case fields matching the rule_profiles columns
 * @returns {Promise<Object>} the created profile row
 */
async function createProfile(data) {
  const { rows } = await pool.query(
    `INSERT INTO rule_profiles
       (name, channel, reading_level_max, passive_voice_enabled, max_sentence_length,
        compliance_keywords_block, compliance_keywords_require, tone, custom_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PROFILE_COLUMNS}`,
    [
      data.name,
      data.channel,
      data.reading_level_max,
      data.passive_voice_enabled,
      data.max_sentence_length,
      data.compliance_keywords_block,
      data.compliance_keywords_require,
      data.tone,
      data.custom_notes,
    ]
  );
  return rows[0];
}

/**
 * Lists every saved rule profile, alphabetically by name.
 * @returns {Promise<Object[]>}
 */
async function listProfiles() {
  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLUMNS} FROM rule_profiles ORDER BY name ASC`
  );
  return rows;
}

/**
 * Fetches a single profile by id.
 * @param {number} id
 * @returns {Promise<Object|null>}
 */
async function getProfile(id) {
  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLUMNS} FROM rule_profiles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Updates only the fields present in `data`, leaving the rest untouched.
 * @param {number} id
 * @param {Object} data - partial snake_case fields to update
 * @returns {Promise<Object|null>} the updated row, or null if id doesn't exist
 */
async function updateProfile(id, data) {
  const existing = await getProfile(id);
  if (!existing) return null;

  const merged = { ...existing, ...data };

  const { rows } = await pool.query(
    `UPDATE rule_profiles SET
       name = $1,
       channel = $2,
       reading_level_max = $3,
       passive_voice_enabled = $4,
       max_sentence_length = $5,
       compliance_keywords_block = $6,
       compliance_keywords_require = $7,
       tone = $8,
       custom_notes = $9
     WHERE id = $10
     RETURNING ${PROFILE_COLUMNS}`,
    [
      merged.name,
      merged.channel,
      merged.reading_level_max,
      merged.passive_voice_enabled,
      merged.max_sentence_length,
      merged.compliance_keywords_block,
      merged.compliance_keywords_require,
      merged.tone,
      merged.custom_notes,
      id,
    ]
  );
  return rows[0];
}

/**
 * Deletes a profile by id. History rows referencing it have profile_id set
 * to NULL (see the ON DELETE SET NULL foreign key) rather than being removed.
 * @param {number} id
 * @returns {Promise<boolean>} true if a row was deleted
 */
async function deleteProfile(id) {
  const { rowCount } = await pool.query(
    "DELETE FROM rule_profiles WHERE id = $1",
    [id]
  );
  return rowCount > 0;
}

/**
 * Records one content check in check_history.
 * @param {{profile_id: number|null, content_snippet: string, overall_score: number, issues_count: number}} entry
 * @returns {Promise<Object>} the created history row
 */
async function addHistoryEntry({ profile_id, content_snippet, overall_score, issues_count }) {
  const { rows } = await pool.query(
    `INSERT INTO check_history (profile_id, content_snippet, overall_score, issues_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id, profile_id, content_snippet, overall_score, issues_count, checked_at`,
    [profile_id, content_snippet, overall_score, issues_count]
  );
  return rows[0];
}

/**
 * Lists the most recent check_history entries, newest first, joined with
 * the profile name (if the profile still exists).
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function listHistory(limit) {
  const { rows } = await pool.query(
    `SELECT h.id, h.profile_id, p.name AS profile_name, h.content_snippet,
            h.overall_score, h.issues_count, h.checked_at
     FROM check_history h
     LEFT JOIN rule_profiles p ON p.id = h.profile_id
     ORDER BY h.checked_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

module.exports = {
  createProfile,
  listProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  addHistoryEntry,
  listHistory,
};
