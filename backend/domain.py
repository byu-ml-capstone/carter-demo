"""Domain rules. No SQL and no HTTP."""

import json
from pathlib import Path

_VOCAB = json.loads(
    (Path(__file__).resolve().parents[1] / "frontend" / "src" / "vocabulary.json").read_text()
)

STATUSES = tuple(_VOCAB["statuses"])
PRIORITIES = tuple(_VOCAB["priorities"])
TYPES = tuple(_VOCAB["storyTypes"])
SPRINT_STATUSES = tuple(_VOCAB["sprintStatuses"])
INITIAL_STORY_STATUS = STATUSES[0]
PRIORITY_RANK = tuple((name, rank) for name, rank in _VOCAB["priorityRank"])
REPORT_KEYS = tuple(_VOCAB["reportKeys"])

ALREADY_MOVED = _VOCAB["alreadyMoved"]
NOTHING_COMPLETED = _VOCAB["nothingCompleted"]
NO_FACULTY_NOTES = _VOCAB["noFacultyNotes"]
NO_BLOCKERS = _VOCAB["noBlockers"]
SIGN_IN_REQUIRED = _VOCAB["signInRequired"]
CREDENTIALS_WRONG = _VOCAB["credentialsWrong"]
EMAIL_TAKEN = _VOCAB["emailTaken"]
EMAIL_INVALID = _VOCAB["emailInvalid"]
PROJECT_NAME_TAKEN = _VOCAB["projectNameTaken"]
SPRINT_ALREADY_OPEN = _VOCAB["sprintAlreadyOpen"]
MEMBER_NAME_TAKEN = _VOCAB["memberNameTaken"]
EMPTY_SPRINT = _VOCAB["emptySprint"]
EMPTY_PROJECT = _VOCAB["emptyProject"]
SPRINT_NOT_CLOSED = "Sprint is not closed."
SPRINT_NOT_PLANNED = "Sprint is not planned."
SPRINT_NOT_ACTIVE = "Sprint is not active."
ANOTHER_SPRINT_ACTIVE = "Another sprint is already active."
DRAFT_FAILED = "Sprint report draft failed."
DRAFTER_MISSING = "Sprint report drafter is not configured."
PASSWORD_INVALID = "password must be at least 8 characters"
PROJECT_NAME_INVALID = "name is required and must be 1–100 characters"
MEMBER_NAME_REQUIRED = "name is required"
TITLE_REQUIRED = "title is required"
COMMENT_BODY_REQUIRED = "Comment body is required."
SORT_INVALID = "sort must be priority or created_at"
STATUS_INVALID = "invalid status"
PRIORITY_INVALID = "invalid priority"
TYPE_INVALID = "invalid type"
FINAL_CONTENT_OBJECT = "final_content must be an object"
FINAL_CONTENT_MISSING = "final_content is missing required fields"
FINAL_CONTENT_EMPTY = "final_content is empty"


class AppError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _name_char(ch: str) -> bool:
    return ch.isalnum() or ch == " "


def mention_ids(body: str, members: list[dict]) -> list[str]:
    """Longest case-insensitive member name after each @, with a boundary."""
    ranked = sorted(members, key=lambda member: len(member["name"]), reverse=True)
    found: list[str] = []
    seen: set[str] = set()
    index = 0
    while True:
        at = body.find("@", index)
        if at < 0:
            break
        rest = body[at + 1 :]
        matched = None
        for member in ranked:
            name = member["name"]
            if rest[: len(name)].casefold() != name.casefold():
                continue
            end = at + 1 + len(name)
            if end == len(body) or not _name_char(body[end]):
                matched = member
                break
        if matched is None:
            index = at + 1
            continue
        if matched["id"] not in seen:
            seen.add(matched["id"])
            found.append(matched["id"])
        index = at + 1 + len(matched["name"])
    return found


def faculty_notes_for_report(stored) -> str:
    if isinstance(stored, str) and stored.strip():
        return stored
    return NO_FACULTY_NOTES


