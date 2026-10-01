import { useEffect, useMemo, useState } from 'react'
import { Link, useBlocker, useParams } from 'react-router-dom'
import { api, ApiError, normalizeReport } from './api'
import { CommentThread } from './comments'
import {
  consumeSuppressLeave,
  authorKey,
  setReportDirty,
  suppressLeaveGuard,
} from './reportGuard'
import { AccountBar, useSession } from './session'
import { TeamDialog } from './WorkspacePage'
import { toast } from './toast'
import type {
  Comment,
  Member,
  ReportFields,
  ReportKey,
  Sprint,
  SprintReport,
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
import { PriorityBadge, TypeIcon } from './ui'

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
  const { sprintId = '' } = useParams()
  const { session } = useSession()
  const [sprint, setSprint] = useState<Sprint | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [draftText, setDraftText] = useState('')
  const [fields, setFields] = useState<ReportFields>(EMPTY_REPORT())
  const [baseline, setBaseline] = useState<ReportFields>(EMPTY_REPORT())
  const [savedFinal, setSavedFinal] = useState<ReportFields | null>(null)
  const [mode, setMode] = useState<
    | 'loading'
    | 'not-closed'
    | 'empty'
    | 'drafting'
    | 'error'
    | 'editing'
    | 'readonly'
  >('loading')
  const [saving, setSaving] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)

  const dirty = mode === 'editing' && !sameFields(fields, baseline)

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

  async function loadComments(id: string) {
    const rows = await api<Comment[]>(`/sprints/${id}/comments`)
    setComments(rows)
  }

  async function load() {
    setMode('loading')
    try {
      const next = await api<Sprint>(`/sprints/${sprintId}`)
      setSprint(next)
      if (next.project_id) {
        const people = await api<Member[]>(
          `/projects/${next.project_id}/members`,
        )
        setMembers(people)
        void loadComments(next.id).catch(() => undefined)
      }
      if (next.status !== 'Closed') {
        setMode('not-closed')
        return
      }
      let report: SprintReport | null = null
      try {
        report = normalizeReport(
          await api<SprintReport>(`/sprints/${sprintId}/report`),
        )
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) report = null
        else throw error
      }
      if (report?.final_content) {
        const finalFields = prepareFields(
          report.final_content,
          (next.stories_snapshot ?? []).filter(
            (story) => story.status_at_close === 'Done',
          ).length,
        )
        setSavedFinal(finalFields)
        setFields(finalFields)
        setBaseline(finalFields)
        setMode('readonly')
        return
      }
      if (report?.draft_content) {
        showDraft(report.draft_content, next)
        return
      }
      await generate(next)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      if (error instanceof ApiError && error.status === 422) {
        setMode('empty')
        return
      }
      setMode('error')
    }
  }

  function showDraft(content: ReportFields, source: Sprint) {
    const doneCount = (source.stories_snapshot ?? []).filter(
      (story) => story.status_at_close === 'Done',
    ).length
    const next = prepareFields(content, doneCount)
    setFields(next)
    setBaseline(next)
    setMode('editing')
  }

  async function generate(source?: Sprint) {
    const current = source ?? sprint
    if (!current) return
    if (dirty && !window.confirm('Regenerate and replace these edits?')) return
    setMode('drafting')
    try {
      const response = await api<{ draft_content: ReportFields }>(
        `/sprints/${current.id}/report/draft`,
        { method: 'POST', body: {} },
      )
      const normalized = normalizeReport({
        draft_content: response.draft_content,
        final_content: savedFinal,
      })
      showDraft(normalized?.draft_content ?? EMPTY_REPORT(), current)
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
    // Reload when the route id changes. load closes over savedFinal only after generate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintId])

  useEffect(() => {
    if (!sprint || sprint.status !== 'Closed') return
    const timer = window.setInterval(() => {
      if (!document.hidden) void loadComments(sprint.id).catch(() => undefined)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [sprint])

  const reviewedBy = useMemo(() => {
    if (!sprint) return undefined
    const id = localStorage.getItem(authorKey(sprint.project_id))
    return members.find((member) => member.id === id)?.name
  }, [members, sprint])

  async function save() {
    if (!sprint) return
    setSaving(true)
    try {
      await api(`/sprints/${sprint.id}/report`, {
        method: 'PUT',
        body: {
          final_content: fields,
          reviewed_by: reviewedBy,
        },
      })
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
  const projectHref = sprint ? `/projects/${sprint.project_id}` : '/'

  return (
    <main className="page report">
      <header className="page-header">
        <div>
          <Link to={projectHref}>Back to board</Link>
          <h1>{sprint?.goal?.trim() || 'Sprint report'}</h1>
        </div>
        <AccountBar />
      </header>
      {mode === 'drafting' ? <p>Drafting your sprint report…</p> : null}
      {mode === 'loading' ? <p>Loading the sprint…</p> : null}
      {mode === 'not-closed' ? (
        <p>Close the sprint before generating a report.</p>
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
            <h2>Sprint snapshot</h2>
            <ul>
              {(sprint?.stories_snapshot ?? []).map((story) => (
                <li key={story.story_id}>
                  <TypeIcon type={story.type} />
                  <span>{story.title}</span>
                  <PriorityBadge priority={story.priority} />
                  <span>{story.status_at_close}</span>
                </li>
              ))}
            </ul>
          </section>
          {sprint ? (
            <CommentThread
              projectId={sprint.project_id}
              parent={{ kind: 'sprint', id: sprint.id }}
              members={members}
              comments={comments}
              email={session?.user.email ?? ''}
              draft={draftText}
              onDraft={setDraftText}
              onPosted={(comment) =>
                setComments((current) => [...current, comment])
              }
              onOpenTeam={() => setTeamOpen(true)}
            />
          ) : null}
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
      {teamOpen && sprint ? (
        <TeamDialog
          projectId={sprint.project_id}
          members={members}
          onClose={() => setTeamOpen(false)}
          onCreated={(member) => setMembers((current) => [...current, member])}
        />
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
