import { record } from './audit.js'

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

/** The bank's calendar day for an instant, as YYYY-MM-DD. */
export const dayOf = (date) => date.toLocaleDateString('en-CA')

/**
 * Accrue one day's interest on every open account that has a rate and has not
 * been credited today. Safe to run as often as you like: the server runs it
 * every hour. Recorded as `system`: no person did it.
 */
export function accrueInterest(store, { clock = () => new Date() } = {}) {
  const at = clock().toISOString()
  const today = dayOf(clock())
  let accounts = 0
  let cents = 0
  for (const account of store.all('accounts')) {
    if (account.closedAt) continue
    if (account.lastAccruedOn === today) continue
    const amount = dailyInterest(account.balanceCents, account.interestRateBps ?? 0)
    if (!amount) continue
    store.update('accounts', account.id, {
      balanceCents: account.balanceCents + amount,
      lastAccruedOn: at.slice(0, 10),
      updatedAt: at,
    })
    record(store, 'system', 'interest', account.id)
    accounts += 1
    cents += amount
  }
  return { accounts, cents }
}
