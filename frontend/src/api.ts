import type { AuthResult, SprintReport, ReportFields } from './types'

/** Hello service, host port from docker-compose.override.yml. */
export const API_ORIGIN = (
  import.meta.env.VITE_API_ORIGIN || 'http://127.0.0.1:8000'
).replace(/\/$/, '')

let token: string | null = null
let onUnauthorized: (() => void) | null = null
let authLock = false

export function getToken() {
  return token
}

export function setToken(value: string | null) {
  token = value
  if (value) authLock = false
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

function readDetail(body: unknown, fallback: string) {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
  }
  return fallback
}

type Options = {
  method?: string
  body?: unknown
  /** Login and register must not clear the session on 401. */
  auth?: 'none'
  /** Logout 401 is not a workspace expiry. */
  skipUnauthorized?: boolean
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const headers = new Headers()
  if (options.body !== undefined)
    headers.set('Content-Type', 'application/json')
  if (token && options.auth !== 'none') {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'network')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      parsed = null
    }
  }

  if (
    response.status === 401 &&
    options.auth !== 'none' &&
    !options.skipUnauthorized
  ) {
    if (!authLock) {
      authLock = true
      onUnauthorized?.()
    }
    throw new ApiError(401, readDetail(parsed, 'Sign in required.'))
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      readDetail(parsed, response.statusText || 'Request failed'),
    )
  }

  return parsed as T
}

export function login(email: string, password: string) {
  return api<AuthResult>('/auth/login', {
    method: 'POST',
    auth: 'none',
    body: { email, password },
  })
}

export function register(email: string, password: string) {
  return api<AuthResult>('/auth/register', {
    method: 'POST',
    auth: 'none',
    body: { email, password },
  })
}

export function logout() {
  return api<void>('/auth/logout', { method: 'POST', skipUnauthorized: true })
}

function asFields(value: unknown): ReportFields | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const text = (key: string) =>
    typeof record[key] === 'string' ? record[key] : ''
  return {
    sprint_goal: text('sprint_goal'),
    completed_work: text('completed_work'),
    next_sprint_goals: text('next_sprint_goals'),
    blockers: text('blockers'),
    faculty_notes: text('faculty_notes'),
  }
}

export function normalizeReport(raw: SprintReport | null): SprintReport | null {
  if (!raw) return null
  return {
    ...raw,
    draft_content: asFields(raw.draft_content),
    final_content: asFields(raw.final_content),
  }
}
