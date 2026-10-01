import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from './api'
import type { Project } from './types'
import { formatDate } from './ui'

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string | number
  sub: string
  icon: string
}) {
  return (
    <div
      className="shadow-sm"
      style={{
        background: 'var(--color-surface-container-lowest)',
        borderRadius: '0.75rem',
        padding: 'var(--spacing-space-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: '0.75rem',
              lineHeight: '1rem',
              letterSpacing: '0.01em',
              fontWeight: 500,
              color: 'var(--color-on-surface-variant)',
            }}
          >
            {label}
          </p>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontSize: '1.5rem',
              fontWeight: 600,
              lineHeight: '2rem',
              letterSpacing: '-0.02em',
              color: 'var(--color-on-surface)',
            }}
          >
            {value}
          </p>
        </div>
        <div
          style={{
            width: '2.25rem',
            height: '2.25rem',
            borderRadius: '0.5rem',
            background: 'var(--color-surface-container-low)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>
            {icon}
          </span>
        </div>
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: 'var(--font-family-mono)',
          fontSize: '0.6875rem',
          lineHeight: '0.9375rem',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        {sub}
      </p>
    </div>
  )
}

export function ProjectListPage() {
  const [projects, setProjects] = useState<
    Array<Project & { pending?: boolean }>
  >([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creatorOpen, setCreatorOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'archived'>('all')
  const [sortMode, setSortMode] = useState<'recent' | 'name'>('recent')

  async function load() {
    setLoading(true)
    setFailed(false)
    try {
      const rows = await api<Project[]>('/projects')
      setProjects(rows)
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) return
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100 || busy) return
    const pendingId = `pending-${crypto.randomUUID()}`
    const pending = {
      id: pendingId,
      name: trimmed,
      description: description.trim() || null,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setProjects((current) => [...current, pending])
    setBusy(true)
    setError('')
    try {
      const created = await api<Project>('/projects', {
        method: 'POST',
        body: {
          name: trimmed,
          description: description.trim() || undefined,
        },
      })
      setProjects((current) =>
        current.map((row) => (row.id === pendingId ? created : row)),
      )
      setName('')
      setDescription('')
    } catch (caught) {
      setProjects((current) => current.filter((row) => row.id !== pendingId))
      if (caught instanceof ApiError && caught.status === 409) {
        setError('A project with that name already exists.')
      } else if (caught instanceof ApiError && caught.status === 400) {
        setError(caught.detail || 'Name is required.')
      } else if (!(caught instanceof ApiError) || caught.status !== 401) {
        setError("Couldn't save that — try again.")
      }
    } finally {
      setBusy(false)
    }
  }

  const totalProjects = projects.filter((p) => !p.pending).length

  const visibleProjects = projects.filter((project) => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      !q ||
      project.name.toLowerCase().includes(q) ||
      (project.description ?? '').toLowerCase().includes(q)
    return matchesSearch
  })

  const sortedProjects = [...visibleProjects].sort((a, b) =>
    sortMode === 'name'
      ? a.name.localeCompare(b.name)
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const projectIndexMap = new Map(
    projects.filter((p) => !p.pending).map((p, i) => [p.id, i + 1]),
  )

  return (
    <main
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 4rem)',
        background: 'var(--color-surface)',
      }}
    >
      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          padding: 'var(--spacing-space-xl) var(--spacing-margin)',
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-space-xl)',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '0.125rem 0.5rem',
                  background: 'var(--color-secondary-fixed)',
                  color: 'var(--color-on-secondary-fixed)',
                  borderRadius: '9999px',
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '0.6875rem',
                  fontWeight: 500,
                }}
              >
                Deliverables &amp; Research
              </span>
              <span style={{ color: 'var(--color-outline-variant)' }}>·</span>
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontSize: '0.6875rem',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                CS 482 Semester II
              </span>
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: '2.25rem',
                fontWeight: 600,
                lineHeight: '2.75rem',
                letterSpacing: '-0.025em',
                color: 'var(--color-on-surface)',
              }}
            >
              Projects
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: '1rem',
                lineHeight: '1.625rem',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              Manage your capstone deliverables, research pipelines, and sprint boards.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreatorOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              height: '2.5rem',
              padding: '0 1rem',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '18px' }}>
              add_circle
            </span>
            New Project
          </button>
        </div>

        {/* Stats grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 'var(--spacing-gutter)',
            marginBottom: 'var(--spacing-space-xl)',
          }}
        >
          <StatCard label="Total Projects" value={totalProjects} sub="ALL TIME" icon="folder" />
          <StatCard label="Active Pipeline" value="—" sub="IN PROGRESS" icon="play_circle" />
          <StatCard label="Pending Milestones" value="—" sub="THIS SPRINT" icon="flag" />
          <StatCard label="Active Researchers" value="—" sub="TEAM MEMBERS" icon="group" />
        </div>

        {/* Project creator */}
        <div
          className={creatorOpen ? '' : 'hidden'}
          style={{
            background: 'var(--color-surface-container-lowest)',
            borderRadius: '0.75rem',
            padding: 'var(--spacing-space-lg)',
            marginBottom: 'var(--spacing-space-lg)',
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '0.5rem',
                  height: '0.5rem',
                  borderRadius: '9999px',
                  background: 'var(--color-secondary)',
                  display: 'inline-block',
                }}
              />
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.125rem',
                  fontWeight: 500,
                  lineHeight: '1.5rem',
                  color: 'var(--color-on-surface)',
                }}
              >
                Create New Project
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setCreatorOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                padding: '0.25rem',
                borderRadius: '0.25rem',
                color: 'var(--color-on-surface-variant)',
                cursor: 'pointer',
              }}
              aria-label="Close project creator"
            >
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '18px' }}>close</span>
            </button>
          </div>

          <form
            onSubmit={(event) => void create(event)}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="project-name-input"
                style={{
                  fontSize: '0.75rem',
                  lineHeight: '1rem',
                  fontWeight: 500,
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                <span>Name</span>
              </label>
              <input
                id="project-name-input"
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Data Pipeline Analysis"
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
            {name.length > 100 ? (
              <p className="field-error">Name must be 100 characters or fewer.</p>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label
                htmlFor="project-desc-input"
                style={{
                  fontSize: '0.75rem',
                  lineHeight: '1rem',
                  fontWeight: 500,
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                <span>Description</span>
              </label>
              <input
                id="project-desc-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional: describe the project scope"
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
            {error ? <p className="field-error">{error}</p> : null}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setCreatorOpen(false)}
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
                disabled={!name.trim() || name.trim().length > 100 || busy}
                style={{
                  height: '2.25rem',
                  padding: '0 1rem',
                  background:
                    !name.trim() || name.trim().length > 100 || busy
                      ? 'var(--color-surface-container-high)'
                      : 'var(--color-primary)',
                  color:
                    !name.trim() || name.trim().length > 100 || busy
                      ? 'var(--color-on-surface-variant)'
                      : 'var(--color-on-primary)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor:
                    !name.trim() || name.trim().length > 100 || busy
                      ? 'not-allowed'
                      : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '16px' }}>
                  rocket_launch
                </span>
                Create project
              </button>
            </div>
          </form>
        </div>

        {/* Search + filter bar */}
        <div
          style={{
            background: 'var(--color-surface-container-lowest)',
            borderRadius: '0.75rem',
            padding: '0.75rem var(--spacing-space-lg)',
            marginBottom: 'var(--spacing-space-lg)',
            boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: 1 }}>
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '16px',
                color: 'var(--color-outline)',
                pointerEvents: 'none',
              }}
            >
              search
            </span>
            <input
              type="search"
              placeholder="Search projects…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                height: '2.25rem',
                paddingLeft: '2.25rem',
                paddingRight: '0.75rem',
                background: 'var(--color-surface-container-low)',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                color: 'var(--color-on-surface)',
                outline: 'none',
              }}
            />
          </div>

          {/* Filter tabs */}
          <div
            style={{
              display: 'flex',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              padding: '0.25rem',
              gap: '0.25rem',
            }}
          >
            {(['all', 'active', 'archived'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilterTab(tab)}
                style={{
                  padding: '0.25rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  background:
                    filterTab === tab
                      ? 'var(--color-surface-container-lowest)'
                      : 'transparent',
                  color:
                    filterTab === tab
                      ? 'var(--color-on-surface)'
                      : 'var(--color-on-surface-variant)',
                  fontWeight: filterTab === tab ? 500 : 400,
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  boxShadow: filterTab === tab ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                }}
              >
                {tab === 'all' ? `All (${totalProjects})` : tab === 'active' ? `Active (${totalProjects})` : 'Archived (0)'}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'recent' | 'name')}
            style={{
              height: '2.25rem',
              padding: '0 0.75rem',
              background: 'var(--color-surface-container-low)',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface)',
              cursor: 'pointer',
            }}
          >
            <option value="recent">Sort: Recent</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        {/* States */}
        {loading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem',
              color: 'var(--color-on-surface-variant)',
              gap: '0.75rem',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '24px' }}>sync</span>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading projects…</p>
          </div>
        ) : null}

        {failed ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem',
              gap: '1rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '40px', color: 'var(--color-error)' }}>error</span>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>
              Couldn&apos;t load projects.{' '}
              <button
                type="button"
                onClick={() => void load()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-secondary)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                }}
              >
                Try again
              </button>
            </p>
          </div>
        ) : null}

        {!loading && !failed && sortedProjects.length === 0 && searchQuery === '' && filterTab === 'all' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem',
              gap: '1rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>folder_open</span>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>No projects yet.</p>
          </div>
        ) : null}

        {!loading && !failed && sortedProjects.length === 0 && (searchQuery !== '' || filterTab !== 'all') ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem',
              gap: '1rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '40px' }}>search_off</span>
            <p style={{ margin: 0, fontSize: '0.875rem' }}>No Matching Projects Found</p>
            <p style={{ margin: 0, fontSize: '0.75rem' }}>
              Try adjusting your search query or filter.
            </p>
          </div>
        ) : null}

        {/* Projects grid */}
        {!loading && !failed && sortedProjects.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 'var(--spacing-gutter)',
            }}
          >
            {sortedProjects.map((project) => {
              const idx = projectIndexMap.get(project.id)
              const cardId = `CAP-482-${String(idx ?? '??').padStart(2, '0')}`
              return (
                <div
                  key={project.id}
                  style={{
                    background: 'var(--color-surface-container-lowest)',
                    borderRadius: '0.75rem',
                    padding: 'var(--spacing-space-lg)',
                    boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    transition: 'box-shadow 0.15s',
                  }}
                >
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.125rem 0.5rem',
                          borderRadius: '9999px',
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: '0.6875rem',
                          fontWeight: 500,
                          background: project.pending
                            ? 'var(--color-surface-container-high)'
                            : 'var(--color-secondary-fixed)',
                          color: project.pending
                            ? 'var(--color-on-surface-variant)'
                            : 'var(--color-on-secondary-fixed)',
                        }}
                      >
                        {project.pending ? (
                          <>
                            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '12px' }}>sync</span>
                            Saving…
                          </>
                        ) : (
                          <>
                            <span
                              style={{
                                width: '0.375rem',
                                height: '0.375rem',
                                borderRadius: '9999px',
                                background: 'var(--color-secondary)',
                                display: 'inline-block',
                              }}
                            />
                            Sprint 1 Active
                          </>
                        )}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-family-mono)',
                          fontSize: '0.6875rem',
                          color: 'var(--color-outline)',
                        }}
                      >
                        {cardId}
                      </span>
                    </div>
                    {!project.pending && (
                      <button
                        type="button"
                        aria-label="Project settings"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '0.25rem',
                          borderRadius: '0.25rem',
                          color: 'var(--color-on-surface-variant)',
                          cursor: 'pointer',
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '16px' }}>more_horiz</span>
                      </button>
                    )}
                  </div>

                  {/* Title */}
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.25rem',
                      fontWeight: 600,
                      lineHeight: '1.75rem',
                      letterSpacing: '-0.015em',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    {project.pending ? project.name : (
                      <Link to={`/projects/${project.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                        {project.name}
                      </Link>
                    )}
                  </h3>

                  {/* Description */}
                  {project.description ? (
                    <small
                      style={{
                        display: '-webkit-box',
                        margin: 0,
                        fontSize: '0.875rem',
                        lineHeight: '1.375rem',
                        color: 'var(--color-on-surface-variant)',
                        overflow: 'hidden',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {project.description}
                    </small>
                  ) : null}

                  {/* Progress bar */}
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.375rem',
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Progress</span>
                      <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-family-mono)', color: 'var(--color-on-surface-variant)' }}>0%</span>
                    </div>
                    <div
                      style={{
                        height: '4px',
                        borderRadius: '9999px',
                        background: 'var(--color-surface-container)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: '0%',
                          background: 'var(--color-secondary)',
                          borderRadius: '9999px',
                        }}
                      />
                    </div>
                  </div>

                  {/* Meta chips */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {[
                      { icon: 'flag', label: '0 Milestones' },
                      { icon: 'article', label: '0 Stories' },
                    ].map(({ icon, label }) => (
                      <span
                        key={label}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.125rem 0.5rem',
                          background: 'var(--color-surface-container-low)',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          color: 'var(--color-on-surface-variant)',
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '12px' }}>{icon}</span>
                        {label}
                      </span>
                    ))}
                  </div>

                  {/* Footer */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '0.5rem',
                      borderTop: '1px solid var(--color-outline-variant)',
                      marginTop: 'auto',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          width: '1.25rem',
                          height: '1.25rem',
                          borderRadius: '9999px',
                          background: 'var(--color-primary)',
                          color: 'var(--color-on-primary)',
                          fontSize: '0.6875rem',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        CL
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                        Updated {formatDate(project.created_at)}
                      </span>
                    </div>

                    {!project.pending ? (
                      <Link
                        to={`/projects/${project.id}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.8125rem',
                          fontWeight: 500,
                          color: 'var(--color-secondary)',
                          textDecoration: 'none',
                        }}
                      >
                        Open Board
                        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '14px' }}>arrow_forward</span>
                      </Link>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </main>
  )
}
