-- The study row: the goal and the plan, one per account, last write wins.
CREATE TABLE IF NOT EXISTS study (sub TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at INTEGER NOT NULL, seq INTEGER NOT NULL);
