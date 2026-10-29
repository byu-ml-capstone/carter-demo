"""SQL for the workspace. Routes stay thin and call these methods."""

import json
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta

from auth import hash_password, new_token, verify_password
from db import Database, now
from domain import (
    ANOTHER_SPRINT_ACTIVE,
    EMAIL_TAKEN,
    EMPTY_PROJECT,
    EMPTY_SPRINT,
    INITIAL_STORY_STATUS,
    MEMBER_NAME_TAKEN,
    PROJECT_NAME_TAKEN,
    SPRINT_ALREADY_OPEN,
    SPRINT_NOT_ACTIVE,
    SPRINT_NOT_CLOSED,
    SPRINT_NOT_PLANNED,
    AppError,
    any_story_completed,
    mention_ids,
    require_report_stories,
    require_sprint_status,
    story_fields,
    story_list_order,
)

SESSION_DAYS = 14


def _id() -> str:
    return str(uuid.uuid4())


def _sprint_public(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "goal": row["goal"],
        "status": row["status"],
        "faculty_notes": row["faculty_notes"],
        "created_at": row["created_at"],
    }


def _user_public(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "email": row["email"], "created_at": row["created_at"]}


class WorkspaceDAO:
    def __init__(self, database_url: str):
        self.db = Database(database_url)

    def apply_migrations(self) -> list[str]:
        return self.db.apply_migrations()

    def _story_dto(self, conn, row: sqlite3.Row) -> dict:
        open_sprint = conn.execute(
            """
            SELECT ss.sprint_id
            FROM sprint_stories ss
            JOIN sprints s ON s.id = ss.sprint_id
            WHERE ss.story_id = ? AND s.status != 'Closed'
            """,
            (row["id"],),
        ).fetchone()
        return {
            "id": row["id"],
            "project_id": row["project_id"],
            "title": row["title"],
            "description": row["description"],
            "status": row["status"],
            "priority": row["priority"],
            "type": row["type"],
            "github_branch_ref": row["github_branch_ref"],
            "open_sprint_id": open_sprint["sprint_id"] if open_sprint else None,
            "created_at": row["created_at"],
        }

    def _load_story(self, conn, story_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM user_stories WHERE id = ?", (story_id,)).fetchone()
        if row is None:
            raise AppError(404, "Story not found")
        return row

    def register(self, email: str, password: str) -> dict:
        cleaned = email
        user_id = _id()
        raw, token_hash = new_token()
        created = now()
        expires = (datetime.now(UTC) + timedelta(days=SESSION_DAYS)).isoformat(
            timespec="microseconds"
        )
        try:
            with self.db.connect() as conn:
                conn.execute(
                    """
                    INSERT INTO users (id, email, password_hash, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (user_id, cleaned, hash_password(password), created),
                )
                conn.execute(
                    """
                    INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (_id(), user_id, token_hash, created, expires),
                )
        except sqlite3.IntegrityError as exc:
            raise AppError(409, EMAIL_TAKEN) from exc
        return {
            "token": raw,
            "user": {"id": user_id, "email": cleaned, "created_at": created},
        }

    def login(self, email: str, password: str) -> dict:
        cleaned = email
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (cleaned,)).fetchone()
            if row is None or not verify_password(password, row["password_hash"]):
                raise AppError(401, "Email or password is wrong.")
            raw, token_hash = new_token()
            created = now()
            expires = (datetime.now(UTC) + timedelta(days=SESSION_DAYS)).isoformat(
                timespec="microseconds"
            )
            conn.execute(
                """
                INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (_id(), row["id"], token_hash, created, expires),
            )
        return {"token": raw, "user": _user_public(row)}

    def user_for_token(self, token_hash: str) -> dict | None:
        with self.db.connect() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.email, u.created_at, s.expires_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ?
                """,
                (token_hash,),
            ).fetchone()
        if row is None or row["expires_at"] <= now():
            return None
        return {"id": row["id"], "email": row["email"], "created_at": row["created_at"]}

    def logout(self, token_hash: str) -> None:
        with self.db.connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))

    def create_project(self, name: str, description: str | None) -> dict:
        cleaned = name
        project_id = _id()
        created = now()
        try:
            with self.db.connect() as conn:
                conn.execute(
                    """
                    INSERT INTO projects (id, name, description, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (project_id, cleaned, description, created),
                )
        except sqlite3.IntegrityError as exc:
            raise AppError(409, PROJECT_NAME_TAKEN) from exc
        return {
            "id": project_id,
            "name": cleaned,
            "description": description,
            "created_at": created,
        }

    def list_projects(self) -> list[dict]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM projects ORDER BY created_at ASC, id ASC").fetchall()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "description": row["description"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def get_project(self, project_id: str) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise AppError(404, "Project not found")
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "created_at": row["created_at"],
        }

    def _require_project(self, conn, project_id: str) -> sqlite3.Row:
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise AppError(404, "Project not found")
        return row

    def list_stories(
        self,
        project_id: str,
        status: str | None,
        sprint_id: str | None,
        sort: str | None,
        hide_resolved: bool,
    ) -> list[dict]:
        order = story_list_order(sort, status)
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            if sprint_id is not None:
                sprint = conn.execute(
                    "SELECT project_id FROM sprints WHERE id = ?", (sprint_id,)
                ).fetchone()
                if sprint is None or sprint["project_id"] != project_id:
                    raise AppError(400, "sprint_id does not belong to this project")
            where = ["us.project_id = ?"]
            params: list = [project_id]
            if status is not None:
                where.append("us.status = ?")
                params.append(status)
            if hide_resolved:
                where.append("us.status != 'Done'")
            if sprint_id is not None:
                where.append(
                    """
                    EXISTS (
                        SELECT 1 FROM sprint_stories ss
                        WHERE ss.story_id = us.id AND ss.sprint_id = ?
                    )
                    """
                )
                params.append(sprint_id)
            rows = conn.execute(
                f"""
                SELECT us.* FROM user_stories us
                WHERE {" AND ".join(where)}
                ORDER BY {order}
                """,
                params,
            ).fetchall()
            return [self._story_dto(conn, row) for row in rows]

    def create_story(
        self,
        project_id: str,
        title: str,
        description: str | None,
        priority: str,
        type_: str,
    ) -> dict:
        cleaned = title
        story_id = _id()
        created = now()
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            conn.execute(
                """
                INSERT INTO user_stories (
                    id, project_id, title, description, status, priority, type,
                    github_branch_ref, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
                """,
                (
                    story_id,
                    project_id,
                    cleaned,
                    description,
                    INITIAL_STORY_STATUS,
                    priority,
                    type_,
                    created,
                ),
            )
            row = conn.execute("SELECT * FROM user_stories WHERE id = ?", (story_id,)).fetchone()
            return self._story_dto(conn, row)

    def patch_story(self, story_id: str, changes: dict) -> dict:
        with self.db.connect() as conn:
            story = self._load_story(conn, story_id)
            fields = story_fields(story, changes)
            if fields["action"] in ("link", "unlink"):
                self._apply_status_move(conn, story, fields["action"])
            conn.execute(
                """
                UPDATE user_stories
                SET title = ?, description = ?, priority = ?, type = ?,
                    github_branch_ref = ?, status = ?
                WHERE id = ?
                """,
                (
                    fields["title"],
                    fields["description"],
                    fields["priority"],
                    fields["type"],
                    fields["github_branch_ref"],
                    fields["status"],
                    story_id,
                ),
            )
            row = self._load_story(conn, story_id)
            return self._story_dto(conn, row)

    def _apply_status_move(self, conn, story: sqlite3.Row, action: str) -> None:
        if action == "link":
            active = conn.execute(
                """
                SELECT id FROM sprints
                WHERE project_id = ? AND status = 'Active'
                """,
                (story["project_id"],),
            ).fetchone()
            if active is None:
                return
            existing = conn.execute(
                """
                SELECT ss.sprint_id
                FROM sprint_stories ss
                JOIN sprints s ON s.id = ss.sprint_id
                WHERE ss.story_id = ? AND s.status != 'Closed'
                """,
                (story["id"],),
            ).fetchone()
            if existing is None:
                conn.execute(
                    """
                    INSERT INTO sprint_stories (id, sprint_id, story_id)
                    VALUES (?, ?, ?)
                    """,
                    (_id(), active["id"], story["id"]),
                )
            return
        conn.execute(
            """
                DELETE FROM sprint_stories
                WHERE story_id = ?
                  AND sprint_id IN (SELECT id FROM sprints WHERE status != 'Closed')
                """,
            (story["id"],),
        )

    def create_sprint(self, project_id: str, goal: str | None) -> dict:
        sprint_id = _id()
        created = now()
        try:
            with self.db.connect() as conn:
                self._require_project(conn, project_id)
                conn.execute(
                    """
                    INSERT INTO sprints (
                        id, project_id, goal, status, faculty_notes, created_at
                    ) VALUES (?, ?, ?, 'Planned', NULL, ?)
                    """,
                    (sprint_id, project_id, goal, created),
                )
                row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        except sqlite3.IntegrityError as exc:
            raise AppError(409, SPRINT_ALREADY_OPEN) from exc
        return _sprint_public(row)

    def list_sprints(self, project_id: str) -> list[dict]:
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            rows = conn.execute(
                """
                SELECT * FROM sprints
                WHERE project_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (project_id,),
            ).fetchall()
        return [_sprint_public(row) for row in rows]

    def _snapshot(self, conn, sprint_id: str) -> list[dict]:
        rows = conn.execute(
            """
            SELECT story_id, title_at_close, description_at_close,
                   priority_at_close, type_at_close, status_at_close
            FROM sprint_stories
            WHERE sprint_id = ?
            ORDER BY title_at_close ASC, story_id ASC
            """,
            (sprint_id,),
        ).fetchall()
        return [
            {
                "story_id": row["story_id"],
                "title": row["title_at_close"],
                "description": row["description_at_close"],
                "priority": row["priority_at_close"],
                "type": row["type_at_close"],
                "status_at_close": row["status_at_close"],
            }
            for row in rows
        ]

    def get_sprint(self, sprint_id: str) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            if row is None:
                raise AppError(404, "Sprint not found")
            body = _sprint_public(row)
            if row["status"] == "Closed":
                body["stories_snapshot"] = self._snapshot(conn, sprint_id)
            else:
                linked = conn.execute(
                    """
                    SELECT us.*
                    FROM user_stories us
                    JOIN sprint_stories ss ON ss.story_id = us.id
                    WHERE ss.sprint_id = ?
                    ORDER BY us.created_at ASC, us.id ASC
                    """,
                    (sprint_id,),
                ).fetchall()
                body["stories"] = [self._story_dto(conn, story) for story in linked]
        return body

    def activate_sprint(self, sprint_id: str) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            if row is None:
                raise AppError(404, "Sprint not found")
            require_sprint_status(row["status"], "Planned", SPRINT_NOT_PLANNED)
            other = conn.execute(
                """
                SELECT id FROM sprints
                WHERE project_id = ? AND status = 'Active' AND id != ?
                """,
                (row["project_id"], sprint_id),
            ).fetchone()
            if other is not None:
                raise AppError(409, ANOTHER_SPRINT_ACTIVE)
            conn.execute("UPDATE sprints SET status = 'Active' WHERE id = ?", (sprint_id,))
            updated = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        return _sprint_public(updated)

    def close_sprint(self, sprint_id: str, faculty_notes: str | None) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            if row is None:
                raise AppError(404, "Sprint not found")
            require_sprint_status(row["status"], "Active", SPRINT_NOT_ACTIVE)
            conn.execute(
                """
                UPDATE sprint_stories
                SET status_at_close = (
                        SELECT status FROM user_stories WHERE id = sprint_stories.story_id
                    ),
                    title_at_close = (
                        SELECT title FROM user_stories WHERE id = sprint_stories.story_id
                    ),
                    description_at_close = (
                        SELECT description FROM user_stories WHERE id = sprint_stories.story_id
                    ),
                    priority_at_close = (
                        SELECT priority FROM user_stories WHERE id = sprint_stories.story_id
                    ),
                    type_at_close = (
                        SELECT type FROM user_stories WHERE id = sprint_stories.story_id
                    )
                WHERE sprint_id = ?
                """,
                (sprint_id,),
            )
            conn.execute(
                """
                UPDATE user_stories
                SET status = 'Backlog'
                WHERE id IN (
                    SELECT story_id FROM sprint_stories
                    WHERE sprint_id = ? AND status_at_close != 'Done'
                )
                """,
                (sprint_id,),
            )
            conn.execute(
                """
                UPDATE sprints
                SET status = 'Closed', faculty_notes = ?
                WHERE id = ?
                """,
                (faculty_notes, sprint_id),
            )
            updated = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            body = _sprint_public(updated)
            body["stories_snapshot"] = self._snapshot(conn, sprint_id)
        return body

    def report_snapshot(self, sprint_id: str) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            if row is None:
                raise AppError(404, "Sprint not found")
            require_sprint_status(row["status"], "Closed", SPRINT_NOT_CLOSED)
            stories = self._snapshot(conn, sprint_id)
        require_report_stories(stories, EMPTY_SPRINT)
        return {
            "sprint_id": row["id"],
            "status": row["status"],
            "goal": row["goal"],
            "sprint_goal": row["goal"],
            "faculty_notes": row["faculty_notes"],
            "story_count": len(stories),
            "any_completed": any_story_completed(stories),
            "stories": [
                {
                    "id": story["story_id"],
                    "title": story["title"],
                    "description": story["description"],
                    "priority": story["priority"],
                    "type": story["type"],
                    "status_at_close": story["status_at_close"],
                }
                for story in stories
            ],
        }

    def save_draft(self, sprint_id: str, draft: dict, generated_at: str) -> None:
        payload = json.dumps(draft)
        with self.db.connect() as conn:
            existing = conn.execute(
                "SELECT id FROM sprint_reports WHERE sprint_id = ?", (sprint_id,)
            ).fetchone()
            if existing is None:
                conn.execute(
                    """
                    INSERT INTO sprint_reports (
                        id, sprint_id, draft_content, final_content, generated_at,
                        reviewed_by, reviewed_at
                    ) VALUES (?, ?, ?, NULL, ?, NULL, NULL)
                    """,
                    (_id(), sprint_id, payload, generated_at),
                )
            else:
                conn.execute(
                    """
                    UPDATE sprint_reports
                    SET draft_content = ?, generated_at = ?
                    WHERE sprint_id = ?
                    """,
                    (payload, generated_at, sprint_id),
                )

    def save_final(self, sprint_id: str, final: dict, reviewed_by: str | None) -> dict:
        with self.db.connect() as conn:
            row = conn.execute(
                "SELECT * FROM sprint_reports WHERE sprint_id = ?", (sprint_id,)
            ).fetchone()
            if row is None:
                raise AppError(404, "Report not found")
            reviewed_at = now()
            conn.execute(
                """
                UPDATE sprint_reports
                SET final_content = ?, reviewed_by = ?, reviewed_at = ?
                WHERE sprint_id = ?
                """,
                (json.dumps(final), reviewed_by, reviewed_at, sprint_id),
            )
            updated = conn.execute(
                "SELECT * FROM sprint_reports WHERE sprint_id = ?", (sprint_id,)
            ).fetchone()
        return _report_public(updated)

    def project_report_snapshot(self, project_id: str, faculty_notes: str | None) -> dict:
        """Point-in-time board snapshot. Status is Closed so the drafter can run
        without a sprint having been closed."""
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            rows = conn.execute(
                """
                SELECT * FROM user_stories
                WHERE project_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (project_id,),
            ).fetchall()
            active = conn.execute(
                """
                SELECT goal FROM sprints
                WHERE project_id = ? AND status = 'Active'
                """,
                (project_id,),
            ).fetchone()
        require_report_stories(rows, EMPTY_PROJECT)
        stories = [
            {
                "id": row["id"],
                "title": row["title"],
                "description": row["description"],
                "priority": row["priority"],
                "type": row["type"],
                "status_at_close": row["status"],
            }
            for row in rows
        ]
        goal = None if active is None else active["goal"]
        return {
            "project_id": project_id,
            "status": "Closed",
            "goal": goal,
            "sprint_goal": goal,
            "faculty_notes": faculty_notes,
            "story_count": len(stories),
            "any_completed": any_story_completed(stories),
            "stories": stories,
        }

    def save_project_draft(
        self, project_id: str, draft: dict, generated_at: str, stories: list
    ) -> dict:
        report_id = _id()
        payload = json.dumps(draft)
        frozen = json.dumps(stories)
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            conn.execute(
                """
                INSERT INTO project_reports (
                    id, project_id, draft_content, final_content, generated_at,
                    reviewed_by, reviewed_at, stories_snapshot
                ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?)
                """,
                (report_id, project_id, payload, generated_at, frozen),
            )
            row = conn.execute(
                "SELECT * FROM project_reports WHERE id = ?", (report_id,)
            ).fetchone()
        return _project_report_public(row)

    def save_project_final(
        self, project_id: str, report_id: str, final: dict, reviewed_by: str | None
    ) -> dict:
        with self.db.connect() as conn:
            row = self._project_report_row(conn, project_id, report_id)
            reviewed_at = now()
            conn.execute(
                """
                UPDATE project_reports
                SET final_content = ?, reviewed_by = ?, reviewed_at = ?
                WHERE id = ?
                """,
                (json.dumps(final), reviewed_by, reviewed_at, row["id"]),
            )
            updated = conn.execute(
                "SELECT * FROM project_reports WHERE id = ?", (row["id"],)
            ).fetchone()
        return _project_report_public(updated)

    def list_project_reports(self, project_id: str) -> list[dict]:
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            rows = conn.execute(
                """
                SELECT * FROM project_reports
                WHERE project_id = ?
                ORDER BY generated_at DESC, id DESC
                """,
                (project_id,),
            ).fetchall()
        return [_project_report_public(row) for row in rows]

    def get_project_report(self, project_id: str, report_id: str) -> dict:
        with self.db.connect() as conn:
            row = self._project_report_row(conn, project_id, report_id)
        return _project_report_public(row)

    def _project_report_row(self, conn, project_id: str, report_id: str) -> sqlite3.Row:
        self._require_project(conn, project_id)
        row = conn.execute(
            """
            SELECT * FROM project_reports
            WHERE id = ? AND project_id = ?
            """,
            (report_id, project_id),
        ).fetchone()
        if row is None:
            raise AppError(404, "Report not found")
        return row

    def get_report(self, sprint_id: str) -> dict:
        with self.db.connect() as conn:
            sprint = conn.execute("SELECT id FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            if sprint is None:
                raise AppError(404, "Sprint not found")
            row = conn.execute(
                "SELECT * FROM sprint_reports WHERE sprint_id = ?", (sprint_id,)
            ).fetchone()
        if row is None:
            raise AppError(404, "Report not found")
        return _report_public(row)

    def add_member(self, project_id: str, name: str) -> dict:
        cleaned = name
        member_id = _id()
        created = now()
        try:
            with self.db.connect() as conn:
                self._require_project(conn, project_id)
                conn.execute(
                    """
                    INSERT INTO team_members (id, project_id, name, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (member_id, project_id, cleaned, created),
                )
        except sqlite3.IntegrityError as exc:
            raise AppError(409, MEMBER_NAME_TAKEN) from exc
        return {"id": member_id, "name": cleaned}

    def list_members(self, project_id: str) -> list[dict]:
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            rows = conn.execute(
                """
                SELECT id, name FROM team_members
                WHERE project_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (project_id,),
            ).fetchall()
        return [{"id": row["id"], "name": row["name"]} for row in rows]

    def add_comment(self, parent_type: str, parent_id: str, author_id: str, body: str) -> dict:
        with self.db.connect() as conn:
            project_id = self._parent_project(conn, parent_type, parent_id)
            author = conn.execute(
                """
                SELECT id, name FROM team_members
                WHERE id = ? AND project_id = ?
                """,
                (author_id, project_id),
            ).fetchone()
            if author is None:
                raise AppError(404, "Author not found")
            members = conn.execute(
                "SELECT id, name FROM team_members WHERE project_id = ?",
                (project_id,),
            ).fetchall()
            mentioned = mention_ids(
                body, [{"id": row["id"], "name": row["name"]} for row in members]
            )
            comment_id = _id()
            created = now()
            conn.execute(
                """
                INSERT INTO comments (
                    id, parent_type, parent_id, author_id, body, mentioned_ids, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    comment_id,
                    parent_type,
                    parent_id,
                    author_id,
                    body,
                    json.dumps(mentioned),
                    created,
                ),
            )
        return {
            "id": comment_id,
            "author_id": author_id,
            "body": body,
            "mentioned_ids": mentioned,
            "created_at": created,
        }

    def list_comments(self, parent_type: str, parent_id: str) -> list[dict]:
        with self.db.connect() as conn:
            self._parent_project(conn, parent_type, parent_id)
            rows = conn.execute(
                """
                SELECT * FROM comments
                WHERE parent_type = ? AND parent_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (parent_type, parent_id),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "author_id": row["author_id"],
                "body": row["body"],
                "mentioned_ids": json.loads(row["mentioned_ids"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]

    def _parent_project(self, conn, parent_type: str, parent_id: str) -> str:
        if parent_type == "Story":
            row = conn.execute(
                "SELECT project_id FROM user_stories WHERE id = ?", (parent_id,)
            ).fetchone()
            if row is None:
                raise AppError(404, "Story not found")
            return row["project_id"]
        row = conn.execute("SELECT project_id FROM sprints WHERE id = ?", (parent_id,)).fetchone()
        if row is None:
            raise AppError(404, "Sprint not found")
        return row["project_id"]


def _project_report_public(row: sqlite3.Row) -> dict:
    final = row["final_content"]
    keys = row.keys()
    frozen = (
        row["stories_snapshot"] if "stories_snapshot" in keys and row["stories_snapshot"] else "[]"
    )
    return {
        "id": row["id"],
        "project_id": row["project_id"],
        "stories_snapshot": json.loads(frozen),
        "draft_content": json.loads(row["draft_content"]),
        "final_content": json.loads(final) if final else None,
        "generated_at": row["generated_at"],
        "reviewed_by": row["reviewed_by"],
        "reviewed_at": row["reviewed_at"],
    }


def _report_public(row: sqlite3.Row) -> dict:
    final = row["final_content"]
    return {
        "id": row["id"],
        "sprint_id": row["sprint_id"],
        "draft_content": json.loads(row["draft_content"]),
        "final_content": json.loads(final) if final else None,
        "generated_at": row["generated_at"],
        "reviewed_by": row["reviewed_by"],
        "reviewed_at": row["reviewed_at"],
    }
