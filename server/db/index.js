/* ==========================================================================
   Content Governance Checker — PostgreSQL connection pool

   Loads DATABASE_URL from .env and exposes a shared `pg` Pool used by the
   rest of the db/ modules.
   ========================================================================== */

"use strict";

require("dotenv").config();

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn(
    "Warning: DATABASE_URL is not set. Copy server/.env.example to server/.env " +
      "and fill in your PostgreSQL connection string."
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

module.exports = { pool };
