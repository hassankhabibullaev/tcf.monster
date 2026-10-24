-- CO/CE exam attempts (docs/COCE.md §3): how the attempt was taken. `exam` = the real conditions (CO plays once and
-- moves on by itself, no going back); `training` = the same questions and the same clock, free movement everywhere.
ALTER TABLE attempts ADD COLUMN mode TEXT NOT NULL DEFAULT 'exam';   -- 'exam' | 'training'
