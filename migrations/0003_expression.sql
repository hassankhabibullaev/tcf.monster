-- The expression simulator (EE · EO): one row per session, one per task, as in the owner's earlier app.
-- The first `expression` table (stage 2, demo rows only) is replaced.
DROP TABLE IF EXISTS expression;

CREATE TABLE expr_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section      TEXT NOT NULL,                     -- ee · eo
  kind         TEXT NOT NULL,                     -- practice · exam
  taches       TEXT NOT NULL,                     -- JSON, ascending: "[1,2,3]"
  mode         TEXT,                              -- eo: live · ptt
  mock_id      INTEGER REFERENCES mocks(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'in_progress', -- in_progress · done · abandoned
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  score        REAL,                              -- out of 20, once every task is marked
  nclc         INTEGER,
  level        TEXT,
  summary_json TEXT,
  seconds      INTEGER
);
CREATE INDEX expr_sessions_user ON expr_sessions(user_id, started_at);

CREATE TABLE expr_tasks (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES expr_sessions(id) ON DELETE CASCADE,
  task_no       INTEGER NOT NULL,                 -- 1 · 2 · 3
  topic_id      INTEGER,                          -- topics.id (null: Tâche 1 oral)
  prompt_json   TEXT NOT NULL,                    -- GeneratedPrompt (worker/sim/types.ts)
  response_text TEXT,                             -- writing: the text
  transcript    TEXT,                             -- speaking: the dialogue, once the task ended
  turns_json    TEXT NOT NULL DEFAULT '[]',       -- speaking: Turn[] (text only: the recordings stay in the browser)
  duration_s    REAL,
  word_count    INTEGER,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending · in_progress · grading · done
  feedback_json TEXT,                             -- Evaluation
  score20       REAL,
  level         TEXT,
  nclc          INTEGER,
  started_at    TEXT,
  submitted_at  TEXT,
  detail_json   TEXT,                             -- the complete list of mistakes
  versions_json TEXT,                             -- writing: the rewrites after the result
  UNIQUE (session_id, task_no)
);

-- Small per-person memory (the Tâche 1 questions already asked, so the next session asks others).
CREATE TABLE user_kv (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
