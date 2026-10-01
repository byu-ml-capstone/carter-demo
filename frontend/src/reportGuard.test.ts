import { describe, expect, it } from 'vitest'
import {
  authorKey,
  clearAuthorKeys,
  consumeSuppressLeave,
  isReportDirty,
  setReportDirty,
  suppressLeaveGuard,
} from './reportGuard'

describe('reportGuard', () => {
  it('tracks unsaved edits and forgets author picks', () => {
    expect(isReportDirty()).toBe(false)
    setReportDirty(true)
    expect(isReportDirty()).toBe(true)
    suppressLeaveGuard()
    expect(consumeSuppressLeave()).toBe(true)
    expect(consumeSuppressLeave()).toBe(false)
    localStorage.setItem(authorKey('p1'), 'member-1')
    localStorage.setItem('other', 'keep')
    clearAuthorKeys()
    expect(localStorage.getItem(authorKey('p1'))).toBeNull()
    expect(localStorage.getItem('other')).toBe('keep')
    setReportDirty(false)
  })
})
