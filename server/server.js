/* ==========================================================================
   Content Governance Checker — Express server

   Serves the static frontend from ../client and exposes the
   POST /api/check endpoint, which runs the rule-based governance checks
   and the Claude-powered AI checks in parallel and merges the results.
   ========================================================================== */

"use strict";

require("dotenv").config();

const path = require("path");
const express = require("express");
const { runChecks, computeScore } = require("./checks");
const { runAIChecks } = require("./ai-checker");
const { resolveProfile } = require("./profiles");

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, "..", "client");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(CLIENT_DIR));

app.post("/api/check", async (req, res) => {
  const { content, channel, rules, profile } = req.body || {};

  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required and must be a non-empty string" });
  }

  const resolvedChannel = typeof channel === "string" && channel ? channel : "email";
  const resolvedRules = rules && typeof rules === "object" ? rules : {};
  const resolvedProfile = resolveProfile(profile);
  const aiEnabled = Boolean(resolvedRules["ai-review"]);

  try {
    // Rule-based checks are synchronous/cheap; the AI checks are the only
    // part worth actually parallelizing, but running both through
    // Promise.all keeps the merge logic below in one place regardless.
    const [ruleResult, aiResult] = await Promise.all([
      Promise.resolve(runChecks({ content, channel: resolvedChannel, rules: resolvedRules })),
      aiEnabled
        ? runAIChecks({ content, channelType: resolvedChannel, profile: resolvedProfile })
        : Promise.resolve({ issues: [], error: null }),
    ]);

    const allIssues = [...ruleResult.issues, ...aiResult.issues];

    res.json({
      score: computeScore(allIssues),
      issues: allIssues,
      meta: {
        ...ruleResult.meta,
        ai: {
          enabled: aiEnabled,
          issueCount: aiResult.issues.length,
          error: aiResult.error,
        },
      },
    });
  } catch (err) {
    console.error("Error handling /api/check:", err);
    res.status(500).json({ error: "Something went wrong while checking this content." });
  }
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
