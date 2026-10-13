#!/usr/bin/env node
// Seed a ledger file with an administrator, a member and two accounts, one of
// them funded, and print the two tokens. Does nothing to a file that already
// has users.
//
//   node scripts/seed.mjs            → data/ledger.json
//   LEDGER_FILE=/tmp/l.json node scripts/seed.mjs
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openAccount } from '../src/accounts.js'
import { Store, newId, now } from '../src/store.js'
import { deposit } from '../src/transfers.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.env.LEDGER_FILE ?? path.join(root, 'data', 'ledger.json')
const store = await Store.open(file)
await store.migrate(path.join(root, 'src', 'migrations'))
if (store.all('users').length) {
  console.log(`${file} already has users — nothing seeded`)
  process.exit(0)
}
const token = () => randomBytes(16).toString('hex')
const admin = store.insert('users', { id: newId('usr'), name: 'Ada', token: token(), role: 'admin', createdAt: now() })
const member = store.insert('users', { id: newId('usr'), name: 'Bob', token: token(), role: 'member', createdAt: now() })
const everyday = openAccount(store, { ownerId: member.id, label: 'Everyday', actorId: member.id })
openAccount(store, { ownerId: member.id, label: 'Savings', actorId: member.id })
deposit(store, admin, { accountId: everyday.id, amountCents: 100_00 })
await store.save()
console.log(`seeded ${file}`)
console.log(`admin  ${admin.name}: ${admin.token}`)
console.log(`member ${member.name}: ${member.token}`)
