"""Pass/fail fixtures for one sprint-report draft.

These tests call a fake model. They do not open a network connection.
"""

from sprint_report import SprintReportError, build_model_payload, draft_report
from sprint_report.draft import (
    NO_BLOCKERS,
    NO_COMPLETED,
    NO_FACULTY_NOTES,
    NO_SPRINT_GOAL,
    NO_UNFINISHED,
)


class FakeModel:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def __call__(self, system_prompt, payload):
        self.calls.append({"system_prompt": system_prompt, "payload": payload})
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


def story(**overrides):
    base = {
        "id": "story-1",
        "title": "Publish board",
        "description": None,
        "priority": "High",
        "type": "Feature",
        "status_at_close": "Done",
    }
    base.update(overrides)
    return base


def snapshot(**overrides):
    base = {
        "status": "Closed",
        "sprint_goal": "Ship the board",
        "stories": [story()],
    }
    base.update(overrides)
    return base


def test_not_closed_does_not_call_the_model():
    model = FakeModel({"completed_work": "Publish board"})
    for status in ("Planned", "Active"):
        try:
            draft_report(snapshot(status=status), model=model)
        except SprintReportError as exc:
            assert exc.status_code == 409
            assert exc.detail == "Sprint is not closed"
        else:
            raise AssertionError(status)
    assert model.calls == []


def test_no_stories_does_not_call_the_model():
    model = FakeModel({})
    try:
        draft_report(snapshot(stories=[]), model=model)
    except SprintReportError as exc:
        assert exc.status_code == 422
        assert exc.detail == "This sprint had no stories, so there's nothing to report"
    else:
        raise AssertionError("expected 422")
    assert model.calls == []


def test_none_completed_states_that_plainly():
    model = FakeModel(
        {
            "completed_work": "We finished Publish board early.",
            "next_sprint_goals": "Invent a mobile app",
            "blockers": "The vendor disappeared",
            "faculty_notes": "Faculty loved it",
        }
    )
    stories = [
        story(id="a", title="Publish board", status_at_close="In Progress"),
        story(id="b", title="Close sprint", status_at_close="In Progress"),
        story(id="c", title="Comment thread", status_at_close="In Progress"),
    ]
    report = draft_report(
        snapshot(stories=stories, sprint_goal=None), model=model
    )
    assert report["completed_work"] == NO_COMPLETED
    assert "Publish board" not in report["completed_work"]
    assert report["blockers"] == NO_BLOCKERS
    assert report["faculty_notes"] == NO_FACULTY_NOTES
    assert "mobile app" not in report["next_sprint_goals"]
    assert report["sprint_goal"] == NO_SPRINT_GOAL


def test_mixed_close_names_only_done_stories():
    done_one = story(
        id="a",
        title="Publish board",
        description="Board is visible.",
        status_at_close="Done",
    )
    done_two = story(
        id="b",
        title="Close sprint",
        description="Sprint can close.",
        priority="Medium",
        status_at_close="Done",
    )
    unfinished = story(
        id="c",
        title="Comment thread",
        description="Comments are still open.",
        status_at_close="In Progress",
    )
    model = FakeModel(
        {
            "completed_work": "Publish board\nBoard is visible.\n\nClose sprint\nSprint can close.",
            "next_sprint_goals": "Comment thread",
            "blockers": NO_BLOCKERS,
        }
    )
    report = draft_report(
        snapshot(stories=[done_one, done_two, unfinished]), model=model
    )
    assert "Publish board" in report["completed_work"]
    assert "Close sprint" in report["completed_work"]
    assert "Comment thread" not in report["completed_work"]
    assert report["next_sprint_goals"].strip() == "Comment thread"


def test_missing_description_does_not_invent_one():
    model = FakeModel(
        {"completed_work": "Publish board\nIt now supports campus-wide SSO."}
    )
    report = draft_report(
        snapshot(stories=[story(description=None)]), model=model
    )
    assert "Publish board" in report["completed_work"]
    assert "SSO" not in report["completed_work"]
    assert report["completed_work"] == "- Publish board — Feature — High"


def test_no_blocker_text_uses_the_fixed_sentence():
    model = FakeModel({"blockers": "The build server was down"})
    report = draft_report(
        snapshot(
            stories=[
                story(description="Show stories on the board.", status_at_close="Done")
            ]
        ),
        model=model,
    )
    assert report["blockers"] == NO_BLOCKERS


