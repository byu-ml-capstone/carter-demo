import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Toaster, toast } from './toast'

describe('toast', () => {
  it('shows a message and clears it', () => {
    toast('before mount')
    const view = render(<Toaster />)
    act(() => {
      vi.useFakeTimers()
      toast('Saved')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')
    act(() => {
      toast('Next')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Next')
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(screen.queryByRole('status')).toBeNull()
    view.unmount()
    toast('after unmount')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
