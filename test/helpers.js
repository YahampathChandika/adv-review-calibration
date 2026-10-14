import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from '../src/server.js'
import { Store, newId, now } from '../src/store.js'

export const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'migrations')

/** A fresh store in a temp dir, migrated, with two users: an admin and a member. */
export async function freshStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ledger-'))
  const store = await Store.open(path.join(dir, 'ledger.json'))
  await store.migrate(MIGRATIONS)
  const admin = store.insert('users', { id: newId('usr'), name: 'Ada', token: 'tok-ada', role: 'admin', createdAt: now() })
  const member = store.insert('users', { id: newId('usr'), name: 'Bob', token: 'tok-bob', role: 'member', createdAt: now() })
  const other = store.insert('users', { id: newId('usr'), name: 'Cy', token: 'tok-cy', role: 'member', createdAt: now() })
  await store.save()
  return { dir, store, admin, member, other }
}

/** The server on a free port, with a `call` helper that speaks JSON. `options` go to createServer. */
export async function serve(store, dir, options = {}) {
  const server = createServer(store, { exportDir: path.join(dir, 'exports'), ...options })
  await new Promise((resolve) => server.listen(0, resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const call = async (method, route, { token, body } = {}) => {
    const res = await fetch(base + route, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json() }
  }
  const close = () => new Promise((resolve) => server.close(resolve))
  return { base, call, close, server }
}
