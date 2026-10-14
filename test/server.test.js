import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { freshStore, serve } from './helpers.js'

test('every account route needs a signed-in user; health does not', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    assert.equal((await call('GET', '/health')).status, 200)
    assert.equal((await call('GET', '/accounts')).status, 401)
    assert.equal((await call('POST', '/accounts', { body: { label: 'X' } })).status, 401)
    assert.equal((await call('GET', '/accounts', { token: 'tok-nobody' })).status, 401)
    assert.equal((await call('GET', '/nowhere', { token: 'tok-bob' })).status, 404)
  } finally {
    await close()
  }
})

test('open, deposit, transfer and read back, through HTTP, with only public fields', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A' } })
    const b = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'B', currency: 'AUD' } })
    assert.equal(a.status, 201)
    assert.deepEqual(Object.keys(a.body).sort(), ['balanceCents', 'closed', 'createdAt', 'currency', 'id', 'label'])
    assert.equal((await call('POST', '/deposits', { token: 'tok-bob', body: { accountId: a.body.id, amountCents: 500 } })).status, 403)
    assert.equal((await call('POST', '/deposits', { token: 'tok-ada', body: { accountId: a.body.id, amountCents: 500 } })).status, 201)
    const t = await call('POST', '/transfers', { token: 'tok-bob', body: { fromId: a.body.id, toId: b.body.id, amountCents: 200, memo: 'm' } })
    assert.equal(t.status, 201)
    assert.equal('actorId' in t.body, false, 'the actor stays inside')
    const list = await call('GET', '/accounts', { token: 'tok-bob' })
    assert.equal(list.body.total, 2)
    const bAgain = await call('GET', `/accounts/${b.body.id}`, { token: 'tok-bob' })
    assert.equal(bAgain.body.balanceCents, 200)
    const history = await call('GET', `/accounts/${a.body.id}/transfers`, { token: 'tok-bob' })
    assert.equal(history.body.length, 1)
    assert.equal(history.body[0].memo, 'm')
    // Persisted: a fresh process sees the balances.
    const raw = JSON.parse(await readFile(path.join(dir, 'ledger.json'), 'utf8'))
    assert.equal(raw.accounts.find((x) => x.id === a.body.id).balanceCents, 300)
  } finally {
    await close()
  }
})

test('errors are JSON with a status, and an unknown failure says nothing about itself', async () => {
  const { dir, store } = await freshStore()
  const { base, call, close } = await serve(store, dir)
  try {
    const bad = await call('POST', '/transfers', { token: 'tok-bob', body: { fromId: 'x', toId: 'y', amountCents: 0 } })
    assert.equal(bad.status, 400)
    assert.match(bad.body.error, /positive whole number/)
    const notJson = await fetch(`${base}/accounts`, { method: 'POST', headers: { authorization: 'Bearer tok-bob' }, body: '{' })
    assert.equal(notJson.status, 400)
    assert.deepEqual(await notJson.json(), { error: 'body must be JSON' })
  } finally {
    await close()
  }
})

test('an export lands under the export directory, named for the account only', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A' } })
    const res = await call('POST', `/accounts/${a.body.id}/export`, { token: 'tok-bob' })
    assert.equal(res.status, 200)
    const csv = await readFile(path.join(dir, 'exports', `${a.body.id}.csv`), 'utf8')
    assert.equal(csv.split('\n')[0], 'id,fromId,toId,amountCents,memo,createdAt')
    assert.equal((await call('POST', '/accounts/../../etc/export', { token: 'tok-bob' })).status, 404)
  } finally {
    await close()
  }
})

test('a read after a write shows the write, and events go to the configured webhook', async () => {
  const { dir, store } = await freshStore()
  const sent = []
  const webhook = {
    url: 'https://hooks.example/ledger',
    secret: 'k',
    send: async (_url, init) => {
      sent.push(JSON.parse(init.body).event)
      return { ok: true }
    },
    delays: [],
  }
  const { call, close, server } = await serve(store, dir, { webhook })
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A' } })
    const b = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'B' } })
    const c = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'C' } })
    assert.equal((await call('GET', `/accounts/${a.body.id}`, { token: 'tok-bob' })).body.balanceCents, 0)
    await call('POST', '/deposits', { token: 'tok-ada', body: { accountId: a.body.id, amountCents: 300 } })
    assert.equal((await call('GET', `/accounts/${a.body.id}`, { token: 'tok-bob' })).body.balanceCents, 300)
    await call('POST', '/transfers', { token: 'tok-bob', body: { fromId: a.body.id, toId: b.body.id, amountCents: 100 } })
    assert.equal((await call('GET', `/accounts/${a.body.id}`, { token: 'tok-bob' })).body.balanceCents, 200)
    assert.equal((await call('POST', `/accounts/${c.body.id}/close`, { token: 'tok-bob' })).status, 200)
    assert.equal((await call('GET', `/accounts/${c.body.id}`, { token: 'tok-bob' })).body.closed, true)
    await server.notifier.idle()
    assert.deepEqual(sent, ['deposit.created', 'transfer.created', 'account.closed'])
  } finally {
    await close()
  }
})

test('only an administrator sets an interest rate, and only within bounds', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A' } })
    const route = `/accounts/${a.body.id}/interest-rate`
    assert.equal((await call('POST', route, { token: 'tok-bob', body: { interestRateBps: 500 } })).status, 403)
    assert.equal((await call('POST', route, { token: 'tok-ada', body: { interestRateBps: 99_999 } })).status, 400)
    assert.equal((await call('POST', route, { token: 'tok-ada', body: { interestRateBps: 500 } })).status, 200)
    assert.equal(store.get('accounts', a.body.id).interestRateBps, 500)
  } finally {
    await close()
  }
})

test('a transfer retried with the same idempotency key moves the money once', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A' } })
    const b = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'B' } })
    await call('POST', '/deposits', { token: 'tok-ada', body: { accountId: a.body.id, amountCents: 1_000 } })
    const move = { fromId: a.body.id, toId: b.body.id, amountCents: 100 }
    const first = await call('POST', '/transfers', { token: 'tok-bob', body: move, headers: { 'idempotency-key': 'k-1' } })
    const again = await call('POST', '/transfers', { token: 'tok-bob', body: move, headers: { 'idempotency-key': 'k-1' } })
    assert.equal(first.status, 201)
    assert.equal(again.status, 201)
    assert.deepEqual(again.body, first.body)
    await call('POST', '/transfers', { token: 'tok-bob', body: move, headers: { 'idempotency-key': 'k-2' } })
    await call('POST', '/transfers', { token: 'tok-bob', body: move })
    assert.equal((await call('GET', `/accounts/${a.body.id}`, { token: 'tok-bob' })).body.balanceCents, 700)
  } finally {
    await close()
  }
})
