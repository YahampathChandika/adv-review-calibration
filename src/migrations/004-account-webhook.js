// Accounts can carry their owner's webhook URL. Additive: none has one.
export const version = 4
export function up(data) {
  for (const account of data.accounts) {
    if (account.webhookUrl === undefined) account.webhookUrl = null
  }
}
