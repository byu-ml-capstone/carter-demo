CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS projects_name ON projects(name);

CREATE TABLE IF NOT EXISTS user_stories (
    id                TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL CHECK (status IN ('Backlog', 'Selected for Sprint', 'In Progress', 'Done')),
    priority          TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
    type              TEXT NOT NULL CHECK (type IN ('Feature', 'Bug', 'Chore')),
    github_branch_ref TEXT,
    created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS user_stories_project ON user_stories(project_id);

CREATE TABLE IF NOT EXISTS sprints (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id),
    goal          TEXT,
    status        TEXT NOT NULL CHECK (status IN ('Planned', 'Active', 'Closed')),
    faculty_notes TEXT,
    created_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS sprints_one_open
    ON sprints(project_id)
    WHERE status IN ('Planned', 'Active');

CREATE TABLE IF NOT EXISTS sprint_stories (
    id                   TEXT PRIMARY KEY,
    sprint_id            TEXT NOT NULL REFERENCES sprints(id),
    story_id             TEXT NOT NULL REFERENCES user_stories(id),
    status_at_close      TEXT,
    title_at_close       TEXT,
    description_at_close TEXT,
    priority_at_close    TEXT,
    type_at_close        TEXT,
    UNIQUE (sprint_id, story_id)
);

CREATE INDEX IF NOT EXISTS sprint_stories_story ON sprint_stories(story_id);

CREATE TABLE IF NOT EXISTS sprint_reports (
    id            TEXT PRIMARY KEY,
    sprint_id     TEXT NOT NULL UNIQUE REFERENCES sprints(id),
    draft_content TEXT NOT NULL,
    final_content TEXT,
    generated_at  TEXT NOT NULL,
    reviewed_by   TEXT,
    reviewed_at   TEXT
);

CREATE TABLE IF NOT EXISTS team_members (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_name
    ON team_members(project_id, lower(trim(name)));

CREATE TABLE IF NOT EXISTS comments (
    id            TEXT PRIMARY KEY,
    parent_type   TEXT NOT NULL CHECK (parent_type IN ('Story', 'Sprint')),
    parent_id     TEXT NOT NULL,
    author_id     TEXT NOT NULL REFERENCES team_members(id),
    body          TEXT NOT NULL,
    mentioned_ids TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS comments_parent ON comments(parent_type, parent_id, created_at, id);

CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email);

CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
