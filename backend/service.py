"""Use cases. Routes call this module; SQL stays in the DAO."""

import logging

from auth import hash_token
from dao import WorkspaceDAO
from db import now
from domain import (
    DRAFT_FAILED,
    DRAFTER_MISSING,
    SIGN_IN_REQUIRED,
    AppError,
    blank_to_none,
    canonical_email,
    coerce_draft,
    final_content,
    normalize_email,
    normalize_faculty_notes,
    normalize_member_name,
    normalize_new_story,
    normalize_project_name,
    require_comment_body,
    validate_password,
)

log = logging.getLogger("workspace")


class WorkspaceService:
    def __init__(self, dao: WorkspaceDAO):
        self.dao = dao

    def user_from_header(self, authorization: str | None) -> dict:
        if authorization is None or not authorization.startswith("Bearer "):
            raise AppError(401, SIGN_IN_REQUIRED)
        raw = authorization.removeprefix("Bearer ").strip()
        if not raw:
            raise AppError(401, SIGN_IN_REQUIRED)
        user = self.dao.user_for_token(hash_token(raw))
        if user is None:
            raise AppError(401, SIGN_IN_REQUIRED)
        return user

    def register(self, email: str, password: str) -> dict:
        cleaned = normalize_email(email)
        validate_password(password)
        return self.dao.register(cleaned, password)

    def login(self, email: str, password: str) -> dict:
        return self.dao.login(canonical_email(email), password)

    def logout(self, authorization: str | None) -> None:
        raw = (authorization or "").removeprefix("Bearer ").strip()
        self.dao.logout(hash_token(raw))

    def create_project(self, name: str, description: str | None) -> dict:
        return self.dao.create_project(normalize_project_name(name), description)

    def list_projects(self) -> list[dict]:
        return self.dao.list_projects()

    def get_project(self, project_id: str) -> dict:
        return self.dao.get_project(project_id)

    def list_stories(
        self,
        project_id: str,
        status: str | None,
        sprint_id: str | None,
        sort: str | None,
        hide_resolved: bool,
    ) -> list[dict]:
        return self.dao.list_stories(project_id, status, sprint_id, sort, hide_resolved)

    def create_story(
        self,
        project_id: str,
        title: str,
        description: str | None,
        priority: str,
        type_: str,
    ) -> dict:
        cleaned = normalize_new_story(title, priority, type_)
        return self.dao.create_story(project_id, cleaned, description, priority, type_)

    def patch_story(self, story_id: str, changes: dict) -> dict:
        return self.dao.patch_story(story_id, changes)

    def create_sprint(self, project_id: str, goal: str | None) -> dict:
        return self.dao.create_sprint(project_id, blank_to_none(goal))

    def list_sprints(self, project_id: str) -> list[dict]:
        return self.dao.list_sprints(project_id)

    def get_sprint(self, sprint_id: str) -> dict:
        return self.dao.get_sprint(sprint_id)

    def activate_sprint(self, sprint_id: str) -> dict:
        return self.dao.activate_sprint(sprint_id)

    def close_sprint(self, sprint_id: str, faculty_notes) -> dict:
        notes = None if faculty_notes is None else normalize_faculty_notes(faculty_notes)
        return self.dao.close_sprint(sprint_id, notes)

    def draft_report(self, snapshot: dict, drafter, failure: str) -> dict:
        if drafter is None:
            raise AppError(503, DRAFTER_MISSING)
        try:
            raw = drafter(snapshot)
        except AppError:
            raise
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            detail = getattr(exc, "detail", None)
            if isinstance(status, int) and isinstance(detail, str):
                raise AppError(status, detail) from None
            log.warning("%s", failure)
            raise AppError(502, DRAFT_FAILED) from None
        return coerce_draft(raw, snapshot)

    def draft_sprint_report(self, sprint_id: str, drafter) -> dict:
        snapshot = self.dao.report_snapshot(sprint_id)
        content = self.draft_report(snapshot, drafter, "sprint report draft failed")
        generated_at = now()
        self.dao.save_draft(sprint_id, content, generated_at)
        return {"draft_content": content, "generated_at": generated_at}

    def draft_project_report(self, project_id: str, faculty_notes, drafter) -> dict:
        notes = None if faculty_notes is None else normalize_faculty_notes(faculty_notes)
        snapshot = self.dao.project_report_snapshot(project_id, notes)
        content = self.draft_report(snapshot, drafter, "project report draft failed")
        return self.dao.save_project_draft(project_id, content, now(), snapshot["stories"])

    def save_sprint_report(self, sprint_id: str, payload, reviewed_by: str | None) -> dict:
        return self.dao.save_final(sprint_id, final_content(payload), reviewed_by)

    def save_project_report(
        self, project_id: str, report_id: str, payload, reviewed_by: str | None
    ) -> dict:
        return self.dao.save_project_final(
            project_id, report_id, final_content(payload), reviewed_by
        )

    def get_sprint_report(self, sprint_id: str) -> dict:
        return self.dao.get_report(sprint_id)

    def list_project_reports(self, project_id: str) -> list[dict]:
        return self.dao.list_project_reports(project_id)

    def get_project_report(self, project_id: str, report_id: str) -> dict:
        return self.dao.get_project_report(project_id, report_id)

    def add_member(self, project_id: str, name: str) -> dict:
        return self.dao.add_member(project_id, normalize_member_name(name))

    def list_members(self, project_id: str) -> list[dict]:
        return self.dao.list_members(project_id)

    def add_comment(self, parent_type: str, parent_id: str, author_id: str, body: str) -> dict:
        return self.dao.add_comment(parent_type, parent_id, author_id, require_comment_body(body))

    def list_comments(self, parent_type: str, parent_id: str) -> list[dict]:
        return self.dao.list_comments(parent_type, parent_id)
