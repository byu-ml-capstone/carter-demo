"""Draft one sprint report from one closed-sprint snapshot.

The model may phrase completed work and quote blocker text. Fixed fields
are overwritten from the snapshot so the model cannot invent a goal,
faculty note, or completed story.
"""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Callable

from sprint_report.course_ai import CourseAINotConfigured, complete_report

NO_SPRINT_GOAL = "No sprint goal was recorded."
NO_COMPLETED = "No stories were completed this sprint"
NO_BLOCKERS = "No blockers were recorded for this sprint"
NO_FACULTY_NOTES = "No faculty notes recorded"
NO_UNFINISHED = "No unfinished stories to carry forward."

REPORT_FIELDS = (
    "sprint_goal",
    "completed_work",
    "next_sprint_goals",
    "blockers",
    "faculty_notes",
)

STORY_FIELDS = ("id", "title", "description", "priority", "type", "status_at_close")

Model = Callable[[str, dict], object]


class SprintReportError(Exception):
    def __init__(self, status_code: int, detail: str):
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


def draft_report(snapshot: dict, model: Model | None = None) -> dict:
    """Return the five report fields for one snapshot.

    `model` is the course AI abstraction: `(system_prompt, payload) -> text
    or dict`. Tests pass a fake. When `model` is omitted, the course client
    is used, and it does not open a connection unless a course API key is set.
    """
    status = snapshot.get("status")
    if status != "Closed":
        raise SprintReportError(409, "Sprint is not closed")

    stories = list(snapshot.get("stories") or [])
    if len(stories) == 0:
        raise SprintReportError(
            422, "This sprint had no stories, so there's nothing to report"
        )

    payload = build_model_payload(snapshot)
    caller = model if model is not None else complete_report
    try:
        raw = caller(_system_prompt(), payload)
    except CourseAINotConfigured as exc:
        raise SprintReportError(503, "Course AI client is not configured") from exc
    except SprintReportError:
        raise
    except Exception as exc:
        raise SprintReportError(
            503, "Sprint report draft failed; try again."
        ) from exc

    drafted = _parse_model_output(raw)
    return _repair(snapshot, stories, drafted)


def build_model_payload(snapshot: dict) -> dict:
    """JSON the model is allowed to see. Faculty notes and other sprints are omitted."""
    stories = []
    for story in snapshot.get("stories") or []:
        description = story.get("description")
        if not isinstance(description, str) or not description.strip():
            description = None
        stories.append(
            {
                "id": story.get("id"),
                "title": story.get("title") or "",
                "description": description,
                "priority": story.get("priority"),
                "type": story.get("type"),
                "status_at_close": story.get("status_at_close"),
            }
        )
    return {"sprint_goal": _goal_text(snapshot), "stories": stories}


def _goal_text(snapshot: dict) -> str | None:
    goal = snapshot.get("sprint_goal")
    if isinstance(goal, str) and goal.strip():
        return goal
    return None


def _faculty_notes_text(snapshot: dict) -> str:
    notes = snapshot.get("faculty_notes")
    if isinstance(notes, str) and notes.strip():
        return notes
    return NO_FACULTY_NOTES


def _system_prompt() -> str:
    return (
        "You draft a sprint report from the JSON user message only. "
        "Do not add stories, people, dates, counts, or causes that are not in it. "
        "Do not print story ids. "
        "Return one JSON object with exactly these keys: "
        "sprint_goal, completed_work, next_sprint_goals, blockers, faculty_notes. "
        "sprint_goal must repeat the snapshot goal verbatim, or be empty when there is none. "
        "completed_work names every story whose status_at_close is Done, by title. "
        "Quote a description only when that story has one. "
        "Do not mention stories that are not Done in completed_work. "
        "next_sprint_goals may name only stories in this payload that are not Done, by title. "
        "Do not propose other work. "
        "blockers is either a verbatim excerpt of a story description or empty. "
        "Do not paraphrase. "
        "Leave faculty_notes empty. The server sets that field from the snapshot."
    )


