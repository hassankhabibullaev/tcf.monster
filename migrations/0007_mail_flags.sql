-- The mails sent once (2026-10-22): the welcome, and the two exam mails remembered by the exam date they were for
-- (a new date gets its own pair). Accounts that finished the welcome sentence before today count as welcomed.
ALTER TABLE users ADD COLUMN welcomed_at TEXT;
ALTER TABLE users ADD COLUMN luck_for TEXT;    -- exam date the « good luck » mail went for
ALTER TABLE users ADD COLUMN after_for TEXT;   -- exam date the « how did it go » mail went for
UPDATE users SET welcomed_at = created_at WHERE name IS NOT NULL;
