import type { RetryPolicy } from '@/shared/types/workflow'

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  retryOn: ['TimeoutError', 'ElementNotFoundError', 'NetworkError'],
}

export function shouldRetry(
  error: Error,
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  if (attempt >= policy.maxAttempts) return false
  return policy.retryOn.some(
    (name) => error.name === name || error.message.includes(name),
  )
}

export function computeBackoffMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  return Math.round(policy.backoffMs * policy.backoffMultiplier ** Math.max(0, attempt - 1))
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  onRetry?: (error: Error, attempt: number, delayMs: number) => void | Promise<void>,
): Promise<T> {
  let attempt = 0
  let lastError: Error | undefined

  while (attempt < policy.maxAttempts) {
    attempt += 1
    try {
      return await operation(attempt)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (!shouldRetry(lastError, attempt, policy)) {
        throw lastError
      }
      const delay = computeBackoffMs(attempt, policy)
      await onRetry?.(lastError, attempt, delay)
      await sleep(delay)
    }
  }

  throw lastError ?? new Error('Retry exhausted')
}
