-- tcf.monster: the whole application's database (D1, SQLite). The app writes it; the admin reads it.
-- Times are ISO strings in UTC ("2026-10-17T09:12:00.000Z"); days are "2026-10-17" in the app's time zone.

-- A person. Deleting the account deletes the row and, through ON DELETE CASCADE, everything below.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,               -- random, never shown
  email         TEXT NOT NULL UNIQUE,           -- lowercased
  name          TEXT,                           -- first name from the sign-up sentence
  password      TEXT,                           -- "pbkdf2-sha256$<iterations>$<salt>$<hash>"; null until set
  created_at    TEXT NOT NULL,
  last_seen_at  TEXT,
  target_nclc   INTEGER,                        -- 4 … 12
  exam_date     TEXT,                           -- "2027-02-18"; null = not registered yet
  lang          TEXT NOT NULL DEFAULT 'fr',     -- interface language
  settings      TEXT NOT NULL DEFAULT '{}',     -- switches and preferences, JSON (latest change wins)
  terms_version TEXT,
  terms_at      TEXT,
  gemini_key    TEXT,                           -- encrypted with the GEMINI_SECRET; never sent back to anyone
  gemini_status TEXT NOT NULL DEFAULT 'none',   -- none · ok · error · quota
  gemini_checked_at TEXT,
  gemini_error  TEXT,
  note          TEXT                            -- the owner's note, admin only
);

-- A signed-in device. The cookie holds a random token; only its SHA-256 is stored.
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,                -- sha256(token)
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at   TEXT NOT NULL,                   -- 30 days after the last visit
  device       TEXT                             -- "iPhone · Safari", from the browser's user agent
);
CREATE INDEX sessions_user ON sessions(user_id);

-- One-time codes sent by e-mail: sign-up, forgotten password, account deletion.
CREATE TABLE codes (
  email      TEXT NOT NULL,
  purpose    TEXT NOT NULL,                     -- signup · reset · delete
  code_hash  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,                     -- 15 minutes
  tries      INTEGER NOT NULL DEFAULT 0,        -- 5 wrong tries and the code is spent
  PRIMARY KEY (email, purpose)
);

-- Practice progress in CO/CE: one row per person per level, a small JSON blob of question → colour
-- (the rules that change it live in one shared file, applied in the browser and on the server alike).
CREATE TABLE progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section    TEXT NOT NULL,                     -- co · ce
  level      TEXT NOT NULL,                     -- A1 … C2
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, section, level)
);

-- What a person did in practice on a day, per level: the admin's sessions list and the dashboard's activity.
CREATE TABLE practice_days (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  section  TEXT NOT NULL,
  level    TEXT NOT NULL,
  answered INTEGER NOT NULL DEFAULT 0,
  wrong    INTEGER NOT NULL DEFAULT 0,
  seconds  INTEGER NOT NULL DEFAULT 0,
  last_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, day, section, level)
);

