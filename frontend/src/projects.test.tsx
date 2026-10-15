import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from './App'
import { setToken } from './api'
import type { Result } from './test/fetch'
import { mockFetch, pathOf } from './test/fetch'

beforeEach(() => {
  setToken(null)
})

function openProjects() {
  setToken('token-1')
  const user = userEvent.setup({ delay: null })
  const router = createMemoryRouter(routes, { initialEntries: ['/'] })
  render(<RouterProvider router={router} />)
  return { user, router }
}

describe('projects', () => {
  it('creates a project and explains empty, failed, and duplicate states', async () => {
    const user = userEvent.setup({ delay: null })
    let resolveProjects: ((value: Result) => void) | undefined
    const projects: Result | Promise<Result> = new Promise<Result>(
      (resolve) => {
        resolveProjects = resolve
      },
    )
    let create: Result | Promise<Result> = {
      status: 409,
      json: { detail: 'duplicate' },
    }
    let resolveCreate: ((value: Result) => void) | undefined
    const calls = mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/projects' && call.method === 'GET') return projects
      if (path === '/projects' && call.method === 'POST') return create
      return { status: 404, json: { detail: 'missing' } }
    })
    setToken('token-1')
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    expect(await screen.findByText('Loading projects…')).toBeInTheDocument()
    resolveProjects?.({ json: [] })
    expect(await screen.findByText('No projects yet.')).toBeInTheDocument()
    expect(
      calls.find((call) => pathOf(call.url) === '/projects')?.authorization,
    ).toBe('Bearer token-1')
    await user.click(screen.getByRole('button', { name: 'New Project' }))
    fireEvent.submit(
      screen.getByRole('button', { name: 'Create project' }).closest('form')!,
    )
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Capstone' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'One page' },
    })
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(
      await screen.findByText('A project with that name already exists.'),
    ).toBeInTheDocument()

    create = { status: 400, json: { detail: 'Name is required.' } }
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()

    create = { status: 500, json: {} }
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(
      await screen.findByText("Couldn't save that — try again."),
    ).toBeInTheDocument()

    create = new Promise<Result>((resolve) => {
      resolveCreate = resolve
    })
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Capstone')).toBeInTheDocument()
    expect(
      screen.getByText('One page', { selector: 'small' }),
    ).toBeInTheDocument()
    fireEvent.submit(
      screen.getByRole('button', { name: 'Create project' }).closest('form')!,
    )
    resolveCreate?.({
      status: 201,
      json: {
        id: 'p1',
        name: 'Capstone',
        description: 'One page',
        created_at: '2024-01-01T00:00:00.000Z',
      },
    })
    expect(
      await screen.findByRole('link', { name: /Capstone/ }),
    ).toBeInTheDocument()
    const created = calls.filter((call) => call.method === 'POST').at(-1)
    expect(created?.body).toEqual({ name: 'Capstone', description: 'One page' })

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Notes' },
    })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: '   ' },
    })
    create = {
      status: 201,
      json: {
        id: 'p2',
        name: 'Notes',
        description: null,
        created_at: '2024-01-02T00:00:00.000Z',
      },
    }
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Notes' })).toBeInTheDocument(),
    )
    expect(calls.filter((call) => call.method === 'POST').at(-1)?.body).toEqual(
      { name: 'Notes' },
    )
  })

  it('stays on the workspace when creating is unauthorized', async () => {
    mockFetch((call) => {
      if (pathOf(call.url) === '/projects' && call.method === 'POST') {
        return { status: 401, json: { detail: 'Sign in required.' } }
      }
      return { json: [] }
    })
    const { user } = openProjects()
    await user.click(await screen.findByRole('button', { name: 'New Project' }))
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Capstone' },
    })
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Your session ended.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('explains a failed load and retries', async () => {
    let projects: Result = { status: 500, json: { detail: 'down' } }
    mockFetch((call) => {
      if (pathOf(call.url) === '/projects') return projects
      return { json: [] }
    })
    const { user } = openProjects()
    expect(
      await screen.findByText(/Couldn't load projects/),
    ).toBeInTheDocument()
    projects = { status: 401, json: { detail: 'Sign in required.' } }
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Your session ended.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('retries a failed load into an empty list', async () => {
    let projects: Result = { status: 500, json: { detail: 'down' } }
    mockFetch((call) => {
      if (pathOf(call.url) === '/projects') return projects
      return { json: [] }
    })
    const { user } = openProjects()
    expect(
      await screen.findByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    projects = { json: [] }
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No projects yet.')).toBeInTheDocument()
  })

  it('rejects a name that is too long', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetch(() => ({ json: [] }))
    setToken('token-1')
    const router = createMemoryRouter(routes, { initialEntries: ['/'] })
    render(<RouterProvider router={router} />)
    await screen.findByRole('button', { name: 'New Project' })
    await user.click(screen.getByRole('button', { name: 'New Project' }))
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'x'.repeat(101) } })
    expect(
      screen.getByText('Name must be 100 characters or fewer.'),
    ).toBeInTheDocument()
    fireEvent.submit(name.closest('form')!)
  })
})
