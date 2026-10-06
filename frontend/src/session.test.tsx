import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from './App'
import { getToken, setToken } from './api'
import { setReportDirty } from './reportGuard'
import { AccountBar, SessionProvider } from './session'
import { mockFetch, pathOf } from './test/fetch'
import { signedInUser } from './test/login'

beforeEach(() => {
  setToken(null)
  setReportDirty(false)
})

describe('session', () => {
  it('requires a provider and hides the account bar until sign-in', () => {
    expect(() => render(<AccountBar />)).toThrow('SessionProvider is missing')
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <SessionProvider>
            <AccountBar />
            <p>inside</p>
          </SessionProvider>
        ),
      },
    ])
    render(<RouterProvider router={router} />)
    expect(screen.getByText('inside')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sign out' })).toBeNull()
  })

  it('signs out, drops a failed logout, and ends an expired session', async () => {
    const user = userEvent.setup({ delay: null })
    const calls = mockFetch((call) => {
      const path = pathOf(call.url)
      if (path === '/auth/login')
        return { json: { token: 'token-1', user: signedInUser } }
      if (path === '/auth/logout') {
        if (
          calls.filter((item) => pathOf(item.url) === '/auth/logout').length ===
          1
        ) {
          return { network: true }
        }
        return { status: 204 }
      }
      if (path === '/projects' && call.method === 'GET') {
        if (getToken() === 'expired') {
          setReportDirty(true)
          return { status: 401, json: { detail: 'Sign in required.' } }
        }
        return { json: [] }
      }
      return { status: 404, json: { detail: 'missing' } }
    })
    const router = createMemoryRouter(routes, { initialEntries: ['/sign-in'] })
    render(<RouterProvider router={router} />)
    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument()
    expect(getToken()).toBe('token-1')

    setReportDirty(true)
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      screen.getByRole('heading', { name: 'My Workspace' }),
    ).toBeInTheDocument()

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    localStorage.setItem('my-workspace:author:p1', 'ann')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      await screen.findByRole('heading', { name: 'My Workspace' }),
    ).toBeInTheDocument()
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('my-workspace:author:p1')).toBeNull()

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('button', { name: 'Sign out' })
    setToken(null)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'ada@example.com')
    await user.type(screen.getByLabelText('Password'), 'password1')
    mockFetch((call) => {
      if (pathOf(call.url) === '/auth/login')
        return { json: { token: 'expired', user: signedInUser } }
      setReportDirty(true)
      return { status: 401, json: { detail: 'Sign in required.' } }
    })
    const alertSpy = vi
      .spyOn(window, 'alert')
      .mockImplementation(() => undefined)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(
      await screen.findByText('Your session ended. Sign in again.'),
    ).toBeInTheDocument()
    expect(alertSpy).toHaveBeenCalled()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })
})
