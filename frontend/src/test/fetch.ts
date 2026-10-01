import { vi } from 'vitest'

export type Call = {
  url: string
  method: string
  body: unknown
  authorization: string | null
}

export type Result = {
  status?: number
  json?: unknown
  text?: string
  network?: boolean
}

export function mockFetch(handler: (call: Call) => Result | Promise<Result>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      const call: Call = {
        url: String(input),
        method: (init?.method ?? 'GET').toUpperCase(),
        body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
        authorization: headers.get('Authorization'),
      }
      calls.push(call)
      const result = await handler(call)
      if (result.network) throw new TypeError('Failed to fetch')
      const status = result.status ?? 200
      if (status === 204) return new Response(null, { status: 204 })
      const raw = result.text !== undefined ? result.text : JSON.stringify(result.json ?? null)
      return new Response(raw, {
        status,
        statusText: status >= 200 && status < 300 ? 'OK' : '',
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  return calls
}

export function pathOf(url: string) {
  return new URL(url).pathname
}
