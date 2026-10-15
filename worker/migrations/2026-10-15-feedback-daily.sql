CREATE TABLE IF NOT EXISTS feedback_daily (day TEXT PRIMARY KEY, n INTEGER NOT NULL);
INSERT INTO feedback_daily (day, n) SELECT 'total', COUNT(*) FROM feedback WHERE 1 ON CONFLICT(day) DO UPDATE SET n = excluded.n;
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
