// Accounts record the day they were last credited with interest, so the job
// can run more than once a day. Additive: no account has been credited yet.
export const version = 4
export function up(data) {
  for (const account of data.accounts) {
    if (account.lastAccruedOn === undefined) account.lastAccruedOn = null
  }
}
