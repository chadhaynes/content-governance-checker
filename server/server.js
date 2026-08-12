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

// Fallback: any other non-API route serves the SPA shell.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Content Governance Checker running at http://localhost:${PORT}`);
});

module.exports = app;
