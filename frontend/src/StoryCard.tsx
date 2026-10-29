import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { STATUSES, type Status, type Story } from './types'
import { BranchIcon, formatDate, PriorityBadge, TypeIcon } from './ui'

export function StoryCard({
  story,
  dragging,
  inflight,
  menuOpen,
  onOpen,
  onDragStart,
  onDragEnd,
  onToggleMenu,
  onMove,
}: {
  story: Story
  dragging: boolean
  inflight: boolean
  menuOpen: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: (x: number, y: number) => void
  onToggleMenu: () => void
  onMove: (status: Status) => void
}) {
  const [holding, setHolding] = useState(false)
  const [flight, setFlight] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)

  function pointerDown(event: ReactPointerEvent) {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('[data-no-drag]')) return
    event.preventDefault()
    window.getSelection()?.removeAllRanges()
    setHolding(true)
    const card = event.currentTarget as HTMLElement
    const blockSelect = (select: Event) => select.preventDefault()
    document.addEventListener('selectstart', blockSelect)
    const startX = event.clientX
    const startY = event.clientY
    let moved = false
    let offsetX = 0
    let offsetY = 0
    function move(pointer: globalThis.PointerEvent) {
      if (
        !moved &&
        Math.hypot(pointer.clientX - startX, pointer.clientY - startY) > 6
      ) {
        moved = true
        const rect = card.getBoundingClientRect()
        offsetX = startX - rect.left
        offsetY = startY - rect.top
        setFlight({
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        })
        window.getSelection()?.removeAllRanges()
        onDragStart()
      }
      if (moved) {
        window.getSelection()?.removeAllRanges()
        setFlight((current) =>
          current
            ? {
                ...current,
                left: pointer.clientX - offsetX,
                top: pointer.clientY - offsetY,
              }
            : current,
        )
      }
    }
    function up(pointer: globalThis.PointerEvent) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.removeEventListener('selectstart', blockSelect)
      window.getSelection()?.removeAllRanges()
      setHolding(false)
      setFlight(null)
      if (moved) onDragEnd(pointer.clientX, pointer.clientY)
      else onOpen()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const storyId = `#${story.id.slice(-6).toUpperCase()}`

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      {flight ? (
        <div
          className="placeholder"
          style={{ height: flight.height }}
          aria-hidden="true"
        />
      ) : null}
      <article
        data-story-id={story.id}
        tabIndex={-1}
        className={dragging ? 'story-card lifting' : 'story-card'}
        style={{
          background: 'var(--color-surface-container-lowest)',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: 0,
          boxShadow: flight
            ? '0 20px 30px -10px rgba(15,23,42,0.12)'
            : '0 1px 2px rgba(15, 23, 42, 0.04)',
          cursor: flight ? 'grabbing' : 'grab',
          userSelect: holding || dragging ? 'none' : 'auto',
          WebkitUserSelect: holding || dragging ? 'none' : 'auto',
          opacity: inflight ? 0.5 : 1,
          pointerEvents: flight ? 'none' : 'auto',
          position: flight ? 'fixed' : 'relative',
          left: flight?.left,
          top: flight?.top,
          width: flight?.width,
          zIndex: flight ? 40 : 'auto',
          transition: flight ? undefined : 'opacity 0.15s, box-shadow 0.15s',
        }}
        onPointerDown={pointerDown}
      >
        {/* Card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.5rem',
            marginBottom: '0.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-family-mono)',
                fontSize: '0.6875rem',
                color: 'var(--color-outline)',
                flexShrink: 0,
              }}
            >
              {storyId}
            </span>
            <TypeIcon type={story.type} />
            <span className="type-word">{story.type}</span>
          </div>

          <div
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          >
            {story.status === 'Done' ? (
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  fontSize: '16px',
                  color: '#3b7a57',
                  flexShrink: 0,
                }}
              >
                check_circle
              </span>
            ) : null}
            <button
              type="button"
              data-no-drag
              aria-label="Move story"
              onClick={onToggleMenu}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '1.5rem',
                height: '1.5rem',
                background: 'none',
                border: 'none',
                borderRadius: '0.25rem',
                color: 'var(--color-on-surface-variant)',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{ fontSize: '16px' }}
              >
                more_horiz
              </span>
            </button>
          </div>
        </div>

        {/* Move menu */}
        {menuOpen ? (
          <ul
            data-no-drag
            style={{
              position: 'absolute',
              top: '2.5rem',
              right: '0.5rem',
              zIndex: 20,
              listStyle: 'none',
              margin: 0,
              padding: '0.25rem',
              background: 'var(--color-surface-container-lowest)',
              borderRadius: '0.5rem',
              border: '1px solid var(--color-outline-variant)',
              boxShadow: '0 8px 16px -4px rgba(15,23,42,0.08)',
              minWidth: '10rem',
            }}
          >
            {STATUSES.map((status) => (
              <li key={status}>
                <button
                  type="button"
                  disabled={status === story.status}
                  onClick={() => onMove(status)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.375rem 0.625rem',
                    background: 'none',
                    border: 'none',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    color:
                      status === story.status
                        ? 'var(--color-on-surface-variant)'
                        : 'var(--color-on-surface)',
                    cursor: status === story.status ? 'default' : 'pointer',
                    opacity: status === story.status ? 0.5 : 1,
                  }}
                >
                  Move to: {status}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Title */}
        <h3
          style={{
            margin: '0 0 0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            lineHeight: '1.375rem',
            color: 'var(--color-on-surface)',
            textDecoration: story.status === 'Done' ? 'line-through' : 'none',
            textDecorationColor:
              story.status === 'Done'
                ? 'color-mix(in srgb, var(--color-on-surface-variant) 40%, transparent)'
                : 'transparent',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {story.title}
        </h3>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <PriorityBadge priority={story.priority} />
          <time
            dateTime={story.created_at}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
              style={{ fontSize: '12px' }}
            >
              event
            </span>
            {formatDate(story.created_at)}
          </time>
        </div>

        {/* Branch ref */}
        {story.github_branch_ref ? (
          <p
            style={{
              margin: '0.5rem 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              color: 'var(--color-on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={story.github_branch_ref}
          >
            <BranchIcon />
            <span>{story.github_branch_ref}</span>
          </p>
        ) : null}
      </article>
    </div>
  )
}
