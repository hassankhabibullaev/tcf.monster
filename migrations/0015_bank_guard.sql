-- The question bank is for signed-in people only, in reasonable amounts and at a human pace (worker/coce/guard.ts):
-- every bank file a person opens is noted once a day; far above what anyone studying opens, the account is blocked
-- until the owner unblocks it on the admin's person page. Rows older than eight days go in the nightly cleanup.
CREATE TABLE bank_reads (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,                  -- the app's local day, YYYY-MM-DD
  kind    TEXT NOT NULL,                  -- data (a /data file)
  key     TEXT NOT NULL,                  -- the file's path
  PRIMARY KEY (user_id, day, key)
) WITHOUT ROWID;
CREATE INDEX bank_reads_user_kind_day ON bank_reads (user_id, kind, day);

-- set when the account was blocked for opening too much of the bank (or by the owner); null = not blocked
ALTER TABLE users ADD COLUMN blocked_at TEXT;
ALTER TABLE users ADD COLUMN blocked_reason TEXT;
-- the bank's human check (Turnstile, asked when a person opens bank files faster than anyone reads): passed until
-- this moment, and the failed answers since the last pass (five → blocked)
ALTER TABLE users ADD COLUMN human_until TEXT;
ALTER TABLE users ADD COLUMN human_fails INTEGER NOT NULL DEFAULT 0;
