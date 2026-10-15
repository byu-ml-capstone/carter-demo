import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  api,
  getToken,
  login,
  logout,
  normalizeReport,
  register,
  resolveApiOrigin,
  setToken,
  setUnauthorizedHandler,
} from './api'
import { mockFetch } from './test/fetch'

beforeEach(() => {
  setToken(null)
  setUnauthorizedHandler(null)
})

describe('resolveApiOrigin', () => {
  const page = {
    protocol: 'https:',
    host: 'carter-demo.ml-capstone.cs.byu.edu',
  }

  it('uses the local API when the raw origin is unset or blank', () => {
    expect(resolveApiOrigin(undefined, page)).toBe('http://127.0.0.1:8000')
    expect(resolveApiOrigin(null, null)).toBe('http://127.0.0.1:8000')
    expect(resolveApiOrigin('', page)).toBe('http://127.0.0.1:8000')
    expect(resolveApiOrigin('   ', null)).toBe('http://127.0.0.1:8000')
  })

  it('adds the page scheme to a bare host', () => {
    expect(
      resolveApiOrigin('api.example.com', {
        protocol: 'https:',
        host: 'app.example.com',
      }),
    ).toBe('https://api.example.com')
    expect(
      resolveApiOrigin('api.example.com', {
        protocol: 'http:',
        host: 'app.example.com',
      }),
    ).toBe('http://api.example.com')
    expect(resolveApiOrigin('api.example.com:8443', null)).toBe(
      'http://api.example.com:8443',
    )
  })

  it('stays relative when the host is the page host', () => {
    expect(resolveApiOrigin('carter-demo.ml-capstone.cs.byu.edu', page)).toBe(
      '',
    )
    expect(
      resolveApiOrigin('https://carter-demo.ml-capstone.cs.byu.edu/', page),
    ).toBe('')
  })

  it('keeps an absolute origin on another host and strips trailing slashes', () => {
    expect(resolveApiOrigin('https://api.example.com///', page)).toBe(
      'https://api.example.com',
    )
    expect(
      resolveApiOrigin('http://127.0.0.1:8000/', {
        protocol: 'http:',
        host: 'localhost:43123',
      }),
    ).toBe('http://127.0.0.1:8000')
  })

  it('falls back when the origin is not a URL', () => {
    expect(resolveApiOrigin('http://', page)).toBe('')
    expect(resolveApiOrigin('http://', null)).toBe('http://127.0.0.1:8000')
    expect(resolveApiOrigin('not a host', page)).toBe('')
    expect(resolveApiOrigin('not a host', null)).toBe('http://127.0.0.1:8000')
  })
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
