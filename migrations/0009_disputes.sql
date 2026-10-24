-- A person's report of a problem with one practice question (docs/COCE.md §2): one row per report, written once,
-- read by the owner on the admin's Disputes page. The question is named three ways: its id (the bank's), and the
-- section, level and number it had in the level file when it was reported (a later export may renumber).
CREATE TABLE disputes (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                     -- co · ce
  level       TEXT NOT NULL,                     -- A1 … C2
  question_id TEXT NOT NULL,
  n           INTEGER NOT NULL,                  -- the question's number in its level, as the person saw it
  message     TEXT NOT NULL,                     -- the person's own words, at most 2 000 characters
  status      TEXT NOT NULL DEFAULT 'open',      -- open · resolved
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX disputes_user ON disputes(user_id, section, level);
CREATE INDEX disputes_created ON disputes(created_at);
CREATE INDEX disputes_open ON disputes(id) WHERE status = 'open';
