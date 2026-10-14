import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openAccount } from '../src/accounts.js'
import { AccountCache } from '../src/cache.js'
import { freshStore } from './helpers.js'

test('a cached account is served until it expires', async () => {
  const { store, member } = await freshStore()
  const a = openAccount(store, { ownerId: member.id, label: 'A', actorId: member.id })
  let t = 0
  const cache = new AccountCache(store, { ttlMs: 100, clock: () => t })
  assert.equal(cache.get(a.id).label, 'A')
  // Replaced behind the store's back, so only expiry can bring it in.
  const rows = store.all('accounts')
  const i = rows.findIndex((x) => x.id === a.id)
  rows[i] = { ...rows[i], label: 'B' }
  t = 50
  assert.equal(cache.get(a.id).label, 'A')
  t = 150
  assert.equal(cache.get(a.id).label, 'B')
})

test('a write through the store drops the cached row at once', async () => {
  const { store, member } = await freshStore()
  const a = openAccount(store, { ownerId: member.id, label: 'A', actorId: member.id })
  const cache = new AccountCache(store, { ttlMs: 60_000, clock: () => 0 })
  assert.equal(cache.get(a.id).balanceCents, 0)
  store.update('accounts', a.id, { balanceCents: 5 })
  assert.equal(cache.get(a.id).balanceCents, 5)
})

test('an unknown account is not cached as missing', async () => {
  const { store, member } = await freshStore()
  const cache = new AccountCache(store, { ttlMs: 60_000, clock: () => 0 })
  assert.equal(cache.get('acc_late'), null)
  store.data.accounts.push({ id: 'acc_late', ownerId: member.id, label: 'Late' })
  assert.equal(cache.get('acc_late').label, 'Late')
})
