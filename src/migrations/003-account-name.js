// Accounts call their label a name. Copy it over and drop the old key.
export const version = 3
export function up(data) {
  for (const account of data.accounts) {
    if (account.name === undefined) account.name = account.label
    delete account.label
  }
}
