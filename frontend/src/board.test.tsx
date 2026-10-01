import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspacePage } from './WorkspacePage'
import { setToken } from './api'
import { SessionProvider } from './session'
import { Toaster } from './toast'
import type { Result } from './test/fetch'
import { mockFetch, pathOf } from './test/fetch'
import type { Member, Sprint, Story } from './types'

const project = {
  id: 'p1',
  name: 'Capstone',
  description: 'One page',
  created_at: '2024-01-01T00:00:00.000Z',
}

function story(partial: Partial<Story> & Pick<Story, 'id' | 'title'>): Story {
  return {
    project_id: 'p1',
    description: null,
    status: 'Backlog',
    priority: 'Medium',
    type: 'Feature',
    github_branch_ref: null,
    open_sprint_id: null,
    created_at: '2024-01-01T00:00:00.000Z',
    ...partial,
  }
}

const backlog = story({
  id: 's1',
  title: 'Publish board',
  description: 'Visible',
})
const done = story({
  id: 's2',
  title: 'Old bug',
  status: 'Done',
  priority: 'Low',
  type: 'Bug',
  open_sprint_id: 'sp1',
  created_at: '2024-02-01T00:00:00.000Z',
})

const active: Sprint = {
  id: 'sp1',
  project_id: 'p1',
  goal: 'Ship',
  status: 'Active',
}
const planned: Sprint = {
  id: 'sp2',
  project_id: 'p1',
  goal: null,
  status: 'Planned',
}
const closed: Sprint = {
  id: 'sp3',
  project_id: 'p1',
  goal: 'First slice',
  status: 'Closed',
}

function renderBoard() {
  setToken('token-1')
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
          { path: '/projects/:projectId', element: <WorkspacePage /> },
          { path: '/sprints/:sprintId/report', element: <p>Report page</p> },
          { path: '/sign-in', element: <p>Sign in page</p> },
          { path: '/', element: <p>Projects home</p> },
        ],
      },
    ],
    { initialEntries: ['/projects/p1'] },
  )
  render(<RouterProvider router={router} />)
  return { user, router }
}

beforeEach(() => {
  setToken('token-1')
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
})

