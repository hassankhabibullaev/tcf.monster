-- The full mock exam (docs/MOCK-EXAM.md §6): one row of `mocks` per sitting. The table exists since 0001 (id, user_id,
-- started_at, finished_at); these columns hold the stage, the server's clock, the paper, the answers and the results.
ALTER TABLE mocks ADD COLUMN status TEXT NOT NULL DEFAULT 'running';      -- running · marking · done · abandoned
ALTER TABLE mocks ADD COLUMN stage TEXT NOT NULL DEFAULT 'co';            -- co · break1 · ce · break2 · ee · break3 · eo · marking · over
ALTER TABLE mocks ADD COLUMN stage_started_at TEXT;                       -- the server's clock (ISO)
ALTER TABLE mocks ADD COLUMN break_until TEXT;                            -- while the stage is a break
ALTER TABLE mocks ADD COLUMN paper_json TEXT NOT NULL DEFAULT '{}';       -- { co: [{id, level, answer}×39], ce: [...] }
ALTER TABLE mocks ADD COLUMN topics_json TEXT NOT NULL DEFAULT '{}';      -- { ee: combinaisonId, eo: { partId, t2, t3 } }
ALTER TABLE mocks ADD COLUMN co_answers TEXT NOT NULL DEFAULT '{}';       -- { "<questionId>": "A" }
ALTER TABLE mocks ADD COLUMN ce_answers TEXT NOT NULL DEFAULT '{}';
ALTER TABLE mocks ADD COLUMN co_result TEXT;                              -- { score, nclc, right, wrong, blank, byLevel, ended, at }
ALTER TABLE mocks ADD COLUMN ce_result TEXT;
ALTER TABLE mocks ADD COLUMN ee_session_id TEXT;                          -- expr_sessions rows (mock_id set), created when their stage starts
ALTER TABLE mocks ADD COLUMN eo_session_id TEXT;
ALTER TABLE mocks ADD COLUMN ended_json TEXT NOT NULL DEFAULT '{}';       -- how each stage ended: { co: "done"|"time"|"abandon"|"stale", …, eoLateS }
ALTER TABLE mocks ADD COLUMN mic_mode TEXT;                               -- live · ptt
ALTER TABLE mocks ADD COLUMN result_json TEXT;                            -- the four results and the overall, once done
ALTER TABLE mocks ADD COLUMN certificate INTEGER NOT NULL DEFAULT 0;      -- 1 when the certificate is due
CREATE INDEX mocks_user ON mocks(user_id, started_at);
CREATE INDEX mocks_user_running ON mocks(user_id) WHERE finished_at IS NULL;
