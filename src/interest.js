import { record } from './audit.js'
import { now } from './store.js'

export const DAYS_PER_YEAR = 365
export const MAX_RATE_BPS = 2_000

/**
 * One day's interest on a balance at a yearly rate in basis points, in whole
 * cents, rounded down. A non-positive balance or rate earns nothing.
 */
export function dailyInterest(balanceCents, rateBps) {
  if (balanceCents <= 0 || rateBps <= 0) return 0
  return Math.floor((balanceCents * rateBps) / 10_000 / DAYS_PER_YEAR)
}

/**
 * Accrue one day's interest on every open account that has a rate. The
 * operator's scheduler runs this once a day (`node scripts/run-jobs.mjs
 * interest`). It is not safe to run twice in one day and does not try to be.
 * Recorded as `system`: no person did it.
 */
export function accrueInterest(store) {
  const at = now()
  let accounts = 0
  let cents = 0
  for (const account of store.all('accounts')) {
    if (account.closedAt) continue
    const amount = dailyInterest(account.balanceCents, account.interestRateBps ?? 0)
    if (!amount) continue
    store.update('accounts', account.id, { balanceCents: account.balanceCents + amount, updatedAt: at })
    record(store, 'system', 'interest', account.id)
    accounts += 1
    cents += amount
  }
  return { accounts, cents }
}
