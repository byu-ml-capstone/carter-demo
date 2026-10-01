import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setToken } from './api'
import { setReportDirty } from './reportGuard'
import { mockFetch, pathOf } from './test/fetch'
import { loginTo, signedInUser } from './test/login'
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

const stories: Story[] = [
  story({
    id: 's-old',
    title: 'Older card',
    priority: 'Low',
    type: 'Bug',
    github_branch_ref: 'feature/older',
    created_at: '2020-01-01T00:00:00.000Z',
  }),
  story({
    id: 's-new',
    title: 'Newer card',
    priority: 'High',
    type: 'Feature',
    created_at: '2024-06-01T00:00:00.000Z',
  }),
]

const members: Member[] = [{ id: 'ann', name: 'Ann' }]

beforeEach(() => {
  setToken(null)
  setReportDirty(false)
})

describe('workspace', () => {
  it('sorts cards, drops them, and closes a sprint with faculty notes', async () => {
    const rows = stories.map((item) => ({ ...item }))
    let sprints: Sprint[] = []
    const moveStatus = 200
    const moveDetail = ''
    const calls = mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/auth/login')
        return { json: { token: 'token-1', user: signedInUser } }
      if (path === '/projects/p1' && call.method === 'GET')
        return { json: project }
      if (path === '/projects/p1/stories' && call.method === 'GET')
        return { json: rows }
      if (path === '/projects/p1/sprints' && call.method === 'GET')
        return { json: sprints }
      if (path === '/projects/p1/sprints' && call.method === 'POST') {
        const created: Sprint = {
          id: 'sp-new',
          project_id: 'p1',
          goal: 'Ship the board',
          status: 'Planned',
        }
        sprints = [created]
        return { status: 201, json: created }
      }
      if (path === '/sprints/sp-new/activate') {
        sprints = [
          {
            ...sprints[0]!,
            status: 'Active',
            goal: 'Ship the board',
            id: 'sp-new',
            project_id: 'p1',
          },
        ]
        return { json: sprints[0] }
      }
      if (path === '/sprints/sp-new' && call.method === 'GET')
        return { json: { ...sprints[0], stories: [] } }
      if (path === '/projects/p1/members') return { json: members }
      if (path === '/sprints/sp-new/close')
        return { json: { ...sprints[0], status: 'Closed' } }
      if (path === '/sprints/sp-new/report')
        return { status: 404, json: { detail: 'missing' } }
      if (path === '/sprints/sp-new/report/draft') {
        return {
          json: {
            draft_content: {
              sprint_goal: 'Ship',
              completed_work: 'Done',
              next_sprint_goals: 'Next',
              blockers: 'None',
              faculty_notes: 'Notes',
            },
          },
        }
      }
      if (path.startsWith('/stories/') && call.method === 'PATCH') {
        if (moveStatus !== 200)
          return { status: moveStatus, json: { detail: moveDetail } }
        const id = path.split('/')[2]
        const body = { ...(call.body as object) } as Partial<Story> & {
          expected_status?: string
        }
        delete body.expected_status
        const index = rows.findIndex((item) => item.id === id)
        rows[index] = { ...rows[index]!, ...body }
        return { json: rows[index] }
      }
      return { json: [] }
    })
    const { user } = await loginTo('/projects/p1')
    expect(
      await screen.findByRole('heading', { name: 'Capstone' }),
    ).toBeInTheDocument()
    const backlog = () =>
      document.querySelector('[data-column="Backlog"]') as HTMLElement
    const titles = () =>
      [...backlog().querySelectorAll('h3')].map((node) => node.textContent)
    expect(titles()).toEqual(['Older card', 'Newer card'])
    await user.click(screen.getByRole('button', { name: 'Priority' }))
    expect(titles()).toEqual(['Newer card', 'Older card'])
    await user.click(screen.getByRole('button', { name: 'Date created' }))
    expect(titles()).toEqual(['Older card', 'Newer card'])
    expect(
      calls.find((call) => pathOf(call.url) === '/projects/p1')?.authorization,
    ).toBe('Bearer token-1')

    await user.type(screen.getByLabelText('Sprint goal'), 'Ship the board')
    await user.click(screen.getByRole('button', { name: 'Plan sprint' }))
    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(
      await screen.findByRole('button', { name: 'Close sprint' }),
    ).toBeInTheDocument()

    const card = within(backlog())
      .getByRole('heading', { name: 'Newer card' })
      .closest('article') as HTMLElement
    document.elementFromPoint = () =>
      document.querySelector('[data-column="In Progress"]')
    fireEvent.pointerDown(card, { button: 0, clientX: 0, clientY: 0 })
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: 40, clientY: 0 }),
    )
    fireEvent.pointerMove(
      document.querySelector('[data-column="In Progress"]') as HTMLElement,
    )
    window.dispatchEvent(
      new PointerEvent('pointerup', { clientX: 40, clientY: 0 }),
    )
    const dropped = calls.filter((call) => call.method === 'PATCH').at(-1)
    expect(dropped?.body).toEqual({
      status: 'In Progress',
      expected_status: 'Backlog',
    })
    expect(dropped?.body).not.toHaveProperty('position')

    await user.click(screen.getByRole('button', { name: 'Close sprint' }))
    const notes = screen.getByLabelText('Faculty notes')
    await user.type(notes, '  Watch the demo  ')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    const closed = calls
      .filter((call) => pathOf(call.url) === '/sprints/sp-new/close')
      .at(-1)
    expect(closed?.body).toEqual({ faculty_notes: 'Watch the demo' })
    expect(closed?.authorization).toBe('Bearer token-1')
  })
})
