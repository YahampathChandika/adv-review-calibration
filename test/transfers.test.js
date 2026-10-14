import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openAccount } from '../src/accounts.js'
import { entriesFor } from '../src/audit.js'
import { MAX_MEMO, deposit, transfer, transfersFor } from '../src/transfers.js'
import { freshStore } from './helpers.js'

async function funded(cents = 1000) {
  const ctx = await freshStore()
  const from = openAccount(ctx.store, { ownerId: ctx.member.id, label: 'From', actorId: ctx.member.id })
  const to = openAccount(ctx.store, { ownerId: ctx.member.id, label: 'To', actorId: ctx.member.id })
  deposit(ctx.store, ctx.admin, { accountId: from.id, amountCents: cents })
  return { ...ctx, from, to }
}

test('a transfer moves the amount, keeps the memo, and is recorded as the member\'s', async () => {
  const { store, member, from, to } = await funded(1000)
  const row = transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 250, memo: 'rent' })
  assert.equal(store.get('accounts', from.id).balanceCents, 750)
  assert.equal(store.get('accounts', to.id).balanceCents, 250)
  assert.equal(store.get('transfers', row.id).memo, 'rent')
  assert.equal(row.actorId, member.id)
  assert.deepEqual(entriesFor(store, row.id).map((e) => [e.actorId, e.action]), [[member.id, 'transfer']])
})

test('the amount is a positive whole number, the accounts differ, and the memo is bounded', async () => {
  const { store, member, from, to } = await funded()
  for (const amountCents of [0, -1, 1.5, '10', NaN]) {
    assert.throws(() => transfer(store, member, { fromId: from.id, toId: to.id, amountCents }), /positive whole number/)
  }
  assert.throws(() => transfer(store, member, { fromId: from.id, toId: from.id, amountCents: 1 }), /must differ/)
  assert.throws(() => transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 1, memo: 'x'.repeat(MAX_MEMO + 1) }), /memo must be/)
})

test('insufficient funds, a closed account, a foreign account and a currency mismatch all refuse', async () => {
  const { store, member, other, from, to } = await funded(100)
  assert.throws(() => transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 101 }), /insufficient funds/)
  const theirs = openAccount(store, { ownerId: other.id, label: 'Theirs', actorId: other.id })
  assert.throws(() => transfer(store, member, { fromId: from.id, toId: theirs.id, amountCents: 1 }), /no such account/)
  const nzd = openAccount(store, { ownerId: member.id, label: 'NZ', currency: 'NZD', actorId: member.id })
  assert.throws(() => transfer(store, member, { fromId: from.id, toId: nzd.id, amountCents: 1 }), /share a currency/)
  store.update('accounts', to.id, { closedAt: 'now' })
  assert.throws(() => transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 1 }), /closed account/)
  assert.equal(store.get('accounts', from.id).balanceCents, 100, 'nothing moved')
})

test('exactly the balance can be sent, leaving zero', async () => {
  const { store, member, from, to } = await funded(100)
  transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 100 })
  assert.equal(store.get('accounts', from.id).balanceCents, 0)
})

test('a deposit needs an admin\'s account to exist and open, and is recorded as the admin\'s', async () => {
  const { store, admin, member } = await freshStore()
  const account = openAccount(store, { ownerId: member.id, label: 'A', actorId: member.id })
  assert.throws(() => deposit(store, admin, { accountId: 'missing', amountCents: 1 }), /no such account/)
  deposit(store, admin, { accountId: account.id, amountCents: 5 })
  assert.equal(store.get('accounts', account.id).balanceCents, 5)
  assert.deepEqual(entriesFor(store, account.id).map((e) => [e.actorId, e.action]), [[member.id, 'account.open'], [admin.id, 'deposit']])
})

test('an account\'s transfers list those in and out, newest first', async () => {
  const { store, member, from, to } = await funded(100)
  const a = transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 10 })
  a.createdAt = '2026-01-01T00:00:00.000Z'
  const b = transfer(store, member, { fromId: to.id, toId: from.id, amountCents: 5 })
  b.createdAt = '2026-01-02T00:00:00.000Z'
  assert.deepEqual(transfersFor(store, from.id).map((t) => t.id), [b.id, a.id])
})

test('a new transfer writes its memo under both keys', async () => {
  const { store, member, from, to } = await funded(100)
  const row = transfer(store, member, { fromId: from.id, toId: to.id, amountCents: 1, memo: 'rent' })
  assert.equal(store.get('transfers', row.id).memo, 'rent')
  assert.equal(store.get('transfers', row.id).note, 'rent')
})
