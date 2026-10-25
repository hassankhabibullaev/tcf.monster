-- The guard tells automation from a fast person by technical signs only (worker/guard.ts), 2026-10-24. Failing the
-- human check never blocks by itself any more; an account is blocked when a hidden trap is touched, when it keeps
-- going at a machine's pace without passing the check, or when several signs add up.

-- the signs seen on the account in the last seven days, by name, with when each was last seen:
-- {"webdriver":"2026-10-24T10:00:00.000Z","rhythm":"…"}; the score is computed from them (worker/guard.ts SIGNS)
ALTER TABLE users ADD COLUMN guard_signs TEXT;

-- the day (the app's) this sign-in last passed Cloudflare's invisible check: once a day a session, one row write
ALTER TABLE sessions ADD COLUMN checked_day TEXT;

-- networks a bot was caught on (a keyed hash of the address, never the address itself; IPv6 by its /64): for a few
-- days the door asks the human check at every step there, with tighter limits; several accounts blocked from one
-- network close sign-ups from it for a week. Never permanent (shared networks: phones, universities); the nightly
-- cleanup removes a row once both dates have passed.
CREATE TABLE guard_networks (
  net          TEXT PRIMARY KEY,
  blocks       INTEGER NOT NULL DEFAULT 0,  -- accounts blocked from it while it was strict
  traps        INTEGER NOT NULL DEFAULT 0,  -- hidden traps touched from it without an account
  strict_until TEXT,                        -- the door is strict until then
  closed_until TEXT,                        -- no new account from it until then
  last_at      TEXT
) WITHOUT ROWID;
