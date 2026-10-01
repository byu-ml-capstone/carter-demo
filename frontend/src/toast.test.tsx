import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toaster, toast } from './toast'

afterEach(() => {
  vi.useRealTimers()
})

describe('toast', () => {
  it('shows a message and clears it', async () => {
    toast('before mount')
    const view = render(<Toaster />)
    vi.useFakeTimers()
    toast('Saved')
    expect(await screen.findByRole('status')).toHaveTextContent('Saved')
    await vi.advanceTimersByTimeAsync(6000)
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    toast('after unmount')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
