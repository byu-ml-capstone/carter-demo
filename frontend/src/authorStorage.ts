const AUTHOR_PREFIX = 'my-workspace:author:'

export function authorKey(projectId: string) {
  return `${AUTHOR_PREFIX}${projectId}`
}

export function clearAuthorKeys() {
  const keys: string[] = []
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(AUTHOR_PREFIX)) keys.push(key)
  }
  keys.forEach((key) => localStorage.removeItem(key))
}
