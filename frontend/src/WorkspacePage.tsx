import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, ApiError } from './api'
import { useSession } from './session'
import { StoryCard } from './StoryCard'
import { TeamDialog } from './TeamDialog'
import { TicketModal } from './TicketModal'
import { toast } from './toast'
import {
  ALREADY_MOVED,
  PRIORITIES,
  SPRINT_ALREADY_OPEN,
  STATUSES,
  STORY_TYPES,
  type Comment,
  type Member,
  type Priority,
  type Project,
  type SortMode,
  type Sprint,
  type Status,
  type Story,
  type StoryType,
} from './types'
import { priorityRank, sprintLabel } from './ui'

const NO_ACTIVE =
  'No active sprint — create or activate one before adding stories.'

export function WorkspacePage() {
  const { projectId = '' } = useParams()
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
      status === 'Backlog' || !active
        ? stories.filter((story) => story.status === status)
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
      const noSprint =
        error instanceof ApiError &&
        error.status === 409 &&
        (error.detail === NO_ACTIVE ||
          error.detail.toLowerCase().includes('no active sprint'))
      if (!noSprint) {
        setStories(previous)
        setActiveStories(previousActive)
      }
      if (error instanceof ApiError && error.status === 401) return
      if (noSprint) return
      if (error instanceof ApiError && error.status === 409) {
        if (
          error.detail === ALREADY_MOVED ||
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
        toast(error.detail || SPRINT_ALREADY_OPEN)
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
      setConfirmClose(false)
      setFacultyNotes('')
      await load()
      setClosing(false)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 409)
        toast('This sprint is already closed.')
      else toast("Couldn't save that — try again.")
      setClosing(false)
    }
  }

  // Telemetry derivations
  const sprintStories =
    activeStories.length > 0
      ? activeStories
      : stories.filter((s) => active && s.open_sprint_id === active.id)
  const doneCount = sprintStories.filter((s) => s.status === 'Done').length
  const totalCount = sprintStories.length

  if (loading) {
    return (
      <main
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 4rem)',
          background: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: '24px' }}
        >
          sync
        </span>
        <span style={{ fontSize: '0.875rem' }}>Loading project…</span>
      </main>
    )
  }

  if (failed || !project) {
    return (
      <main
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 4rem)',
          background: 'var(--color-surface)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '40px', color: 'var(--color-error)' }}
        >
          error
        </span>
        <p
          style={{
            margin: 0,
            fontSize: '0.875rem',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          Couldn&apos;t load this project.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            height: '2.5rem',
            padding: '0 1.25rem',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: '0.75rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </main>
    )
  }

  return (
    <main
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 4rem)',
        background: active
          ? 'var(--color-surface-container)'
          : 'var(--color-surface)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          maxWidth: '1600px',
          width: '100%',
          margin: '0 auto',
          padding: 'var(--spacing-space-lg) var(--spacing-margin)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-space-lg)',
          flex: 1,
        }}
      >
        {/* Breadcrumb + Header */}
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <nav
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '14px', color: 'var(--color-outline)' }}
            >
              folder
            </span>
            <Link
              to="/"
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface-variant)',
                textDecoration: 'none',
              }}
            >
              Projects
            </Link>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-outline-variant)',
              }}
            >
              /
            </span>
            <span
              style={{
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface)',
                fontWeight: 500,
              }}
            >
              {project.name}
            </span>
            {active && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.125rem 0.5rem',
                  background: 'var(--color-secondary-fixed)',
                  color: 'var(--color-on-secondary-fixed)',
                  borderRadius: '9999px',
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                  marginLeft: '0.5rem',
                }}
              >
                <span
                  style={{
                    width: '0.375rem',
                    height: '0.375rem',
                    borderRadius: '9999px',
                    background: 'var(--color-secondary)',
                    display: 'inline-block',
                  }}
                />
                Active Sprint
              </span>
            )}
          </nav>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
              }}
            >
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  lineHeight: '2rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-on-surface)',
                }}
              >
                {project.name}
              </h1>
              {project.description ? (
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  {project.description}
                </p>
              ) : null}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setTeamOpen(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  height: '2.25rem',
                  padding: '0 0.875rem',
                  background: 'var(--color-surface-container-lowest)',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface)',
                  cursor: 'pointer',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: '16px' }}
                >
                  group
                </span>
                Team
              </button>
            </div>
          </div>
        </div>

        {/* Controls toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          {/* Sort segmented pill */}
          <div
            role="group"
            aria-label="Sort"
            style={{
              display: 'flex',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              padding: '0.25rem',
              gap: '0.25rem',
            }}
          >
            {(['priority', 'created_at'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={sortMode === mode}
                onClick={() => setSortMode(mode)}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background:
                    sortMode === mode
                      ? 'var(--color-surface-container-lowest)'
                      : 'transparent',
                  color:
                    sortMode === mode
                      ? 'var(--color-primary)'
                      : 'var(--color-on-surface-variant)',
                  fontWeight: sortMode === mode ? 600 : 400,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  boxShadow:
                    sortMode === mode
                      ? '0 1px 2px rgba(15,23,42,0.06)'
                      : 'none',
                }}
              >
                {mode === 'priority' ? 'Priority' : 'Date created'}
              </button>
            ))}
          </div>

          {/* Hide resolved */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface-variant)',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={hideResolved}
              onChange={(event) => setHideResolved(event.target.checked)}
              style={{
                accentColor: 'var(--color-secondary)',
                cursor: 'pointer',
              }}
            />
            Hide resolved
          </label>

          <div style={{ flex: 1 }} />

          <Link
            to={`/projects/${projectId}/report`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              height: '2.25rem',
              padding: '0 0.875rem',
              background: 'var(--color-surface-container-lowest)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface)',
              textDecoration: 'none',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '16px' }}
            >
              summarize
            </span>
            Generate report
          </Link>

          {/* History */}
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              height: '2.25rem',
              padding: '0 0.875rem',
              background: historyOpen
                ? 'var(--color-surface-container-high)'
                : 'var(--color-surface-container-lowest)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface)',
              cursor: 'pointer',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '16px' }}
            >
              history
            </span>
            History
          </button>

          {/* Close sprint */}
          {active && !confirmClose ? (
            <button
              type="button"
              onClick={() => setConfirmClose(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                height: '2.25rem',
                padding: '0 0.875rem',
                background: 'var(--color-surface-container-lowest)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                color: 'var(--color-on-surface)',
                cursor: 'pointer',
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: '16px' }}
              >
                stop_circle
              </span>
              Close sprint
            </button>
          ) : null}

          {/* Add story */}
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              height: '2.25rem',
              padding: '0 0.875rem',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '16px' }}
            >
              add
            </span>
            Add Story
          </button>
        </div>

        {active ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.75rem',
            }}
          >
            {active.goal?.trim() ? (
              <span
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface)',
                }}
              >
                {active.goal.trim()}
              </span>
            ) : null}
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '13px',
                color: '#45474c',
              }}
            >
              {doneCount} of {totalCount} done
            </span>
          </div>
        ) : null}

        {/* Sprint management strips */}
        {confirmClose && active ? (
          <div
            style={{
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: 'var(--spacing-space-md)',
              border: '1px solid var(--color-outline-variant)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '0.875rem',
                color: 'var(--color-on-surface)',
              }}
            >
              Close this sprint? Unfinished stories will return to Backlog.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              <label
                htmlFor="faculty-notes"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                Faculty notes
              </label>
              <textarea
                id="faculty-notes"
                value={facultyNotes}
                placeholder="Optional"
                onChange={(event) => setFacultyNotes(event.target.value)}
                style={{
                  padding: '0.5rem',
                  background: 'var(--color-surface-container-low)',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  minHeight: '72px',
                  resize: 'vertical',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setConfirmClose(false)
                  setFacultyNotes('')
                }}
                disabled={closing}
                style={{
                  height: '2.25rem',
                  padding: '0 1rem',
                  background: 'none',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface-variant)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void closeSprint()}
                disabled={closing}
                style={{
                  height: '2.25rem',
                  padding: '0 1rem',
                  background: 'var(--color-error)',
                  color: 'var(--color-on-error)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  opacity: closing ? 0.7 : 1,
                }}
              >
                {closing ? 'Closing…' : 'Confirm'}
              </button>
            </div>
          </div>
        ) : null}

        {!active && planned ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            <span
              style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)' }}
            >
              {sprintLabel('Planned', planned.goal)}
            </span>
            <button
              type="button"
              onClick={() => void activate()}
              style={{
                height: '2.25rem',
                padding: '0 1rem',
                background: 'var(--color-secondary)',
                color: 'var(--color-on-secondary)',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Activate
            </button>
          </div>
        ) : null}

        {!active && !planned ? (
          <form
            onSubmit={(event) => void planSprint(event)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.75rem',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            <input
              value={goal}
              placeholder="Sprint goal"
              aria-label="Sprint goal"
              onChange={(event) => setGoal(event.target.value)}
              style={{
                flex: 1,
                height: '2.25rem',
                padding: '0 0.75rem',
                background: 'var(--color-surface-container-low)',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                color: 'var(--color-on-surface)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                height: '2.25rem',
                padding: '0 1rem',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Plan sprint
            </button>
          </form>
        ) : null}

        {/* History panel */}
        {historyOpen ? (
          <div
            className="history"
            style={{
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: 'var(--spacing-space-md)',
              border: '1px solid var(--color-outline-variant)',
            }}
          >
            {closed.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                No closed sprints yet.
              </p>
            ) : null}
            <ul>
              {closed.map((sprint) => (
                <li key={sprint.id}>
                  <span
                    style={{
                      fontSize: '0.875rem',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    {sprintLabel('Closed', sprint.goal)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Kanban board */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))',
            gap: 'var(--spacing-gutter)',
            alignItems: 'start',
            overflowX: 'auto',
          }}
        >
          {STATUSES.map((status) => {
            const rows = columnStories(status)
            const visible = hideResolved && status === 'Done' ? [] : rows
            const hiddenCount =
              hideResolved && status === 'Done' ? rows.length : 0

            const columnDotColor: Record<Status, string> = {
              Backlog: 'var(--color-outline)',
              'Selected for Sprint': 'var(--color-secondary)',
              'In Progress': 'var(--color-secondary-container)',
              Done: '#3b7a57',
            }

            return (
              <section
                key={status}
                data-column={status}
                style={{
                  background: 'var(--color-surface-container-low)',
                  borderRadius: '0.75rem',
                  padding: '0.5rem',
                  minHeight: '10rem',
                  boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
                }}
              >
                {/* Column header */}
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.375rem 0.5rem 0.625rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        width: '0.5rem',
                        height: '0.5rem',
                        borderRadius: '9999px',
                        background: columnDotColor[status],
                        flexShrink: 0,
                      }}
                    />
                    <h2
                      style={{
                        margin: 0,
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: 'var(--color-on-surface)',
                      }}
                    >
                      {status}
                    </h2>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '1.25rem',
                        height: '1.25rem',
                        padding: '0 0.25rem',
                        borderRadius: '9999px',
                        background: 'var(--color-surface-container)',
                        fontFamily: 'var(--font-family-mono)',
                        fontSize: '0.6875rem',
                        color: 'var(--color-on-surface-variant)',
                      }}
                    >
                      {visible.length}
                    </span>
                  </div>
                  {status === 'Backlog' ? (
                    <button
                      type="button"
                      onClick={() => setAdding(true)}
                      aria-label="Add story"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '1.5rem',
                        height: '1.5rem',
                        background: 'none',
                        border: 'none',
                        borderRadius: '0.25rem',
                        color: 'var(--color-on-surface-variant)',
                        cursor: 'pointer',
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                        style={{ fontSize: '16px' }}
                      >
                        add
                      </span>
                    </button>
                  ) : null}
                </header>

                {/* Empty states */}
                {visible.length === 0 && hiddenCount === 0 ? (
                  <p className="empty-line">No stories yet.</p>
                ) : null}

                {hiddenCount > 0 && visible.length === 0 ? (
                  <p className="empty-line">
                    Resolved stories are hidden. Turn off Hide resolved to see
                    them.
                  </p>
                ) : null}

                {visible.map((story) => (
                  <StoryCard
                    key={story.id}
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
                ))}
              </section>
            )
          })}
        </div>
      </div>

      {/* Quick add story modal */}
      {adding ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background:
              'color-mix(in srgb, var(--color-primary) 20%, transparent)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setAdding(false)
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '32rem',
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.75rem',
              padding: 'var(--spacing-space-lg)',
              boxShadow: '0 20px 30px -10px rgba(15,23,42,0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: 'var(--color-on-surface)',
                }}
              >
                Add Story
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setAdding(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'var(--color-on-surface-variant)',
                  cursor: 'pointer',
                  padding: '0.25rem',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  aria-hidden="true"
                  style={{ fontSize: '20px' }}
                >
                  close
                </span>
              </button>
            </div>

            <form
              className="add-story"
              onSubmit={(event) => void addStory(event)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.875rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem',
                }}
              >
                <label
                  htmlFor="story-title"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  Title
                </label>
                <input
                  id="story-title"
                  value={title}
                  placeholder="Title"
                  aria-label="Title"
                  onChange={(event) => setTitle(event.target.value)}
                  style={{
                    height: '2.75rem',
                    padding: '0 0.75rem',
                    background: 'var(--color-surface-container-low)',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--color-on-surface)',
                    outline: 'none',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.375rem',
                }}
              >
                <label
                  htmlFor="story-description"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: 'var(--color-on-surface-variant)',
                  }}
                >
                  Description
                </label>
                <textarea
                  id="story-description"
                  value={description}
                  placeholder="Description"
                  aria-label="Description"
                  onChange={(event) => setDescription(event.target.value)}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: 'var(--color-surface-container-low)',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--color-on-surface)',
                    outline: 'none',
                    minHeight: '72px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                  }}
                >
                  <label
                    htmlFor="story-priority"
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Priority
                  </label>
                  <select
                    id="story-priority"
                    value={priority}
                    onChange={(event) =>
                      setPriority(event.target.value as Priority)
                    }
                    style={{
                      height: '2.75rem',
                      padding: '0 0.75rem',
                      background: 'var(--color-surface-container-low)',
                      border: '1px solid var(--color-outline-variant)',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    {PRIORITIES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.375rem',
                  }}
                >
                  <label
                    htmlFor="story-type"
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Type
                  </label>
                  <select
                    id="story-type"
                    value={storyType}
                    onChange={(event) =>
                      setStoryType(event.target.value as StoryType)
                    }
                    style={{
                      height: '2.75rem',
                      padding: '0 0.75rem',
                      background: 'var(--color-surface-container-low)',
                      border: '1px solid var(--color-outline-variant)',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    {STORY_TYPES.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  paddingTop: '0.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  style={{
                    height: '2.25rem',
                    padding: '0 1rem',
                    background: 'none',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--color-on-surface-variant)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!title.trim()}
                  style={{
                    height: '2.25rem',
                    padding: '0 1rem',
                    background: title.trim()
                      ? 'var(--color-primary)'
                      : 'var(--color-surface-container-high)',
                    color: title.trim()
                      ? 'var(--color-on-primary)'
                      : 'var(--color-on-surface-variant)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    cursor: title.trim() ? 'pointer' : 'not-allowed',
                  }}
                >
                  Add story
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Ticket modal */}
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
          onClose={() => {
            const id = openStory.id
            setOpenId(null)
            requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>(`[data-story-id="${id}"]`)
                ?.focus()
            })
          }}
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

      {/* Team dialog */}
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
      return Date.parse(a.created_at) - Date.parse(b.created_at)
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at)
  })
}
