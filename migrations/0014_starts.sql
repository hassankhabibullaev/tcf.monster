-- Every start of a practice session, an exam attempt or a mock exam, kept apart from the thing started: deleting a
-- session no longer gives its start back (the daily caps count these). Rows older than two days go in the nightly cleanup.
CREATE TABLE starts (user_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX starts_user_kind_at ON starts (user_id, kind, at);
