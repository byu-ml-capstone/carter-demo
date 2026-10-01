import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from './api'
import { AccountBar, useSession } from './session'
import { TicketModal } from './TicketModal'
import { toast } from './toast'
import type {
  Comment,
  Member,
  Priority,
  Project,
  SortMode,
  Sprint,
  Status,
  Story,
  StoryType,
} from './types'
import { PRIORITIES, STATUSES, STORY_TYPES } from './types'
import {
  BranchIcon,
  formatDate,
  PriorityBadge,
  priorityRank,
  sprintLabel,
  TypeIcon,
} from './ui'

const NO_ACTIVE =
  'No active sprint — create or activate one before adding stories.'
const ALREADY = 'This story was already moved.'

export function WorkspacePage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useSession()
  const [project, setProject] = useState<Project | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [activeStories, setActiveStories] = useState<Story[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('created_at')
  const [hideResolved, setHideResolved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [teamOpen, setTeamOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [facultyNotes, setFacultyNotes] = useState('')
  const [closing, setClosing] = useState(false)
  const [goal, setGoal] = useState('')
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('Medium')
  const [storyType, setStoryType] = useState<StoryType>('Feature')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [hoverStatus, setHoverStatus] = useState<Status | null>(null)
  const [inflight, setInflight] = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const active = sprints.find((sprint) => sprint.status === 'Active') ?? null
  const planned = sprints.find((sprint) => sprint.status === 'Planned') ?? null
  const closed = sprints.filter((sprint) => sprint.status === 'Closed')

  const load = useCallback(async () => {
    try {
      const [nextProject, nextStories, nextSprints, nextMembers] =
        await Promise.all([
          api<Project>(`/projects/${projectId}`),
          api<Story[]>(`/projects/${projectId}/stories`),
          api<Sprint[]>(`/projects/${projectId}/sprints`),
          api<Member[]>(`/projects/${projectId}/members`),
        ])
      const nextActive = nextSprints.find(
        (sprint) => sprint.status === 'Active',
      )
      const detail = nextActive
        ? await api<Sprint>(`/sprints/${nextActive.id}`)
        : null
      setProject(nextProject)
      setStories(nextStories)
      setSprints(nextSprints)
      setActiveStories(detail?.stories ?? [])
      setMembers(nextMembers)
      setFailed(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      void load()
    }
    const timer = window.setInterval(tick, 10000)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', tick)
    }
  }, [load])

  useEffect(() => {
    if (!openId) return
    let cancelled = false
    void api<Comment[]>(`/stories/${openId}/comments`)
      .then((rows) => {
        if (!cancelled) setComments(rows)
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) return
      })
    return () => {
      cancelled = true
    }
  }, [openId, stories])

  const activeIds = useMemo(() => {
    const ids = new Set(activeStories.map((story) => story.id))
    if (active) {
      stories.forEach((story) => {
        if (story.open_sprint_id === active.id) ids.add(story.id)
      })
    }
    return ids
  }, [active, activeStories, stories])

  function columnStories(status: Status) {
    const rows =
      status === 'Backlog'
        ? stories.filter((story) => story.status === 'Backlog')
        : stories.filter(
            (story) => activeIds.has(story.id) && story.status === status,
          )
    return sortStories(rows, sortMode)
  }

  const openStory = stories.find((story) => story.id === openId) ?? null

  async function moveStory(story: Story, status: Status) {
    if (story.status === status) return
    const previous = stories
    const previousActive = activeStories
    setInflight(story.id)
    setStories((current) =>
      current.map((item) =>
        item.id === story.id
          ? {
              ...item,
              status,
              open_sprint_id:
                status === 'Backlog'
                  ? null
                  : (active?.id ?? item.open_sprint_id),
            }
          : item,
      ),
    )
    if (active) {
      setActiveStories((current) => {
        const without = current.filter((item) => item.id !== story.id)
        if (status === 'Backlog') return without
        return [...without, { ...story, status, open_sprint_id: active.id }]
      })
    }
    try {
      const updated = await api<Story>(`/stories/${story.id}`, {
        method: 'PATCH',
        body: { status, expected_status: story.status },
      })
      setStories((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (error) {
      setStories(previous)
      setActiveStories(previousActive)
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 409) {
        if (
          error.detail === NO_ACTIVE ||
          error.detail.toLowerCase().includes('no active sprint')
        ) {
          toast(NO_ACTIVE)
        } else if (
          error.detail === ALREADY ||
          error.detail.toLowerCase().includes('already moved')
        ) {
          toast('This story was already moved — refreshing board.')
          void load()
        } else {
          toast("Couldn't move that story — try again.")
        }
      } else {
        toast("Couldn't move that story — try again.")
      }
    } finally {
      setInflight(null)
    }
  }

  function dropOn(storyId: string, clientX: number, clientY: number) {
    const story = stories.find((item) => item.id === storyId)
    setDraggingId(null)
    setHoverStatus(null)
    if (!story) return
    const element = document.elementFromPoint(clientX, clientY)
    const column = element?.closest<HTMLElement>('[data-column]')
    const status = column?.dataset.column as Status | undefined
    if (!status || status === story.status) return
    void moveStory(story, status)
  }

  async function addStory(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    try {
      const created = await api<Story>(`/projects/${projectId}/stories`, {
        method: 'POST',
        body: {
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          type: storyType,
        },
      })
      setStories((current) => [...current, created])
      setTitle('')
      setDescription('')
      setPriority('Medium')
      setStoryType('Feature')
      setAdding(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast("Couldn't save that — try again.")
    }
  }

  async function planSprint(event: FormEvent) {
    event.preventDefault()
    try {
      const created = await api<Sprint>(`/projects/${projectId}/sprints`, {
        method: 'POST',
        body: { goal: goal.trim() || undefined },
      })
      setSprints((current) => [...current, created])
      setGoal('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 409) {
        toast('A sprint is already planned or active.')
      } else {
        toast("Couldn't save that — try again.")
      }
    }
  }

  async function activate() {
    if (!planned) return
    try {
      const updated = await api<Sprint>(`/sprints/${planned.id}/activate`, {
        method: 'POST',
      })
      setSprints((current) =>
        current.map((sprint) =>
          sprint.id === updated.id ? { ...sprint, ...updated } : sprint,
        ),
      )
      await load()
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast("Couldn't save that — try again.")
    }
  }

  async function closeSprint() {
    if (!active) return
    setClosing(true)
    try {
      await api(`/sprints/${active.id}/close`, {
        method: 'POST',
        body: { faculty_notes: facultyNotes.trim() },
      })
      navigate(`/sprints/${active.id}/report`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 409)
        toast('This sprint is already closed.')
      else toast("Couldn't save that — try again.")
      setClosing(false)
    }
  }

  if (loading) return <main className="page">Loading project…</main>
  if (failed || !project) {
    return (
      <main className="page">
        <p>Couldn't load this project.</p>
        <button type="button" onClick={() => void load()}>
          Try again
        </button>
      </main>
    )
  }

  const sprintColumnsBlocked = !active

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <Link to="/">Projects</Link>
          <h1>{project.name}</h1>
          {project.description ? (
            <p className="muted">{project.description}</p>
          ) : null}
        </div>
        <div className="header-actions">
          <button type="button" onClick={() => setTeamOpen(true)}>
            Team
          </button>
          <AccountBar />
        </div>
      </header>
      <div className="toolbar">
        <div className="sort" role="group" aria-label="Sort">
          <button
            type="button"
            aria-pressed={sortMode === 'priority'}
            onClick={() => setSortMode('priority')}
          >
            Priority
          </button>
          <button
            type="button"
            aria-pressed={sortMode === 'created_at'}
            onClick={() => setSortMode('created_at')}
          >
            Date created
          </button>
        </div>
        <label className="hide-toggle">
          <input
            type="checkbox"
            checked={hideResolved}
            onChange={(event) => setHideResolved(event.target.checked)}
          />
          Hide resolved
        </label>
        <div className="sprint-slot">
          {active ? (
            <>
              <span>{sprintLabel('Active', active.goal)}</span>
              {!confirmClose ? (
                <button type="button" onClick={() => setConfirmClose(true)}>
                  Close sprint
                </button>
              ) : (
                <div className="confirm">
                  <p>
                    Close this sprint? Unfinished stories will return to
                    Backlog.
                  </p>
                  <label>
                    Faculty notes
                    <textarea
                      value={facultyNotes}
                      placeholder="Optional"
                      onChange={(event) => setFacultyNotes(event.target.value)}
                    />
                  </label>
                  <div className="row">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmClose(false)
                        setFacultyNotes('')
                      }}
                      disabled={closing}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void closeSprint()}
                      disabled={closing}
                    >
                      {closing ? 'Closing…' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
          {!active && planned ? (
            <>
              <span>{sprintLabel('Planned', planned.goal)}</span>
              <button type="button" onClick={() => void activate()}>
                Activate
              </button>
            </>
          ) : null}
          {!active && !planned ? (
            <form className="row" onSubmit={(event) => void planSprint(event)}>
              <input
                value={goal}
                placeholder="Sprint goal"
                aria-label="Sprint goal"
                onChange={(event) => setGoal(event.target.value)}
              />
              <button type="submit">Plan sprint</button>
            </form>
          ) : null}
        </div>
        <button type="button" onClick={() => setHistoryOpen((open) => !open)}>
          History
        </button>
      </div>
      {historyOpen ? (
        <div className="history">
          {closed.length === 0 ? <p>No closed sprints yet.</p> : null}
          <ul>
            {closed.map((sprint) => (
              <li key={sprint.id}>
                <Link to={`/sprints/${sprint.id}/report`}>
                  {sprintLabel('Closed', sprint.goal)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="board">
        {STATUSES.map((status) => {
          const rows = columnStories(status)
          const visible = hideResolved && status === 'Done' ? [] : rows
          const hiddenCount =
            hideResolved && status === 'Done' ? rows.length : 0
          const legalTarget = status === 'Backlog' || !sprintColumnsBlocked
          const highlighted =
            draggingId !== null && hoverStatus === status && legalTarget
          const dragged = stories.find((story) => story.id === draggingId)
          const slot =
            dragged && highlighted && dragged.status !== status
              ? sortStories(
                  [...rows, { ...dragged, status }],
                  sortMode,
                ).findIndex((story) => story.id === dragged.id)
              : -1
          return (
            <section
              key={status}
              className={highlighted ? 'column target' : 'column'}
              data-column={status}
              onPointerMove={() => {
                if (draggingId) setHoverStatus(status)
              }}
            >
              <header>
                <h2>{status}</h2>
                {status === 'Backlog' ? (
                  <button type="button" onClick={() => setAdding(true)}>
                    Add story
                  </button>
                ) : null}
              </header>
              {status !== 'Backlog' && sprintColumnsBlocked ? (
                <p className="banner">
                  {planned
                    ? 'No active sprint — activate it to start moving stories here.'
                    : 'No active sprint — plan one to start moving stories here.'}
                </p>
              ) : null}
              {status === 'Backlog' && adding ? (
                <form
                  className="add-story"
                  onSubmit={(event) => void addStory(event)}
                >
                  <input
                    value={title}
                    placeholder="Title"
                    aria-label="Title"
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <textarea
                    value={description}
                    placeholder="Description"
                    aria-label="Description"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                  <label>
                    Priority
                    <select
                      value={priority}
                      onChange={(event) =>
                        setPriority(event.target.value as Priority)
                      }
                    >
                      {PRIORITIES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Type
                    <select
                      value={storyType}
                      onChange={(event) =>
                        setStoryType(event.target.value as StoryType)
                      }
                    >
                      {STORY_TYPES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={!title.trim()}>
                    Add story
                  </button>
                </form>
              ) : null}
              {visible.length === 0 &&
              hiddenCount === 0 &&
              !(status === 'Backlog' && adding) ? (
                status === 'Backlog' ? (
                  <p className="empty">
                    No stories yet — add one
                    <button type="button" onClick={() => setAdding(true)}>
                      Add story
                    </button>
                  </p>
                ) : (
                  <p className="empty">No stories yet.</p>
                )
              ) : null}
              {hiddenCount > 0 && visible.length === 0 ? (
                <p className="empty">
                  Resolved stories are hidden. Turn off Hide resolved to see
                  them.
                </p>
              ) : null}
              {visible.map((story, index) => (
                <div key={story.id}>
                  {slot === index ? <div className="insert-line" /> : null}
                  <StoryCard
                    story={story}
                    dragging={draggingId === story.id}
                    inflight={inflight === story.id}
                    menuOpen={menuFor === story.id}
                    onOpen={() => {
                      setMenuFor(null)
                      setOpenId(story.id)
                    }}
                    onDragStart={() => setDraggingId(story.id)}
                    onDragEnd={(x, y) => dropOn(story.id, x, y)}
                    onToggleMenu={() =>
                      setMenuFor((current) =>
                        current === story.id ? null : story.id,
                      )
                    }
                    onMove={(status) => {
                      setMenuFor(null)
                      void moveStory(story, status)
                    }}
                  />
                </div>
              ))}
              {slot === visible.length && slot >= 0 ? (
                <div className="insert-line" />
              ) : null}
            </section>
          )
        })}
      </div>
      {openStory ? (
        <TicketModal
          story={openStory}
          members={members}
          comments={comments}
          email={session?.user.email ?? ''}
          draft={drafts[openStory.id] ?? ''}
          onDraft={(value) =>
            setDrafts((current) => ({ ...current, [openStory.id]: value }))
          }
          onPosted={(comment) =>
            setComments((current) => [...current, comment])
          }
          onOpenTeam={() => setTeamOpen(true)}
          onClose={() => setOpenId(null)}
          onStory={(updated) =>
            setStories((current) =>
              current.map((story) =>
                story.id === updated.id ? updated : story,
              ),
            )
          }
          onMove={(story, status) => void moveStory(story, status)}
        />
      ) : null}
      {teamOpen ? (
        <TeamDialog
          projectId={projectId}
          members={members}
          onClose={() => setTeamOpen(false)}
          onCreated={(member) => setMembers((current) => [...current, member])}
        />
      ) : null}
    </main>
  )
}

function sortStories(rows: Story[], mode: SortMode) {
  return [...rows].sort((a, b) => {
    if (mode === 'priority') {
      const rank = priorityRank(a.priority) - priorityRank(b.priority)
      if (rank !== 0) return rank
    }
    return Date.parse(a.created_at) - Date.parse(b.created_at)
  })
}

function StoryCard({
  story,
  dragging,
  inflight,
  menuOpen,
  onOpen,
  onDragStart,
  onDragEnd,
  onToggleMenu,
  onMove,
}: {
  story: Story
  dragging: boolean
  inflight: boolean
  menuOpen: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: (x: number, y: number) => void
  onToggleMenu: () => void
  onMove: (status: Status) => void
}) {
  function pointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    function move(pointer: globalThis.PointerEvent) {
      if (
        !moved &&
        Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 6
      ) {
        moved = true
        onDragStart()
      }
    }
    function up(pointer: globalThis.PointerEvent) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (moved) onDragEnd(pointer.clientX, pointer.clientY)
      else onOpen()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <article
      className={`card${dragging ? ' lifting' : ''}${inflight ? ' inflight' : ''}`}
      onPointerDown={pointerDown}
    >
      {dragging ? <div className="placeholder" /> : null}
      <div className="card-top">
        <h3>{story.title}</h3>
        <button
          type="button"
          data-no-drag
          aria-label="Move story"
          onClick={onToggleMenu}
        >
          …
        </button>
      </div>
      {menuOpen ? (
        <ul className="move-menu" data-no-drag>
          {STATUSES.map((status) => (
            <li key={status}>
              <button
                type="button"
                disabled={status === story.status}
                onClick={() => onMove(status)}
              >
                Move to: {status}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="card-meta">
        <PriorityBadge priority={story.priority} />
        <TypeIcon type={story.type} />
        <time className="created" dateTime={story.created_at}>
          {formatDate(story.created_at)}
        </time>
      </div>
      {story.github_branch_ref ? (
        <p className="branch" title={story.github_branch_ref}>
          <BranchIcon />
          <span>{story.github_branch_ref}</span>
        </p>
      ) : null}
    </article>
  )
}

export function TeamDialog({
  projectId,
  members,
  onClose,
  onCreated,
}: {
  projectId: string
  members: Member[]
  onClose: () => void
  onCreated: (member: Member) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    try {
      const created = await api<Member>(`/projects/${projectId}/members`, {
        method: 'POST',
        body: { name: name.trim() },
      })
      onCreated(created)
      setName('')
      setError('')
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError('That name is already on this project.')
      } else if (!(caught instanceof ApiError) || caught.status !== 401) {
        setError("Couldn't save that — try again.")
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="team"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className="ticket-header">
        <h2>Team</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <ul>
        {members.map((member) => (
          <li key={member.id}>{member.name}</li>
        ))}
      </ul>
      <form onSubmit={(event) => void add(event)}>
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <button type="submit" disabled={!name.trim()}>
          Add teammate
        </button>
      </form>
    </dialog>
  )
}
