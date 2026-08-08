-- ==========================================================================
-- Content Governance Checker — database schema
--
-- Applied by db/setup.js. Safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- ==========================================================================

CREATE TABLE IF NOT EXISTS rule_profiles (
  id                           SERIAL PRIMARY KEY,
  name                         TEXT NOT NULL,
  channel                      TEXT,
  reading_level_max            INTEGER NOT NULL DEFAULT 8,
  passive_voice_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  max_sentence_length          INTEGER NOT NULL DEFAULT 25,
  compliance_keywords_block    TEXT[] NOT NULL DEFAULT '{}',
  compliance_keywords_require  TEXT[] NOT NULL DEFAULT '{}',
  tone                         TEXT,
  custom_notes                 TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS check_history (
  id                SERIAL PRIMARY KEY,
  profile_id        INTEGER REFERENCES rule_profiles(id) ON DELETE SET NULL,
  content_snippet   TEXT,
  overall_score     INTEGER,
  issues_count      INTEGER,
  checked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_check_history_checked_at ON check_history (checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_history_profile_id ON check_history (profile_id);

-- Keeps rule_profiles.updated_at current on every UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rule_profiles_updated_at ON rule_profiles;
CREATE TRIGGER trg_rule_profiles_updated_at
  BEFORE UPDATE ON rule_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
