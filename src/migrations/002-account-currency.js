// Accounts gain a currency. Additive: every account that has none is AUD, the
// only currency the ledger held before this.
export const version = 2
export function up(data) {
  for (const account of data.accounts) {
    if (account.currency === undefined) account.currency = 'AUD'
  }
}
