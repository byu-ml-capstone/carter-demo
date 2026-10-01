import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { setToken } from './api'
import { mockFetch } from './test/fetch'

beforeEach(() => {
  setToken(null)
  window.history.replaceState({}, '', '/sign-in')
})

describe('app', () => {
  it('renders the sign-in page from the browser router', async () => {
    mockFetch(() => ({ status: 404, json: { detail: 'missing' } }))
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'My Workspace' }),
    ).toBeInTheDocument()
  })
})
