import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from './App'
import { getToken, setToken } from './api'
import { mockFetch, pathOf } from './test/fetch'
import { signedInUser } from './test/login'

beforeEach(() => {
  setToken(null)
})

function renderAuth(path: string) {
  const user = userEvent.setup({ delay: null })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return { user, router }
}

describe('auth', () => {
  it('opens the workspace without a sign-in page', async () => {
    mockFetch((call) => {
      if (pathOf(call.url) === '/projects' && call.method === 'GET')
        return { json: [] }
      return { status: 404, json: { detail: 'missing' } }
    })
    const guest = renderAuth('/projects/p1')
    expect(guest.router.state.location.pathname).toBe('/projects/p1')
    expect(screen.queryByLabelText('Email')).toBeNull()

    cleanup()
    const home = renderAuth('/sign-in')
    await waitFor(() => expect(home.router.state.location.pathname).toBe('/'))
    expect(
      await screen.findByRole('button', { name: 'New Project' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('creates an account and returns to the workspace', async () => {
    const calls = mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/auth/register')
        return { status: 201, json: { token: 'reg-token', user: signedInUser } }
      if (path === '/projects' && call.method === 'GET') return { json: [] }
      return { status: 404, json: { detail: 'missing' } }
    })
    const { user } = renderAuth('/sign-up')
    fireEvent.submit(
      screen.getByRole('button', { name: 'Create account' }).closest('form')!,
    )
    await user.type(screen.getByLabelText('Email'), 'Ada@Example.com')
    await user.type(screen.getByLabelText('Password'), 'short')
    expect(
      screen.getByText('Password must be at least 8 characters.'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Confirm password'), 'other-password')
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Confirm password'), 'short')
    await user.clear(screen.getByLabelText('Password'))
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.clear(screen.getByLabelText('Confirm password'))
    await user.type(screen.getByLabelText('Confirm password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument()
    expect(getToken()).toBe('reg-token')
    expect(localStorage.getItem('reg-token')).toBeNull()
    await waitFor(() => {
      const projectCall = calls.find(
        (call) => pathOf(call.url) === '/projects' && call.method === 'GET',
      )
      expect(projectCall?.authorization).toBe('Bearer reg-token')
    })

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      await screen.findByRole('button', { name: 'New Project' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('shows sign-up failures', async () => {
    let status = 500
    mockFetch(() => {
      if (status === 0) return { network: true }
      return {
        status,
        json: { detail: status === 400 ? 'email must contain @' : 'no' },
      }
    })
    const { user, router } = renderAuth('/sign-up')
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password1' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'password1' },
    })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      await screen.findByText("Couldn't create the account — try again."),
    ).toBeInTheDocument()

    status = 0
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      await screen.findByText("Couldn't create the account — try again."),
    ).toBeInTheDocument()

    status = 409
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      await screen.findByText('An account with that email already exists.'),
    ).toBeInTheDocument()

    status = 400
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('email must contain @')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Back to workspace' }))
    expect(router.state.location.pathname).toBe('/')
  })

  it('shows a busy label while sign-up is open', async () => {
    let finish: ((value: { status: number; json: unknown }) => void) | undefined
    mockFetch(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const { user } = renderAuth('/sign-up')
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'password1' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'password1' },
    })
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(
      screen.getByRole('button', { name: 'Creating account…' }),
    ).toBeDisabled()
    finish?.({ json: { token: 'token-1', user: signedInUser }, status: 201 })
    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument()
  })

  it('leaves sign-up when a session is already active', async () => {
    mockFetch((call) => {
      if (pathOf(call.url) === '/auth/register')
        return { json: { token: 'token-1', user: signedInUser } }
      return { json: [] }
    })
    const { user, router } = renderAuth('/sign-up')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.type(screen.getByLabelText('Confirm password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await screen.findByRole('button', { name: 'Sign out' })
    await router.navigate('/sign-up')
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(
      screen.getByRole('heading', { name: 'My Workspace' }),
    ).toBeInTheDocument()
  })
})
