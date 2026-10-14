import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ListCache } from '../src/cache.js'
import { freshStore, serve } from './helpers.js'

test('a page is served from the cache until it expires, and forget drops one owner only', () => {
  let t = 0
  let loads = 0
  const cache = new ListCache({ ttlMs: 100, clock: () => t })
  const load = () => ++loads
  assert.equal(cache.get('u1', 1, load), 1)
  assert.equal(cache.get('u1', 1, load), 1)
  assert.equal(cache.get('u2', 1, load), 2)
  cache.forget('u1')
  assert.equal(cache.get('u1', 1, load), 3)
  assert.equal(cache.get('u2', 1, load), 2)
  t = 200
  assert.equal(cache.get('u2', 1, load), 4)
})

test('the list shows a balance changed by a deposit or a transfer at once', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A' } })
    const b = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'B' } })
    const balanceOf = async (id) => (await call('GET', '/accounts', { token: 'tok-bob' })).body.items.find((x) => x.id === id).balanceCents
    assert.equal(await balanceOf(a.body.id), 0)
    await call('POST', '/deposits', { token: 'tok-ada', body: { accountId: a.body.id, amountCents: 500 } })
    assert.equal(await balanceOf(a.body.id), 500)
    await call('POST', '/transfers', { token: 'tok-bob', body: { fromId: a.body.id, toId: b.body.id, amountCents: 200 } })
    assert.equal(await balanceOf(a.body.id), 300)
    assert.equal(await balanceOf(b.body.id), 200)
  } finally {
    await close()
  }
})
