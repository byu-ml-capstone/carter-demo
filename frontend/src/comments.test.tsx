import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CommentThread, MentionText } from './comments'
import { Toaster } from './toast'
import type { Comment, Member } from './types'
import type { Result } from './test/fetch'
import { mockFetch } from './test/fetch'

const members: Member[] = [
  { id: 'ann', name: 'Ann' },
  { id: 'anna', name: 'Anna' },
  { id: 'mail', name: 'ada@example.com' },
]

const posted: Comment = {
  id: 'c1',
  author_id: 'ann',
  body: 'Hi @Anna',
  mentioned_ids: ['anna'],
  created_at: '2024-06-01T15:04:00.000Z',
}

describe('comments', () => {
  it('highlights the longest team-member name', () => {
    render(<MentionText body="Hi @Anna, @Ann." mentionedIds={['ann', 'anna']} members={members} />)
    expect(screen.getByText('@Anna')).toBeInTheDocument()
    expect(screen.getByText('@Ann')).toBeInTheDocument()
    render(<MentionText body="" mentionedIds={[]} members={[]} />)
    render(<MentionText body="Hello @Nope" mentionedIds={[]} members={members} />)
    expect(screen.getByText('Hello ')).toBeInTheDocument()
  })

  it('inserts a team member and posts on a story or a sprint', async () => {
    const user = userEvent.setup({ delay: null })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    localStorage.setItem('my-workspace:author:p1', 'ann')
    const calls = mockFetch(() => ({ status: 201, json: posted }))
    const onDraft = vi.fn()
    const onPosted = vi.fn()
    render(
      <>
        <CommentThread
          projectId="p1"
          parent={{ kind: 'story', id: 's1' }}
          members={members}
          comments={[
            posted,
            { ...posted, id: 'c2', author_id: 'missing', body: 'plain', mentioned_ids: [] },
          ]}
          email="ada@example.com"
          draft="Hi @An"
          onDraft={onDraft}
          onPosted={onPosted}
          onOpenTeam={vi.fn()}
        />
        <Toaster />
      </>,
    )
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'ada@example.com' })).toBeNull()
    await user.selectOptions(screen.getByLabelText('Your name'), '')
    await user.selectOptions(screen.getByLabelText('Your name'), 'ann')
    expect(localStorage.getItem('my-workspace:author:p1')).toBe('ann')
    const box = screen.getByPlaceholderText('Write a comment')
    fireEvent.select(box, { target: { selectionStart: 6 } })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    fireEvent.keyDown(box, { key: 'ArrowUp' })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    await user.click(screen.getByRole('button', { name: 'Anna' }))
    expect(onDraft).toHaveBeenCalledWith(expect.stringContaining('@Anna'))
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onDraft).toHaveBeenCalledWith(expect.stringContaining('@Ann'))

    await user.click(screen.getByRole('button', { name: 'Post' }))
    expect(calls[0]?.url).toContain('/stories/s1/comments')
    expect(calls[0]?.body).toEqual({ author_id: 'ann', body: 'Hi @An' })
    expect(onPosted).toHaveBeenCalled()

    render(
      <CommentThread
        projectId="p1"
        parent={{ kind: 'sprint', id: 'sp1' }}
        members={members}
        comments={[]}
        email="ada@example.com"
        draft="Sprint note"
        onDraft={vi.fn()}
        onPosted={vi.fn()}
        onOpenTeam={vi.fn()}
      />,
    )
    await user.selectOptions(screen.getAllByLabelText('Your name')[1]!, 'ann')
    await user.click(screen.getAllByRole('button', { name: 'Post' })[1]!)
    expect(calls.some((call) => call.url.includes('/sprints/sp1/comments'))).toBe(true)
  })

  it('guards an empty post and reports save errors', async () => {
    const user = userEvent.setup({ delay: null })
    let result: Result | Promise<Result> = { status: 201, json: posted }
    mockFetch(() => result)
    const onPosted = vi.fn()
    render(
      <>
        <CommentThread
          projectId="p1"
          parent={{ kind: 'story', id: 's1' }}
          members={[{ id: 'ann', name: 'Ann' }]}
          comments={[]}
          email="ada@example.com"
          draft="Hello"
          onDraft={vi.fn()}
          onPosted={onPosted}
          onOpenTeam={vi.fn()}
        />
        <Toaster />
      </>,
    )
    await user.selectOptions(screen.getByLabelText('Your name'), 'ann')
    const post = screen.getByRole('button', { name: 'Post' })
    let resolve: ((value: Result) => void) | undefined
    result = new Promise<Result>((done) => {
      resolve = done
    })
    await user.click(post)
    const posting = await screen.findByRole('button', { name: 'Posting…' })
    posting.removeAttribute('disabled')
    fireEvent.click(posting)
    resolve?.({ status: 201, json: posted })
    await waitFor(() => expect(onPosted).toHaveBeenCalled())

    result = { status: 401, json: { detail: 'Sign in required.' } }
    await user.click(screen.getByRole('button', { name: 'Post' }))
    result = { status: 400, json: { detail: 'Comment body is required.' } }
    await user.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Comment body is required.')).toBeInTheDocument()
    result = { status: 500, json: {} }
    await user.click(screen.getByRole('button', { name: 'Post' }))
    expect(await screen.findByText('Request failed')).toBeInTheDocument()

    const idle = screen.getByRole('button', { name: 'Post' })
    idle.removeAttribute('disabled')
    fireEvent.click(idle)
  })

  it('asks for teammates when the mention list is empty', async () => {
    const user = userEvent.setup({ delay: null })
    const onOpenTeam = vi.fn()
    const onDraft = vi.fn()
    render(
      <CommentThread
        projectId="p1"
        parent={{ kind: 'story', id: 's1' }}
        members={[]}
        comments={[]}
        email="ada@example.com"
        draft="@"
        onDraft={onDraft}
        onPosted={vi.fn()}
        onOpenTeam={onOpenTeam}
      />,
    )
    expect(screen.getByText('No comments yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add a teammate' }))
    await user.click(screen.getByRole('button', { name: 'Add teammates to this project first' }))
    expect(onOpenTeam).toHaveBeenCalledTimes(2)
    const box = screen.getByPlaceholderText('Write a comment')
    fireEvent.change(box, { target: { value: 'a@Ann', selectionStart: 2 } })
    fireEvent.change(box, { target: { value: '@Ann\nmore', selectionStart: 8 } })
    fireEvent.keyDown(box, { key: 'ArrowDown' })
    const post = screen.getByRole('button', { name: 'Post' })
    post.removeAttribute('disabled')
    fireEvent.click(post)
  })
})
