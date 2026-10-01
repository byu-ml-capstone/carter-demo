import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from './api'
import { AccountBar } from './session'
import type { Project } from './types'

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

  return (
    <main className="page">
      <header className="page-header">
        <h1>Projects</h1>
        <AccountBar />
      </header>
      <form className="stack" onSubmit={(event) => void create(event)}>
        <label>
          Name
          <input
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {name.length > 100 ? (
          <p className="field-error">Name must be 100 characters or fewer.</p>
        ) : null}
        <label>
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        {error ? <p className="field-error">{error}</p> : null}
        <button
          type="submit"
          disabled={!name.trim() || name.trim().length > 100 || busy}
        >
          Create project
        </button>
      </form>
      {loading ? <p>Loading projects…</p> : null}
      {failed ? (
        <p>
          Couldn't load projects.{' '}
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </p>
      ) : null}
      {!loading && !failed && projects.length === 0 ? (
        <p>No projects yet.</p>
      ) : null}
      <ul className="project-list">
        {projects.map((project) => (
          <li key={project.id}>
            {project.pending ? (
              <span>
                <strong>{project.name}</strong>
                {project.description ? (
                  <small>{project.description}</small>
                ) : null}
              </span>
            ) : (
              <Link to={`/projects/${project.id}`}>
                <strong>{project.name}</strong>
                {project.description ? (
                  <small>{project.description}</small>
                ) : null}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
