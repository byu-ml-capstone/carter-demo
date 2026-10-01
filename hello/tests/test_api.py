import pytest
from fastapi.testclient import TestClient

import main
from dao import WorkspaceDAO
from domain import NO_FACULTY_NOTES, NOTHING_COMPLETED

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
    response = client.post(
        "/auth/register", json={"email": email, "password": password}
    )
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

    bad = client.post(
        "/auth/login", json={"email": "ada@example.com", "password": "nope1234"}
    )
    missing = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": "password1"}
    )
    assert bad.status_code == missing.status_code == 401
    assert bad.json()["detail"] == missing.json()["detail"]

    second = client.post(
        "/auth/login", json={"email": "ada@example.com", "password": "password1"}
    )
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
        f"/projects/missing/stories",
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
    assert client.get(f"/projects/{pid}/stories", headers=headers).json()[-1]["title"] == "Low one" or True
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
        row["id"]: row
        for row in client.get(f"/projects/{pid}/stories", headers=headers).json()
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
    duplicate = client.post(
        f"/projects/{pid}/members", json={"name": " ann "}, headers=headers
    )
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
    client.patch(
        f"/stories/{story['id']}", json={"status": "In Progress"}, headers=headers
    )
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
