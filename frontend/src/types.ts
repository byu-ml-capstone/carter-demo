import vocabulary from './vocabulary.json'

export const STATUSES = vocabulary.statuses
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = vocabulary.priorities
export type Priority = (typeof PRIORITIES)[number]

export const STORY_TYPES = vocabulary.storyTypes
export type StoryType = (typeof STORY_TYPES)[number]

export const SPRINT_STATUSES = vocabulary.sprintStatuses
export type SprintStatus = (typeof SPRINT_STATUSES)[number]

export const PRIORITY_RANK = Object.fromEntries(
  vocabulary.priorityRank,
) as Record<Priority, number>

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
  id?: string
  project_id?: string
  draft_content: ReportFields | null
  final_content: ReportFields | null
  generated_at?: string | null
  reviewed_by?: string | null
}

export type ReportSnapshotStory = {
  id: string
  title: string
  description: string | null
  priority: Priority
  type: StoryType
  status_at_close: Status
}

export type SavedReport = SprintReport & {
  id: string
  generated_at: string
  stories_snapshot?: ReportSnapshotStory[]
}

export const REPORT_KEYS = vocabulary.reportKeys as unknown as readonly [
  'sprint_goal',
  'completed_work',
  'next_sprint_goals',
  'blockers',
  'faculty_notes',
]
export type ReportKey = (typeof REPORT_KEYS)[number]

export const REPORT_LABELS: Record<ReportKey, string> = {
  sprint_goal: 'Sprint goal',
  completed_work: 'Completed work',
  next_sprint_goals: 'Next sprint goals',
  blockers: 'Blockers',
  faculty_notes: 'Faculty notes',
}

export const NO_BLOCKERS = vocabulary.noBlockers
export const NONE_COMPLETED = vocabulary.nothingCompleted
export const NO_FACULTY_NOTES = vocabulary.noFacultyNotes
export const EMPTY_SPRINT_DETAIL = vocabulary.emptyProject
export const ALREADY_MOVED = vocabulary.alreadyMoved
export const SIGN_IN_REQUIRED = vocabulary.signInRequired
export const CREDENTIALS_WRONG = vocabulary.credentialsWrong
export const EMAIL_TAKEN = vocabulary.emailTaken
export const PROJECT_NAME_TAKEN = vocabulary.projectNameTaken
export const SPRINT_ALREADY_OPEN = vocabulary.sprintAlreadyOpen
export const MEMBER_NAME_TAKEN = vocabulary.memberNameTaken

export const EMPTY_REPORT = (): ReportFields =>
  Object.fromEntries(REPORT_KEYS.map((key) => [key, ''])) as ReportFields
