"""SQL for the workspace. Routes stay thin and call these methods."""

import json
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from auth import hash_password, new_token, verify_password
from db import Database, now
from domain import (
    ALREADY_MOVED,
    NO_ACTIVE,
    PRIORITIES,
    STATUSES,
    TYPES,
    AppError,
    mention_ids,
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
        cleaned = email.strip().lower()
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
            raise AppError(400, "email must contain @")
        if len(password) < 8:
            raise AppError(400, "password must be at least 8 characters")
        user_id = _id()
        raw, token_hash = new_token()
        created = now()
        expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat(
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
            raise AppError(409, "An account with that email already exists.") from exc
        return {
            "token": raw,
            "user": {"id": user_id, "email": cleaned, "created_at": created},
        }

    def login(self, email: str, password: str) -> dict:
        cleaned = email.strip().lower()
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (cleaned,)).fetchone()
            if row is None or not verify_password(password, row["password_hash"]):
                raise AppError(401, "Email or password is wrong.")
            raw, token_hash = new_token()
            created = now()
            expires = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).isoformat(
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
        cleaned = name.strip()
        if not cleaned or len(cleaned) > 100:
            raise AppError(400, "name is required and must be 1–100 characters")
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
            raise AppError(409, "A project with that name already exists.") from exc
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
        if sort not in (None, "priority", "created_at"):
            raise AppError(400, "sort must be priority or created_at")
        if status is not None and status not in STATUSES:
            raise AppError(400, "invalid status")
        order = {
            None: "us.created_at ASC, us.id ASC",
            "created_at": "us.created_at DESC, us.id ASC",
            "priority": (
                "CASE us.priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 "
                "ELSE 2 END, us.created_at ASC, us.id ASC"
            ),
        }[sort]
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
        cleaned = title.strip()
        if not cleaned:
            raise AppError(400, "title is required")
        if priority not in PRIORITIES:
            raise AppError(400, "invalid priority")
        if type_ not in TYPES:
            raise AppError(400, "invalid type")
        story_id = _id()
        created = now()
        with self.db.connect() as conn:
            self._require_project(conn, project_id)
            conn.execute(
                """
                INSERT INTO user_stories (
                    id, project_id, title, description, status, priority, type,
                    github_branch_ref, created_at
                ) VALUES (?, ?, ?, ?, 'Backlog', ?, ?, NULL, ?)
                """,
                (story_id, project_id, cleaned, description, priority, type_, created),
            )
            row = conn.execute("SELECT * FROM user_stories WHERE id = ?", (story_id,)).fetchone()
            return self._story_dto(conn, row)

    def patch_story(self, story_id: str, changes: dict) -> dict:
        with self.db.connect() as conn:
            story = self._load_story(conn, story_id)
            if "expected_status" in changes and changes["expected_status"] != story["status"]:
                raise AppError(409, ALREADY_MOVED)
            title = story["title"]
            description = story["description"]
            priority = story["priority"]
            type_ = story["type"]
            branch = story["github_branch_ref"]
            status = story["status"]
            if "title" in changes:
                if not isinstance(changes["title"], str) or not changes["title"].strip():
                    raise AppError(400, "title is required")
                title = changes["title"].strip()
            if "description" in changes:
                description = changes["description"]
                if description is not None and not isinstance(description, str):
                    raise AppError(400, "description must be a string")
            if "priority" in changes:
                if changes["priority"] not in PRIORITIES:
                    raise AppError(400, "invalid priority")
                priority = changes["priority"]
            if "type" in changes:
                if changes["type"] not in TYPES:
                    raise AppError(400, "invalid type")
                type_ = changes["type"]
            if "github_branch_ref" in changes:
                branch = changes["github_branch_ref"]
                if branch is not None and not isinstance(branch, str):
                    raise AppError(400, "github_branch_ref must be a string")
            if "status" in changes:
                if changes["status"] not in STATUSES:
                    raise AppError(400, "invalid status")
                status = changes["status"]
                self._apply_status_move(conn, story, status)
            conn.execute(
                """
                UPDATE user_stories
                SET title = ?, description = ?, priority = ?, type = ?,
                    github_branch_ref = ?, status = ?
                WHERE id = ?
                """,
                (title, description, priority, type_, branch, status, story_id),
            )
            row = self._load_story(conn, story_id)
            return self._story_dto(conn, row)

    def _apply_status_move(self, conn, story: sqlite3.Row, new_status: str) -> None:
        old = story["status"]
        if new_status == old:
            return
        if old == "Backlog" and new_status != "Backlog":
            active = conn.execute(
                """
                SELECT id FROM sprints
                WHERE project_id = ? AND status = 'Active'
                """,
                (story["project_id"],),
            ).fetchone()
            if active is None:
                raise AppError(409, NO_ACTIVE)
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
        if new_status == "Backlog":
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
            raise AppError(
                409, "A Planned or Active sprint already exists for this project."
            ) from exc
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
            if row["status"] != "Planned":
                raise AppError(409, "Sprint is not planned.")
            other = conn.execute(
                """
                SELECT id FROM sprints
                WHERE project_id = ? AND status = 'Active' AND id != ?
                """,
                (row["project_id"], sprint_id),
            ).fetchone()
            if other is not None:
                raise AppError(409, "Another sprint is already active.")
            conn.execute("UPDATE sprints SET status = 'Active' WHERE id = ?", (sprint_id,))
            updated = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
        return _sprint_public(updated)

    def close_sprint(self, sprint_id: str, faculty_notes: str | None) -> dict:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
            if row is None:
                raise AppError(404, "Sprint not found")
            if row["status"] != "Active":
                raise AppError(409, "Sprint is not active.")
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
            if row["status"] != "Closed":
                raise AppError(409, "Sprint is not closed.")
            stories = self._snapshot(conn, sprint_id)
        if not stories:
            raise AppError(422, "This sprint had no stories, so there's nothing to report")
        return {
            "sprint_id": row["id"],
            "status": row["status"],
            "goal": row["goal"],
            "sprint_goal": row["goal"],
            "faculty_notes": row["faculty_notes"],
            "story_count": len(stories),
            "any_completed": any(story["status_at_close"] == "Done" for story in stories),
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
        cleaned = name.strip()
        if not cleaned:
            raise AppError(400, "name is required")
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
            raise AppError(409, "A team member with that name already exists.") from exc
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
        if not isinstance(body, str) or body.strip() == "":
            raise AppError(400, "Comment body is required.")
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