def normalize_faculty_notes(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise AppError(400, "faculty_notes must be a string")
    if value.strip() == "":
        return None
    return value


def canonical_email(email: str) -> str:
    return email.strip().lower()


def normalize_email(email: str) -> str:
    cleaned = canonical_email(email)
    if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
        raise AppError(400, EMAIL_INVALID)
    return cleaned


def validate_password(password: str) -> None:
    if len(password) < 8:
        raise AppError(400, PASSWORD_INVALID)


def normalize_project_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned or len(cleaned) > 100:
        raise AppError(400, PROJECT_NAME_INVALID)
    return cleaned


def normalize_member_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise AppError(400, MEMBER_NAME_REQUIRED)
    return cleaned


def require_comment_body(body) -> str:
    if not isinstance(body, str) or body.strip() == "":
        raise AppError(400, COMMENT_BODY_REQUIRED)
    return body


def blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    if value.strip() == "":
        return None
    return value


def _require_choice(value, allowed: tuple, message: str) -> None:
    if value not in allowed:
        raise AppError(400, message)


def normalize_new_story(title: str, priority: str, type_: str) -> str:
    cleaned = title.strip()
    if not cleaned:
        raise AppError(400, TITLE_REQUIRED)
    _require_choice(priority, PRIORITIES, PRIORITY_INVALID)
    _require_choice(type_, TYPES, TYPE_INVALID)
    return cleaned


def story_list_order(sort: str | None, status: str | None) -> str:
    if sort not in (None, "priority", "created_at"):
        raise AppError(400, SORT_INVALID)
    if status is not None and status not in STATUSES:
        raise AppError(400, STATUS_INVALID)
    if sort == "created_at":
        return "us.created_at DESC, us.id ASC"
    if sort == "priority":
        whens = " ".join(f"WHEN '{name}' THEN {rank}" for name, rank in PRIORITY_RANK)
        fallback = PRIORITY_RANK[-1][1]
        return f"CASE us.priority {whens} ELSE {fallback} END, us.created_at ASC, us.id ASC"
    return "us.created_at ASC, us.id ASC"


def sprint_membership(old: str, new: str) -> str:
    """How an open sprint link changes when a story's status changes.

    A status change does not require an Active sprint. ``link`` attaches the
    story only when one exists. ``same`` and ``keep`` do not touch links.
    """
    if new == old:
        return "same"
    if old == "Backlog" and new != "Backlog":
        return "link"
    if new == "Backlog":
        return "unlink"
    return "keep"


def story_fields(story, changes: dict) -> dict:
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
            raise AppError(400, TITLE_REQUIRED)
        title = changes["title"].strip()
    if "description" in changes:
        description = changes["description"]
        if description is not None and not isinstance(description, str):
            raise AppError(400, "description must be a string")
    if "priority" in changes:
        _require_choice(changes["priority"], PRIORITIES, PRIORITY_INVALID)
        priority = changes["priority"]
    if "type" in changes:
        _require_choice(changes["type"], TYPES, TYPE_INVALID)
        type_ = changes["type"]
    if "github_branch_ref" in changes:
        branch = changes["github_branch_ref"]
        if branch is not None and not isinstance(branch, str):
            raise AppError(400, "github_branch_ref must be a string")
    if "status" in changes:
        _require_choice(changes["status"], STATUSES, STATUS_INVALID)
        status = changes["status"]
    return {
        "title": title,
        "description": description,
        "priority": priority,
        "type": type_,
        "github_branch_ref": branch,
        "status": status,
        "action": sprint_membership(story["status"], status),
    }


def any_story_completed(stories: list) -> bool:
    return any(story.get("status_at_close") == "Done" for story in stories)


def report_context(
    *,
    goal,
    faculty_notes,
    stories: list,
    sprint_id: str | None = None,
    project_id: str | None = None,
    status: str | None = None,
) -> dict:
    """Fields the drafter reads. Sprint drafts include status; board drafts do not."""
    body = {
        "goal": goal,
        "sprint_goal": goal,
        "faculty_notes": faculty_notes,
        "story_count": len(stories),
        "any_completed": any_story_completed(stories),
        "stories": stories,
    }
    if project_id is not None:
        body["project_id"] = project_id
    if sprint_id is not None:
        body["sprint_id"] = sprint_id
        body["status"] = status
    return body


def require_sprint_status(actual: str, expected: str, message: str) -> None:
    if actual != expected:
        raise AppError(409, message)


def require_report_stories(stories: list, message: str) -> None:
    if not stories:
        raise AppError(422, message)


def apply_snapshot_facts(content: dict, snapshot: dict) -> dict:
    updated = dict(content)
    if not snapshot.get("any_completed"):
        updated["completed_work"] = NOTHING_COMPLETED
    updated["faculty_notes"] = faculty_notes_for_report(snapshot.get("faculty_notes"))
    return updated


def coerce_draft(raw, snapshot: dict) -> dict:
    if not isinstance(raw, dict):
        raise AppError(502, DRAFT_FAILED)
    content = {}
    for key in REPORT_KEYS:
        if key == "faculty_notes":
            continue
        value = raw.get(key)
        if not isinstance(value, str):
            raise AppError(502, DRAFT_FAILED)
        content[key] = value
    return apply_snapshot_facts(content, snapshot)


def final_content(payload) -> dict:
    if not isinstance(payload, dict):
        raise AppError(400, FINAL_CONTENT_OBJECT)
    missing = [key for key in REPORT_KEYS if key not in payload]
    if missing:
        raise AppError(400, FINAL_CONTENT_MISSING)
    content = {}
    for key in REPORT_KEYS:
        if not isinstance(payload[key], str):
            raise AppError(400, f"{key} must be a string")
        content[key] = payload[key]
    if all(not value.strip() for value in content.values()):
        raise AppError(400, FINAL_CONTENT_EMPTY)
    return content
