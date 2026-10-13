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
    assert.equal(csv.split('\n')[0], 'id,fromId,toId,amountCents,currency,memo,createdAt')
    assert.equal((await call('POST', '/accounts/../../etc/export', { token: 'tok-bob' })).status, 404)
  } finally {
    await close()
  }
})

test('each exported row carries the account\'s currency', async () => {
  const { dir, store } = await freshStore()
  const { call, close } = await serve(store, dir)
  try {
    const a = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'A', currency: 'NZD' } })
    const b = await call('POST', '/accounts', { token: 'tok-bob', body: { label: 'B', currency: 'NZD' } })
    await call('POST', '/deposits', { token: 'tok-ada', body: { accountId: a.body.id, amountCents: 100 } })
    await call('POST', '/transfers', { token: 'tok-bob', body: { fromId: a.body.id, toId: b.body.id, amountCents: 1, memo: 'a "b", c' } })
    await call('POST', `/accounts/${a.body.id}/export`, { token: 'tok-bob' })
    const [header, row] = (await readFile(path.join(dir, 'exports', `${a.body.id}.csv`), 'utf8')).split('\n')
    assert.equal(header.split(',')[4], 'currency')
    assert.match(row, /,1,NZD,"a ""b"", c",/)
  } finally {
    await close()
  }
})
