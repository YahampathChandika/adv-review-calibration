import { HttpError } from './auth.js'
import { record } from './audit.js'
import { MAX_RATE_BPS } from './interest.js'
import { newId, now } from './store.js'

export const CURRENCIES = ['AUD', 'NZD', 'USD']
export const PAGE_SIZE = 20

export function openAccount(store, { ownerId, label, currency = 'AUD', actorId }) {
  if (!label || typeof label !== 'string') throw new HttpError(400, 'label is required')
  if (!CURRENCIES.includes(currency)) throw new HttpError(400, `currency must be one of ${CURRENCIES.join(', ')}`)
  const at = now()
  const account = store.insert('accounts', {
    id: newId('acc'),
    ownerId,
    label: label.trim(),
    currency,
    balanceCents: 0,
    interestRateBps: 0,
    closedAt: null,
    createdAt: at,
    updatedAt: at,
  })
  record(store, actorId, 'account.open', account.id)
  return account
}

/** The owner's accounts, newest first, one page at a time. Pages start at 1. */
export function listAccounts(store, { ownerId, page = 1 }) {
  if (!Number.isInteger(page) || page < 1) throw new HttpError(400, 'page must be a whole number from 1')
  const mine = store
    .all('accounts')
    .filter((a) => a.ownerId === ownerId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const start = (page - 1) * PAGE_SIZE
  return { page, pageSize: PAGE_SIZE, total: mine.length, items: mine.slice(start, start + PAGE_SIZE) }
}

/** The user's own account, read through `cache` when one is given. */
export function getOwnAccount(store, user, id, cache) {
  const account = cache ? cache.get(id) : store.get('accounts', id)
  if (!account || account.ownerId !== user.id) throw new HttpError(404, 'no such account')
  return account
}

export function closeAccount(store, user, id) {
  const account = getOwnAccount(store, user, id)
  if (account.closedAt) throw new HttpError(409, 'already closed')
  if (account.balanceCents !== 0) throw new HttpError(409, 'empty the account first')
  const closed = store.update('accounts', id, { closedAt: now(), updatedAt: now() })
  record(store, user.id, 'account.close', id)
  return closed
}

/** Set an account's yearly interest rate, in basis points. Administrators only. */
export function setInterestRate(store, admin, { accountId, interestRateBps }) {
  if (!Number.isInteger(interestRateBps) || interestRateBps < 0 || interestRateBps > MAX_RATE_BPS) {
    throw new HttpError(400, `interestRateBps must be a whole number from 0 to ${MAX_RATE_BPS}`)
  }
  const account = store.get('accounts', accountId)
  if (!account) throw new HttpError(404, 'no such account')
  if (account.closedAt) throw new HttpError(409, 'already closed')
  const updated = store.update('accounts', accountId, { interestRateBps, updatedAt: now() })
  record(store, admin.id, 'account.interest-rate', accountId)
  return updated
}
