#!/usr/bin/env node
// Run one of the ledger's scheduled jobs against the ledger file, then save it.
// The operator's scheduler runs `interest` once a day.
//
//   node scripts/run-jobs.mjs interest
//   LEDGER_FILE=/srv/ledger.json node scripts/run-jobs.mjs interest
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { accrueInterest } from '../src/interest.js'
import { Store } from '../src/store.js'

const jobs = { interest: accrueInterest }
const name = process.argv[2]
if (!jobs[name]) {
  console.error(`usage: run-jobs.mjs <${Object.keys(jobs).join('|')}>`)
  process.exit(2)
}
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = process.env.LEDGER_FILE ?? path.join(root, 'data', 'ledger.json')
const store = await Store.open(file)
await store.migrate(path.join(root, 'src', 'migrations'))
const result = jobs[name](store)
await store.save()
console.log(`${name}: ${JSON.stringify(result)}`)
