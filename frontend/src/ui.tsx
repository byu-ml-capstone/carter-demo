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

export function TypeIcon({ type }: { type: StoryType }) {
  if (type === 'Feature') {
    return (
      <svg
        className="type-icon feature"
        viewBox="0 0 16 16"
        aria-label="Feature"
      >
        <path d="M8 1.5 14.5 8 8 14.5 1.5 8Z" />
      </svg>
    )
  }
  if (type === 'Bug') {
    return (
      <svg className="type-icon bug" viewBox="0 0 16 16" aria-label="Bug">
        <ellipse cx="8" cy="9" rx="3.2" ry="4" />
        <path d="M8 5.2 V2.2 M6.2 3.2 4.4 1.8 M9.8 3.2 11.6 1.8 M4.6 8 H2 M11.4 8 H14 M5 11.2 3.2 13 M11 11.2 12.8 13 M5.4 6.4 3.4 5.2 M10.6 6.4 12.6 5.2" />
      </svg>
    )
  }
  return (
    <svg className="type-icon chore" viewBox="0 0 16 16" aria-label="Chore">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M4.5 8.2 7 10.5 11.5 5.5" />
    </svg>
  )
}

export function BranchIcon() {
  return (
    <svg className="branch-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="4" cy="3.5" r="1.4" />
      <circle cx="4" cy="12.5" r="1.4" />
      <circle cx="12" cy="6.5" r="1.4" />
      <path d="M4 4.9 V11.1 M4 8.2 C4 6.6 12 8.2 12 6.6" />
    </svg>
  )
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge priority-${priority.toLowerCase()}`}>
      {priority}
    </span>
  )
}
