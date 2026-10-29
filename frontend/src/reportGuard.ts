export { authorKey, clearAuthorKeys } from './authorStorage'

let dirty = false
let suppress = false

export function setReportDirty(value: boolean) {
  dirty = value
}

export function isReportDirty() {
  return dirty
}

export function suppressLeaveGuard() {
  suppress = true
}

export function consumeSuppressLeave() {
  const value = suppress
  suppress = false
  return value
}
