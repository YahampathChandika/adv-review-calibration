/**
 * Bearer tokens. Every request to the API carries `Authorization: Bearer <token>`,
 * which names a user in the store. The token is the only credential; it is
 * never logged.
 */
export function authenticate(req, store) {
  const header = req.headers.authorization ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) return null
  return store.all('users').find((u) => u.token === match[1]) ?? null
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** Wrap a handler so it runs only for a signed-in user, who is passed to it. */
export function requireUser(handler) {
  return async (ctx) => {
    const user = authenticate(ctx.req, ctx.store)
    if (!user) throw new HttpError(401, 'sign in first')
    return handler({ ...ctx, user })
  }
}

/** Wrap a handler so it runs only for a user with this role. */
export function requireRole(role, handler) {
  return requireUser(async (ctx) => {
    if (ctx.user.role !== role) throw new HttpError(403, `${role} only`)
    return handler(ctx)
  })
}
