import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { CommentThread } from './comments'
import { toast } from './toast'
import type {
  Comment,
  Member,
  Priority,
  Status,
  Story,
  StoryType,
} from './types'
import { PRIORITIES, STATUSES, STORY_TYPES } from './types'
import { PriorityBadge, TypeIcon } from './ui'

type Props = {
  story: Story
  members: Member[]
  comments: Comment[]
  email: string
  draft: string
  onDraft: (value: string) => void
  onPosted: (comment: Comment) => void
  onOpenTeam: () => void
  onClose: () => void
  onStory: (story: Story) => void
  onMove: (story: Story, status: Status) => void
}

export function TicketModal({
  story,
  members,
  comments,
  email,
  draft,
  onDraft,
  onPosted,
  onOpenTeam,
  onClose,
  onStory,
  onMove,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(story.title)
  const [description, setDescription] = useState(story.description ?? '')
  const [branch, setBranch] = useState(story.github_branch_ref ?? '')
  const [titleDirty, setTitleDirty] = useState(false)
  const [descriptionDirty, setDescriptionDirty] = useState(false)
  const [branchDirty, setBranchDirty] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  useEffect(() => {
    if (!titleDirty) setTitle(story.title)
  }, [story.id, story.title, titleDirty])

  useEffect(() => {
    if (!descriptionDirty) setDescription(story.description ?? '')
  }, [story.description, story.id, descriptionDirty])

  useEffect(() => {
    if (!branchDirty) setBranch(story.github_branch_ref ?? '')
  }, [branchDirty, story.github_branch_ref, story.id])

  async function save(patch: Record<string, string | null>) {
    try {
      const updated = await api<Story>(`/stories/${story.id}`, {
        method: 'PATCH',
        body: patch,
      })
      onStory(updated)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return
      toast("Couldn't save that — try again.")
    }
  }

  function commitTitle() {
    const next = title.trim()
    if (!next) {
      setTitle(story.title)
      setTitleDirty(false)
      return
    }
    if (next !== story.title) void save({ title: next })
    setTitleDirty(false)
  }

  return (
    <dialog
      ref={dialogRef}
      className="ticket"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <header className="ticket-header">
        <TypeIcon type={story.type} />
        <input
          className="title-input"
          value={title}
          aria-label="Title"
          onChange={(event) => {
            setTitle(event.target.value)
            setTitleDirty(true)
          }}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitTitle()
            }
          }}
        />
        <PriorityBadge priority={story.priority} />
        <button
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <label>
        Description
        <textarea
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            setDescriptionDirty(true)
          }}
          onBlur={() => {
            const next = description.trim()
            const current = story.description ?? ''
            if (next !== current) void save({ description: next || null })
            setDescriptionDirty(false)
          }}
        />
      </label>
      <div className="meta-row">
        <label>
          Status
          <select
            value={story.status}
            onChange={(event) => onMove(story, event.target.value as Status)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={story.priority}
            onChange={(event) => {
              const priority = event.target.value as Priority
              if (priority !== story.priority) void save({ priority })
            }}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            value={story.type}
            onChange={(event) => {
              const type = event.target.value as StoryType
              if (type !== story.type) void save({ type })
            }}
          >
            {STORY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        GitHub branch reference
        <input
          value={branch}
          onChange={(event) => {
            setBranch(event.target.value)
            setBranchDirty(true)
          }}
          onBlur={() => {
            const next = branch.trim()
            const current = story.github_branch_ref ?? ''
            if (next !== current) void save({ github_branch_ref: next || null })
            setBranchDirty(false)
          }}
        />
      </label>
      <CommentThread
        projectId={story.project_id}
        parent={{ kind: 'story', id: story.id }}
        members={members}
        comments={comments}
        email={email}
        draft={draft}
        onDraft={onDraft}
        onPosted={onPosted}
        onOpenTeam={onOpenTeam}
      />
    </dialog>
  )
}
