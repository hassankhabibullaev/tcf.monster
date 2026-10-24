-- At most 10 codes a day for one address (worker/auth.ts CODES_PER_DAY): a day's guesses at any account stay under 50.
ALTER TABLE codes ADD COLUMN day_sends INTEGER NOT NULL DEFAULT 0;
ALTER TABLE codes ADD COLUMN day_at TEXT;
