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

export function clearAuthorKeys() {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith('my-workspace:author:')) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}

export function authorKey(projectId: string) {
  return `my-workspace:author:${projectId}`
}
