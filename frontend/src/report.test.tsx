import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setToken } from './api'
import { ReportPage } from './ReportPage'
import { setReportDirty } from './reportGuard'
import { SessionProvider } from './session'
import { Toaster } from './toast'
import { mockFetch, pathOf } from './test/fetch'
import { NO_BLOCKERS, NO_FACULTY_NOTES, NONE_COMPLETED } from './types'

const snapshot = [
  {
    story_id: 's1',
    title: 'Publish board',
    description: 'Board is visible.',
    priority: 'High' as const,
    type: 'Feature' as const,
    status_at_close: 'Done' as const,
  },
  {
    story_id: 's2',
    title: 'Comment thread',
    description: null,
    priority: 'Low' as const,
    type: 'Chore' as const,
    status_at_close: 'In Progress' as const,
  },
]

const draft = {
  sprint_goal: 'Ship the board',
  completed_work: 'Publish board',
  next_sprint_goals: 'Comment thread',
  blockers: 'Waiting on the course API token.',
  faculty_notes: 'Watch the demo',
}

function renderReport(path = '/sprints/sp1/report') {
  const user = userEvent.setup({ delay: null })
  const router = createMemoryRouter(
    [
      {
        element: (
          <SessionProvider>
            <Outlet />
            <Toaster />
          </SessionProvider>
        ),
        children: [
          { path: '/sprints/:sprintId/report', element: <ReportPage /> },
          { path: '/projects/:projectId', element: <p>Board</p> },
          { path: '/sign-in', element: <p>Sign in page</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return { user, router }
}

beforeEach(() => {
  setToken('token-1')
  setReportDirty(false)
})

describe('report page', () => {
  it('edits the five fields, saves, and regenerates', async () => {
    let current = draft
    let saveStatus = 500
    const calls = mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/sprints/sp1') {
        return {
          json: {
            id: 'sp1',
            project_id: 'p1',
            goal: 'Ship the board',
            status: 'Closed',
            stories_snapshot: snapshot,
          },
        }
      }
      if (path === '/projects/p1/members')
        return { json: [{ id: 'ann', name: 'Ann' }] }
      if (path === '/sprints/sp1/comments') return { json: [] }
      if (path === '/sprints/sp1/report' && call.method === 'GET')
        return { status: 404, json: { detail: 'missing' } }
      if (path === '/sprints/sp1/report/draft')
        return { json: { draft_content: current } }
      if (path === '/sprints/sp1/report' && call.method === 'PUT') {
        return saveStatus === 200
          ? {
              json: {
                final_content: (call.body as { final_content: typeof draft })
                  .final_content,
              },
            }
          : { status: saveStatus, json: { detail: 'nope' } }
      }
      return { json: [] }
    })
    localStorage.setItem('my-workspace:author:p1', 'ann')
    const { user } = renderReport()
    expect(await screen.findByLabelText('Sprint goal')).toHaveValue(
      'Ship the board',
    )
    expect(screen.getByLabelText('Completed work')).toHaveValue('Publish board')
    expect(screen.getByLabelText('Next sprint goals')).toHaveValue(
      'Comment thread',
    )
    expect(screen.getByLabelText('Blockers')).toHaveValue(
      'Waiting on the course API token.',
    )
    expect(screen.getByLabelText('Faculty notes')).toHaveValue('Watch the demo')
    expect(calls[0]?.authorization).toBe('Bearer token-1')

    await user.clear(screen.getByLabelText('Sprint goal'))
    await user.type(screen.getByLabelText('Sprint goal'), 'Edited goal')
    await user.clear(screen.getByLabelText('Completed work'))
    await user.type(screen.getByLabelText('Completed work'), 'Saved work')
    await user.clear(screen.getByLabelText('Next sprint goals'))
    await user.type(screen.getByLabelText('Next sprint goals'), 'Auth next')
    await user.clear(screen.getByLabelText('Blockers'))
    await user.type(screen.getByLabelText('Blockers'), 'A real blocker')
    await user.clear(screen.getByLabelText('Faculty notes'))
    await user.type(screen.getByLabelText('Faculty notes'), 'Edited notes')

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: 'Regenerate draft' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByLabelText('Sprint goal')).toHaveValue('Edited goal')

    await user.click(screen.getByRole('button', { name: 'Save report' }))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()
    saveStatus = 200
    await user.click(screen.getByRole('button', { name: 'Save report' }))
    expect(
      await screen.findByRole('button', { name: 'Edit report' }),
    ).toBeInTheDocument()
    const saved = calls.filter((call) => call.method === 'PUT').at(-1)
    expect(saved?.body).toMatchObject({
      reviewed_by: 'Ann',
      final_content: {
        sprint_goal: 'Edited goal',
        completed_work: 'Saved work',
        next_sprint_goals: 'Auth next',
        blockers: 'A real blocker',
        faculty_notes: 'Edited notes',
      },
    })

    current = {
      ...draft,
      sprint_goal: 'After regen',
      completed_work: 'Regenerated work',
    }
    await user.click(screen.getByRole('button', { name: 'Regenerate draft' }))
    expect(await screen.findByLabelText('Sprint goal')).toHaveValue(
      'After regen',
    )
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(
      calls.filter((call) => pathOf(call.url).endsWith('/report/draft')).length,
    ).toBeGreaterThan(1)

    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(
      screen.getByRole('button', { name: 'Edit report' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Edited goal')).toBeInTheDocument()
  })

  it('fills empty draft fields and can leave or stay', async () => {
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/sprints/sp1') {
        return {
          json: {
            id: 'sp1',
            project_id: 'p1',
            goal: '',
            status: 'Closed',
            stories_snapshot: [
              { ...snapshot[1], status_at_close: 'In Progress' },
            ],
          },
        }
      }
      if (path.endsWith('/members')) return { json: [] }
      if (path.endsWith('/comments')) return { json: [] }
      if (path.endsWith('/report') && call.method === 'GET')
        return { status: 404, json: { detail: 'missing' } }
      if (path.endsWith('/report/draft')) {
        return {
          json: {
            draft_content: {
              sprint_goal: '',
              completed_work: '',
              next_sprint_goals: '',
              blockers: '   ',
              faculty_notes: '',
            },
          },
        }
      }
      if (path.endsWith('/members') && call.method === 'POST')
        return { status: 201, json: { id: 'lee', name: 'Lee' } }
      return { json: [] }
    })
    const { user } = renderReport()
    expect(await screen.findByLabelText('Blockers')).toHaveValue(NO_BLOCKERS)
    expect(
      screen.getByRole('heading', { name: 'Sprint report' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Faculty notes')).toHaveValue(NO_FACULTY_NOTES)
    expect(screen.getByLabelText('Completed work')).toHaveValue(NONE_COMPLETED)
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    await user.clear(screen.getByLabelText('Sprint goal'))
    await user.type(screen.getByLabelText('Sprint goal'), 'Dirty')
    const leaving = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leaving)
    expect(leaving.defaultPrevented).toBe(true)
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await user.click(screen.getByRole('link', { name: 'Back to board' }))
    expect(screen.getByLabelText('Sprint goal')).toBeInTheDocument()
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    await user.click(screen.getByRole('link', { name: 'Back to board' }))
    expect(await screen.findByText('Board')).toBeInTheDocument()
  })

  it('shows a saved report, an open sprint, an empty sprint, and a draft error', async () => {
    let mode: 'final' | 'open' | 'empty' | 'error' | 'auth' = 'final'
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (mode === 'auth')
        return { status: 401, json: { detail: 'Sign in required.' } }
      if (path === '/sprints/sp1') {
        return {
          json: {
            id: 'sp1',
            project_id: 'p1',
            goal: 'Ship',
            status: mode === 'open' ? 'Active' : 'Closed',
            stories_snapshot: snapshot,
          },
        }
      }
      if (path.endsWith('/members'))
        return { json: [{ id: 'ann', name: 'Ann' }] }
      if (path.endsWith('/comments'))
        return { status: 500, json: { detail: 'nope' } }
      if (path.endsWith('/report/draft')) {
        if (mode === 'error') return { status: 500, json: { detail: 'down' } }
        return { json: { draft_content: draft } }
      }
      if (mode === 'empty') return { status: 422, json: { detail: 'nothing' } }
      if (mode === 'final') {
        return {
          json: {
            final_content: {
              sprint_goal: 'Goal',
              completed_work: NONE_COMPLETED,
              next_sprint_goals: 'Next',
              blockers: NO_BLOCKERS,
              faculty_notes: NO_FACULTY_NOTES,
            },
          },
        }
      }
      return { status: 404, json: { detail: 'missing' } }
    })
    const { user } = renderReport()
    expect(
      await screen.findByRole('heading', { name: 'Sprint goal' }),
    ).toBeInTheDocument()
    expect(screen.getByText(NONE_COMPLETED)).toHaveClass('honest')
    expect(screen.getByText(NO_BLOCKERS)).toHaveClass('muted-italic')
    await user.click(screen.getByRole('button', { name: 'Edit report' }))
    await user.click(screen.getByRole('button', { name: 'Discard draft' }))
    expect(
      screen.getByRole('button', { name: 'Edit report' }),
    ).toBeInTheDocument()

    mode = 'open'
    cleanup()
    renderReport()
    expect(
      await screen.findByText('Close the sprint before generating a report.'),
    ).toBeInTheDocument()

    mode = 'empty'
    cleanup()
    renderReport()
    expect(await screen.findByText(/nothing to report/)).toBeInTheDocument()

    mode = 'error'
    cleanup()
    const again = renderReport()
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    await again.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()

    mode = 'auth'
    await again.user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sign in page')).toBeInTheDocument()
  })

  it('shows a stored draft, an empty generation, and a failed load', async () => {
    let draftStatus = 200
    let sprintStatus = 200
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (sprintStatus !== 200)
        return { status: sprintStatus, json: { detail: 'down' } }
      if (path === '/sprints/sp1') {
        return {
          json: {
            id: 'sp1',
            project_id: 'p1',
            goal: 'Ship',
            status: 'Closed',
            stories_snapshot: snapshot,
          },
        }
      }
      if (path.endsWith('/members')) return { json: [] }
      if (path.endsWith('/comments')) return { json: [] }
      if (path.endsWith('/report/draft')) {
        return draftStatus === 200
          ? { json: { draft_content: draft } }
          : { status: draftStatus, json: { detail: 'empty' } }
      }
      if (path.endsWith('/report') && call.method === 'GET') {
        return { json: { draft_content: draft, final_content: null } }
      }
      return { json: [] }
    })
    const first = renderReport()
    expect(await screen.findByLabelText('Sprint goal')).toHaveValue(
      'Ship the board',
    )
    draftStatus = 422
    await first.user.click(
      screen.getByRole('button', { name: 'Regenerate draft' }),
    )
    expect(await screen.findByText(/nothing to report/)).toBeInTheDocument()

    sprintStatus = 500
    cleanup()
    renderReport()
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
  })

  it('posts a sprint comment and adds a teammate from the report', async () => {
    const posted = {
      id: 'c1',
      author_id: 'ann',
      body: 'Looks good',
      mentioned_ids: [],
      created_at: '2024-06-01T15:04:00.000Z',
    }
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/sprints/sp1') {
        return {
          json: {
            id: 'sp1',
            project_id: 'p1',
            goal: 'Ship',
            status: 'Closed',
            stories_snapshot: [],
          },
        }
      }
      if (path === '/projects/p1/members' && call.method === 'POST')
        return { status: 201, json: { id: 'ann', name: 'Ann' } }
      if (path.endsWith('/members')) return { json: [] }
      if (path.endsWith('/comments') && call.method === 'POST')
        return { status: 201, json: posted }
      if (path.endsWith('/comments')) return { json: [] }
      if (path.endsWith('/report') && call.method === 'GET')
        return { json: { final_content: draft } }
      return { json: [] }
    })
    const { user } = renderReport()
    expect(
      await screen.findByRole('button', { name: 'Edit report' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a teammate' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(withinDialogName(dialog), { target: { value: 'Ann' } })
    await user.click(screen.getByRole('button', { name: 'Add teammate' }))
    expect(
      await screen.findByRole('option', { name: 'Ann' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.selectOptions(screen.getByLabelText('Your name'), 'ann')
    fireEvent.change(screen.getByPlaceholderText('Write a comment'), {
      target: { value: 'Looks good' },
    })
    await user.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Looks good')).toBeInTheDocument()
  })

  it('refreshes sprint comments while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let reads = 0
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/sprints/sp1') {
        return {
          json: {
            id: 'sp1',
            project_id: 'p1',
            goal: 'Ship',
            status: 'Closed',
            stories_snapshot: [],
          },
        }
      }
      if (path.endsWith('/members')) return { json: [] }
      if (path.endsWith('/comments')) {
        reads += 1
        return { json: [] }
      }
      if (path.endsWith('/report') && call.method === 'GET')
        return { json: { final_content: draft } }
      return { json: [] }
    })
    renderReport()
    expect(
      await screen.findByRole('button', { name: 'Edit report' }),
    ).toBeInTheDocument()
    const ready = reads
    await vi.advanceTimersByTimeAsync(10000)
    expect(reads).toBeGreaterThan(ready)
  })
})

function withinDialogName(dialog: HTMLElement) {
  return dialog.querySelector('input') as HTMLInputElement
}
