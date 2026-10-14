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
