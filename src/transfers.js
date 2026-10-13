import { HttpError } from './auth.js'
import { record } from './audit.js'
import { newId, now } from './store.js'

export const MAX_MEMO = 140
// A memo is one printable line: no control characters.
const CONTROL = /[\x00-\x1f\x7f]/g

/**
 * Move money between two of the caller's accounts. One statement: both
 * balances and the transfer row change together, or nothing does.
 */
export function transfer(store, user, { fromId, toId, amountCents, memo }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpError(400, 'amountCents must be a positive whole number')
  if (fromId === toId) throw new HttpError(400, 'from and to must differ')
  if (memo !== undefined) {
    if (typeof memo !== 'string' || memo.length > MAX_MEMO) {
      throw new HttpError(400, `memo must be a string of at most ${MAX_MEMO} characters`)
    }
    memo = memo.replace(CONTROL, '')
  }
  const from = store.get('accounts', fromId)
  const to = store.get('accounts', toId)
  if (!from || from.ownerId !== user.id) throw new HttpError(404, 'no such account')
  if (!to || to.ownerId !== user.id) throw new HttpError(404, 'no such account')
  if (from.closedAt || to.closedAt) throw new HttpError(409, 'a closed account cannot transfer')
  if (from.currency !== to.currency) throw new HttpError(409, 'accounts must share a currency')
  if (from.balanceCents < amountCents) throw new HttpError(409, 'insufficient funds')

  const at = now()
  store.update('accounts', fromId, { balanceCents: from.balanceCents - amountCents, updatedAt: at })
  store.update('accounts', toId, { balanceCents: to.balanceCents + amountCents, updatedAt: at })
  const row = store.insert('transfers', {
    id: newId('trf'),
    fromId,
    toId,
    amountCents,
    memo: memo ?? '',
    actorId: user.id,
    createdAt: at,
  })
  record(store, user.id, 'transfer', row.id)
  return row
}

/** Money arriving from outside the ledger (a deposit). Administrators only. */
export function deposit(store, admin, { accountId, amountCents }) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new HttpError(400, 'amountCents must be a positive whole number')
  const account = store.get('accounts', accountId)
  if (!account) throw new HttpError(404, 'no such account')
  if (account.closedAt) throw new HttpError(409, 'a closed account cannot take a deposit')
  const updated = store.update('accounts', accountId, {
    balanceCents: account.balanceCents + amountCents,
    updatedAt: now(),
  })
  record(store, admin.id, 'deposit', accountId)
  return updated
}

/** Transfers in or out of one account, newest first. */
export function transfersFor(store, accountId) {
  return store
    .all('transfers')
    .filter((t) => t.fromId === accountId || t.toId === accountId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}
