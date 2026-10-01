import type { Priority, StoryType } from './types'

const PRIORITY_RANK: Record<Priority, number> = { High: 0, Medium: 1, Low: 2 }

export function priorityRank(priority: Priority) {
  return PRIORITY_RANK[priority]
}

export function formatDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatWhen(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function sprintLabel(
  status: 'Planned' | 'Active' | 'Closed',
  goal: string | null,
) {
  const text = goal?.trim()
  if (text) return text
  if (status === 'Planned') return 'Planned sprint'
  if (status === 'Active') return 'Active sprint'
  return 'Closed sprint'
}

export function safeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/'
  return value
}

const TYPE_ICON: Record<StoryType, string> = {
  Feature: 'new_releases',
  Bug: 'bug_report',
  Chore: 'check_box',
}

export function TypeIcon({ type }: { type: StoryType }) {
  return (
    <span
      className="material-symbols-outlined text-[var(--color-on-surface-variant)]"
      style={{ fontSize: '14px' }}
      aria-label={type}
    >
      {TYPE_ICON[type]}
    </span>
  )
}

export function BranchIcon() {
  return (
    <span
      className="material-symbols-outlined text-[var(--color-on-surface-variant)]"
      style={{ fontSize: '14px' }}
      aria-hidden="true"
    >
      alt_route
    </span>
  )
}

const PRIORITY_CLASSES: Record<Priority, string> = {
  High: 'bg-[var(--color-error-container)] text-[var(--color-on-error-container)]',
  Medium:
    'bg-[var(--color-surface-container-high)] text-[var(--color-on-surface)]',
  Low: 'bg-[var(--color-surface-container)] text-[var(--color-on-surface-variant)]',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 rounded font-semibold',
        `priority-${priority.toLowerCase()}`,
        PRIORITY_CLASSES[priority],
      ].join(' ')}
      style={{
        fontFamily: 'var(--font-family-mono)',
        fontSize: '0.6875rem',
        lineHeight: '0.9375rem',
      }}
    >
      {priority}
    </span>
  )
}