-- A CO/CE exam attempt. It lives here, not in the tab: the deadline is the server's.
CREATE TABLE attempts (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                    -- co · ce
  exam        INTEGER NOT NULL,                 -- 1 … 40
  mock_id     INTEGER REFERENCES mocks(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  finished_at TEXT,                             -- null while running
  ended       TEXT,                             -- done · time · abandon
  answers     TEXT NOT NULL DEFAULT '{}',       -- placement → chosen letter
  score       INTEGER,                          -- 100 … 699
  nclc        INTEGER,
  right_count INTEGER,
  wrong_count INTEGER,
  blank_count INTEGER
);
CREATE INDEX attempts_user ON attempts(user_id, started_at);

-- An EE/EO session: one Tâche in practice, the three in an exam.
CREATE TABLE expression (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section     TEXT NOT NULL,                    -- ee · eo
  kind        TEXT NOT NULL,                    -- practice · exam
  taches      TEXT NOT NULL,                    -- "2" or "1,2,3"
  topics      TEXT NOT NULL DEFAULT '[]',       -- topic ids, one per Tâche
  mode        TEXT,                             -- EO: live · ptt
  mock_id     INTEGER REFERENCES mocks(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  ended       TEXT,                             -- done · early · dropped
  score       REAL,                             -- out of 20
  criteria    TEXT,                             -- JSON: criterion → mark
  work        TEXT,                             -- EE: the texts; EO: the transcript (JSON per Tâche)
  feedback    TEXT,                             -- JSON: every mistake and its correction
  seconds     INTEGER
);
CREATE INDEX expression_user ON expression(user_id, started_at);

-- The four tests in one sitting; its parts are the attempts and expression rows that point here.
CREATE TABLE mocks (
  id          INTEGER PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at  TEXT NOT NULL,
  finished_at TEXT
);

-- EE/EO topics, word for word from formation-tcfcanada.com, refreshed every Monday by the Worker.
-- EO: one row per topic (Tâche 2 or 3) of a Partie. EE: one row per Combinaison (Tâche 1 + 2 + 3 in body).
CREATE TABLE topics (
  section    TEXT NOT NULL,                     -- ee · eo
  id         INTEGER NOT NULL,                  -- the source's id
  month      TEXT NOT NULL,                     -- "2026-10"
  part       INTEGER NOT NULL,                  -- Partie n (EO) or Combinaison n (EE)
  part_id    INTEGER NOT NULL,                  -- the source's id of the part
  tache      INTEGER,                           -- EO: 2 or 3; EE: null (the row holds the three)
  position   INTEGER NOT NULL,                  -- order inside the part, as on the source
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '{}',        -- EE: tache1, tache2, tache3 {title, document1, document2}; EO: description, question
  first_seen TEXT NOT NULL,
  last_seen  TEXT NOT NULL,
  gone_at    TEXT,                              -- no longer on the source (kept; people's results point to it)
  hidden     INTEGER NOT NULL DEFAULT 0,        -- hidden by the owner
  PRIMARY KEY (section, id)
);
CREATE INDEX topics_month ON topics(section, month, part);

-- Questions or topics the owner hid from the app, with a note.
CREATE TABLE hidden (
  kind TEXT NOT NULL,                           -- question · topic
  id   TEXT NOT NULL,
  at   TEXT NOT NULL,
  note TEXT,
  PRIMARY KEY (kind, id)
);

-- Scheduled and manual jobs: their last run, and a log of every run.
CREATE TABLE jobs (
  name    TEXT PRIMARY KEY,                     -- topics · backup · cleanup
  last_at TEXT NOT NULL,
  ok      INTEGER NOT NULL,
  detail  TEXT NOT NULL,
  seconds REAL NOT NULL
);
CREATE TABLE job_log (
  id     INTEGER PRIMARY KEY,
  at     TEXT NOT NULL,
  name   TEXT NOT NULL,
  ok     INTEGER NOT NULL,
  detail TEXT NOT NULL
);

-- Rows written per day (the free plan allows 100 000); past the hold line the app stops syncing and browsers keep their queue.
CREATE TABLE budget (
  day    TEXT PRIMARY KEY,
  writes INTEGER NOT NULL DEFAULT 0
);

-- Every e-mail the app sent (Resend).
CREATE TABLE mail (
  id     INTEGER PRIMARY KEY,
  at     TEXT NOT NULL,
  email  TEXT NOT NULL,
  kind   TEXT NOT NULL,                         -- signup · reset · delete · test
  ok     INTEGER NOT NULL,
  detail TEXT
);
CREATE INDEX mail_at ON mail(at);

-- The source's month pages the topics sync knows: a new address is read at once; an old month is read again only
-- while it is one of the three newest (older months no longer change).
CREATE TABLE topic_pages (
  section TEXT NOT NULL,
  slug    TEXT NOT NULL,
  month   TEXT,                                 -- from the page title; null if it could not be read
  hash    TEXT,                                 -- SHA-256 of what was taken from the page
  last_at TEXT NOT NULL,
  PRIMARY KEY (section, slug)
);
