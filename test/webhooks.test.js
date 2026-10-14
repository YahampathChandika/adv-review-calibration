import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { createNotifier } from '../src/webhooks.js'

const quiet = { warn: () => {} }
const URL_ = 'https://hooks.example/ledger'

test('an event is POSTed as signed JSON to the configured endpoint', async () => {
  const sent = []
  const n = createNotifier({
    url: URL_,
    secret: 's3cret',
    send: async (url, init) => {
      sent.push({ url, init })
      return { ok: true }
    },
    delays: [],
    log: quiet,
  })
  n.notify('transfer.created', { id: 't1' })
  await n.idle()
  assert.equal(sent.length, 1)
  assert.equal(sent[0].url, URL_)
  const body = JSON.parse(sent[0].init.body)
  assert.equal(body.event, 'transfer.created')
  assert.deepEqual(body.data, { id: 't1' })
  const expected = createHmac('sha256', 's3cret').update(sent[0].init.body).digest('hex')
  assert.equal(sent[0].init.headers['x-ledger-signature'], expected)
})

test('a receiver that is down is tried three times in all, then given up with a warning that carries no secret', async () => {
  const warnings = []
  let attempts = 0
  const n = createNotifier({
    url: URL_,
    secret: 's3cret',
    send: async () => {
      attempts++
      throw new Error('down')
    },
    delays: [0, 0],
    log: { warn: (m) => warnings.push(m) },
  })
  n.notify('transfer.created', {})
  await n.idle()
  assert.equal(attempts, 3)
  assert.equal(warnings.length, 1)
  assert.ok(!warnings[0].includes('s3cret'))
})

test('a receiver that answers with an error is retried, and one success ends it', async () => {
  const answers = [{ ok: false }, { ok: true }]
  let attempts = 0
  const n = createNotifier({ url: URL_, send: async () => answers[attempts++], delays: [0, 0], log: quiet })
  n.notify('deposit.created', {})
  await n.idle()
  assert.equal(attempts, 2)
})

test('without an endpoint nothing is sent', async () => {
  let attempts = 0
  const n = createNotifier({
    send: async () => {
      attempts++
      return { ok: true }
    },
  })
  n.notify('transfer.created', {})
  await n.idle()
  assert.equal(attempts, 0)
})

test('every attempt at one delivery carries the same delivery id; two deliveries differ', async () => {
  const ids = []
  let attempts = 0
  const n = createNotifier({
    url: URL_,
    send: async (_url, init) => {
      ids.push(init.headers['x-ledger-delivery'])
      return { ok: ++attempts > 1 }
    },
    delays: [0, 0],
    log: quiet,
  })
  n.notify('transfer.created', {})
  await n.idle()
  n.notify('transfer.created', {})
  await n.idle()
  assert.equal(ids.length, 3)
  assert.equal(ids[0], ids[1])
  assert.notEqual(ids[1], ids[2])
  assert.match(ids[0], /^[0-9a-f-]{36}$/)
})
