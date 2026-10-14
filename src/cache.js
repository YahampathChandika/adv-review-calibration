/**
 * A read cache for single accounts, used by `GET /accounts/:id`. An entry lives
 * for `ttlMs` and is dropped whenever the store writes that account, so a read
 * after a write never sees the old row. Every write to an account goes through
 * the store, which makes the store's change hook the one place to invalidate:
 * nothing else has to remember to.
 */
export class AccountCache {
  constructor(store, { ttlMs = 30_000, clock = Date.now } = {}) {
    this.store = store
    this.ttlMs = ttlMs
    this.clock = clock
    this.entries = new Map()
    store.onChange((collection, row) => {
      if (collection === 'accounts') this.entries.delete(row.id)
    })
  }

  get(id) {
    const hit = this.entries.get(id)
    if (hit && this.clock() - hit.at < this.ttlMs) return hit.row
    const row = this.store.get('accounts', id)
    if (row) this.entries.set(id, { row, at: this.clock() })
    else this.entries.delete(id)
    return row
  }
}

/**
 * One owner's account-list pages, for `GET /accounts`, kept for `ttlMs`. A
 * transfer or deposit changes balances, so they call `forget(ownerId)` for each
 * owner whose list they change.
 */
export class ListCache {
  constructor({ ttlMs = 30_000, clock = Date.now } = {}) {
    this.ttlMs = ttlMs
    this.clock = clock
    this.entries = new Map()
  }

  get(ownerId, page, load) {
    const key = `${ownerId}:${page}`
    const hit = this.entries.get(key)
    if (hit && this.clock() - hit.at < this.ttlMs) return hit.value
    const value = load()
    this.entries.set(key, { value, at: this.clock() })
    return value
  }

  forget(ownerId) {
    for (const key of this.entries.keys()) if (key.startsWith(`${ownerId}:`)) this.entries.delete(key)
  }
}

/** The process's account-list cache. */
export const listCache = new ListCache()
