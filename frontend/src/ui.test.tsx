import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BranchIcon, PriorityBadge, TypeIcon, formatDate, formatWhen, priorityRank, safeNext, sprintLabel } from './ui'

describe('ui', () => {
  it('ranks priorities and formats dates', () => {
    expect(priorityRank('High')).toBeLessThan(priorityRank('Medium'))
    expect(priorityRank('Low')).toBe(2)
    expect(formatDate('2024-06-01T15:00:00.000Z')).toContain('2024')
    expect(formatDate('not-a-date')).toBe('')
    expect(formatWhen('2024-06-01T15:04:00.000Z')).toContain('2024')
    expect(formatWhen('not-a-date')).toBe('')
  })

  it('labels sprints and keeps redirects on this site', () => {
    expect(sprintLabel('Active', '  Ship  ')).toBe('Ship')
    expect(sprintLabel('Planned', '   ')).toBe('Planned sprint')
    expect(sprintLabel('Active', null)).toBe('Active sprint')
    expect(sprintLabel('Closed', '')).toBe('Closed sprint')
    expect(safeNext(null)).toBe('/')
    expect(safeNext('https://evil.example')).toBe('/')
    expect(safeNext('//evil.example')).toBe('/')
    expect(safeNext('/projects/p1')).toBe('/projects/p1')
  })

  it('draws the story icons', () => {
    const { rerender } = render(<TypeIcon type="Feature" />)
    expect(screen.getByLabelText('Feature')).toBeInTheDocument()
    rerender(<TypeIcon type="Bug" />)
    expect(screen.getByLabelText('Bug')).toBeInTheDocument()
    rerender(<TypeIcon type="Chore" />)
    expect(screen.getByLabelText('Chore')).toBeInTheDocument()
    rerender(
      <>
        <BranchIcon />
        <PriorityBadge priority="High" />
      </>,
    )
    expect(screen.getByText('High')).toHaveClass('priority-high')
  })
})
