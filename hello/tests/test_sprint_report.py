"""Pass/fail fixtures for one sprint-report draft.

These tests call a fake model. They do not open a network connection.
"""

import builtins
import json
import sys
from types import SimpleNamespace

import pytest

from sprint_report import SprintReportError, build_model_payload, draft_report
from sprint_report.course_ai import CourseAINotConfigured, complete_report
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
    report = draft_report(snapshot(stories=stories, sprint_goal=None), model=model)
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
    report = draft_report(snapshot(stories=[done_one, done_two, unfinished]), model=model)
    assert "Publish board" in report["completed_work"]
    assert "Close sprint" in report["completed_work"]
    assert "Comment thread" not in report["completed_work"]
    assert report["next_sprint_goals"].strip() == "Comment thread"


def test_missing_description_does_not_invent_one():
    model = FakeModel({"completed_work": "Publish board\nIt now supports campus-wide SSO."})
    report = draft_report(snapshot(stories=[story(description=None)]), model=model)
    assert "Publish board" in report["completed_work"]
    assert "SSO" not in report["completed_work"]
    assert report["completed_work"] == "- Publish board — Feature — High"


def test_no_blocker_text_uses_the_fixed_sentence():
    model = FakeModel({"blockers": "The build server was down"})
    report = draft_report(
        snapshot(stories=[story(description="Show stories on the board.", status_at_close="Done")]),
        model=model,
    )
    assert report["blockers"] == NO_BLOCKERS


def test_blocker_quote_is_verbatim_and_alone():
    sentence = "Waiting on the course API token."
    model = FakeModel({"blockers": sentence})
    report = draft_report(snapshot(stories=[story(description=sentence)]), model=model)
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
    model = FakeModel({"completed_work": "Publish board\nBoard is visible."})
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


def test_sprint_report_error_from_the_model_is_not_wrapped():
    def raiser(_prompt, _payload):
        raise SprintReportError(409, "Sprint is not closed")

    with pytest.raises(SprintReportError) as caught:
        draft_report(snapshot(), model=raiser)
    assert caught.value.status_code == 409
    assert caught.value.detail == "Sprint is not closed"


def test_parser_accepts_text_fences_and_rejects_garbage():
    source = snapshot(stories=[story(description="Board is visible.")])
    fenced = (
        "```json\n" + json.dumps({"completed_work": "Publish board\nBoard is visible."}) + "\n```"
    )
    wrapped = draft_report(source, model=FakeModel({"text": fenced}))
    assert "Publish board" in wrapped["completed_work"]
    for raw in (5, "```\nnot-json\n```", "[1]", "not json at all"):
        report = draft_report(source, model=FakeModel(raw))
        assert "Publish board" in report["completed_work"]


def test_repair_rejects_empty_foreign_and_bullet_text():
    done = story(
        id="a",
        title="Publish board",
        description="Board is visible.",
        status_at_close="Done",
    )
    left = story(
        id="b",
        title="Comment thread",
        description="Waiting on the course API token.",
        status_at_close="In Progress",
    )
    source = snapshot(stories=[done, left])
    empty_next = draft_report(
        source,
        model=FakeModel(
            {
                "completed_work": "Publish board\nBoard is visible.",
                "next_sprint_goals": "   ",
                "blockers": None,
            }
        ),
    )
    assert "Comment thread" in empty_next["next_sprint_goals"]

    stolen = draft_report(
        source,
        model=FakeModel(
            {
                "completed_work": "Publish board and Comment thread\nBoard is visible.",
                "next_sprint_goals": "Publish board",
            }
        ),
    )
    assert "Comment thread" not in stolen["completed_work"]
    assert stolen["next_sprint_goals"] == "- Comment thread"

    invented = draft_report(
        source,
        model=FakeModel({"next_sprint_goals": "- Comment thread\n- A brand new app"}),
    )
    assert "brand new" not in invented["next_sprint_goals"]

    quoted = draft_report(
        source,
        model=FakeModel(
            {
                "next_sprint_goals": "- Comment thread",
                "blockers": "\n- Waiting on the course API token.\n\n",
                "completed_work": None,
            }
        ),
    )
    assert quoted["next_sprint_goals"] == "- Comment thread"
    assert "Waiting on the course API token." in quoted["blockers"]


def test_blank_goal_and_description_are_omitted_from_the_model():
    payload = build_model_payload(
        snapshot(sprint_goal="   ", stories=[story(description="   ", title="")])
    )
    assert payload["sprint_goal"] is None
    assert payload["stories"][0]["description"] is None
    assert payload["stories"][0]["title"] == ""
    report = draft_report(
        snapshot(sprint_goal="   ", stories=[story(description="   ")]),
        model=FakeModel({}),
    )
    assert report["sprint_goal"] == NO_SPRINT_GOAL


def test_complete_report_calls_the_configured_client_without_the_network(monkeypatch):
    calls = []

    class Responses:
        def __init__(self, text):
            self.text = text

        def create(self, **kwargs):
            calls.append(kwargs)
            if self.text is None:
                return SimpleNamespace()
            return SimpleNamespace(output_text=self.text)

    class Client:
        def __init__(self, **kwargs):
            calls.append(kwargs)
            text = None if kwargs.get("api_key") == "missing-text" else "hello"
            self.responses = Responses(text)

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=Client))
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.delenv("LITELLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    assert complete_report("sys", {"a": 1}) == {"text": "hello"}
    assert calls[0]["api_key"] == "sk-test"
    assert "base_url" not in calls[0]
    assert calls[1]["model"] == "gpt-5.6-luna"

    calls.clear()
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("LITELLM_API_KEY", "litellm-test")
    monkeypatch.delenv("LITELLM_URL", raising=False)
    monkeypatch.delenv("LITELLM_BASE_URL", raising=False)
    monkeypatch.delenv("LITELLM_MODEL", raising=False)
    monkeypatch.delenv("MODEL", raising=False)
    assert complete_report("sys", {"a": 1})["text"] == "hello"
    assert calls[0]["base_url"] == "http://ml-capstone.cs.byu.edu:4000/v1"
    assert calls[1]["model"] == "classroom-chat"

    calls.clear()
    monkeypatch.setenv("LITELLM_API_KEY", "missing-text")
    monkeypatch.setenv("LITELLM_URL", "http://llm.example/v1")
    monkeypatch.setenv("LITELLM_MODEL", "classroom-chat")
    assert complete_report("sys", {"a": 1}) == {"text": ""}


def test_complete_report_without_the_openai_package(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("LITELLM_API_KEY", raising=False)
    real_import = builtins.__import__

    def blocked(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "openai":
            raise ImportError("no openai")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", blocked)
    with pytest.raises(CourseAINotConfigured):
        complete_report("system", {"stories": []})
