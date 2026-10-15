import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { setToken } from './api'
import { mockFetch } from './test/fetch'

beforeEach(() => {
  setToken(null)
  window.history.replaceState({}, '', '/')
})

describe('app', () => {
  it('renders the workspace from the browser router', async () => {
    mockFetch(() => ({ json: [] }))
    render(<App />)
    expect(
      await screen.findByRole('heading', { name: 'My Workspace' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'New Project' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).toBeNull()
  })
})
