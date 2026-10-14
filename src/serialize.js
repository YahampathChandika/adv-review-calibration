/**
 * What leaves the API. Each shape lists its fields, so a stored key that is
 * nobody's business — a token, an actor — never rides out by accident.
 */
export function publicUser(u) {
  return { id: u.id, name: u.name, role: u.role }
}

export function publicAccount(a) {
  return {
    id: a.id,
    label: a.label,
    currency: a.currency,
    balanceCents: a.balanceCents,
    closed: Boolean(a.closedAt),
    createdAt: a.createdAt,
  }
}

export function publicTransfer(t) {
  return {
    id: t.id,
    fromId: t.fromId,
    toId: t.toId,
    amountCents: t.amountCents,
    memo: t.note,
    createdAt: t.createdAt,
  }
}

export function publicPage(page, map) {
  return { ...page, items: page.items.map(map) }
}
