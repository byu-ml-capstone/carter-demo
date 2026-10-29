import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, ApiError } from './api'
import { MEMBER_NAME_TAKEN, type Member } from './types'

export function TeamDialog({
  projectId,
  members,
  onClose,
  onCreated,
}: {
  projectId: string
  members: Member[]
  onClose: () => void
  onCreated: (member: Member) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  async function add(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    try {
      const created = await api<Member>(`/projects/${projectId}/members`, {
        method: 'POST',
        body: { name: name.trim() },
      })
      onCreated(created)
      setName('')
      setError('')
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError(caught.detail || MEMBER_NAME_TAKEN)
      } else if (!(caught instanceof ApiError) || caught.status !== 401) {
        setError("Couldn't save that — try again.")
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="team"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="dialog-header">
        <h2
          style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: 600,
            color: 'var(--color-on-surface)',
          }}
        >
          Team
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'none',
            border: 'none',
            borderRadius: '0.25rem',
            color: 'var(--color-on-surface-variant)',
            cursor: 'pointer',
            padding: '0.25rem',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ fontSize: '20px' }}
          >
            close
          </span>
        </button>
      </div>

      <div className="team-body">
        {members.length === 0 ? (
          <p
            className="empty-line"
            style={{ textAlign: 'left', padding: '0 0 12px' }}
          >
            No teammates yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
            {members.map((member) => (
              <li
                key={member.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--color-outline-variant)',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface)',
                }}
              >
                <div
                  style={{
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '9999px',
                    background: 'var(--color-primary-container)',
                    color: 'var(--color-on-primary-container)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {member.name[0]?.toUpperCase() ?? '?'}
                </div>
                {member.name}
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => void add(event)}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem',
            }}
          >
            <label
              htmlFor="team-member-name"
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--color-on-surface-variant)',
              }}
            >
              Name
            </label>
            <input
              id="team-member-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Teammate's name"
              style={{
                height: '2.75rem',
                padding: '0 0.75rem',
                background: 'var(--color-surface-container-low)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                color: 'var(--color-on-surface)',
                outline: 'none',
              }}
            />
          </div>
          {error ? <p className="field-error">{error}</p> : null}
          <button
            type="submit"
            disabled={!name.trim()}
            style={{
              width: '100%',
              height: '36px',
              padding: '0 1rem',
              background: name.trim()
                ? 'var(--color-primary)'
                : 'var(--color-surface-container-high)',
              color: name.trim()
                ? 'var(--color-on-primary)'
                : 'var(--color-on-surface-variant)',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: name.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Add teammate
          </button>
        </form>
      </div>
    </dialog>
  )
}
