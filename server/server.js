/* ==========================================================================
   Content Governance Checker — Express server

   Serves the static frontend from ../client and exposes the
   POST /api/check endpoint that runs the (non-AI) governance checks.
   ========================================================================== */

"use strict";

const path = require("path");
const express = require("express");
const { runChecks } = require("./checks");

const app = express();
const PORT = process.env.PORT || 3800;
const CLIENT_DIR = path.join(__dirname, "..", "client");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(CLIENT_DIR));

app.post("/api/check", (req, res) => {
  const { content, channel, rules } = req.body || {};

  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required and must be a non-empty string" });
  }

  const result = runChecks({
    content,
    channel: typeof channel === "string" && channel ? channel : "email",
    rules: rules && typeof rules === "object" ? rules : {},
  });

  res.json(result);
});

// Fallback: any other non-API route serves the SPA shell.
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Content Governance Checker running at http://localhost:${PORT}`);
});

module.exports = app;
