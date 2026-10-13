// The first shape: every collection present, version 1.
export const version = 1
export function up(data) {
  for (const collection of ['users', 'accounts', 'transfers', 'audit']) {
    if (!Array.isArray(data[collection])) data[collection] = []
  }
}
