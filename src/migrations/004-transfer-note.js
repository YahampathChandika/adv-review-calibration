// Transfers call their memo a note. Additive, per docs/deploy.md: copy every
// memo into note and leave memo in place. Removing memo is a later migration.
export const version = 4
export function up(data) {
  for (const transfer of data.transfers) {
    if (transfer.note === undefined) transfer.note = transfer.memo ?? ''
  }
}
