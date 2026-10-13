import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PAGE_SIZE, closeAccount, getOwnAccount, listAccounts, openAccount } from '../src/accounts.js'
import { entriesFor } from '../src/audit.js'
import { freshStore } from './helpers.js'

test('opening an account stores it empty, in AUD by default, and records who opened it', async () => {
  const { store, member } = await freshStore()
  const account = openAccount(store, member, { label: ' Savings ' })
  assert.equal(account.label, 'Savings')
  assert.equal(account.currency, 'AUD')
  assert.equal(account.balanceCents, 0)
  assert.equal(account.closedAt, null)
  assert.deepEqual(entriesFor(store, account.id).map((e) => [e.actorId, e.action]), [[member.id, 'account.open']])
})

test('a label is required and a currency must be known', async () => {
  const { store, member } = await freshStore()
  assert.throws(() => openAccount(store, member, { label: '' }), /label is required/)
  assert.throws(() => openAccount(store, member, { label: 'X', currency: 'EUR' }), /currency must be/)
})

test('listing is paged, newest first, and only the owner\'s', async () => {
  const { store, member, other } = await freshStore()
  for (let i = 0; i < PAGE_SIZE + 3; i++) {
    const a = openAccount(store, member, { label: `A${i}` })
    a.createdAt = `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
  }
  openAccount(store, other, { label: 'Not mine' })
  const first = listAccounts(store, { ownerId: member.id, page: 1 })
  const second = listAccounts(store, { ownerId: member.id, page: 2 })
  assert.equal(first.total, PAGE_SIZE + 3)
  assert.equal(first.items.length, PAGE_SIZE)
  assert.equal(second.items.length, 3)
  assert.equal(first.items[0].label, `A${PAGE_SIZE + 2}`)
  const seen = new Set([...first.items, ...second.items].map((a) => a.id))
  assert.equal(seen.size, PAGE_SIZE + 3)
  assert.ok([...first.items, ...second.items].every((a) => a.ownerId === member.id))
  assert.throws(() => listAccounts(store, { ownerId: member.id, page: 0 }), /page must be/)
})

test('another user\'s account reads as absent, not forbidden', async () => {
  const { store, member, other } = await freshStore()
  const theirs = openAccount(store, other, { label: 'Theirs' })
  assert.throws(() => getOwnAccount(store, member, theirs.id), /no such account/)
})

test('closing needs an empty account, happens once, and is recorded', async () => {
  const { store, member } = await freshStore()
  const account = openAccount(store, member, { label: 'Old' })
  store.update('accounts', account.id, { balanceCents: 1 })
  assert.throws(() => closeAccount(store, member, account.id), /empty the account/)
  store.update('accounts', account.id, { balanceCents: 0 })
  const closed = closeAccount(store, member, account.id)
  assert.ok(closed.closedAt)
  assert.throws(() => closeAccount(store, member, account.id), /already closed/)
  assert.deepEqual(entriesFor(store, account.id).map((e) => e.action), ['account.open', 'account.close'])
})
