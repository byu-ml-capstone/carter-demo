import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from './App'
import { setToken } from './api'
import type { Result } from './test/fetch'
import { mockFetch, pathOf } from './test/fetch'
import { signedInUser } from './test/login'

beforeEach(() => {
  setToken(null)
})

describe('projects', () => {
  it('creates a project and explains empty, failed, and duplicate states', async () => {
    const user = userEvent.setup({ delay: null })
    let projects: Result = { json: [] }
    let create: Result | Promise<Result> = { status: 409, json: { detail: 'duplicate' } }
    let resolveCreate: ((value: Result) => void) | undefined
    mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/auth/login') return { json: { token: 'token-1', user: signedInUser } }
      if (path === '/auth/logout') return { status: 204 }
      if (path === '/projects' && call.method === 'GET') return projects
      if (path === '/projects' && call.method === 'POST') return create
      return { status: 404, json: { detail: 'missing' } }
    })
    const router = createMemoryRouter(routes, { initialEntries: ['/sign-in?next=/'] })
    render(<RouterProvider router={router} />)
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('No projects yet.')).toBeInTheDocument()
    fireEvent.submit(document.querySelector('form')!)
    await user.type(screen.getByLabelText('Name'), 'Capstone')
    await user.type(screen.getByLabelText('Description'), 'One page')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('A project with that name already exists.')).toBeInTheDocument()

    create = { status: 400, json: { detail: 'Name is required.' } }
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Name is required.')).toBeInTheDocument()

    create = { status: 401, json: { detail: 'Sign in required.' } }
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    create = { status: 500, json: { detail: '' } }
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Projects' })
    await user.type(screen.getByLabelText('Name'), 'Capstone')
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText("Couldn't save that — try again.")).toBeInTheDocument()

    create = new Promise<Result>((resolve) => {
      resolveCreate = resolve
    })
    await user.click(screen.getByRole('button', { name: 'Create project' }))
    expect(await screen.findByText('Capstone')).toBeInTheDocument()
    resolveCreate?.({
      status: 201,
      json: {
        id: 'p1',
        name: 'Capstone',
        description: 'One page',
        created_at: '2024-01-01T00:00:00.000Z',
      },
    })
    expect(await screen.findByRole('link', { name: /Capstone/ })).toBeInTheDocument()

    projects = { status: 500, json: { detail: 'down' } }
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Couldn't load projects/)).toBeInTheDocument()
    projects = { json: [] }
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No projects yet.')).toBeInTheDocument()

    projects = { status: 401, json: { detail: 'Sign in required.' } }
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
  })

  it('rejects a name that is too long', async () => {
    const user = userEvent.setup({ delay: null })
    mockFetch((call) => {
      if (pathOf(call.url) === '/auth/login') return { json: { token: 'token-1', user: signedInUser } }
      return { json: [] }
    })
    const router = createMemoryRouter(routes, { initialEntries: ['/sign-in?next=/'] })
    render(<RouterProvider router={router} />)
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'x'.repeat(101) } })
    expect(screen.getByText('Name must be 100 characters or fewer.')).toBeInTheDocument()
    fireEvent.submit(name.closest('form')!)
  })
})
