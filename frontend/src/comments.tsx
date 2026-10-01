import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { authorKey } from './reportGuard'
import { toast } from './toast'
import type { Comment, Member } from './types'
import { formatWhen } from './ui'

type Props = {
  projectId: string
  parent: { kind: 'story' | 'sprint'; id: string }
  members: Member[]
  comments: Comment[]
  email: string
  draft: string
  onDraft: (value: string) => void
  onPosted: (comment: Comment) => void
  onOpenTeam: () => void
}

export function CommentThread({
  projectId,
  parent,
  members,
  comments,
  email,
  draft,
  onDraft,
  onPosted,
  onOpenTeam,
}: Props) {
  const storageKey = authorKey(projectId)
  const stored = localStorage.getItem(storageKey) ?? ''
  const known = members.some((member) => member.id === stored)
  const [authorId, setAuthorId] = useState(known ? stored : '')
  const [posting, setPosting] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [caret, setCaret] = useState(draft.length)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const emailKey = email.trim().toLowerCase()

  useEffect(() => {
    if (known) setAuthorId(stored)
  }, [known, stored])

  const selectable = members.filter(
    (member) => member.name.trim().toLowerCase() !== emailKey,
  )
  const mention = mentionQuery(draft, caret)

  const matches = mention
    ? selectable.filter((member) =>
        member.name.toLowerCase().startsWith(mention.query.toLowerCase()),
      )
    : []

  function chooseAuthor(id: string) {
    setAuthorId(id)
    if (id) localStorage.setItem(storageKey, id)
  }

  function insertMention(name: string) {
    if (!mention) return
    const caret = inputRef.current?.selectionStart ?? draft.length
    const next = `${draft.slice(0, mention.start)}@${name} ${draft.slice(caret)}`
    onDraft(next)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      const pos = mention.start + name.length + 2
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  async function post() {
    if (!authorId || !draft.trim() || posting) return
    setPosting(true)
    const path =
      parent.kind === 'story'
        ? `/stories/${parent.id}/comments`
        : `/sprints/${parent.id}/comments`
    try {
      const created = await api<Comment>(path, {
        method: 'POST',
        body: { author_id: authorId, body: draft },
      })
      onPosted(created)
      onDraft('')
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast(
        error instanceof ApiError && error.detail
          ? error.detail
          : "Couldn't save that — try again.",
      )
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="thread">
      <h3>Comments</h3>
      {comments.length === 0 ? <p className="hint">No comments yet.</p> : null}
      <ol className="comments">
        {comments.map((comment) => {
          const author = members.find(
            (member) => member.id === comment.author_id,
          )
          return (
            <li key={comment.id}>
              <div className="comment-meta">
                <strong>{author?.name ?? 'Unknown'}</strong>
                <time dateTime={comment.created_at}>
                  {formatWhen(comment.created_at)}
                </time>
              </div>
              <p>
                <MentionText
                  body={comment.body}
                  mentionedIds={comment.mentioned_ids}
                  members={selectable}
                />
              </p>
            </li>
          )
        })}
      </ol>
      {selectable.length === 0 ? (
        <p className="hint">
          Add teammates to this project first.{' '}
          <button type="button" onClick={onOpenTeam}>
            Add a teammate
          </button>
        </p>
      ) : (
        <label className="author-picker">
          Your name
          <select
            value={authorId}
            onChange={(event) => chooseAuthor(event.target.value)}
          >
            <option value="">Choose your name</option>
            {selectable.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="composer">
        <textarea
          ref={inputRef}
          value={draft}
          placeholder="Write a comment"
          onChange={(event) => {
            onDraft(event.target.value)
            setCaret(event.target.selectionStart ?? event.target.value.length)
            setActiveIndex(0)
          }}
          onSelect={(event) =>
            setCaret(event.currentTarget.selectionStart ?? 0)
          }
          onKeyDown={(event) => {
            if (!mention || matches.length === 0) return
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveIndex((index) => (index + 1) % matches.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveIndex(
                (index) => (index - 1 + matches.length) % matches.length,
              )
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              insertMention(matches[activeIndex]?.name ?? matches[0].name)
            }
          }}
        />
        {mention && selectable.length === 0 ? (
          <div className="mention-list">
            <button type="button" onClick={onOpenTeam}>
              Add teammates to this project first
            </button>
          </div>
        ) : null}
        {mention && matches.length > 0 ? (
          <ul className="mention-list">
            {matches.map((member, index) => (
              <li key={member.id}>
                <button
                  type="button"
                  className={index === activeIndex ? 'active' : ''}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insertMention(member.name)
                  }}
                >
                  {member.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          disabled={!authorId || !draft.trim() || posting}
          onClick={() => void post()}
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
      </div>
    </section>
  )
}

function mentionQuery(value: string, caret: number) {
  const upto = value.slice(0, caret)
  const start = upto.lastIndexOf('@')
  if (start < 0) return null
  if (start > 0 && /[A-Za-z0-9]/.test(upto[start - 1] ?? '')) return null
  const query = upto.slice(start + 1)
  if (query.includes('\n')) return null
  return { start, query }
}

export function MentionText({
  body,
  mentionedIds,
  members,
}: {
  body: string
  mentionedIds: string[]
  members: Member[]
}) {
  const mentioned = members
    .filter((member) => mentionedIds.includes(member.id))
    .sort((a, b) => b.name.length - a.name.length)
  const parts: Array<{ key: string; text: string; hit: boolean }> = []
  let index = 0
  let part = 0
  while (index < body.length) {
    const at = body.indexOf('@', index)
    if (at < 0) {
      parts.push({ key: `t-${part}`, text: body.slice(index), hit: false })
      break
    }
    if (at > index) {
      parts.push({ key: `t-${part}`, text: body.slice(index, at), hit: false })
      part += 1
    }
    const match = mentioned.find((member) => {
      const slice = body.slice(at + 1, at + 1 + member.name.length)
      if (slice.toLowerCase() !== member.name.toLowerCase()) return false
      const next = body[at + 1 + member.name.length]
      return !next || !/[A-Za-z0-9 ]/.test(next)
    })
    if (!match) {
      parts.push({ key: `t-${part}`, text: '@', hit: false })
      index = at + 1
      part += 1
      continue
    }
    parts.push({ key: `m-${part}`, text: `@${match.name}`, hit: true })
    index = at + 1 + match.name.length
    part += 1
  }
  return (
    <>
      {parts.map((piece) =>
        piece.hit ? (
          <mark key={piece.key}>{piece.text}</mark>
        ) : (
          <span key={piece.key}>{piece.text}</span>
        ),
      )}
    </>
  )
}
