-- One guard against abuse (worker/guard.ts), 2026-10-24. Nobody has a daily quota any more: a person may sit every
-- exam in a day. What is watched is pace and volume far beyond anyone studying: first Cloudflare's human check, then,
-- when it goes on regardless, the account is blocked until the owner unblocks it.

-- the bank's per-file index was already covered by its primary key (two rows written per file noted)
DROP INDEX IF EXISTS bank_reads_user_kind_day;

-- the human check the account must pass before going on (set when its pace or volume looked automated), and why
ALTER TABLE users ADD COLUMN human_needed_at TEXT;
ALTER TABLE users ADD COLUMN human_reason TEXT;

-- what the guard did to an account, shown on the admin's person page: challenged · passed · failed · blocked ·
-- unblocked (by the owner) · cleared. Kept 90 days.
CREATE TABLE guard_events (
  user_id TEXT NOT NULL,
  at      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  detail  TEXT,
  PRIMARY KEY (user_id, at, kind)
) WITHOUT ROWID;

-- requests and changes per person per day, counted in each server's memory and written in groups of 25 (a person
-- using the app normally is rarely written at all); compared with the guard's daily lines. Kept 3 days.
CREATE TABLE usage (
  user_id  TEXT NOT NULL,
  day      TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  writes   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;

-- which network asked for each mail (a keyed hash, never the address itself): codes per network per day are capped
ALTER TABLE mail ADD COLUMN ip TEXT;
CREATE INDEX mail_ip_at ON mail (ip, at) WHERE ip IS NOT NULL;
