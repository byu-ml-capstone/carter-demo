import { fireEvent, render, screen } from '@testing-library/react'
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
  it('sends visitors to sign in and keeps a bearer token in memory', async () => {
    const calls = mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/auth/register') return { status: 201, json: { token: 'reg-token', user: signedInUser } }
      if (path === '/auth/login') return { json: { token: 'log-token', user: signedInUser } }
      if (path === '/projects' && call.method === 'GET') return { json: [] }
      return { status: 404, json: { detail: 'missing' } }
    })
    const guest = renderAuth('/projects/p1')
    expect(await screen.findByRole('heading', { name: 'My Workspace' })).toBeInTheDocument()
    expect(guest.router.state.location.pathname).toBe('/sign-in')
    expect(guest.router.state.location.search).toContain('next=')

    await guest.user.click(screen.getByRole('link', { name: 'Create an account' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)
    await guest.user.type(screen.getByLabelText('Email'), 'Ada@Example.com')
    await guest.user.type(screen.getByLabelText('Password'), 'short')
    expect(screen.getByText('Password must be at least 8 characters.')).toBeInTheDocument()
    await guest.user.type(screen.getByLabelText('Confirm password'), 'other-password')
    expect(screen.getByText('Passwords don’t match.')).toBeInTheDocument()
    await guest.user.clear(screen.getByLabelText('Confirm password'))
    await guest.user.type(screen.getByLabelText('Confirm password'), 'short')
    await guest.user.clear(screen.getByLabelText('Password'))
    await guest.user.type(screen.getByLabelText('Password'), 'password1')
    await guest.user.clear(screen.getByLabelText('Confirm password'))
    await guest.user.type(screen.getByLabelText('Confirm password'), 'password1')
    await guest.user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(getToken()).toBe('reg-token')
    expect(localStorage.getItem('reg-token')).toBeNull()
    const projectCall = calls.find((call) => pathOf(call.url) === '/projects')
    expect(projectCall?.authorization).toBe('Bearer reg-token')

    await guest.user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    await guest.user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await guest.user.type(screen.getByLabelText('Password'), 'password1')
    await guest.user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    expect(getToken()).toBe('log-token')
    const signedIn = calls.filter((call) => pathOf(call.url) === '/projects')
    expect(signedIn.at(-1)?.authorization).toBe('Bearer log-token')
  })

  it('shows sign-in and sign-up failures', async () => {
    let status = 401
    mockFetch(() => {
      if (status === 0) return { network: true }
      return { status, json: { detail: status === 400 ? 'email must contain @' : 'no' } }
    })
    const { user, router } = renderAuth('/sign-in?next=/projects/p1')
    fireEvent.submit(document.querySelector('form')!)
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email or password is wrong.')).toBeInTheDocument()

    status = 409
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('An account with that email already exists.')).toBeInTheDocument()

    status = 400
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('email must contain @')).toBeInTheDocument()

    status = 0
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText("Couldn't sign in — try again.")).toBeInTheDocument()

    status = 500
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText("Couldn't sign in — try again.")).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Create an account' }))
    status = 500
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.type(screen.getByLabelText('Confirm password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText("Couldn't create the account — try again.")).toBeInTheDocument()

    status = 0
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText("Couldn't create the account — try again.")).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Already have an account' }))
    expect(router.state.location.pathname).toBe('/sign-in')
  })

  it('leaves the form when a session is already active', async () => {
    mockFetch((call) => {
      if (pathOf(call.url) === '/auth/login') return { json: { token: 'token-1', user: signedInUser } }
      return { json: [] }
    })
    const { user, router } = renderAuth('/sign-in?next=/')
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Projects' })
    await router.navigate('/sign-in')
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
    await router.navigate('/sign-up')
    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument()
  })
})
