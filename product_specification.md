# My Workspace — Product Specification

*Revision note: this pass fixes gaps found in a self-review — missing sprint-history endpoints, an unwritten comments/mentions workflow, an outdated validation plan, a field-scope contradiction, under-covered risks, and a reprioritization of the collaboration features. See ADR-005 and ADR-006 in Section 12 for the reasoning behind the reprioritization and the terminology note below.*

**Terminology used throughout:** "story" is the domain entity (`UserStory`); "card" is its visual appearance on the Kanban board; "ticket modal" is the name of the UI screen that shows one story's full detail and comment thread. All three refer to the same underlying story — the document uses whichever term fits the sentence, never a different entity.

## 1. Product vision
*CRISP-DM connection: Business Understanding.*

**Product name:** My Workspace

**Problem statement:** Classmates working on a shared project juggle several tools (chat threads, spreadsheets, sticky notes) just to track sprint work, and lose time context-switching between tabs to see what's planned, in progress, or done.

**Product vision:** One page, less tabs. A single-page workspace where a small classmate team can see and manage an entire sprint — backlog, active board, and history — without navigating between separate tools or views.

**Intended users and stakeholders:**

| Person or group | Need or responsibility | How the app helps |
|---|---|---|
| Classmate (team member) | See and update their own tasks quickly, without hunting through tabs | Single-page Kanban board with sortable, color-coded stories |
| Team/project lead (a classmate role) | Plan sprints, close them out, keep a record of what happened | Sprint lifecycle (plan → activate → close) with preserved history |
| Course instructor / grader | Verify the team followed sound engineering and product practice | Documentation, tests, health/version endpoints (Section 9) |

**Success criteria:**
- [ ] A user can create a project and see it appear in the project list within 2 seconds of submission, with no page reload.
- [ ] A user can move a story from Backlog to Selected for Sprint and see it appear on the active sprint board without navigating to a different page.
- [ ] After closing a sprint, that sprint's planned and completed stories are still retrievable (visible in sprint history) — verified by reopening the app after closing.
- [ ] A user can plan, run, and close one sprint using exactly one browser tab — no external spreadsheet or chat thread required.
- [ ] A user can open a story's ticket modal, post a comment that @mentions a teammate, and see that mention rendered as a highlighted tag — without leaving the board.

## 2. Product research and decisions
*CRISP-DM connection: Data Understanding.*

