import { now } from './store.js'

/** How long a key is remembered. */
export const KEY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * The response first given for an idempotency key, if it is still remembered.
 * Expired keys are dropped as a side effect, so the collection stays small.
 */
export function remembered(store, key, { clock = Date.now } = {}) {
  const keys = store.all('idempotency')
  const cutoff = clock() - KEY_TTL_MS
  for (let i = keys.length - 1; i >= 0; i--) if (Date.parse(keys[i].createdAt) < cutoff) keys.splice(i, 1)
  return keys.find((k) => k.id === key) ?? null
}

/** Remember the response given for a key. */
export function remember(store, key, status, body) {
  return store.insert('idempotency', { id: key, status, body, createdAt: now() })
}