describe('board', () => {
  it('retries a failed load and refreshes while the tab is visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let failed = true
    let loads = 0
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects/p1' && call.method === 'GET') {
        loads += 1
        if (failed) return { status: 500, json: { detail: 'down' } }
        return { json: project }
      }
      if (path.endsWith('/stories')) return { json: [] }
      if (path.endsWith('/sprints')) return { json: [] }
      if (path.endsWith('/members')) return { json: [] }
      return { json: [] }
    })
    renderBoard()
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    failed = false
    await screen.getByRole('button', { name: 'Try again' }).click()
    expect(
      await screen.findByRole('heading', { name: 'Capstone' }),
    ).toBeInTheDocument()
    const ready = loads
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(loads).toBeGreaterThan(ready)
  })

  it('adds a story, plans through failures, and explains an empty backlog', async () => {
    const stories: Story[] = []
    let sprints: Sprint[] = []
    let createStory: Result = { status: 500, json: {} }
    let plan: Result = { status: 409, json: { detail: 'taken' } }
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects/p1' && call.method === 'GET')
        return { json: { ...project, description: null } }
      if (path.endsWith('/stories') && call.method === 'GET')
        return { json: stories }
      if (path.endsWith('/stories') && call.method === 'POST')
        return createStory
      if (path.endsWith('/sprints') && call.method === 'GET')
        return { json: sprints }
      if (path.endsWith('/sprints') && call.method === 'POST') return plan
      if (path.endsWith('/members')) return { json: [] }
      return { json: [] }
    })
    const { user } = renderBoard()
    const column = () =>
      document.querySelector('[data-column="Backlog"]') as HTMLElement
    expect(
      await screen.findByText(/No stories yet — add one/),
    ).toBeInTheDocument()
    const emptyAdd = within(column()).getAllByRole('button', {
      name: 'Add story',
    })[1]!
    await user.click(emptyAdd)
    const form = () => document.querySelector('.add-story') as HTMLElement
    fireEvent.submit(form())
    fireEvent.change(within(form()).getByLabelText('Title'), {
      target: { value: 'Publish board' },
    })
    fireEvent.change(within(form()).getByLabelText('Description'), {
      target: { value: 'Visible' },
    })
    await user.selectOptions(within(form()).getByLabelText('Priority'), 'High')
    await user.selectOptions(within(form()).getByLabelText('Type'), 'Bug')
    await user.click(within(form()).getByRole('button', { name: 'Add story' }))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()

    createStory = {
      status: 201,
      json: story({
        id: 's1',
        title: 'Publish board',
        description: 'Visible',
        priority: 'High',
        type: 'Bug',
      }),
    }
    await user.click(within(form()).getByRole('button', { name: 'Add story' }))
    expect(
      await screen.findByRole('heading', { name: 'Publish board' }),
    ).toBeInTheDocument()

    await user.click(
      within(column()).getByRole('button', { name: 'Add story' }),
    )
    fireEvent.change(screen.getByLabelText('Sprint goal'), {
      target: { value: 'Ship' },
    })
    await user.click(screen.getByRole('button', { name: 'Plan sprint' }))
    expect(
      await screen.findByText('A sprint is already planned or active.'),
    ).toBeInTheDocument()
    plan = { status: 500, json: {} }
    await user.click(screen.getByRole('button', { name: 'Plan sprint' }))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()
    plan = { status: 201, json: planned }
    sprints = [planned]
    await user.click(screen.getByRole('button', { name: 'Plan sprint' }))
    expect(
      await screen.findByRole('button', { name: 'Activate' }),
    ).toBeInTheDocument()
  })

  it('hides resolved cards, opens history, and reports move and close failures', async () => {
    const rows = [backlog, done]
    let sprints: Sprint[] = [active, closed]
    let patch: Result = {
      status: 409,
      json: {
        detail:
          'No active sprint — create or activate one before adding stories.',
      },
    }
    let close: Result = { status: 409, json: { detail: 'closed' } }
    const activate: Result = { status: 500, json: {} }
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects/p1' && call.method === 'GET')
        return { json: project }
      if (path === '/projects/p1/stories') return { json: rows }
      if (path === '/projects/p1/sprints' && call.method === 'GET')
        return { json: sprints }
      if (path === '/sprints/sp1' && call.method === 'GET')
        return { json: { ...active, stories: [done] } }
      if (path === '/projects/p1/members') return { json: [] }
      if (path.startsWith('/stories/') && call.method === 'PATCH') return patch
      if (path === '/sprints/sp1/close') return close
      if (path === '/sprints/sp2/activate') {
        sprints = [active]
        return activate
      }
      return { json: [] }
    })
    const { user } = renderBoard()
    expect(
      await screen.findByRole('heading', { name: 'Capstone' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Hide resolved' }))
    expect(
      await screen.findByText(/Resolved stories are hidden/),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'History' }))
    expect(screen.getByRole('link', { name: 'First slice' })).toHaveAttribute(
      'href',
      '/sprints/sp3/report',
    )

    const move = async () => {
      const card = screen
        .getByRole('heading', { name: 'Publish board' })
        .closest('article') as HTMLElement
      fireEvent.click(within(card).getByRole('button', { name: 'Move story' }))
      fireEvent.click(
        screen.getByRole('button', { name: 'Move to: In Progress' }),
      )
    }
    await move()
    expect(
      await screen.findByText(
        'No active sprint — create or activate one before adding stories.',
      ),
    ).toBeInTheDocument()

    patch = {
      status: 409,
      json: { detail: 'There is no active sprint right now' },
    }
    await move()
    expect(
      await screen.findByText(
        'No active sprint — create or activate one before adding stories.',
      ),
    ).toBeInTheDocument()

    patch = { status: 409, json: { detail: 'This story was already moved.' } }
    await move()
    expect(
      await screen.findByText(
        'This story was already moved — refreshing board.',
      ),
    ).toBeInTheDocument()

    patch = { status: 409, json: { detail: 'Someone already moved that card' } }
    await move()
    expect(
      await screen.findByText(
        'This story was already moved — refreshing board.',
      ),
    ).toBeInTheDocument()

    patch = { status: 409, json: { detail: 'conflict' } }
    await move()
    expect(
      await screen.findByText("Couldn't move that story — try again."),
    ).toBeInTheDocument()

    patch = { status: 500, json: {} }
    await move()
    expect(
      await screen.findByText("Couldn't move that story — try again."),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close sprint' }))
    fireEvent.change(screen.getByLabelText('Faculty notes'), {
      target: { value: 'Watch' },
    })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close sprint' }))
    expect(screen.getByLabelText('Faculty notes')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(
      await screen.findByText('This sprint is already closed.'),
    ).toBeInTheDocument()
    close = { status: 500, json: {} }
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()

    sprints = [planned]
    window.dispatchEvent(new Event('focus'))
    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()
  })

  it('drops a card into a highlighted column', async () => {
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects/p1' && call.method === 'GET')
        return { json: project }
      if (path === '/projects/p1/stories') return { json: [backlog] }
      if (path === '/projects/p1/sprints') return { json: [active] }
      if (path === '/sprints/sp1') return { json: { ...active, stories: [] } }
      if (path.endsWith('/members')) return { json: [] }
      if (call.method === 'PATCH') {
        return {
          json: { ...backlog, status: 'In Progress', open_sprint_id: 'sp1' },
        }
      }
      return { json: [] }
    })
    renderBoard()
    const card = (
      await screen.findByRole('heading', { name: 'Publish board' })
    ).closest('article') as HTMLElement
    const column = document.querySelector(
      '[data-column="In Progress"]',
    ) as HTMLElement
    document.elementFromPoint = () => column.querySelector('h2')
    fireEvent.pointerDown(card, { button: 0, clientX: 0, clientY: 0 })
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 40, clientY: 0 }),
    )
    await waitFor(() => expect(card.className).toContain('lifting'))
    fireEvent.pointerMove(column)
    expect(column.className).toContain('target')
    expect(document.querySelector('.insert-line')).not.toBeNull()
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 40, clientY: 0 }),
    )
    await waitFor(() =>
      expect(
        within(column).getByRole('heading', { name: 'Publish board' }),
      ).toBeInTheDocument(),
    )
  })

  it('edits a ticket, inserts a teammate, and manages the team dialog', async () => {
    const members: Member[] = []
    let patch: Result = { json: { ...backlog, title: 'Publish the board' } }
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects/p1' && call.method === 'GET')
        return { json: project }
      if (path === '/projects/p1/stories' && call.method === 'GET')
        return { json: [backlog] }
      if (path === '/projects/p1/sprints') return { json: [active] }
      if (path === '/sprints/sp1') return { json: { ...active, stories: [] } }
      if (path === '/projects/p1/members' && call.method === 'GET')
        return { json: members }
      if (path === '/projects/p1/members' && call.method === 'POST') {
        if ((call.body as { name?: string }).name === 'Ann')
          return { status: 201, json: { id: 'ann', name: 'Ann' } }
        if ((call.body as { name?: string }).name === 'Bea')
          return { status: 409, json: { detail: 'taken' } }
        return { status: 500, json: {} }
      }
      if (path === '/stories/s1/comments' && call.method === 'GET')
        return { json: [] }
      if (path === '/stories/s1/comments' && call.method === 'POST') {
        return {
          status: 201,
          json: {
            id: 'c1',
            author_id: 'ann',
            body: 'Hi @Ann ',
            mentioned_ids: ['ann'],
            created_at: '2024-06-01T15:04:00.000Z',
          },
        }
      }
      if (path === '/stories/s1' && call.method === 'PATCH') return patch
      return { json: [] }
    })
    const { user } = renderBoard()
    const card = (
      await screen.findByRole('heading', { name: 'Publish board' })
    ).closest('article') as HTMLElement
    fireEvent.pointerDown(card, { button: 2, clientX: 0, clientY: 0 })
    fireEvent.pointerDown(card, { button: 0, clientX: 0, clientY: 0 })
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 1, clientY: 0 }),
    )
    const dialog = await screen.findByRole('dialog')
    const title = within(dialog).getByLabelText('Title')
    fireEvent.change(title, { target: { value: '   ' } })
    fireEvent.blur(title)
    expect(title).toHaveValue('Publish board')
    fireEvent.change(title, { target: { value: 'Publish the board' } })
    fireEvent.keyDown(title, { key: 'Enter' })
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Title')).toHaveValue(
        'Publish the board',
      ),
    )
    fireEvent.blur(within(dialog).getByLabelText('Title'))

    const description = within(dialog).getByLabelText('Description')
    fireEvent.change(description, { target: { value: 'Edited' } })
    fireEvent.blur(description)
    fireEvent.change(description, { target: { value: '   ' } })
    fireEvent.blur(description)
    await user.selectOptions(within(dialog).getByLabelText('Priority'), 'High')
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'Chore')
    await user.selectOptions(
      within(dialog).getByLabelText('Status'),
      'In Progress',
    )
    const branch = within(dialog).getByLabelText('GitHub branch reference')
    fireEvent.change(branch, { target: { value: 'feature/board' } })
    fireEvent.blur(branch)
    fireEvent.change(branch, { target: { value: '   ' } })
    fireEvent.blur(branch)

    await user.click(
      within(dialog).getByRole('button', { name: 'Add a teammate' }),
    )
    const team = screen.getAllByRole('dialog')[1]!
    fireEvent.submit(team.querySelector('form')!)
    fireEvent.change(within(team).getByLabelText('Name'), {
      target: { value: 'Ann' },
    })
    await user.click(within(team).getByRole('button', { name: 'Add teammate' }))
    expect(await within(team).findByText('Ann')).toBeInTheDocument()
    fireEvent.change(within(team).getByLabelText('Name'), {
      target: { value: 'Bea' },
    })
    await user.click(within(team).getByRole('button', { name: 'Add teammate' }))
    expect(
      await within(team).findByText('That name is already on this project.'),
    ).toBeInTheDocument()
    fireEvent.change(within(team).getByLabelText('Name'), {
      target: { value: 'Cy' },
    })
    await user.click(within(team).getByRole('button', { name: 'Add teammate' }))
    expect(
      await within(team).findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()
    team.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }))
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Team' }))
    const reopened = screen
      .getAllByRole('dialog')
      .find((element) => element.classList.contains('team'))!
    await user.click(within(reopened).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))

    const ticket = screen.getByRole('dialog')
    await user.selectOptions(within(ticket).getByLabelText('Your name'), 'ann')
    const box = within(ticket).getByPlaceholderText('Write a comment')
    fireEvent.change(box, { target: { value: '@An' } })
    fireEvent.select(box, { target: { selectionStart: 3 } })
    await user.click(within(ticket).getByRole('button', { name: 'Ann' }))
    await waitFor(() => {
      expect(
        (
          within(ticket).getByPlaceholderText(
            'Write a comment',
          ) as HTMLTextAreaElement
        ).value,
      ).toContain('@Ann')
    })
    await user.click(within(ticket).getByRole('button', { name: 'Post' }))
    await waitFor(() =>
      expect(document.querySelector('.comments')?.textContent).toContain('Hi'),
    )

    patch = { status: 500, json: {} }
    fireEvent.change(within(ticket).getByLabelText('Title'), {
      target: { value: 'Nope' },
    })
    fireEvent.blur(within(ticket).getByLabelText('Title'))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()

    fireEvent.click(ticket)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const again = screen
      .getByRole('heading', { name: 'Publish the board' })
      .closest('article') as HTMLElement
    fireEvent.pointerDown(again, { button: 0, clientX: 0, clientY: 0 })
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 0, clientY: 0 }),
    )
    const reopenedTicket = await screen.findByRole('dialog')
    reopenedTicket.dispatchEvent(
      new Event('cancel', { bubbles: true, cancelable: true }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('ignores a story comment failure that is not an expired session', async () => {
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects/p1' && call.method === 'GET')
        return { json: project }
      if (path.endsWith('/stories') && call.method === 'GET')
        return { json: [backlog] }
      if (path.endsWith('/sprints')) return { json: [] }
      if (path.endsWith('/members')) return { json: [] }
      if (path.endsWith('/comments'))
        return { status: 500, json: { detail: 'nope' } }
      return { json: [] }
    })
    renderBoard()
    const card = (
      await screen.findByRole('heading', { name: 'Publish board' })
    ).closest('article') as HTMLElement
    fireEvent.pointerDown(card, { button: 0, clientX: 0, clientY: 0 })
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 0, clientY: 0 }),
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByText('No comments yet.')).toBeInTheDocument()
  })
})
