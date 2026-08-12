/* ==========================================================================
   Content Governance Checker — database setup script

   Creates (or verifies) the rule_profiles and check_history tables in the
   PostgreSQL database pointed to by DATABASE_URL. Safe to run more than
   once.

   Usage (from server/):
     npm run db:setup
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const { pool } = require("./index");

async function setup() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  console.log("Connecting to database and applying schema...");
  await pool.query(schema);
  console.log("Done. Verified tables: rule_profiles, check_history.");
}

setup()
  .catch((err) => {
    console.error("Database setup failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
