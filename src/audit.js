import { newId, now } from './store.js'

/**
 * Who did what, appended on every write. `actorId` is the signed-in user for a
 * request, or 'system' for a job the ledger runs on its own — never a person
 * who did not do it.
 */
export function record(store, actorId, action, target) {
  return store.insert('audit', { id: newId('aud'), actorId, action, target, at: now() })
}

export function entriesFor(store, target) {
  return store.all('audit').filter((entry) => entry.target === target)
}
