-- What a person writes and says stays in their browser (2026-10-24): the server keeps their account, their progress
-- and their marks, nothing more. The Gemini key, the texts, the transcripts, the corrections and the rewrites leave
-- the database; a task keeps its subject and its marks (marks_json: the grid's rows and their numbers, shared/sim/marks.ts).

-- the marks, taken from each stored evaluation before it goes (numbers and the grid's row names only)
ALTER TABLE expr_tasks ADD COLUMN marks_json TEXT;
UPDATE expr_tasks SET marks_json = json_object(
  'stage', CASE json_extract(feedback_json, '$.stage') WHEN 'full' THEN 'full' ELSE 'transcript' END,
  'score20', coalesce(json_extract(feedback_json, '$.score20'), score20),
  'taskScore', json_extract(feedback_json, '$.taskScore'),
  'taskScoreMax', json_extract(feedback_json, '$.taskScoreMax'),
  'criteria', (SELECT json_group_array(json_object('name', json_extract(c.value, '$.name'), 'score', json_extract(c.value, '$.score')))
               FROM json_each(feedback_json, '$.criteria') c WHERE json_type(c.value, '$.score') IN ('integer', 'real')),
  'locked', coalesce((SELECT json_group_array(l.value) FROM json_each(feedback_json, '$.locked') l WHERE l.type = 'text'), json('[]'))
) WHERE feedback_json IS NOT NULL AND json_valid(feedback_json) AND json_type(feedback_json) = 'object' AND score20 IS NOT NULL;

-- the follow-up questions planned from what a candidate said about themselves go with the rest
UPDATE expr_tasks SET prompt_json = json_remove(prompt_json, '$.examinerPlan.followUps') WHERE json_valid(prompt_json) AND json_type(prompt_json, '$.examinerPlan.followUps') IS NOT NULL;

ALTER TABLE expr_tasks DROP COLUMN response_text;   -- the text written
ALTER TABLE expr_tasks DROP COLUMN transcript;      -- what was said, as one text
ALTER TABLE expr_tasks DROP COLUMN turns_json;      -- what was said, turn by turn
ALTER TABLE expr_tasks DROP COLUMN feedback_json;   -- the evaluation (its reasons and tips quote the candidate)
ALTER TABLE expr_tasks DROP COLUMN detail_json;     -- every mistake and its correction
ALTER TABLE expr_tasks DROP COLUMN versions_json;   -- the rewrites

-- the Tâche 1 questions already asked live in the browser too (they can echo what the candidate said)
DELETE FROM user_kv WHERE key = 't1_asked';

-- the key: in the browser only. gemini_status stays: what the browser last reported (ok · none · error · quota).
ALTER TABLE users DROP COLUMN gemini_key;