def test_blocker_quote_is_verbatim_and_alone():
    sentence = "Waiting on the course API token."
    model = FakeModel({"blockers": sentence})
    report = draft_report(
        snapshot(stories=[story(description=sentence)]), model=model
    )
    assert report["blockers"] == sentence


def test_faculty_notes_missing_or_empty_use_the_fixed_sentence():
    model = FakeModel({"faculty_notes": "Professor said to ship it"})
    missing = draft_report(snapshot(), model=model)
    empty = draft_report(snapshot(faculty_notes=""), model=model)
    blank = draft_report(snapshot(faculty_notes="   "), model=model)
    assert missing["faculty_notes"] == NO_FACULTY_NOTES
    assert empty["faculty_notes"] == NO_FACULTY_NOTES
    assert blank["faculty_notes"] == NO_FACULTY_NOTES
    assert "Professor said to ship it" not in missing["faculty_notes"]


def test_faculty_notes_are_copied_verbatim():
    note = "Ask faculty whether the close snapshot is enough."
    model = FakeModel({"faculty_notes": "Rewritten: the faculty were thrilled."})
    report = draft_report(snapshot(faculty_notes=note), model=model)
    assert report["faculty_notes"] == note
    assert model.calls[0]["payload"].get("faculty_notes") is None
    assert note not in str(model.calls[0]["payload"])


def test_wrong_sprint_is_not_in_the_payload_or_the_draft():
    foreign = "Zebra migration from sprint B"
    source = snapshot(
        stories=[story(title="Publish board", description="Board is visible.")],
        other_sprint={"stories": [{"title": foreign}]},
    )
    payload = build_model_payload(source)
    assert foreign not in str(payload)
    model = FakeModel(lambda_result := {"completed_work": foreign, "blockers": foreign})
    report = draft_report(source, model=model)
    assert foreign not in str(model.calls[0]["payload"])
    assert foreign not in " ".join(report.values())
    assert lambda_result["completed_work"] == foreign


def test_invented_work_is_replaced_with_the_done_list():
    model = FakeModel({"completed_work": "Shipped the quantum cache"})
    report = draft_report(
        snapshot(
            stories=[
                story(
                    title="Publish board",
                    description="Board is visible.",
                    status_at_close="Done",
                )
            ]
        ),
        model=model,
    )
    assert "quantum cache" not in report["completed_work"]
    assert "Publish board" in report["completed_work"]
    assert "Board is visible." in report["completed_work"]


def test_missing_done_story_is_restored():
    model = FakeModel(
        {"completed_work": "Publish board\nBoard is visible."}
    )
    report = draft_report(
        snapshot(
            stories=[
                story(id="a", title="Publish board", description="Board is visible."),
                story(
                    id="b",
                    title="Close sprint",
                    description="Sprint can close.",
                    priority="Medium",
                ),
            ]
        ),
        model=model,
    )
    assert "Publish board" in report["completed_work"]
    assert "Close sprint" in report["completed_work"]


def test_empty_goal_uses_the_fixed_sentence():
    model = FakeModel({"sprint_goal": "We decided to redesign navigation."})
    report = draft_report(snapshot(sprint_goal=None), model=model)
    assert report["sprint_goal"] == NO_SPRINT_GOAL


def test_goal_is_copied_verbatim():
    model = FakeModel({"sprint_goal": "A different goal"})
    report = draft_report(snapshot(sprint_goal="Ship the board"), model=model)
    assert report["sprint_goal"] == "Ship the board"


def test_all_done_has_no_invented_next_goals():
    model = FakeModel({"next_sprint_goals": "Start a mobile client"})
    report = draft_report(snapshot(), model=model)
    assert report["next_sprint_goals"] == NO_UNFINISHED


def test_model_failure_does_not_return_a_draft():
    model = FakeModel(RuntimeError("timeout"))
    try:
        draft_report(snapshot(), model=model)
    except SprintReportError as exc:
        assert exc.status_code == 503
        assert exc.detail == "Sprint report draft failed; try again."
    else:
        raise AssertionError("expected 503")


def test_unconfigured_course_client_does_not_use_the_network(monkeypatch):
    monkeypatch.delenv("LITELLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    def fail_if_called(*args, **kwargs):
        raise AssertionError("network call")

    monkeypatch.setattr("urllib.request.urlopen", fail_if_called)
    try:
        draft_report(snapshot())
    except SprintReportError as exc:
        assert exc.status_code == 503
        assert exc.detail == "Course AI client is not configured"
    else:
        raise AssertionError("expected unconfigured client")
