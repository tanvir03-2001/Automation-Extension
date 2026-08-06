const PREFIX = 'ae:'

export async function storageGet<T>(key: string, fallback: T): Promise<T> {
  const result = await chrome.storage.local.get(`${PREFIX}${key}`)
  const value = result[`${PREFIX}${key}`]
  return (value as T | undefined) ?? fallback
}

export async function storageSet<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [`${PREFIX}${key}`]: value })
}

export async function storageRemove(key: string): Promise<void> {
  await chrome.storage.local.remove(`${PREFIX}${key}`)
}
