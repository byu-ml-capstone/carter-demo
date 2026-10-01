import builtins
import importlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

import main
from auth import verify_password
from dao import WorkspaceDAO
from db import Database, sqlite_path
from domain import (
    NO_FACULTY_NOTES,
    NOTHING_COMPLETED,
    AppError,
    mention_ids,
    normalize_faculty_notes,
)

STORY = {"title": "Write the API", "description": "routes", "priority": "High", "type": "Feature"}
REPORT = {
    "sprint_goal": "Ship it",
    "completed_work": "Done the board",
    "next_sprint_goals": "Auth",
    "blockers": "None",
    "faculty_notes": "Edited by a person",
}


@pytest.fixture
def client(tmp_path):
    database = WorkspaceDAO(f"sqlite:///{tmp_path / 'workspace.db'}")
    database.apply_migrations()
    main.dao = database
    main.report_drafter = None
    with TestClient(main.app) as test_client:
        yield test_client


def auth(client, email="ada@example.com", password="password1"):
    response = client.post("/auth/register", json={"email": email, "password": password})
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def test_cors_allows_the_workspace_ui(client):
    response = client.options(
        "/projects",
        headers={
            "Origin": "http://localhost:43123",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:43123"
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "authorization" in allowed
    assert "content-type" in allowed


def test_health_and_version_are_public(client):
    health = client.get("/health")
    version = client.get("/version")
    assert health.status_code == 200
    assert health.json()["ok"] is True
    assert version.status_code == 200
    assert health.json()["version"] == version.json()["version"]


def test_register_login_logout_and_second_session(client):
    first = client.post(
        "/auth/register", json={"email": "Ada@Example.com", "password": "password1"}
    )
    assert first.status_code == 201
    token = first.json()["token"]
    assert " " not in token
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"

    again = client.post(
        "/auth/register", json={"email": "ada@example.com", "password": "password1"}
    )
    assert again.status_code == 409
    short = client.post("/auth/register", json={"email": "a@b.c", "password": "short"})
    assert short.status_code == 400

    bad = client.post("/auth/login", json={"email": "ada@example.com", "password": "nope1234"})
    missing = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "password1"}
    )
    assert bad.status_code == missing.status_code == 401
    assert bad.json()["detail"] == missing.json()["detail"]

    second = client.post("/auth/login", json={"email": "ada@example.com", "password": "password1"})
    other = second.json()["token"]
    gone = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert gone.status_code == 204
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {other}"}).status_code == 200


def test_expired_token_is_rejected(client):
    headers = auth(client)
    with main.dao.db.connect() as conn:
        conn.execute(
            "UPDATE sessions SET expires_at = ?",
            ("2000-01-01T00:00:00.000000+00:00",),
        )
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.get("/projects", headers=headers).status_code == 401


def test_projects_require_a_token_and_are_shared(client):
    assert client.get("/projects").status_code == 401
    ada = auth(client, "ada@example.com")
    grace = auth(client, "grace@example.com")
    missing = client.post("/projects", json={}, headers=ada)
    assert missing.status_code == 400
    long_name = client.post("/projects", json={"name": "x" * 101}, headers=ada)
    assert long_name.status_code == 400
    created = client.post(
        "/projects", json={"name": "Capstone", "description": "one page"}, headers=ada
    )
    assert created.status_code == 201
    body = created.json()
    listed = client.get("/projects", headers=grace)
    assert listed.status_code == 200
    assert listed.json()[0]["name"] == "Capstone"
    assert client.get(f"/projects/{body['id']}", headers=grace).json()["description"] == "one page"
    duplicate = client.post("/projects", json={"name": "Capstone"}, headers=grace)
    assert duplicate.status_code == 409


def test_create_story_starts_in_backlog(client):
    headers = auth(client)
    project = client.post("/projects", json={"name": "Capstone"}, headers=headers).json()
    pid = project["id"]
    bad = client.post(
        f"/projects/{pid}/stories",
        json={"title": "x", "priority": "Urgent", "type": "Feature"},
        headers=headers,
    )
    assert bad.status_code == 400
    missing = client.post(
        "/projects/missing/stories",
        json=STORY,
        headers=headers,
    )
    assert missing.status_code == 404
    created = client.post(f"/projects/{pid}/stories", json=STORY, headers=headers)
    assert created.status_code == 201
    story = created.json()
    assert story["status"] == "Backlog"
    assert story["github_branch_ref"] is None
    assert "position" not in story
    listed = client.get(f"/projects/{pid}/stories", headers=headers).json()
    assert listed[0]["id"] == story["id"]


