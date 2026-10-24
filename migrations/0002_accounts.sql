-- Accounts: e-mail codes prove an address (sign-up and forgotten password are the same proof), then a password.
-- A verified code leaves a short-lived proof (its hash here) that the password step must present.
ALTER TABLE codes ADD COLUMN proof_hash TEXT;          -- set once the code was right; valid until expires_at
ALTER TABLE codes ADD COLUMN sends INTEGER NOT NULL DEFAULT 1;   -- codes sent in this hour for this address
ALTER TABLE codes ADD COLUMN window_at TEXT;           -- start of that hour

-- Wrong passwords: after 10 in a row, a 15-minute pause.
ALTER TABLE users ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TEXT;
