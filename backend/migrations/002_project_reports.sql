CREATE TABLE IF NOT EXISTS project_reports (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL UNIQUE REFERENCES projects(id),
    draft_content TEXT NOT NULL,
    final_content TEXT,
    generated_at  TEXT NOT NULL,
    reviewed_by   TEXT,
    reviewed_at   TEXT
);
