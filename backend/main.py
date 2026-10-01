"""My Workspace API. Workspace routes require an opaque bearer token."""

import logging
import os
import sys
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict

from auth import hash_token
from dao import WorkspaceDAO
from db import now
from domain import (
    NOTHING_COMPLETED,
    REPORT_KEYS,
    SIGN_IN_REQUIRED,
    AppError,
    faculty_notes_for_report,
    normalize_faculty_notes,
)

APP_VERSION = "0.2.0"

log = logging.getLogger("workspace")
if not log.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
    log.setLevel(logging.INFO)
    log.propagate = False

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data/workspace.db")
dao = WorkspaceDAO(DATABASE_URL)

# Tests assign a callable. None means import sprint_report.draft_report.
report_drafter = None


def current_drafter():
    if report_drafter is not None:
        return report_drafter
    try:
        from sprint_report import draft_report
    except ImportError:
        return None
    return draft_report


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        dao.apply_migrations()
    except Exception as exc:
        log.warning("startup: database migrations skipped: %s", type(exc).__name__)
    yield


app = FastAPI(title="My Workspace", version=APP_VERSION, lifespan=lifespan)

_UI_ORIGIN = "http://localhost:43123"
_origins = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", _UI_ORIGIN).split(",")
    if origin.strip()
]
if _UI_ORIGIN not in _origins:
    _origins.append(_UI_ORIGIN)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def log_request(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    log.info(
        '{"method":"%s","path":"%s","status":%s,"duration_ms":%.2f}',
        request.method,
        request.url.path,
        response.status_code,
        (time.perf_counter() - started) * 1000,
    )
    return response


@app.exception_handler(AppError)
def app_error(_request: Request, exc: AppError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
def validation_error(_request: Request, exc: RequestValidationError):
    parts = []
    for err in exc.errors():
        loc = ".".join(str(item) for item in err["loc"] if item != "body")
        parts.append(f"{loc}: {err['msg']}" if loc else err["msg"])
    return JSONResponse(status_code=400, content={"detail": "; ".join(parts) or "Invalid request"})


def require_user(authorization: str | None = Header(default=None)) -> dict:
    if authorization is None or not authorization.startswith("Bearer "):
        raise AppError(401, SIGN_IN_REQUIRED)
    raw = authorization.removeprefix("Bearer ").strip()
    if not raw:
        raise AppError(401, SIGN_IN_REQUIRED)
    user = dao.user_for_token(hash_token(raw))
    if user is None:
        raise AppError(401, SIGN_IN_REQUIRED)
    return user


class RegisterIn(BaseModel):
    email: str
    password: str


class ProjectIn(BaseModel):
    name: str
    description: str | None = None


class StoryIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str
    description: str | None = None
    priority: str
    type: str


class StoryPatch(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    type: str | None = None
    github_branch_ref: str | None = None
    status: str | None = None
    expected_status: str | None = None


class SprintIn(BaseModel):
    goal: str | None = None


class CloseIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    faculty_notes: str | None = None


class MemberIn(BaseModel):
    name: str


class CommentIn(BaseModel):
    author_id: str
    body: str


class ReportIn(BaseModel):
    final_content: dict
    reviewed_by: str | None = None


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    if value.strip() == "":
        return None
    return value


@app.get("/health")
def health():
    return {"ok": True, "version": APP_VERSION}


@app.get("/version")
def version():
    return {"version": APP_VERSION}


@app.post("/auth/register", status_code=201)
def register(body: RegisterIn):
    return dao.register(body.email, body.password)


@app.post("/auth/login")
def login(body: RegisterIn):
    return dao.login(body.email, body.password)


@app.post("/auth/logout", status_code=204)
def logout(
    authorization: str | None = Header(default=None),
    _user: dict = Depends(require_user),
):
    raw = (authorization or "").removeprefix("Bearer ").strip()
    dao.logout(hash_token(raw))
    return Response(status_code=204)


@app.get("/auth/me")
def me(user: dict = Depends(require_user)):
    return user


@app.post("/projects", status_code=201)
def create_project(body: ProjectIn, _user: dict = Depends(require_user)):
    return dao.create_project(body.name, body.description)


@app.get("/projects")
def list_projects(_user: dict = Depends(require_user)):
    return dao.list_projects()


@app.get("/projects/{project_id}")
def get_project(project_id: str, _user: dict = Depends(require_user)):
    return dao.get_project(project_id)


@app.get("/projects/{project_id}/stories")
def list_stories(
    project_id: str,
    status: str | None = None,
    sprint_id: str | None = None,
    sort: str | None = None,
    hide_resolved: bool = False,
    _user: dict = Depends(require_user),
):
    return dao.list_stories(project_id, status, sprint_id, sort, hide_resolved)


@app.post("/projects/{project_id}/stories", status_code=201)
def create_story(project_id: str, body: StoryIn, _user: dict = Depends(require_user)):
    return dao.create_story(project_id, body.title, body.description, body.priority, body.type)


@app.patch("/stories/{story_id}")
def patch_story(story_id: str, body: StoryPatch, _user: dict = Depends(require_user)):
    return dao.patch_story(story_id, body.model_dump(exclude_unset=True))


@app.post("/projects/{project_id}/sprints", status_code=201)
def create_sprint(project_id: str, body: SprintIn, _user: dict = Depends(require_user)):
    return dao.create_sprint(project_id, _blank_to_none(body.goal))


@app.get("/projects/{project_id}/sprints")
def list_sprints(project_id: str, _user: dict = Depends(require_user)):
    return dao.list_sprints(project_id)


@app.get("/sprints/{sprint_id}")
def get_sprint(sprint_id: str, _user: dict = Depends(require_user)):
    return dao.get_sprint(sprint_id)


@app.post("/sprints/{sprint_id}/activate")
def activate_sprint(sprint_id: str, _user: dict = Depends(require_user)):
    return dao.activate_sprint(sprint_id)


@app.post("/sprints/{sprint_id}/close")
def close_sprint(
    sprint_id: str,
    body: CloseIn | None = None,
    _user: dict = Depends(require_user),
):
    notes = None if body is None else normalize_faculty_notes(body.faculty_notes)
    return dao.close_sprint(sprint_id, notes)


def _coerce_draft(raw, snapshot: dict) -> dict:
    if not isinstance(raw, dict):
        raise AppError(502, "Sprint report draft failed.")
    content = {}
    for key in REPORT_KEYS:
        if key == "faculty_notes":
            continue
        value = raw.get(key)
        if not isinstance(value, str):
            raise AppError(502, "Sprint report draft failed.")
        content[key] = value
    if not snapshot["any_completed"]:
        content["completed_work"] = NOTHING_COMPLETED
    content["faculty_notes"] = faculty_notes_for_report(snapshot["faculty_notes"])
    return content


@app.post("/sprints/{sprint_id}/report/draft")
def draft_sprint_report(sprint_id: str, _user: dict = Depends(require_user)):
    snapshot = dao.report_snapshot(sprint_id)
    drafter = current_drafter()
    if drafter is None:
        raise AppError(503, "Sprint report drafter is not configured.")
    try:
        raw = drafter(snapshot)
    except AppError:
        raise
    except Exception as exc:
        status = getattr(exc, "status_code", None)
        detail = getattr(exc, "detail", None)
        if isinstance(status, int) and isinstance(detail, str):
            raise AppError(status, detail) from None
        log.warning("sprint report draft failed")
        raise AppError(502, "Sprint report draft failed.") from None
    content = _coerce_draft(raw, snapshot)
    generated_at = now()
    dao.save_draft(sprint_id, content, generated_at)
    return {"draft_content": content, "generated_at": generated_at}


def _final_content(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise AppError(400, "final_content must be an object")
    missing = [key for key in REPORT_KEYS if key not in payload]
    if missing:
        raise AppError(400, "final_content is missing required fields")
    content = {}
    for key in REPORT_KEYS:
        if not isinstance(payload[key], str):
            raise AppError(400, f"{key} must be a string")
        content[key] = payload[key]
    return content


@app.put("/sprints/{sprint_id}/report")
def save_sprint_report(sprint_id: str, body: ReportIn, _user: dict = Depends(require_user)):
    return dao.save_final(sprint_id, _final_content(body.final_content), body.reviewed_by)


@app.get("/sprints/{sprint_id}/report")
def get_sprint_report(sprint_id: str, _user: dict = Depends(require_user)):
    return dao.get_report(sprint_id)


@app.post("/projects/{project_id}/members", status_code=201)
def add_member(project_id: str, body: MemberIn, _user: dict = Depends(require_user)):
    return dao.add_member(project_id, body.name)


@app.get("/projects/{project_id}/members")
def list_members(project_id: str, _user: dict = Depends(require_user)):
    return dao.list_members(project_id)


@app.post("/stories/{story_id}/comments", status_code=201)
def add_story_comment(story_id: str, body: CommentIn, _user: dict = Depends(require_user)):
    return dao.add_comment("Story", story_id, body.author_id, body.body)


@app.get("/stories/{story_id}/comments")
def list_story_comments(story_id: str, _user: dict = Depends(require_user)):
    return dao.list_comments("Story", story_id)


@app.post("/sprints/{sprint_id}/comments", status_code=201)
def add_sprint_comment(sprint_id: str, body: CommentIn, _user: dict = Depends(require_user)):
    return dao.add_comment("Sprint", sprint_id, body.author_id, body.body)


@app.get("/sprints/{sprint_id}/comments")
def list_sprint_comments(sprint_id: str, _user: dict = Depends(require_user)):
    return dao.list_comments("Sprint", sprint_id)
