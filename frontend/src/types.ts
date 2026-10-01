export const STATUSES = [
  'Backlog',
  'Selected for Sprint',
  'In Progress',
  'Done',
] as const

export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['Low', 'Medium', 'High'] as const
export type Priority = (typeof PRIORITIES)[number]

export const STORY_TYPES = ['Feature', 'Bug', 'Chore'] as const
export type StoryType = (typeof STORY_TYPES)[number]

export type SprintStatus = 'Planned' | 'Active' | 'Closed'

export type SortMode = 'priority' | 'created_at'

export type User = {
  id: string
  email: string
  created_at: string
}

export type AuthResult = {
  token: string
  user: User
}

export type Project = {
  id: string
  name: string
  description: string | null
  created_at: string
}

export type Story = {
  id: string
  project_id: string
  title: string
  description: string | null
  status: Status
  priority: Priority
  type: StoryType
  github_branch_ref: string | null
  open_sprint_id: string | null
  created_at: string
}

export type Member = {
  id: string
  name: string
}

export type Comment = {
  id: string
  author_id: string
  body: string
  mentioned_ids: string[]
  created_at: string
}

export type Sprint = {
  id: string
  project_id: string
  goal: string | null
  status: SprintStatus
  created_at?: string
  stories?: Story[]
  stories_snapshot?: SnapshotStory[]
}

export type SnapshotStory = {
  story_id: string
  title: string
  description: string | null
  priority: Priority
  type: StoryType
  status_at_close: Status
}

export type ReportFields = {
  sprint_goal: string
  completed_work: string
  next_sprint_goals: string
  blockers: string
  faculty_notes: string
}

export type SprintReport = {
  draft_content: ReportFields | null
  final_content: ReportFields | null
  generated_at?: string | null
  reviewed_by?: string | null
}

export const REPORT_KEYS = [
  'sprint_goal',
  'completed_work',
  'next_sprint_goals',
  'blockers',
  'faculty_notes',
] as const

export type ReportKey = (typeof REPORT_KEYS)[number]

export const REPORT_LABELS: Record<ReportKey, string> = {
  sprint_goal: 'Sprint goal',
  completed_work: 'Completed work',
  next_sprint_goals: 'Next sprint goals',
  blockers: 'Blockers',
  faculty_notes: 'Faculty notes',
}

export const NO_BLOCKERS = 'No blockers were recorded for this sprint'
export const NONE_COMPLETED = 'No stories were completed this sprint'
export const NO_FACULTY_NOTES = 'No faculty notes recorded'
export const EMPTY_SPRINT_DETAIL =
  "This sprint had no stories, so there's nothing to report"

export const EMPTY_REPORT = (): ReportFields => ({
  sprint_goal: '',
  completed_work: '',
  next_sprint_goals: '',
  blockers: '',
  faculty_notes: '',
})
