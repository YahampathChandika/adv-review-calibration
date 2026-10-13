// A running total of the money held per currency, so the summary needs no
// scan. Built from the accounts; kept by every deposit and withdrawal after.
export const version = 3
export function up(data) {
  const byCurrency = new Map()
  for (const a of data.accounts) byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0) + a.balanceCents)
  data.totals = [...byCurrency].map(([id, cents]) => ({ id, cents }))
}
