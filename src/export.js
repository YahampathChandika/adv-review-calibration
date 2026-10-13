import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { transfersFor } from './transfers.js'

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Write one account's transfers as CSV under `dir`, named for the account unless the caller names the file. */
export async function exportTransfers(store, account, dir, name) {
  const rows = transfersFor(store, account.id)
  const lines = ['id,fromId,toId,amountCents,memo,createdAt']
  for (const t of rows) {
    lines.push([t.id, t.fromId, t.toId, t.amountCents, t.memo, t.createdAt].map(csvCell).join(','))
  }
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${name ?? account.id}.csv`)
  await writeFile(file, `${lines.join('\n')}\n`)
  return { file, rows: rows.length }
}
