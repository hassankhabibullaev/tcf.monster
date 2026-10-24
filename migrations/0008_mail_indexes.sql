-- The nightly mail job reads only the people it may write to: exam dates around today, and the welcomes still owed
-- (without these it read every account each night, and the free plan counts every row read).
CREATE INDEX users_exam_date ON users(exam_date) WHERE exam_date IS NOT NULL;
CREATE INDEX users_unwelcomed ON users(id) WHERE welcomed_at IS NULL AND name IS NOT NULL;
