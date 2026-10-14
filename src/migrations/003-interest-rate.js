// Accounts gain a yearly interest rate in basis points. Additive: every account
// that has none earns nothing until an administrator sets one.
export const version = 3
export function up(data) {
  for (const account of data.accounts) {
    if (account.interestRateBps === undefined) account.interestRateBps = 0
  }
}
