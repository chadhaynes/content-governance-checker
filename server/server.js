/* ==========================================================================
   Content Governance Checker — Express server

   Serves the static frontend from ../client and exposes:
     POST   /api/check           run the (non-AI) governance checks
     POST   /api/profiles        create a rule profile
     GET    /api/profiles        list rule profiles
     GET    /api/profiles/:id    fetch a rule profile
     PUT    /api/profiles/:id    update a rule profile
     DELETE /api/profiles/:id    delete a rule profile
     GET    /api/history         list recent check_history entries
   ========================================================================== */

"use strict";

const path = require("path");
const express = require("express");
const { runChecks } = require("./checks");
const {
  createProfile,
  listProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  addHistoryEntry,
  listHistory,
} = require("./db/profiles");

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, "..", "client");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(CLIENT_DIR));

/**
 * Normalizes a rule-profile request body into the snake_case shape the
 * db/profiles.js layer expects, applying defaults for creation.
 * @param {Object} body
 * @param {boolean} isCreate - when true, missing fields fall back to defaults
 *   instead of being omitted (used for POST vs PUT).
 * @returns {Object}
 */
function normalizeProfileInput(body, isCreate) {
  const out = {};

  const set = (key, value) => {
    if (value !== undefined) out[key] = value;
  };

  set("name", typeof body.name === "string" ? body.name.trim() : isCreate ? "" : undefined);
  set("channel", body.channel !== undefined ? (typeof body.channel === "string" ? body.channel : null) : isCreate ? null : undefined);
  set(
    "reading_level_max",
    body.reading_level_max !== undefined
      ? Number(body.reading_level_max)
      : isCreate
      ? 8
      : undefined
  );
  set(
    "passive_voice_enabled",
    body.passive_voice_enabled !== undefined ? !!body.passive_voice_enabled : isCreate ? true : undefined
  );
  set(
    "max_sentence_length",
    body.max_sentence_length !== undefined
      ? Number(body.max_sentence_length)
      : isCreate
      ? 25
      : undefined
  );
  set(
    "compliance_keywords_block",
    body.compliance_keywords_block !== undefined
      ? Array.isArray(body.compliance_keywords_block)
        ? body.compliance_keywords_block.filter((w) => typeof w === "string" && w.trim()).map((w) => w.trim())
        : []
      : isCreate
      ? []
      : undefined
  );
  set(
    "compliance_keywords_require",
    body.compliance_keywords_require !== undefined
      ? Array.isArray(body.compliance_keywords_require)
        ? body.compliance_keywords_require.filter((w) => typeof w === "string" && w.trim()).map((w) => w.trim())
        : []
      : isCreate
      ? []
      : undefined
  );
  set("tone", body.tone !== undefined ? (typeof body.tone === "string" ? body.tone : null) : isCreate ? null : undefined);
  set(
    "custom_notes",
    body.custom_notes !== undefined ? (typeof body.custom_notes === "string" ? body.custom_notes : null) : isCreate ? null : undefined
  );

  return out;
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "id must be a positive integer" });
    return null;
  }
  return id;
}

app.post("/api/check", async (req, res) => {
  const { content, channel, rules, profile_id } = req.body || {};

  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required and must be a non-empty string" });
  }

  const result = runChecks({
    content,
    channel: typeof channel === "string" && channel ? channel : "email",
    rules: rules && typeof rules === "object" ? rules : {},
  });

  try {
    await addHistoryEntry({
      profile_id: Number.isInteger(profile_id) ? profile_id : null,
      content_snippet: content.slice(0, 200),
      overall_score: result.score,
      issues_count: result.issues.length,
    });
  } catch (err) {
    // Governance checking must keep working even if history logging fails
    // (e.g. the database isn't configured or is unreachable).
    console.error("Failed to save check history:", err.message);
  }

  res.json(result);
});

app.post("/api/profiles", async (req, res) => {
  const data = normalizeProfileInput(req.body || {}, true);

  if (!data.name) {
    return res.status(400).json({ error: "name is required and must be a non-empty string" });
  }

  try {
    const profile = await createProfile(data);
    res.status(201).json(profile);
  } catch (err) {
    console.error("Failed to create profile:", err.message);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

app.get("/api/profiles", async (req, res) => {
  try {
    const profiles = await listProfiles();
    res.json(profiles);
  } catch (err) {
    console.error("Failed to list profiles:", err.message);
    res.status(500).json({ error: "Failed to list profiles" });
  }
});

app.get("/api/profiles/:id", async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const profile = await getProfile(id);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  } catch (err) {
    console.error("Failed to get profile:", err.message);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

app.put("/api/profiles/:id", async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  const data = normalizeProfileInput(req.body || {}, false);

  if (data.name !== undefined && !data.name) {
    return res.status(400).json({ error: "name must be a non-empty string" });
  }

  try {
    const profile = await updateProfile(id, data);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json(profile);
  } catch (err) {
    console.error("Failed to update profile:", err.message);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.delete("/api/profiles/:id", async (req, res) => {
  const id = parseId(req, res);
  if (id === null) return;

  try {
    const deleted = await deleteProfile(id);
    if (!deleted) return res.status(404).json({ error: "Profile not found" });
    res.status(204).end();
  } catch (err) {
    console.error("Failed to delete profile:", err.message);
    res.status(500).json({ error: "Failed to delete profile" });
  }
});

app.get("/api/history", async (req, res) => {
  const requestedLimit = Number(req.query.limit);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;

  try {
    const history = await listHistory(limit);
    res.json(history);
  } catch (err) {
    console.error("Failed to list history:", err.message);
    res.status(500).json({ error: "Failed to list history" });
  }
});

// Fallback: any other non-API route serves the SPA shell.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Content Governance Checker running at http://localhost:${PORT}`);
});

module.exports = app;
