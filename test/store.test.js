import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { SCHEMA, Store, pick } from '../src/store.js'
import { MIGRATIONS, freshStore } from './helpers.js'

test('pick keeps only the keys a collection stores', () => {
  assert.deepEqual(pick('audit', { id: 'a', actorId: 'u', action: 'x', target: 't', at: 'now', extra: 1 }), {
    id: 'a',
    actorId: 'u',
    action: 'x',
    target: 't',
    at: 'now',
  })
  assert.throws(() => pick('nope', {}), /unknown collection/)
})

test('every collection in the schema exists in a fresh store', async () => {
  const { store } = await freshStore()
  for (const collection of Object.keys(SCHEMA)) assert.ok(Array.isArray(store.all(collection)))
})

test('a save round-trips through the file, and migrations run once', async () => {
  const { dir, store } = await freshStore()
  store.insert('accounts', { id: 'acc_1', ownerId: 'u', label: 'Main', currency: 'AUD', balanceCents: 5, createdAt: 'a', updatedAt: 'a' })
  await store.save()
  const again = await Store.open(path.join(dir, 'ledger.json'))
  assert.equal(again.get('accounts', 'acc_1').balanceCents, 5)
  assert.equal(again.data.version, 4)
  assert.deepEqual(await again.migrate(MIGRATIONS), [])
})

test('migration 002 gives every account a currency, and only those without one', async () => {
  const store = new Store(path.join(process.cwd(), 'never-written.json'))
  store.data.accounts.push({ id: 'a', ownerId: 'u' }, { id: 'b', ownerId: 'u', currency: 'NZD' })
  store.save = async () => {}
  const applied = await store.migrate(MIGRATIONS)
  assert.deepEqual(applied, ['001-init.js', '002-account-currency.js', '003-interest-rate.js', '004-last-accrued.js'])
  assert.equal(store.get('accounts', 'a').interestRateBps, 0)
  assert.equal(store.get('accounts', 'a').currency, 'AUD')
  assert.equal(store.get('accounts', 'b').currency, 'NZD')
})

test('update replaces the row with the schema applied, and rejects an unknown id', async () => {
  const { store, member } = await freshStore()
  const row = store.insert('accounts', { id: 'acc_2', ownerId: member.id, label: 'L', currency: 'AUD', balanceCents: 0, createdAt: 'a', updatedAt: 'a' })
  const updated = store.update('accounts', row.id, { balanceCents: 10, bogus: true })
  assert.equal(updated.balanceCents, 10)
  assert.equal('bogus' in updated, false)
  assert.throws(() => store.update('accounts', 'missing', {}), /no row/)
})

test('the file on disk is whole JSON after a save', async () => {
  const { dir, store } = await freshStore()
  await store.save()
  const raw = await readFile(path.join(dir, 'ledger.json'), 'utf8')
  assert.equal(JSON.parse(raw).version, 4)
})