| Tool | Pattern observed | Useful for this app? | Decision or implication |
|---|---|---|---|
| [GitHub Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects) | Issues live in the same ecosystem as the code repo; Kanban board with customizable views; an "Iteration" field groups issues into timeboxes instead of a dedicated sprint object; colored labels mark type/priority; an Insights tab renders burn-up/down and cumulative flow charts | Partially | Adopt the single Kanban board and color-coded labels for priority/type. Reject the git-integration depth and cross-org roadmapping — out of scope for one classmate team's project. |
| [Jira](https://www.atlassian.com/software/jira) | Strict issue types (Epic/Story/Task/Bug/Sub-task) each with their own fields; Scrum board bound to one "active sprint"; industry-leading reporting suite (velocity, burndown, control charts); issue linking and impediment flags; granular permission schemes | Partially | Adopt the idea of one explicit "active sprint" a board is bound to. Reject the multi-type issue hierarchy, the full reporting suite, and permission schemes — all more structure than a small classmate team needs. |

**Patterns to adopt**
- A Kanban board with stories moving through Backlog → Selected for Sprint → In Progress → Done, all on one screen (matches the "one page, less tabs" vision).
- A lightweight Sprint object (borrowing Jira's "one active sprint" idea, not GitHub's plain field) so a board can be scoped to "the current sprint" without a full reporting module.
- Color-coding by priority and by story type, borrowed from GitHub Projects' labels, for fast visual scanning.
- Sorting stories by urgency (priority) or by date created.

**Patterns to reject or simplify**
- Jira's Epic/Story/Bug/Sub-task hierarchy — replaced with one flat UserStory entity carrying a `type` field, to keep the domain model small.
- Permission schemes — no per-role access control in the MVP; every project member can edit any story.
- Strict workflow transition rules (Jira's workflow engine) — any story can move to any status; nothing is enforced.
- Full analytics suites (velocity/burndown/cumulative-flow charts) — replaced with a simple AI-drafted narrative sprint report (Section 8).
- GitHub's deep git integration — reduced to an optional reference field in v1; real branch creation is deferred (Section 3).

**Product decisions**

| Decision | Alternatives considered | Choice | Reason |
|---|---|---|---|
| How to model a sprint | A field on each story (GitHub Iteration-style) vs. a dedicated Sprint entity (Jira-style) | Dedicated Sprint entity with an explicit lifecycle | Only a dedicated entity can express Planned → Active → Closed and preserve history after closing, which the problem statement and Section 4 both require. |
| How many story "types" to support | Jira-style Epic/Story/Bug/Sub-task hierarchy vs. one flat type | Single UserStory entity with a `type` field | Matches the simplicity goal; classmates don't need a multi-level hierarchy. |
| Reporting approach | Full analytics dashboard vs. no reporting vs. AI-drafted narrative report | AI-drafted report, human-reviewed before saving | Fits the "simple" vision better than a charting suite, and is required by the course's AI-integration expectation (Section 8/9). |
| Access control | Jira-style permission schemes vs. open access for all project members | Open access, no roles in MVP | Small, trusted classmate teams; a permission scheme would add scope without solving an observed problem. |

## 3. MVP scope
*CRISP-DM connection: Business Understanding → Data Understanding.*

**In scope**
- [x] Projects
- [x] User stories
- [x] Sprint board
- [x] Sprint lifecycle (Planned → Active → Closed)
- [x] Sprint reporting — a simple AI-drafted narrative summary, not an analytics dashboard
- [ ] Velocity or progress tracking
- [x] Other: Kanban board with color-coding by priority/type, sorting by urgency or date created, hiding resolved/closed stories from the active view, and an optional plain-text field to reference a related GitHub branch (no live API integration yet).
- [x] Other: a ticket modal (opened by clicking a story card) with a comment thread on both stories and sprints, supporting @mentions of a lightweight, no-login list of named project team members. Mentions only highlight the name in the comment — no notifications are sent. (Reprioritized to **Should** rather than Must — see ADR-005 — since the board and sprint lifecycle are fully usable without it.)

**Explicitly out of scope**
- Permission schemes / role-based access control.
- Strict workflow enforcement (forced status-transition rules).
- Velocity charts, burndown/burn-up graphs, cumulative flow diagrams.
- Live GitHub API integration that actually opens a branch — v1 stores only a reference string.
- Multiple issue types (Epic/Bug/Sub-task hierarchy).
- Cross-project or cross-team roadmapping.
- Comment editing or deletion (append-only threads in the MVP).
- Mention notifications (email/push) and any real authentication/login.

**Deferred or optional ideas**
- Real GitHub API integration to open a branch directly from a story.
- Speech-to-text ("type to speak") input for creating stories.
- Velocity/progress tracking, once there's enough sprint history to make it meaningful.
- A multi-team or multi-project roadmap view.

## 4. Key user workflows
*CRISP-DM connection: Business Understanding.*

**Workflow 1: Plan and run a sprint**
- **Actor:** Team lead (a classmate)
- **Starting condition:** The project has a non-empty backlog of user stories.
- **Steps:**
  1. Open the project workspace.
  2. Review backlog stories, sorted by urgency or date created.
  3. Move selected stories to "Selected for Sprint," which assigns them to the currently displayed sprint.
  4. Team members drag their stories across board statuses (Selected for Sprint → In Progress → Done) as work happens.
- **Expected result:** The sprint board shows only stories assigned to the active sprint, each reflecting its current status accurately.
- **Failure or edge cases:** Moving a story to "Selected for Sprint" when no sprint is Active is rejected with a clear error rather than silently failing. Moving a story that belongs to an already-closed sprint is not allowed.

**Workflow 2: Close a sprint and generate a report**
- **Actor:** Team lead
- **Starting condition:** A sprint is Active and has at least one story in any status.
- **Steps:**
  1. Team lead selects "Close sprint."
  2. The system snapshots each story's status at close time and marks the sprint Closed.
  3. Team lead triggers "Generate report draft."
  4. The system drafts a report from the sprint's own story data (completed vs. not, any blockers noted in story text).
  5. Team lead reviews and edits the draft.
  6. Team lead saves the final report.
- **Expected result:** The sprint is closed, its history (planned and completed stories) remains retrievable afterward, and a human-reviewed report is saved and tied to that sprint.
- **Failure or edge cases:** A sprint with zero completed stories produces a report that says so plainly, rather than inventing progress. A sprint with no stories at all blocks report generation with a clear message. Unfinished stories return to Backlog at close time with their data intact, ready to be replanned.

**Workflow 3: Comment on a story or sprint, optionally mentioning a teammate**
- **Actor:** Any classmate on the project.
- **Starting condition:** The project has at least one story or one sprint to comment on; the project may or may not yet have any named team members.
- **Steps:**
  1. Click a story card to open its ticket modal (or open the Sprint Report page for a sprint-level comment).
  2. If this is the user's first comment in this browser, pick their name from the project's team member list (added first, if the list is empty).
  3. Type a comment; typing "@" opens an autocomplete of the project's team members.
  4. Optionally select a teammate's name from the autocomplete, inserting "@Name" into the text.
  5. Post the comment.
- **Expected result:** The comment appears at the bottom of the thread immediately, attributed to the chosen author, with any matched @mention rendered as a highlighted tag; nothing is sent to the mentioned person beyond that visual highlight.
- **Failure or edge cases:** No team members exist yet — the author picker and @mention autocomplete both prompt to add one first, rather than showing an empty dropdown. An "@" token matching no known member posts as plain text. An empty comment cannot be posted.

**Workflow checklist**
- [x] Create and view a project
- [x] Create and manage a user story
- [x] Select a story for the current sprint
- [x] Move a story through the workflow
- [x] Close a sprint while preserving history
- [x] Generate, review, and edit a sprint report
- [x] View planned and completed work
- [x] Open a story's ticket modal
- [x] Comment on a story or sprint, optionally @mentioning a teammate

### Detailed interaction spec: Sprint/Kanban board

**Layout.** One page, four columns side by side: Backlog | Selected for Sprint | In Progress | Done. Backlog shows every unassigned story in the project (per the workflow rule that the active board shows unassigned backlog stories); the other three columns show only stories linked to the active sprint. A toolbar above the board holds a sort control (Priority | Date created), a "Hide resolved" toggle, and the active sprint's name/goal.

**Story card fields:** title (bold, truncates past two lines), a priority badge (color-coded), a type icon (small inline SVG — not an emoji), the created date in muted text, and, if set, the optional GitHub branch reference.

**Drag-and-drop behavior, step by step:**
1. Press-and-hold a card → it lifts (stronger shadow), the cursor becomes "grabbing," and its original slot shows a placeholder outline.
2. Drag across a column boundary → that column highlights as a valid drop target, and a live insertion line shows where the card would land among the existing cards.
3. Release over a valid column → the card animates into place and a `PATCH /stories/{id}` request fires with the new status (and, when moving out of Backlog, assignment to the active sprint per the workflow rules). The card dims slightly while the request is in flight.
4. Request succeeds → the card settles into its new position; surrounding cards reflow to close or open the gap.
5. Request fails (e.g., 409 no active sprint) → the card animates back to its original column and position, and a toast explains why (e.g., "No active sprint — create or activate one before adding stories.").
6. Released outside any column, or dropped back at its own original position → no-op, no request sent, card simply returns/stays.

**Non-drag fallback (accessibility):** every card also has a small "…" menu offering "Move to: Backlog / Selected for Sprint / In Progress / Done," which fires the identical `PATCH` request, so the board doesn't require drag-and-drop to operate.

**States & edge cases:**
- Empty backlog: the Backlog column shows a centered "No stories yet — add one" placeholder with an add-story button, rather than a blank column.
- No active sprint: the three sprint columns show a banner ("No active sprint — plan one to start moving stories here"); they don't highlight as drop targets, and a card dropped there bounces back with the toast from step 5.
- A sprint exists but has zero stories: each affected column shows its own "No stories yet" placeholder instead of looking broken or empty by mistake.
- "Hide resolved" is on and Done has nothing else to show: a small hint clarifies the toggle is hiding stories, not that the column is genuinely empty.
- A non-status API error during a drag: same bounce-back animation, with a generic "Couldn't move that story — try again" toast.
- Another teammate already moved the same story: the drop is rejected with "This story was already moved — refreshing board," and the board re-fetches to reconcile before the user tries again.

### Detailed interaction spec: Ticket modal & comments

**Trigger.** Clicking anywhere on a story card opens a modal for that story — distinguished from a drag by movement distance/time (the same click-vs-drag heuristic most Kanban tools use), so starting a drag never pops the modal open mid-move.

**Modal contents, top to bottom:**
1. Header: story title (editable inline), type icon, priority badge, and a close (×) control.
2. Description field (editable).
3. Metadata row: status, priority, type — each editable via a small dropdown using the same values as the board.
4. Comment thread: a chronological list of comments, each showing the author's name, a timestamp, and body text with any @mentions rendered as highlighted tags — visual only, no click action or notification behind them.
5. Comment composer at the bottom: a text input plus an author picker. Since there's no login, the commenter picks their own name from the project's team member list before posting (remembered locally afterward so they aren't asked every time). Typing "@" opens an autocomplete of the project's team members; selecting a name inserts "@Name," and once posted that mention renders highlighted for everyone.

**States & edge cases:**
- No team members added yet: the author picker and @mention autocomplete both show "Add teammates to this project first," with a shortcut to add one, instead of a broken empty dropdown.
- "@" followed by text matching no team member: it posts and stays as plain text — only names matched against the project's member list at post time become highlighted tags.
- Empty comment: the post button stays disabled until there's non-whitespace text.
- An unsent draft comment when the modal is closed (×, background click, or Esc): the draft is kept in memory and restored if the modal is reopened for that same story before a page reload — not persisted to the server.
- Story data changes elsewhere while the modal is open (e.g., another teammate moves it): the metadata row updates to the refreshed status without closing the modal.

**Sprint comment thread.** The Sprint Report page (the full-page view from the sprint-close workflow) gets its own comment thread — same composer, author picker, and @mention behavior, scoped to the same project's team members — placed below the Sprint snapshot panel. It's for discussing the sprint or its report as a whole (e.g., "the blockers section misses the API delay we hit"), kept separate from any individual story's thread. Its edge cases are the same as the story thread's (no team members yet, unmatched mentions stay plain text, empty comment disabled) — it reuses the same component in a different location, nothing additional to spec.

### Detailed interaction spec: Sprint close + AI report review

**Entry point.** A "Close sprint" button is visible on the board only while a sprint is Active. Clicking it opens an inline confirmation first — "Close this sprint? Unfinished stories will return to Backlog." with Cancel/Confirm — since closing is irreversible (Section 6).

**Flow, step by step:**
1. Confirm → `POST /sprints/{id}/close` fires; the button shows a loading spinner.
2. On success, the app navigates to a full-page Sprint Report view at its own route (e.g. `/sprints/{id}/report`) — not a modal.
3. That page immediately calls `POST /sprints/{id}/report/draft` and shows a labeled loading state ("Drafting your sprint report…") while it waits, so the delay reads as an AI step rather than a stall.
4. Once the draft returns, its five sections (Sprint goal, Completed work, Next sprint goals, Blockers, Faculty notes) render as separate, independently editable blocks — clicking into one edits just that section, so it's always clear what's being changed.
5. Below the sections, a read-only "Sprint snapshot" panel lists every story that was in the sprint at close time with its `status_at_close`, so the reviewer can check the AI's summary against the real data it was given.
6. Two actions at the bottom: "Save report" (`PUT /sprints/{id}/report` with the edited content) and "Discard draft" (leaves the report unsaved — the sprint stays Closed, and the draft can be regenerated later from the same page).
7. After saving, the sections switch to a read-only display with an "Edit report" control that reopens editing (saving again calls `PUT`).

**States & edge cases:**
- Draft generation fails outright (AI service error): the page shows an error state with a "Try again" button that re-calls the draft endpoint, instead of a blank or broken page.
- The sprint had no stories at all: the draft endpoint returns 422, and the page shows a plain "This sprint had no stories, so there's nothing to report" message — no editable sections, no invented content, just a way back to the board.
- The sprint had stories but none were completed: the Completed work section explicitly reads "No stories were completed this sprint" (per Section 8), styled so a reviewer can visually confirm this is a real statement, not a loading glitch.
- No blockers, or no faculty notes: each renders its own explicit placeholder sentence, styled distinctly (e.g. muted italic) so it reads as a stated absence rather than an unfinished field.
- Navigating away with unsaved edits: a confirm dialog ("You have unsaved changes to this report — leave anyway?") guards against silently losing edits, since there's no autosave.
- Revisiting a sprint whose report was already saved: the page loads straight into the read-only `final_content` view, skipping the draft step, with "Edit report" available.
- Trying to close an already-Closed sprint (double-click, stale page): the Close button is hidden once the page reflects Closed status; a stale request's 409 surfaces as a toast, not a crash.

## 5. Functional requirements
*CRISP-DM connection: Business Understanding → Modeling.*

| ID | Requirement | Priority | Related workflow | Acceptance evidence |
|---|---|---|---|---|
| FR-01 | The system must let a user create a project with a name and optional description. | Must | Create/view project | New project appears in the project list immediately and persists after reload. |
| FR-02 | The system must let a user create a user story within a project, with title, description, priority, and type; it starts in Backlog. | Must | Create/manage story | New story is visible in the Backlog column immediately after creation. |
| FR-03 | The system must let a user move a story to "Selected for Sprint," assigning it to the currently active sprint. | Must | Workflow 1 | Story appears on the active sprint board and disappears from the unassigned backlog view. |
| FR-04 | The system must let a user close a sprint, preserving its planned and completed story history while returning unfinished stories to Backlog. | Must | Workflow 2 | After closing, the sprint appears in sprint history with an accurate snapshot of every story's status at close time. |
| FR-05 | The system should generate an AI-drafted sprint report from a closed sprint's data, and require human review before it is saved as final. | Should | Workflow 2 | Draft is generated only from that sprint's own data; user can edit before saving; an empty-data sprint produces an honest "nothing completed" statement rather than fabricated content. |
| FR-06 | The system should let a user sort and color-code stories by priority and by type on the backlog and board. | Should | Workflow 1 | Changing sort order updates the displayed order without a reload; priority and type are visibly distinguished by color. |
| FR-07 | The system could let a user hide resolved (Done) stories from the active board view. | Could | Workflow 1 | Toggling "hide resolved" removes Done stories from view without deleting them. |
| FR-08 | The system should let a user open a story's ticket modal by clicking its card, showing full detail and its comment thread. | Should | Workflow 3 | A click opens the modal; a drag, however brief, never does. |
| FR-09 | The system should let a user comment on a story or a sprint, optionally @mentioning a project team member by name. | Should | Workflow 3 | Typing "@" opens an autocomplete of the project's team members; a selected mention renders as a highlighted tag once posted. |
| FR-10 | The system should maintain a lightweight, per-project list of named team members, with no login or authentication. | Should | Workflow 3 | A name added to a project appears in that project's @mention autocomplete and author picker immediately. |

**Workflow rules**
- Stories begin in Backlog.
- Moving a story to Selected for Sprint assigns it to the displayed (Active) sprint.
- The active board shows unassigned project backlog stories.
- Moving a story back to Backlog removes it from the active sprint while preserving closed-sprint history.
- Closing a sprint preserves its planned and completed story history.
- **Additional rules:**
  - A story can be linked to only one *open* sprint at a time; its associations with previously closed sprints remain as read-only history.
  - Only a project's own stories can be added to that project's sprints.
  - A story's priority and type can be edited at any time, regardless of status.
  - A closed sprint's story snapshot is read-only — it can be viewed but not edited.

## 6. Domain model
*CRISP-DM connection: Data Understanding → Modeling.*

**Entity: Project**
- **Purpose:** Top-level container scoping stories and sprints to one classmate team's workspace.
- **Fields:**
  - id — unique identifier
  - name — required, unique within the workspace
  - description — optional
- **Relationships:** Has many UserStory; has many Sprint.
- **Rules:** Name must be unique within the workspace. Deleting a project is out of MVP scope (archiving is deferred).

**Entity: UserStory**
- **Purpose:** The unit of work a team tracks from idea to done.
- **Fields:**
  - id — unique identifier
  - project_id — owning project
  - title — required
  - description — optional, free text
  - status — Backlog | Selected for Sprint | In Progress | Done
  - *(added for this app)* priority — Low | Medium | High
  - *(added for this app)* type — Feature | Bug | Chore
  - *(added for this app)* github_branch_ref — optional plain-text reference string, in scope for v1; only the live GitHub API call to actually open/create the branch is deferred (Section 3)
- **Relationships:** Belongs to Project; optionally linked to one open Sprint via SprintStory.
- **Rules:** Always starts in Backlog. A story with no sprint link is part of the project's unassigned backlog.

**Entity: Sprint**
- **Purpose:** A timeboxed grouping of stories a team commits to complete together.
- **Fields:**
  - id — unique identifier
  - project_id — owning project
  - goal — optional
  - status — Planned | Active | Closed
- **Relationships:** Belongs to Project; has many stories via SprintStory; has at most one SprintReport.
- **Rules:** Only one sprint per project can be Active at a time. Closing a sprint is irreversible in the MVP (no reopening).

**Entity: SprintStory (association)**
- **Purpose:** Records which stories were part of which sprint, and preserves each story's status at close time for history.
- **Fields:** id, sprint_id, story_id, status_at_close (written only when the sprint closes).
- **Relationships:** Belongs to Sprint; belongs to UserStory.
- **Rules:** Created when a story moves to "Selected for Sprint." Removed if the story is moved back to Backlog before the sprint closes. Becomes read-only history once the sprint closes.

**Entity: SprintReport**
- **Purpose:** Stores the AI-drafted, then human-reviewed, narrative summary of a closed sprint.
- **Fields:** id, sprint_id (one-to-one), draft_content, final_content, generated_at, reviewed_by (optional), reviewed_at.
- **Relationships:** Belongs to Sprint (one sprint has at most one report).
- **Rules:** draft_content is never shown to the rest of the team as final. A report can only be generated once its sprint is Closed.

**Entity: TeamMember**
- **Purpose:** A named person on a project who can be @mentioned and attributed as a comment author — lightweight, with no login or authentication.
- **Fields:** id, project_id, name (required, unique within the project).
- **Relationships:** Belongs to Project; referenced by Comment as author and as a mention.
- **Rules:** Added to a project as a simple name (e.g., during setup); picking "who you are" to comment is a local choice, not a sign-in. The @mention autocomplete for a project only offers that project's own members.

**Entity: Comment**
- **Purpose:** A threaded remark on a UserStory or a Sprint, optionally @mentioning other team members.
- **Fields:** id, parent_type (Story | Sprint), parent_id, author_id (TeamMember), body (text, may contain @mentions), mentioned_ids (TeamMember ids parsed from body), created_at.
- **Relationships:** Belongs to either a UserStory or a Sprint (one comment has exactly one parent); references TeamMember for authorship and for each mention.
- **Rules:** A mention only highlights the name in the rendered comment — it never triggers a notification. Comments are append-only in the MVP (no edit or delete). Text matching no known team member's name is left as plain, unhighlighted text.

**Domain questions to resolve**
- *What fields are required versus optional?* Project.name and UserStory.title/status are required; everything else (descriptions, dates, github_branch_ref) is optional in the MVP.
- *Which fields are computed?* Sprint.status transitions (Planned → Active → Closed) are derived from user actions, not directly editable. SprintStory.status_at_close is written once, at close time. Comment.mentioned_ids is computed by matching @tokens in body against the project's TeamMember names at post time.
- *Where is story status stored?* Directly on UserStory.status — the single source of truth for both the board and any reports, not derived from board column position.
- *Can a story belong to more than one sprint over time?* Yes, sequentially — if returned to Backlog and later re-selected into a different sprint — but only one SprintStory row can be open (unclosed) for a story at a time; closed rows remain as history.
- *What happens to unfinished stories when a sprint closes?* Their status_at_close is recorded for history, but the live UserStory.status resets to Backlog so they can be replanned.
- *Where is an AI-generated report draft saved?* In SprintReport.draft_content, kept separate from final_content, so an unreviewed draft is never mistaken for the approved report.
- *What happens to a TeamMember's past comments if they're removed from the project?* Out of MVP scope to even remove one (the member list is additive-only for now); if added later, past comments and mentions would remain as historical text regardless.

## 7. API contract
*CRISP-DM connection: Modeling. Backend implemented with FastAPI.*

**POST /projects**
- Purpose: Create a new project.
- Related requirement: FR-01
- Request body: `{"name": "string", "description": "string (optional)"}`
- Response body: `{"id": "uuid", "name": "string", "description": "string|null", "created_at": "iso8601"}`
- Validation rules: name required, 1–100 characters, unique within the workspace.
- Error cases: 400 if name is missing or too long; 409 if the name already exists.

**GET /projects/{project_id}/stories**
- Purpose: List a project's stories, filterable by status/sprint and sortable by priority or date.
- Related requirement: FR-02, FR-06
- Request: query params `status`, `sprint_id`, `sort=priority|created_at`, `hide_resolved=bool`
- Response body: `[{...story...}]`
- Validation rules: project_id must exist.
- Error cases: 404 if project not found.

**POST /projects/{project_id}/stories**
- Purpose: Create a user story in a project; it starts in Backlog.
- Related requirement: FR-02
- Request body: `{"title": "string", "description": "string (optional)", "priority": "Low|Medium|High", "type": "Feature|Bug|Chore"}`
- Response body: `{...story, "status": "Backlog"...}`
- Validation rules: title required; priority and type must be valid enum values.
- Error cases: 400 invalid field; 404 project not found.

**PATCH /stories/{story_id}**
- Purpose: Update story fields, or move it to a new status.
- Related requirement: FR-03; workflow rules
- Request body: `{"status": "string (optional)", "title": "string (optional)", "priority": "string (optional)", ...}`
- Response body: `{...updated story...}`
- Validation rules: status must be a legal enum value; moving to "Selected for Sprint" requires an Active sprint to exist for the project.
- Error cases: 400 invalid status; 404 story not found; 409 no active sprint to assign to.

**POST /projects/{project_id}/sprints**
- Purpose: Create a new sprint (starts Planned).
- Related requirement: FR-04
- Request body: `{"goal": "string (optional)"}`
- Response body: `{...sprint, "status": "Planned"...}`
- Validation rules: only one Planned or Active sprint allowed per project at a time.
- Error cases: 409 if a Planned or Active sprint already exists for the project.

**GET /projects/{project_id}/sprints**
- Purpose: List a project's sprints — Planned, Active, and Closed — for sprint history.
- Related requirement: FR-04; Section 1 success criteria
- Response body: `[{...sprint (without stories)...}]`
- Validation rules: project_id must exist.
- Error cases: 404 if project not found.

**GET /sprints/{sprint_id}**
- Purpose: Fetch a single sprint, including its current story list (open sprints) or its preserved snapshot (closed sprints) — the read path that makes sprint history actually retrievable, and that the Sprint Report page uses to reload a closed sprint's data.
- Related requirement: FR-04; Section 1 success criteria
- Response body: `{...sprint, "stories" or "stories_snapshot": [...]}`
- Error cases: 404 if sprint not found.

**POST /sprints/{sprint_id}/activate**
- Purpose: Transition a Planned sprint to Active — the sprint stories get assigned to.
- Related requirement: FR-03
- Response body: `{...sprint, "status": "Active"...}`
- Error cases: 409 if the sprint isn't Planned, or another sprint is already Active for the project.

**POST /sprints/{sprint_id}/close**
- Purpose: Close an Active sprint — snapshot story statuses, return unfinished stories to Backlog, preserve history.
- Related requirement: FR-04
- Response body: `{...sprint, "status": "Closed", "stories_snapshot": [...]}`
- Validation rules: sprint must currently be Active.
- Error cases: 409 sprint already closed; 404 sprint not found.

**POST /sprints/{sprint_id}/report/draft**
- Purpose: Generate an AI-drafted sprint report from the sprint's story snapshot.
- Related requirement: FR-05; Section 8
- Request body: `{}` (uses the sprint's own stored data)
- Response body: `{"draft_content": "string", "generated_at": "iso8601"}`
- Validation rules: sprint must be Closed before a report can be drafted.
- Error cases: 409 sprint not yet closed; 422 sprint has no stories at all (returns a clear message instead of an empty draft).

**PUT /sprints/{sprint_id}/report**
- Purpose: Save the human-reviewed final report.
- Related requirement: FR-05; Section 8 human review
- Request body: `{"final_content": "string", "reviewed_by": "string (optional)"}`
- Response body: `{...SprintReport with final_content...}`
- Validation rules: final_content required and non-empty.
- Error cases: 404 if no draft exists yet to finalize.

**GET /sprints/{sprint_id}/report**
- Purpose: Fetch the saved report (draft and/or final).
- Response body: `{...SprintReport...}`

**POST /projects/{project_id}/members**
- Purpose: Add a named team member to a project's mention/authorship list.
- Related requirement: FR-10
- Request body: `{"name": "string"}`
- Response body: `{"id": "uuid", "name": "string"}`
- Validation rules: name required; unique within the project, case-insensitive.
- Error cases: 409 if the name already exists in the project.

**GET /projects/{project_id}/members**
- Purpose: List a project's team members, for the @mention autocomplete and comment author picker.
- Response body: `[{"id": "uuid", "name": "string"}]`

**POST /stories/{story_id}/comments**
- Purpose: Add a comment to a story.
- Related requirement: FR-08, FR-09
- Request body: `{"author_id": "uuid", "body": "string"}`
- Response body: `{"id": "uuid", "author_id": "uuid", "body": "string", "mentioned_ids": ["uuid"], "created_at": "iso8601"}`
- Validation rules: author_id must be a team member of the story's project; body required and non-empty; @mentions in body are matched against the project's member list at post time (an unmatched @token is left as plain text).
- Error cases: 400 empty body; 404 story or author not found.

**GET /stories/{story_id}/comments**
- Purpose: List a story's comment thread in chronological order.
- Response body: `[{...comment...}]`

**POST /sprints/{sprint_id}/comments** and **GET /sprints/{sprint_id}/comments**
- Purpose: Same shape and rules as the story comment endpoints above, scoped to the sprint's project members, for the Sprint Report page's comment thread.
- Related requirement: FR-09

**Endpoint checklist**
- [x] Project endpoints
- [x] User story endpoints
- [x] Sprint endpoints (including sprint history: list + single-sprint fetch)
- [x] Sprint planning and closing endpoints
- [x] Board transition behavior
- [x] AI sprint-report draft endpoint
- [x] Team member endpoints
- [x] Comment endpoints (stories and sprints)

## 8. AI sprint-report behavior
*CRISP-DM connection: Modeling → Evaluation.*

**Inputs provided to the model:** the closed sprint's goal; its list of stories with title, description, priority, type, and status_at_close (Done vs. not-Done); and any free-text notes or blockers already captured in story descriptions. Nothing outside that sprint's own snapshot is provided, so the model can't pull in unrelated sprints or projects.

**Output sections:**
- Sprint goal
- Completed work
- Next sprint goals
- Blockers
- Faculty notes

**Missing or incomplete information**
- No blockers were recorded → the report states "No blockers were recorded for this sprint" instead of inventing one.
- No faculty notes exist → the section reads "No faculty notes recorded," clearly labeled, not fabricated.
- A story has incomplete data (e.g., no description) → the report uses only its title and status; it doesn't guess at what the work involved.
- No stories were completed → the report explicitly says so ("No stories were completed this sprint") rather than omitting the section or writing a vague success statement.

**Human review:** Every draft lands in `SprintReport.draft_content` and is shown to the team lead in an editable text area before it's treated as final. Nothing is shared with the rest of the team, exported, or referenced by a future sprint's report until a human explicitly saves it via `PUT /sprints/{id}/report`, which writes `final_content`. The system never auto-saves an AI draft as final.

**AI failure cases to check**
- [x] Invented work or unsupported claims
- [x] Missing completed or incomplete work
- [x] Wrong sprint or project context
- [x] Unhelpful output when information is missing

## 9. Non-functional and platform requirements
*CRISP-DM connection: Modeling → Deployment.*

- [x] FastAPI backend
- [x] Persistent data storage — SQLite for the course MVP, structured so it can move to Postgres later
- [x] Containerized local execution — Docker Compose for backend + database
- [x] Environment-based configuration — `.env` for the database URL and AI API key
- [x] Automated tests — pytest covering the API and the domain rules in Section 5/6
- [x] Health endpoint — `GET /health`
- [x] Version information — `GET /version`
- [x] Structured logging — JSON logs to stdout
- [x] Engineering documentation — a README plus this document
- [x] Course platform AI integration through the approved abstraction — used by the Section 8 report-draft endpoint
- [x] Authentication decision: no login in the MVP — a single shared workspace, matching the "open access" decision in Section 2. Revisit if the app ever needs to support multiple isolated teams.

**Additional requirements or constraints:** single-team deployment for the MVP (no multi-tenant workspace isolation); frontend framework choice is out of this document's scope, which focuses on the backend contract.

## 10. Risks, assumptions, and open questions
*CRISP-DM connection: Business Understanding → Evaluation.*

| Type | Statement | Impact | Next action or owner |
|---|---|---|---|
| Assumption | Classmates will use one shared project workspace rather than needing isolated per-team accounts. | If wrong, the MVP needs multi-tenant auth added later — a significant rework. | Confirm with the team/instructor before Class 5. |
| Risk | An AI-drafted sprint report could state completed work that wasn't actually verified (hallucination). | Misleads teammates or the instructor about real progress. | Constrain the prompt to the sprint's own story data only (Section 8) and require human review before saving; covered in the validation plan. |
| Risk | Without permission schemes, any team member can edit or delete any story, including another's in-progress work. | Accidental overwrites or data loss during a live sprint. | Accept for the MVP (small, trusted classmate teams); revisit if conflicts are reported. |
| Open question | Should a story ever join a sprint automatically (e.g., by due date), or only by explicit user action? | Affects the Sprint/UserStory relationship and the PATCH /stories behavior. | Resolve before implementing FR-03; default to explicit-only unless told otherwise. |
| Risk | Distinguishing a click (open ticket modal) from a drag (move card) on the same gesture can misfire — a slow click could register as a drag, or a fast short drag could pop the modal open mid-move. | Confusing or broken-feeling board interaction; erodes trust in the "one page" experience the product is built around. | Tune the click-vs-drag movement/time threshold during implementation and cover both paths in the validation plan (Section 11). |
| Risk | An @mention only highlights a name — it sends no notification — so a mentioned teammate who isn't already looking at the board or thread can miss it entirely. | Undercuts the stated purpose of "calling" someone by name; a real blocker or question could go unseen. | Accepted tradeoff for MVP (see ADR-004); revisit with a real notification channel if teams report missed mentions. |
| Risk | The AI sprint-report draft endpoint depends on "the course platform's approved AI abstraction," with no stated limit on how many times a draft can be regenerated. | Possible latency, rate-limiting, or cost surprises if a team regenerates a draft repeatedly. | Open question below; confirm the platform's rate/cost behavior before relying on unlimited regeneration. |
| Open question | Should there be a limit on how many times a sprint's AI report draft can be regenerated (`POST /sprints/{id}/report/draft`), given possible cost or rate limits on the course's AI platform? | Affects that endpoint's implementation and the "Discard draft" / "Try again" interactions in Section 4. | Confirm the course platform's AI-abstraction limits before implementation; default to unlimited unless told otherwise. |

## 11. Initial validation plan
*CRISP-DM connection: Evaluation.*

| Requirement or workflow | Test or evidence | Expected result |
|---|---|---|
| FR-01 (create project) | POST /projects with a valid name, then GET /projects | New project appears in the list with a matching name. |
| FR-03 (assign to sprint) | PATCH a story's status to "Selected for Sprint" while no sprint is Active | 409 error returned; story remains in Backlog. |
| FR-04 (close sprint) | Create a sprint, add 3 stories (2 Done, 1 In Progress), close the sprint, then fetch sprint history | Closed sprint shows all 3 stories with correct status_at_close; the unfinished story's live status is back in Backlog. |
| FR-05 (AI report, empty sprint) | Close a sprint with zero stories, call the report-draft endpoint | 422 error with a clear message; no fabricated report text is generated. |
| FR-05 (AI report, no completed work) | Close a sprint where every story is still "In Progress," then generate a draft | Draft explicitly states no stories were completed; it invents nothing. |
| FR-04 (sprint history retrieval) | Close a sprint, then call `GET /projects/{id}/sprints` and `GET /sprints/{id}` | The closed sprint appears in the list and its single-sprint fetch returns the same story snapshot recorded at close. |
| FR-08 (ticket modal open vs. drag) | Simulate a click with near-zero movement on a card, then simulate a press-drag-release of the same card | The click opens the ticket modal; the drag moves the card and never opens the modal. |
| FR-09 (mention matching) | Post a comment containing "@" followed by an existing team member's exact name, then a second comment with "@" followed by text matching nobody | The first mention appears in the response's `mentioned_ids` and renders highlighted; the second is returned as plain text with an empty `mentioned_ids`. |
| FR-10 (team member list) | POST a new member name to a project, then GET that project's members | The new name appears in the list immediately and is available to the @mention autocomplete. |

**First implementation slice:** FR-01 + FR-02 — creating a project and adding a user story to its Backlog, end to end (API, persistence, and a minimal single-page UI).

**Why this slice:** It's the smallest vertical slice that touches every architectural layer without needing sprint logic or AI integration yet, so it validates the FastAPI + storage + one-page UI foundation before the sprint and reporting features are built on top of it.

## 12. Decision log
*CRISP-DM connection: Improve.*

| ID | Decision | Alternatives | Reason | Consequence |
|---|---|---|---|---|
| ADR-001 | Model Sprint as its own entity rather than a field on UserStory. | A field on each story (GitHub Iteration-style) vs. a dedicated Sprint entity (Jira-style). | Only a dedicated entity can express a Planned → Active → Closed lifecycle and preserve history after closing, as required by Sections 3, 4, and 6. | Adds one more table and endpoint set, but keeps sprint-close history correct. |
| ADR-002 | Use a single UserStory type instead of Jira's Epic/Story/Bug/Sub-task hierarchy. | A multi-type hierarchy vs. one flat type with a `type` field. | Matches the "one page, less tabs" simplicity goal; classmates don't need Jira's structural depth. | Loses fine-grained parent/child (Epic → Story) relationships — acceptable at this scale. |
| ADR-003 | AI sprint reports are drafted from sprint snapshot data only, and always require human review before saving. | Auto-publish the AI draft vs. a mandatory human-review step. | Directly addresses the hallucination/invented-work risk identified in Sections 8 and 10. | Adds one manual review-and-save step before a report is usable, but sharply reduces the risk of shipping fabricated content. |
| ADR-004 | Comments use a lightweight, per-project named TeamMember list instead of real login, and @mentions only highlight the name — no notifications are sent. | Full authentication plus email/push mention alerts vs. no attribution at all vs. a lightweight named list with highlight-only mentions. | Lightweight named list, highlight-only mentions. | Keeps the "no login" simplicity decision from Section 2 while still allowing comment attribution and @mention call-outs; real notifications would need email/contact infrastructure the classmate MVP doesn't otherwise need. | A highlighted mention doesn't reliably alert anyone who isn't already looking at the board or thread — an accepted tradeoff for MVP, revisit if teams report missing call-outs. |
| ADR-005 | Reprioritize the ticket modal, comments, @mentions, and team member list (FR-08–FR-10) from Must to Should. | Leave them as Must, matching how they were originally specced vs. downgrade to Should vs. cut them from MVP scope entirely. | Downgrade to Should; keep them in scope. | A self-review found the board and sprint lifecycle (FR-01–FR-04) are fully usable without collaboration features, and the "First implementation slice" (Section 11) already excludes them — marking them Must overstated how blocking they are relative to the product's core "one page, less tabs" vision. | The first implementation slice and MVP no longer imply comments must ship before the core board does; if a team runs short on time, cutting FR-08–FR-10 no longer means missing a "Must." |
| ADR-006 | Add the missing sprint-history read endpoints (`GET /projects/{id}/sprints`, `GET /sprints/{id}`), fix the `github_branch_ref` field's scope wording, and add a Workflow 3 write-up for comments/mentions. | Leave the gaps as-is vs. fix them now. | Fix now, before implementation starts. | A self-review found Section 1's own success criterion ("sprint history is retrievable") had no supporting endpoint, the domain model contradicted Section 3's stated scope for the branch-reference field, and comments/mentions had interaction detail but no formal workflow entry like Workflows 1 and 2 — all three would have caused confusion or rework once implementation began. | Section 7 (API), Section 4 (workflows), and Section 6 (domain model) are now internally consistent with Sections 1 and 3; Section 11's validation plan was extended to cover the new endpoints and FR-08–FR-10. |
