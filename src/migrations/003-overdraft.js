// Accounts gain an overdraft limit, 0 for every account that has none. Additive.
export const version = 3
export function up(data) {
  for (const account of data.accounts) {
    if (account.overdraftCents === undefined) account.overdraftCents = 0
  }
}
