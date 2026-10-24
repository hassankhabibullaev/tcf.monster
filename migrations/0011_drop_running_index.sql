-- The free plan counts index entries as rows written: this partial index cost two writes per exam (in at the start,
-- out at the finish). The person's own index (attempts_user) answers « what runs for me » from their few rows.
DROP INDEX IF EXISTS attempts_user_running;