def test_sprint_plan_and_activate(client):
    headers = auth(client)
    project = client.post("/projects", json={"name": "Capstone"}, headers=headers).json()
    pid = project["id"]
    sprint = client.post(f"/projects/{pid}/sprints", json={"goal": "MVP"}, headers=headers)
    assert sprint.status_code == 201
    assert sprint.json()["status"] == "Planned"
    assert sprint.json()["faculty_notes"] is None
    second = client.post(f"/projects/{pid}/sprints", json={}, headers=headers)
    assert second.status_code == 409
    sprint_id = sprint.json()["id"]
    active = client.post(f"/sprints/{sprint_id}/activate", headers=headers)
    assert active.status_code == 200
    fetched = client.get(f"/sprints/{sprint_id}", headers=headers).json()
    assert fetched["stories"] == []
    assert "stories_snapshot" not in fetched
    closed = client.post(f"/sprints/{sprint_id}/close", headers=headers)
    assert closed.status_code == 200
    again = client.post(f"/sprints/{sprint_id}/activate", headers=headers)
    assert again.status_code == 409


def _project(client, headers, name="Capstone"):
    return client.post("/projects", json={"name": name}, headers=headers).json()


def _story(client, headers, project_id, **overrides):
    body = dict(STORY)
    body.update(overrides)
    response = client.post(f"/projects/{project_id}/stories", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _active_sprint(client, headers, project_id, goal="MVP"):
    sprint = client.post(
        f"/projects/{project_id}/sprints", json={"goal": goal}, headers=headers
    ).json()
    activated = client.post(f"/sprints/{sprint['id']}/activate", headers=headers)
    assert activated.status_code == 200
    return sprint


def test_board_moves_sort_and_hide_resolved(client):
    headers = auth(client)
    project = _project(client, headers)
    pid = project["id"]
    low = _story(client, headers, pid, title="Low one", priority="Low")
    high = _story(client, headers, pid, title="High one", priority="High")
    ordered = client.get(
        f"/projects/{pid}/stories", params={"sort": "priority"}, headers=headers
    ).json()
    assert [row["title"] for row in ordered] == ["High one", "Low one"]
    blocked = client.patch(
        f"/stories/{low['id']}",
        json={"status": "Selected for Sprint", "expected_status": "Backlog"},
        headers=headers,
    )
    assert blocked.status_code == 409
    assert "No active sprint" in blocked.json()["detail"]
    still = next(
        row
        for row in client.get(f"/projects/{pid}/stories", headers=headers).json()
        if row["id"] == low["id"]
    )
    assert still["status"] == "Backlog"

    sprint = _active_sprint(client, headers, pid)
    stale = client.patch(
        f"/stories/{low['id']}",
        json={"status": "Done", "title": "should not stick", "expected_status": "Done"},
        headers=headers,
    )
    assert stale.status_code == 409
    unchanged = next(
        row
        for row in client.get(f"/projects/{pid}/stories", headers=headers).json()
        if row["id"] == low["id"]
    )
    assert unchanged["title"] == "Low one"
    assert unchanged["status"] == "Backlog"

    moved = client.patch(
        f"/stories/{high['id']}",
        json={"status": "Done", "position": 3, "expected_status": "Backlog"},
        headers=headers,
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "Done"
    assert moved.json()["open_sprint_id"] == sprint["id"]
    assert "position" not in moved.json()
    hidden = client.get(
        f"/projects/{pid}/stories",
        params={"hide_resolved": True},
        headers=headers,
    ).json()
    assert high["id"] not in [row["id"] for row in hidden]
    back = client.patch(
        f"/stories/{high['id']}",
        json={"status": "Backlog", "expected_status": "Done"},
        headers=headers,
    )
    assert back.json()["open_sprint_id"] is None
    assert back.json()["status"] == "Backlog"


def test_close_preserves_snapshot_and_faculty_notes(client):
    headers = auth(client)
    project = _project(client, headers)
    pid = project["id"]
    done_a = _story(client, headers, pid, title="A done")
    done_b = _story(client, headers, pid, title="B done")
    left = _story(client, headers, pid, title="C left", priority="Medium", type="Bug")
    sprint = _active_sprint(client, headers, pid)
    for story, status in ((done_a, "Done"), (done_b, "Done"), (left, "In Progress")):
        moved = client.patch(
            f"/stories/{story['id']}",
            json={"status": status},
            headers=headers,
        )
        assert moved.status_code == 200
    closed = client.post(
        f"/sprints/{sprint['id']}/close",
        json={"faculty_notes": "  Watch the demo  "},
        headers=headers,
    )
    assert closed.status_code == 200
    snapshot = {row["story_id"]: row for row in closed.json()["stories_snapshot"]}
    assert closed.json()["faculty_notes"] == "  Watch the demo  "
    assert snapshot[done_a["id"]]["status_at_close"] == "Done"
    assert snapshot[left["id"]]["status_at_close"] == "In Progress"
    live = {
        row["id"]: row for row in client.get(f"/projects/{pid}/stories", headers=headers).json()
    }
    assert live[left["id"]]["status"] == "Backlog"
    assert live[left["id"]]["open_sprint_id"] is None
    assert live[done_a["id"]]["status"] == "Done"
    backlog = client.get(
        f"/projects/{pid}/stories", params={"status": "Backlog"}, headers=headers
    ).json()
    assert done_a["id"] not in [row["id"] for row in backlog]
    renamed = client.patch(
        f"/stories/{done_a['id']}", json={"title": "renamed after close"}, headers=headers
    )
    assert renamed.status_code == 200
    history = client.get(f"/sprints/{sprint['id']}", headers=headers).json()
    frozen = {row["story_id"]: row for row in history["stories_snapshot"]}
    assert frozen[done_a["id"]]["title"] == "A done"
    again = client.post(f"/sprints/{sprint['id']}/close", headers=headers)
    assert again.status_code == 409
    listed = client.get(f"/projects/{pid}/sprints", headers=headers).json()
    assert listed[0]["status"] == "Closed"
    assert listed[0]["faculty_notes"] == "  Watch the demo  "


def test_mentions_use_team_member_names(client):
    headers = auth(client)
    project = _project(client, headers)
    other = _project(client, headers, name="Other")
    pid = project["id"]
    story = _story(client, headers, pid)
    ann = client.post(f"/projects/{pid}/members", json={"name": "Ann"}, headers=headers)
    anna = client.post(f"/projects/{pid}/members", json={"name": "Anna"}, headers=headers)
    assert ann.status_code == anna.status_code == 201
    duplicate = client.post(f"/projects/{pid}/members", json={"name": " ann "}, headers=headers)
    assert duplicate.status_code == 409
    members = client.get(f"/projects/{pid}/members", headers=headers).json()
    assert [row["name"] for row in members] == ["Ann", "Anna"]
    outsider = client.post(
        f"/projects/{other['id']}/members", json={"name": "Grace"}, headers=headers
    ).json()
    exact = client.post(
        f"/stories/{story['id']}/comments",
        json={"author_id": anna.json()["id"], "body": "Ask @Anna"},
        headers=headers,
    )
    assert exact.status_code == 201
    assert exact.json()["mentioned_ids"] == [anna.json()["id"]]
    plain = client.post(
        f"/stories/{story['id']}/comments",
        json={"author_id": ann.json()["id"], "body": "Ask @Nope"},
        headers=headers,
    )
    assert plain.json()["mentioned_ids"] == []
    assert plain.json()["body"] == "Ask @Nope"
    empty = client.post(
        f"/stories/{story['id']}/comments",
        json={"author_id": ann.json()["id"], "body": "   "},
        headers=headers,
    )
    assert empty.status_code == 400
    wrong = client.post(
        f"/stories/{story['id']}/comments",
        json={"author_id": outsider["id"], "body": "hi"},
        headers=headers,
    )
    assert wrong.status_code == 404
    thread = client.get(f"/stories/{story['id']}/comments", headers=headers).json()
    assert [row["body"] for row in thread] == ["Ask @Anna", "Ask @Nope"]


def _five(**overrides):
    content = {
        "sprint_goal": "g",
        "completed_work": "MODEL",
        "next_sprint_goals": "n",
        "blockers": "b",
        "faculty_notes": "MODEL NOTES",
    }
    content.update(overrides)
    return content


def test_report_draft_uses_sprint_faculty_notes_and_keeps_final(client):
    headers = auth(client)
    project = _project(client, headers)
    pid = project["id"]
    story = _story(client, headers, pid)
    sprint = _active_sprint(client, headers, pid)
    calls = []

    def drafter(snapshot):
        calls.append(snapshot)
        return _five()

    main.report_drafter = drafter
    not_closed = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert not_closed.status_code == 409
    assert calls == []
    client.patch(f"/stories/{story['id']}", json={"status": "In Progress"}, headers=headers)
    client.post(
        f"/sprints/{sprint['id']}/close",
        json={"faculty_notes": "Ship the demo"},
        headers=headers,
    )
    main.report_drafter = None
    unconfigured = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert unconfigured.status_code == 503
    assert client.get(f"/sprints/{sprint['id']}/report", headers=headers).status_code == 404

    main.report_drafter = drafter
    drafted = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert drafted.status_code == 200
    body = drafted.json()["draft_content"]
    assert body["completed_work"] == NOTHING_COMPLETED
    assert body["faculty_notes"] == "Ship the demo"
    assert calls[0]["faculty_notes"] == "Ship the demo"
    assert calls[0]["any_completed"] is False
    assert "github_branch_ref" not in calls[0]["stories"][0]
    assert calls[0]["stories"][0]["status_at_close"] == "In Progress"

    early = client.put(
        f"/sprints/{sprint['id']}/report",
        json={"final_content": REPORT, "reviewed_by": "Ada"},
        headers=headers,
    )
    assert early.status_code == 200
    saved = client.get(f"/sprints/{sprint['id']}/report", headers=headers).json()
    assert saved["final_content"]["faculty_notes"] == "Edited by a person"
    again = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert again.status_code == 200
    reread = client.get(f"/sprints/{sprint['id']}/report", headers=headers).json()
    assert reread["final_content"]["completed_work"] == "Done the board"
    assert reread["draft_content"]["faculty_notes"] == "Ship the demo"
    assert reread["generated_at"] == again.json()["generated_at"]


def test_empty_faculty_notes_and_empty_sprint_do_not_call_the_model_for_nothing(client):
    headers = auth(client)
    project = _project(client, headers)
    pid = project["id"]
    sprint = _active_sprint(client, headers, pid)
    closed = client.post(
        f"/sprints/{sprint['id']}/close",
        json={"faculty_notes": "   "},
        headers=headers,
    )
    assert closed.json()["faculty_notes"] is None
    calls = []
    main.report_drafter = lambda snapshot: calls.append(snapshot)
    empty = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert empty.status_code == 422
    assert empty.json()["detail"].startswith("This sprint had no stories")
    assert calls == []

    story = _story(client, headers, pid, title="Only one")
    nxt = client.post(f"/projects/{pid}/sprints", json={"goal": "next"}, headers=headers).json()
    client.post(f"/sprints/{nxt['id']}/activate", headers=headers)
    client.patch(f"/stories/{story['id']}", json={"status": "Done"}, headers=headers)
    client.post(f"/sprints/{nxt['id']}/close", headers=headers)

    def drafter(snapshot):
        calls.append(snapshot)
        return _five(completed_work="Kept because someone finished")

    main.report_drafter = drafter
    drafted = client.post(f"/sprints/{nxt['id']}/report/draft", headers=headers)
    assert drafted.status_code == 200
    assert drafted.json()["draft_content"]["faculty_notes"] == NO_FACULTY_NOTES
    assert drafted.json()["draft_content"]["completed_work"] == "Kept because someone finished"
    assert calls[-1]["faculty_notes"] is None
    assert calls[-1]["any_completed"] is True


def test_put_before_draft_is_404_and_drafter_errors_do_not_save(client):
    headers = auth(client)
    project = _project(client, headers)
    story = _story(client, headers, project["id"])
    sprint = _active_sprint(client, headers, project["id"])
    client.patch(f"/stories/{story['id']}", json={"status": "Done"}, headers=headers)
    client.post(f"/sprints/{sprint['id']}/close", headers=headers)
    missing = client.put(
        f"/sprints/{sprint['id']}/report",
        json={"final_content": REPORT},
        headers=headers,
    )
    assert missing.status_code == 404

    def boom(_snapshot):
        raise RuntimeError("model down")

    main.report_drafter = boom
    failed = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert failed.status_code == 502
    assert client.get(f"/sprints/{sprint['id']}/report", headers=headers).status_code == 404


def _closed_sprint(client, headers):
    project = _project(client, headers)
    story = _story(client, headers, project["id"])
    sprint = _active_sprint(client, headers, project["id"])
    moved = client.patch(f"/stories/{story['id']}", json={"status": "Done"}, headers=headers)
    assert moved.status_code == 200
    closed = client.post(f"/sprints/{sprint['id']}/close", headers=headers)
    assert closed.status_code == 200
    return project, story, sprint


def test_password_hashes_reject_a_bad_encoding():
    assert verify_password("password1", "md5$1$aa$bb") is False
    assert verify_password("password1", "not-a-hash") is False
    assert verify_password("password1", "pbkdf2_sha256$nope$zz$aa") is False


def test_email_shape_blank_goal_and_bearer_token(client):
    for email in ("no-at.example", "@missing.example", "missing@"):
        response = client.post("/auth/register", json={"email": email, "password": "password1"})
        assert response.status_code == 400
    assert client.post("/auth/register", json={}).status_code == 400
    headers = auth(client)
    blank = client.post(
        "/projects",
        json={"name": "Goals"},
        headers=headers,
    )
    project_id = blank.json()["id"]
    sprint = client.post(
        f"/projects/{project_id}/sprints",
        json={"goal": "   "},
        headers=headers,
    )
    assert sprint.status_code == 201
    assert sprint.json()["goal"] is None
    assert client.get("/projects", headers={"Authorization": "Bearer   "}).status_code == 401
    assert client.get("/projects", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/health").status_code == 200
    assert client.get("/version").status_code == 200


def test_two_accounts_edit_the_same_board_and_sort_without_position(client):
    ada = auth(client, "ada@example.com")
    grace = auth(client, "grace@example.com")
    project = _project(client, ada)
    pid = project["id"]
    older = _story(client, ada, pid, title="Older", priority="Low")
    newer = _story(client, ada, pid, title="Newer", priority="High")
    with main.dao.db.connect() as conn:
        conn.execute(
            "UPDATE user_stories SET created_at = ? WHERE id = ?",
            ("2020-01-01T00:00:00.000000+00:00", older["id"]),
        )
        conn.execute(
            "UPDATE user_stories SET created_at = ? WHERE id = ?",
            ("2024-06-01T00:00:00.000000+00:00", newer["id"]),
        )
    by_time = client.get(
        f"/projects/{pid}/stories", params={"sort": "created_at"}, headers=grace
    ).json()
    by_default = client.get(f"/projects/{pid}/stories", headers=ada).json()
    assert [row["title"] for row in by_time] == ["Newer", "Older"]
    assert [row["title"] for row in by_default] == ["Older", "Newer"]
    assert "position" not in by_time[0]
    edited = client.patch(
        f"/stories/{older['id']}",
        json={"title": "Edited by Grace", "status": "Backlog", "description": "shared"},
        headers=grace,
    )
    assert edited.status_code == 200
    assert edited.json()["title"] == "Edited by Grace"
    assert edited.json()["status"] == "Backlog"
    assert "position" not in edited.json()
    seen = client.get(f"/projects/{pid}/stories", headers=ada).json()
    assert seen[0]["title"] == "Edited by Grace"


def test_story_filters_and_field_validation(client):
    headers = auth(client)
    project = _project(client, headers)
    other = _project(client, headers, name="Other")
    pid = project["id"]
    story = _story(client, headers, pid, title="Board card")
    sprint = _active_sprint(client, headers, pid)
    other_sprint = client.post(
        f"/projects/{other['id']}/sprints", json={"goal": "elsewhere"}, headers=headers
    ).json()
    moved = client.patch(
        f"/stories/{story['id']}",
        json={
            "status": "In Progress",
            "priority": "Low",
            "type": "Chore",
            "github_branch_ref": "feature/board",
            "description": None,
        },
        headers=headers,
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "In Progress"
    assert "position" not in moved.json()
    listed = client.get(
        f"/projects/{pid}/stories",
        params={"sprint_id": sprint["id"], "status": "In Progress", "sort": "priority"},
        headers=headers,
    )
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [story["id"]]
    assert (
        client.get(
            f"/projects/{pid}/stories", params={"sort": "position"}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/projects/{pid}/stories", params={"status": "Later"}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/projects/{pid}/stories", params={"sprint_id": "missing"}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/projects/{pid}/stories",
            params={"sprint_id": other_sprint["id"]},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/projects/{pid}/stories",
            json={"title": "   ", "priority": "Low", "type": "Feature"},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.post(
            f"/projects/{pid}/stories",
            json={"title": "Epic", "priority": "Low", "type": "Epic"},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.patch(f"/stories/{story['id']}", json={"title": "  "}, headers=headers).status_code
        == 400
    )
    assert (
        client.patch(
            f"/stories/{story['id']}", json={"priority": "Urgent"}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.patch(f"/stories/{story['id']}", json={"type": "Epic"}, headers=headers).status_code
        == 400
    )
    assert (
        client.patch(
            f"/stories/{story['id']}", json={"status": "Archived"}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.patch("/stories/missing", json={"title": "nope"}, headers=headers).status_code == 404
    )
    with pytest.raises(AppError):
        main.dao.patch_story(story["id"], {"description": 5})
    with pytest.raises(AppError):
        main.dao.patch_story(story["id"], {"github_branch_ref": 5})
    assert client.get("/projects/missing", headers=headers).status_code == 404
    assert client.get("/projects/missing/sprints", headers=headers).status_code == 404
    assert client.get("/projects/missing/members", headers=headers).status_code == 404


def test_sprint_lookup_activation_and_comments(client):
    headers = auth(client)
    project = _project(client, headers)
    pid = project["id"]
    member = client.post(f"/projects/{pid}/members", json={"name": "Ada"}, headers=headers).json()
    assert (
        client.post(f"/projects/{pid}/members", json={"name": "   "}, headers=headers).status_code
        == 400
    )
    planned = client.post(f"/projects/{pid}/sprints", json={"goal": "Plan"}, headers=headers).json()
    assert client.post(f"/sprints/{planned['id']}/close", headers=headers).status_code == 409
    assert client.get("/sprints/missing", headers=headers).status_code == 404
    assert client.post("/sprints/missing/activate", headers=headers).status_code == 404
    assert client.post("/sprints/missing/close", headers=headers).status_code == 404
    assert client.get("/sprints/missing/report", headers=headers).status_code == 404
    assert client.post("/sprints/missing/report/draft", headers=headers).status_code == 404
    story = _story(client, headers, pid)
    assert (
        client.post(
            "/stories/missing/comments",
            json={"author_id": member["id"], "body": "hi"},
            headers=headers,
        ).status_code
        == 404
    )
    assert client.get("/stories/missing/comments", headers=headers).status_code == 404
    assert client.get("/sprints/missing/comments", headers=headers).status_code == 404
    with main.dao.db.connect() as conn:
        conn.execute("DROP INDEX IF EXISTS sprints_one_open")
        conn.execute(
            """
            INSERT INTO sprints (id, project_id, goal, status, faculty_notes, created_at)
            VALUES ('already-active', ?, 'live', 'Active', NULL, ?)
            """,
            (pid, "2020-01-01T00:00:00.000000+00:00"),
        )
    blocked = client.post(f"/sprints/{planned['id']}/activate", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "Another sprint is already active."
    client.post("/sprints/already-active/close", headers=headers)
    active = client.post(f"/sprints/{planned['id']}/activate", headers=headers)
    assert active.status_code == 200
    moved = client.patch(f"/stories/{story['id']}", json={"status": "Done"}, headers=headers)
    assert moved.status_code == 200
    closed = client.post(f"/sprints/{planned['id']}/close", headers=headers)
    assert closed.status_code == 200
    posted = client.post(
        f"/sprints/{planned['id']}/comments",
        json={"author_id": member["id"], "body": "Thanks @Ada"},
        headers=headers,
    )
    assert posted.status_code == 201
    assert posted.json()["author_id"] == member["id"]
    assert posted.json()["mentioned_ids"] == [member["id"]]
    thread = client.get(f"/sprints/{planned['id']}/comments", headers=headers)
    assert thread.status_code == 200
    assert thread.json()[0]["author_id"] == member["id"]


def test_mentions_and_faculty_notes_normalize():
    members = [{"id": "1", "name": "Ann"}, {"id": "2", "name": "Ann Lee"}]
    assert mention_ids("Hi @Ann Lee, then @ann.", members) == ["2", "1"]
    assert mention_ids("plain", members) == []
    assert normalize_faculty_notes(None) is None
    assert normalize_faculty_notes("   ") is None
    assert normalize_faculty_notes("  Keep spaces  ") == "  Keep spaces  "
    with pytest.raises(AppError) as caught:
        normalize_faculty_notes(4)
    assert caught.value.status == 400


def test_draft_failures_do_not_replace_a_saved_report(client):
    headers = auth(client)
    _project_body, _story_body, sprint = _closed_sprint(client, headers)
    sprint_id = sprint["id"]

    def raise_app(_snapshot):
        raise AppError(409, "Sprint is not closed.")

    main.report_drafter = raise_app
    refused = client.post(f"/sprints/{sprint_id}/report/draft", headers=headers)
    assert refused.status_code == 409

    main.report_drafter = lambda _snapshot: "not-an-object"
    bad_shape = client.post(f"/sprints/{sprint_id}/report/draft", headers=headers)
    assert bad_shape.status_code == 502
    assert client.get(f"/sprints/{sprint_id}/report", headers=headers).status_code == 404

    main.report_drafter = lambda _snapshot: {**_five(), "completed_work": 1}
    bad_field = client.post(f"/sprints/{sprint_id}/report/draft", headers=headers)
    assert bad_field.status_code == 502

    main.report_drafter = lambda _snapshot: _five()
    drafted = client.post(f"/sprints/{sprint_id}/report/draft", headers=headers)
    assert drafted.status_code == 200
    assert set(drafted.json()["draft_content"]) == {
        "sprint_goal",
        "completed_work",
        "next_sprint_goals",
        "blockers",
        "faculty_notes",
    }
    missing = client.put(
        f"/sprints/{sprint_id}/report",
        json={"final_content": {"sprint_goal": "only one"}},
        headers=headers,
    )
    assert missing.status_code == 400
    typed = dict(REPORT)
    typed["blockers"] = 5
    bad_type = client.put(
        f"/sprints/{sprint_id}/report",
        json={"final_content": typed},
        headers=headers,
    )
    assert bad_type.status_code == 400
    with pytest.raises(AppError):
        main._final_content(["nope"])


def test_missing_drafter_package_is_503(client, monkeypatch):
    headers = auth(client)
    _project_body, _story_body, sprint = _closed_sprint(client, headers)
    main.report_drafter = None
    real_import = builtins.__import__

    def blocked(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "sprint_report":
            raise ImportError("sprint_report is not installed")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", blocked)
    response = client.post(f"/sprints/{sprint['id']}/report/draft", headers=headers)
    assert response.status_code == 503
    assert response.json()["detail"] == "Sprint report drafter is not configured."


def test_startup_continues_when_migrations_fail(client, monkeypatch):
    def boom():
        raise RuntimeError("disk")

    monkeypatch.setattr(main.dao, "apply_migrations", boom)
    with TestClient(main.app) as restarted:
        assert restarted.get("/health").status_code == 200


def test_ui_origin_stays_allowed_when_env_lists_another_origin(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://faculty.example.edu")
    importlib.reload(main)
    origins = next(
        middleware.kwargs["allow_origins"]
        for middleware in main.app.user_middleware
        if middleware.cls.__name__ == "CORSMiddleware"
    )
    assert origins == ["https://faculty.example.edu", "http://localhost:43123"]


def test_database_url_and_migration_rollback(tmp_path, monkeypatch):
    with pytest.raises(ValueError):
        sqlite_path("postgres://workspace")

    broken = tmp_path / "broken"
    broken.mkdir()
    (broken / "001_bad.sql").write_text("NOT VALID SQL;")
    monkeypatch.setattr("db.MIGRATIONS_DIR", broken)
    database = Database(f"sqlite:///{tmp_path / 'broken.db'}")
    with pytest.raises(sqlite3.Error):
        database.apply_migrations()
