-- CO/CE exam attempts (docs/COCE.md §3): the per-level right counts of a finished attempt, for the result's bar,
-- and a small index of the running attempts (one per person at most; the nightly job closes the ones past their deadline).
ALTER TABLE attempts ADD COLUMN by_level TEXT;         -- JSON {"A1":{"right":3,"of":4},…}; null while running
CREATE INDEX attempts_user_running ON attempts(user_id, deadline_at) WHERE finished_at IS NULL;
