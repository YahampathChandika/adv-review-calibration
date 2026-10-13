import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { transfersFor } from './transfers.js'

const csvCell = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Write one account's transfers as CSV under `dir`, named for the account. The
 * file name is the account's id and nothing else, so a caller cannot name a
 * path outside `dir`.
 */
export async function exportTransfers(store, account, dir) {
  const rows = transfersFor(store, account.id)
  const lines = ['id,fromId,toId,amountCents,currency,memo,createdAt']
  for (const t of rows) {
    lines.push([t.id, t.fromId, t.toId, t.amountCents, account.currency, t.memo, t.createdAt].map(csvCell).join(','))
  }
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${path.basename(account.id)}.csv`)
  await writeFile(file, `${lines.join('\n')}\n`)
  return { file, rows: rows.length }
}
