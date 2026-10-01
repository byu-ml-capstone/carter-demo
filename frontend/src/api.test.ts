import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  api,
  getToken,
  login,
  logout,
  normalizeReport,
  register,
  setToken,
  setUnauthorizedHandler,
} from './api'
import { mockFetch } from './test/fetch'

beforeEach(() => {
  setToken(null)
  setUnauthorizedHandler(null)
})

describe('api', () => {
  it('keeps the bearer token in memory and sends Authorization', async () => {
    const calls = mockFetch(() => ({ json: { ok: true } }))
    setToken('token-1')
    expect(getToken()).toBe('token-1')
    await api('/projects')
    expect(calls[0]?.authorization).toBe('Bearer token-1')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('skips the header and the session handler for auth calls', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    setToken('token-1')
    mockFetch((call) => {
      if (call.url.endsWith('/auth/login'))
        return { json: { token: 'next', user: { id: 'u' } } }
      return { status: 401, json: { detail: 'Sign in required.' } }
    })
    await login('ada@example.com', 'password1')
    await expect(
      register('ada@example.com', 'password1'),
    ).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('clears the session once on 401 and ignores logout 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    setToken('token-1')
    mockFetch(() => ({ status: 401, json: {} }))
    await expect(api('/projects')).rejects.toMatchObject({
      status: 401,
      detail: 'Sign in required.',
    })
    await expect(api('/projects')).rejects.toBeInstanceOf(ApiError)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
    setToken('token-2')
    await expect(logout()).rejects.toMatchObject({ status: 401 })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('maps network, empty, and invalid bodies', async () => {
    mockFetch(() => ({ network: true }))
    await expect(api('/projects')).rejects.toMatchObject({
      status: 0,
      detail: 'network',
    })

    mockFetch(() => ({ status: 204 }))
    await expect(
      api('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined()

    mockFetch(() => ({ text: '' }))
    await expect(api('/projects')).resolves.toBeNull()

    mockFetch(() => ({ text: 'not-json' }))
    await expect(api('/projects')).resolves.toBeNull()

    mockFetch(() => ({ status: 500, json: { detail: '  ' } }))
    await expect(api('/projects')).rejects.toMatchObject({
      detail: 'Request failed',
    })

    mockFetch(() => ({ status: 400, json: { detail: 12 } }))
    await expect(api('/projects')).rejects.toMatchObject({
      detail: 'Request failed',
    })

    mockFetch(() => ({ status: 400, json: { detail: 'Name is required.' } }))
    await expect(
      api('/projects', { method: 'POST', body: { name: 'A' } }),
    ).rejects.toMatchObject({
      detail: 'Name is required.',
    })
  })

  it('normalizes report fields and ignores non-objects', () => {
    expect(normalizeReport(null)).toBeNull()
    expect(
      normalizeReport({
        draft_content: null,
        final_content: { sprint_goal: 'Ship', completed_work: 1 } as never,
      }),
    ).toEqual({
      draft_content: null,
      final_content: {
        sprint_goal: 'Ship',
        completed_work: '',
        next_sprint_goals: '',
        blockers: '',
        faculty_notes: '',
      },
    })
    expect(
      normalizeReport({ draft_content: 'nope' as never, final_content: null }),
    ).toEqual({
      draft_content: null,
      final_content: null,
    })
  })
})