def _parse_model_output(raw: object) -> dict:
    if isinstance(raw, dict) and "text" in raw and not any(
        key in raw for key in REPORT_FIELDS
    ):
        raw = raw.get("text")
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return {}
    text = raw.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _repair(snapshot: dict, stories: list, drafted: dict) -> dict:
    done = [story for story in stories if story.get("status_at_close") == "Done"]
    not_done = [story for story in stories if story.get("status_at_close") != "Done"]

    report = {
        "sprint_goal": _sprint_goal_field(snapshot),
        "completed_work": _completed_work_field(done, not_done, drafted),
        "next_sprint_goals": _next_goals_field(done, not_done, drafted),
        "blockers": _blockers_field(stories, drafted),
        "faculty_notes": _faculty_notes_text(snapshot),
    }
    return {key: report[key] for key in REPORT_FIELDS}


def _sprint_goal_field(snapshot: dict) -> str:
    goal = _goal_text(snapshot)
    if goal is None:
        return NO_SPRINT_GOAL
    return goal


def _completed_work_field(done: list, not_done: list, drafted: dict) -> str:
    if not done:
        return NO_COMPLETED
    model_text = _field_text(drafted, "completed_work")
    if _completed_work_ok(done, not_done, model_text) and _descriptions_are_quoted(
        done, model_text
    ):
        return model_text
    return _deterministic_completed(done)


def _completed_work_ok(done: list, not_done: list, text: str) -> bool:
    if not text.strip():
        return False
    counts = Counter((story.get("title") or "") for story in done)
    for title, needed in counts.items():
        if title and text.count(title) < needed:
            return False
    for story in not_done:
        title = story.get("title") or ""
        if title and title in text:
            return False
    return True


def _descriptions_are_quoted(done: list, text: str) -> bool:
    """A story with no description cannot pick up an invented sentence."""
    if any(not _description(story) for story in done):
        return text.strip() == _deterministic_completed(done).strip()
    return True


def _deterministic_completed(done: list) -> str:
    blocks = []
    for story in done:
        line = (
            f"- {story.get('title') or ''} — {story.get('type') or ''} — "
            f"{story.get('priority') or ''}"
        )
        description = _description(story)
        if description:
            blocks.append(f"{line}\n{description}")
        else:
            blocks.append(line)
    return "\n".join(blocks)


def _next_goals_field(done: list, not_done: list, drafted: dict) -> str:
    if not not_done:
        return NO_UNFINISHED
    model_text = _field_text(drafted, "next_sprint_goals")
    if _next_goals_ok(done, not_done, model_text):
        return model_text
    return "\n".join(f"- {story.get('title') or ''}" for story in not_done)


def _next_goals_ok(done: list, not_done: list, text: str) -> bool:
    if not text.strip():
        return False
    for story in done:
        title = story.get("title") or ""
        if title and title in text:
            return False
    allowed = {(story.get("title") or "") for story in not_done}
    for line in text.splitlines():
        item = line.strip()
        if item.startswith("- "):
            item = item[2:].strip()
        if item and item not in allowed:
            return False
    return True


def _blockers_field(stories: list, drafted: dict) -> str:
    model_text = _field_text(drafted, "blockers")
    if model_text == NO_BLOCKERS:
        return NO_BLOCKERS
    descriptions = [_description(story) for story in stories]
    descriptions = [item for item in descriptions if item]
    if not model_text.strip() or not descriptions:
        return NO_BLOCKERS
    for line in model_text.splitlines():
        excerpt = line.strip()
        if excerpt.startswith("- "):
            excerpt = excerpt[2:].strip()
        if not excerpt:
            continue
        if not any(excerpt in description for description in descriptions):
            return NO_BLOCKERS
    return model_text


def _description(story: dict) -> str | None:
    description = story.get("description")
    if isinstance(description, str) and description.strip():
        return description
    return None


def _field_text(drafted: dict, key: str) -> str:
    value = drafted.get(key, "")
    if value is None:
        return ""
    return value if isinstance(value, str) else ""
