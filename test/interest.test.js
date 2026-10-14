import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openAccount, setInterestRate } from '../src/accounts.js'
import { entriesFor } from '../src/audit.js'
import { DAYS_PER_YEAR, MAX_RATE_BPS, accrueInterest, dailyInterest } from '../src/interest.js'
import { deposit } from '../src/transfers.js'
import { freshStore } from './helpers.js'

test('a day of interest is whole cents, rounded down; an empty account or no rate earns nothing', () => {
  assert.equal(dailyInterest(100_000, 500), 13, '$1,000 at 5% earns 13.69 cents a day')
  assert.equal(dailyInterest(DAYS_PER_YEAR * 10_000, 10_000), 10_000)
  assert.equal(dailyInterest(0, 500), 0)
  assert.equal(dailyInterest(-5, 500), 0)
  assert.equal(dailyInterest(100_000, 0), 0)
})

test('accrual credits open accounts with a rate, skips the rest, and is recorded as the system', async () => {
  const { store, admin, member } = await freshStore()
  const earning = openAccount(store, { ownerId: member.id, label: 'Savings', actorId: member.id })
  const flat = openAccount(store, { ownerId: member.id, label: 'Everyday', actorId: member.id })
  const closed = openAccount(store, { ownerId: member.id, label: 'Old', actorId: member.id })
  deposit(store, admin, { accountId: earning.id, amountCents: 100_000 })
  deposit(store, admin, { accountId: flat.id, amountCents: 100_000 })
  setInterestRate(store, admin, { accountId: earning.id, interestRateBps: 500 })
  store.update('accounts', closed.id, { interestRateBps: 500, closedAt: 'now' })
  assert.deepEqual(accrueInterest(store), { accounts: 1, cents: 13 })
  assert.equal(store.get('accounts', earning.id).balanceCents, 100_013)
  assert.equal(store.get('accounts', flat.id).balanceCents, 100_000)
  const last = entriesFor(store, earning.id).at(-1)
  assert.deepEqual([last.actorId, last.action], ['system', 'interest'])
})

test('a rate is a whole number of basis points within bounds, set on an open account, and audited', async () => {
  const { store, admin, member } = await freshStore()
  const a = openAccount(store, { ownerId: member.id, label: 'A', actorId: member.id })
  for (const interestRateBps of [-1, MAX_RATE_BPS + 1, 2.5, '500']) {
    assert.throws(() => setInterestRate(store, admin, { accountId: a.id, interestRateBps }), /interestRateBps must be/)
  }
  assert.throws(() => setInterestRate(store, admin, { accountId: 'nope', interestRateBps: 1 }), /no such account/)
  setInterestRate(store, admin, { accountId: a.id, interestRateBps: MAX_RATE_BPS })
  assert.equal(store.get('accounts', a.id).interestRateBps, MAX_RATE_BPS)
  assert.deepEqual(entriesFor(store, a.id).at(-1).action, 'account.interest-rate')
  store.update('accounts', a.id, { closedAt: 'now' })
  assert.throws(() => setInterestRate(store, admin, { accountId: a.id, interestRateBps: 1 }), /already closed/)
})

test('running the job twice in a day credits each account once', async () => {
  const { store, admin, member } = await freshStore()
  const a = openAccount(store, { ownerId: member.id, label: 'Savings', actorId: member.id })
  deposit(store, admin, { accountId: a.id, amountCents: 100_000 })
  setInterestRate(store, admin, { accountId: a.id, interestRateBps: 500 })
  const clock = () => new Date('2026-03-02T12:00:00.000Z')
  assert.deepEqual(accrueInterest(store, { clock }), { accounts: 1, cents: 13 })
  assert.deepEqual(accrueInterest(store, { clock }), { accounts: 0, cents: 0 })
  assert.equal(store.get('accounts', a.id).balanceCents, 100_013)
  const tomorrow = () => new Date('2026-03-03T12:00:00.000Z')
  assert.deepEqual(accrueInterest(store, { clock: tomorrow }), { accounts: 1, cents: 13 })
})
