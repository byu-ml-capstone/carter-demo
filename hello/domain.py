"""Domain constants and mention matching. No SQL."""

STATUSES = ("Backlog", "Selected for Sprint", "In Progress", "Done")
PRIORITIES = ("Low", "Medium", "High")
TYPES = ("Feature", "Bug", "Chore")
SPRINT_STATUSES = ("Planned", "Active", "Closed")
REPORT_KEYS = (
    "sprint_goal",
    "completed_work",
    "next_sprint_goals",
    "blockers",
    "faculty_notes",
)

NO_ACTIVE = "No active sprint — create or activate one before adding stories."
ALREADY_MOVED = "This story was already moved."
NOTHING_COMPLETED = "No stories were completed this sprint"
NO_FACULTY_NOTES = "No faculty notes recorded"
EMPTY_SPRINT_REPORT = "This sprint had no stories, so there's nothing to report"
SIGN_IN_REQUIRED = "Sign in required."
BAD_LOGIN = "Email or password is wrong."


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


def faculty_notes_for_report(stored: str | None) -> str:
    if stored is not None and stored.strip():
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
