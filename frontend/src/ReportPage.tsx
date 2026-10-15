import { useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import { api, ApiError, normalizeReport } from './api'
import {
  authorKey,
  consumeSuppressLeave,
  setReportDirty,
  suppressLeaveGuard,
} from './reportGuard'
import { AccountBar } from './session'
import { toast } from './toast'
import type {
  Member,
  Project,
  ReportFields,
  ReportKey,
  ReportSnapshotStory,
  SavedReport,
  Story,
} from './types'
import {
  EMPTY_REPORT,
  EMPTY_SPRINT_DETAIL,
  NO_BLOCKERS,
  NO_FACULTY_NOTES,
  NONE_COMPLETED,
  REPORT_KEYS,
  REPORT_LABELS,
} from './types'
import { formatWhen, PriorityBadge, TypeIcon } from './ui'

function sameFields(a: ReportFields, b: ReportFields) {
  return REPORT_KEYS.every((key) => a[key] === b[key])
}

function prepareFields(fields: ReportFields, doneCount: number): ReportFields {
  return {
    ...fields,
    blockers: fields.blockers.trim() ? fields.blockers : NO_BLOCKERS,
    completed_work:
      fields.completed_work.trim() || doneCount > 0
        ? fields.completed_work
        : NONE_COMPLETED,
    faculty_notes: fields.faculty_notes.trim()
      ? fields.faculty_notes
      : NO_FACULTY_NOTES,
  }
}

export function ReportPage() {
  const { projectId = '' } = useParams()
  const [project, setProject] = useState<Project | null>(null)
  const [stories, setStories] = useState<Story[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [notes, setNotes] = useState('')
  const [reports, setReports] = useState<SavedReport[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<ReportSnapshotStory[]>([])
  const [fields, setFields] = useState<ReportFields>(EMPTY_REPORT())
  const [baseline, setBaseline] = useState<ReportFields>(EMPTY_REPORT())
  const [savedFinal, setSavedFinal] = useState<ReportFields | null>(null)
  const [mode, setMode] = useState<
    'loading' | 'idle' | 'empty' | 'drafting' | 'error' | 'editing' | 'readonly'
  >('loading')
  const [saving, setSaving] = useState(false)

  const dirty = mode === 'editing' && !sameFields(fields, baseline)
  const doneCount = stories.filter((story) => story.status === 'Done').length

  useEffect(() => {
    setReportDirty(dirty)
    return () => setReportDirty(false)
  }, [dirty])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !consumeSuppressLeave() &&
      currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (
      window.confirm('You have unsaved changes to this report — leave anyway?')
    ) {
      suppressLeaveGuard()
      setReportDirty(false)
      blocker.proceed()
    } else {
      blocker.reset()
    }
  }, [blocker])

  useEffect(() => {
    if (!dirty) return
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [dirty])

  function showSaved(report: SavedReport, finished: number) {
    const frozen = report.stories_snapshot ?? []
    const content =
      report.final_content ?? report.draft_content ?? EMPTY_REPORT()
    const finishedThen = frozen.length
      ? frozen.filter((story) => story.status_at_close === 'Done').length
      : finished
    const next = prepareFields(content, finishedThen)
    setSnapshot(frozen)
    setSelectedId(report.id)
    setFields(next)
    setBaseline(next)
    setSavedFinal(report.final_content ? next : null)
    setMode(report.final_content ? 'readonly' : 'editing')
  }

  function openReport(report: SavedReport) {
    if (report.id === selectedId && mode !== 'idle') return
    if (
      dirty &&
      !window.confirm('You have unsaved changes to this report — leave anyway?')
    ) {
      return
    }
    setReportDirty(false)
    showSaved(report, doneCount)
  }

  async function load() {
    setMode('loading')
    try {
      const [nextProject, nextStories, nextMembers] = await Promise.all([
        api<Project>(`/projects/${projectId}`),
        api<Story[]>(`/projects/${projectId}/stories`),
        api<Member[]>(`/projects/${projectId}/members`),
      ])
      setProject(nextProject)
      setStories(nextStories)
      setMembers(nextMembers)
      const rows = (await api<SavedReport[]>(`/projects/${projectId}/reports`))
        .map((row) => normalizeReport(row))
        .filter((row): row is SavedReport => row !== null && Boolean(row.id))
      setReports(rows)
      const finished = nextStories.filter(
        (story) => story.status === 'Done',
      ).length
      if (rows[0]) showSaved(rows[0], finished)
      else {
        setSelectedId(null)
        setMode('idle')
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      setMode('error')
    }
  }

  async function generate() {
    if (dirty && !window.confirm('Regenerate and replace these edits?')) return
    setMode('drafting')
    try {
      const response = normalizeReport(
        await api<SavedReport>(`/projects/${projectId}/report/draft`, {
          method: 'POST',
          body: { faculty_notes: notes.trim() || fields.faculty_notes },
        }),
      )
      if (!response?.id || !response.generated_at) {
        setMode('error')
        return
      }
      const saved: SavedReport = {
        ...response,
        id: response.id,
        generated_at: response.generated_at,
      }
      setReports((current) => [saved, ...current])
      showSaved(saved, doneCount)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 422) {
        setMode('empty')
        return
      }
      setMode('error')
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const reviewedBy = useMemo(() => {
    const id = localStorage.getItem(authorKey(projectId))
    return members.find((member) => member.id === id)?.name
  }, [members, projectId])

  async function save() {
    if (!selectedId) return
    setSaving(true)
    try {
      const updated = normalizeReport(
        await api<SavedReport>(`/projects/${projectId}/reports/${selectedId}`, {
          method: 'PUT',
          body: {
            final_content: fields,
            reviewed_by: reviewedBy,
          },
        }),
      )
      setReports((current) =>
        current.map((report) =>
          report.id === selectedId
            ? {
                ...report,
                ...(updated ?? {}),
                id: report.id,
                generated_at: report.generated_at,
                final_content: fields,
              }
            : report,
        ),
      )
      setSavedFinal(fields)
      setBaseline(fields)
      setReportDirty(false)
      setMode('readonly')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast("Couldn't save that — try again.")
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    const restore = savedFinal ?? baseline
    setFields(restore)
    setBaseline(restore)
    if (savedFinal) setMode('readonly')
  }

  const blank = REPORT_KEYS.every((key) => !fields[key].trim())
  const projectHref = `/projects/${projectId}`

  return (
    <main className="page report">
      <header className="page-header">
        <div>
          <Link to={projectHref}>Back to board</Link>
          <h1>{project?.name?.trim() || 'Report'}</h1>
        </div>
        <AccountBar />
      </header>
      <section className="snapshot" aria-label="Saved reports">
        <h2>Saved reports</h2>
        {reports.length === 0 ? <p>No reports yet.</p> : null}
        <ul>
          {reports.map((report) => {
            const title =
              (
                report.final_content ?? report.draft_content
              )?.sprint_goal?.trim() || 'Report'
            return (
              <li key={report.id}>
                <button
                  type="button"
                  aria-current={report.id === selectedId ? 'true' : undefined}
                  onClick={() => openReport(report)}
                >
                  {title} {formatWhen(report.generated_at)}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
      {mode === 'drafting' ? <p>Drafting your report…</p> : null}
      {mode === 'loading' ? <p>Loading the board…</p> : null}
      {mode === 'idle' ? (
        <section className="report-fields">
          <p>Generate a report from the stories on this board.</p>
          <label className="report-field">
            Faculty notes
            <textarea
              aria-label="Faculty notes"
              value={notes}
              placeholder="Optional"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void generate()}>
            Generate report
          </button>
        </section>
      ) : null}
      {mode === 'empty' ? (
        <p>
          {EMPTY_SPRINT_DETAIL} <Link to={projectHref}>Back to board</Link>
        </p>
      ) : null}
      {mode === 'error' ? (
        <p>
          Couldn't draft the report.{' '}
          <button type="button" onClick={() => void generate()}>
            Try again
          </button>
        </p>
      ) : null}
      {mode === 'editing' || mode === 'readonly' ? (
        <>
          <div className="report-fields">
            {REPORT_KEYS.map((key) => (
              <ReportBlock
                key={key}
                name={key}
                value={fields[key]}
                readOnly={mode === 'readonly'}
                onChange={(value) =>
                  setFields((current) => ({
                    ...current,
                    [key]: value,
                  }))
                }
              />
            ))}
          </div>
          <section className="snapshot">
            <h2>Board snapshot</h2>
            <ul>
              {snapshot.map((story) => (
                <li key={story.id}>
                  <TypeIcon type={story.type} />
                  <span>{story.title}</span>
                  <PriorityBadge priority={story.priority} />
                  <span>{story.status_at_close}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className="row">
            {mode === 'readonly' ? (
              <button type="button" onClick={() => setMode('editing')}>
                Edit report
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={blank || saving}
                  onClick={() => void save()}
                >
                  {saving ? 'Saving…' : 'Save report'}
                </button>
                <button type="button" onClick={discard}>
                  Discard draft
                </button>
              </>
            )}
            <button type="button" onClick={() => void generate()}>
              Regenerate draft
            </button>
          </div>
        </>
      ) : null}
    </main>
  )
}

function ReportBlock({
  name,
  value,
  readOnly,
  onChange,
}: {
  name: ReportKey
  value: string
  readOnly: boolean
  onChange: (value: string) => void
}) {
  const absence =
    (name === 'blockers' && value === NO_BLOCKERS) ||
    (name === 'faculty_notes' && value === NO_FACULTY_NOTES)
  const honest = name === 'completed_work' && value === NONE_COMPLETED
  if (readOnly) {
    return (
      <section>
        <h2>{REPORT_LABELS[name]}</h2>
        <p className={absence ? 'muted-italic' : honest ? 'honest' : ''}>
          {value}
        </p>
      </section>
    )
  }
  return (
    <label className="report-field">
      {REPORT_LABELS[name]}
      <textarea
        className={absence ? 'muted-italic' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
