CREATE TABLE project_reports_next (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id),
    draft_content TEXT NOT NULL,
    final_content TEXT,
    generated_at  TEXT NOT NULL,
    reviewed_by   TEXT,
    reviewed_at   TEXT
);

INSERT INTO project_reports_next (
    id, project_id, draft_content, final_content, generated_at, reviewed_by, reviewed_at
)
SELECT id, project_id, draft_content, final_content, generated_at, reviewed_by, reviewed_at
FROM project_reports;

DROP TABLE project_reports;

ALTER TABLE project_reports_next RENAME TO project_reports;

CREATE INDEX IF NOT EXISTS project_reports_project
    ON project_reports(project_id, generated_at);
