// Accounts can be frozen. Additive: none is.
export const version = 4
export function up(data) {
  for (const account of data.accounts) {
    if (account.frozenAt === undefined) account.frozenAt = null
  }
}
