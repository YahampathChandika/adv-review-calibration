// A collection for idempotency keys. Additive.
export const version = 4
export function up(data) {
  if (!Array.isArray(data.idempotency)) data.idempotency = []
}
