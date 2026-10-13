import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAccount, getOwnAccount, listAccounts, openAccount } from './accounts.js'
import { HttpError, requireRole, requireUser } from './auth.js'
import { exportTransfers } from './export.js'
import { publicAccount, publicPage, publicTransfer } from './serialize.js'
import { Store } from './store.js'
import { deposit, summary, transfer, transfersFor, withdraw } from './transfers.js'

const MAX_BODY = 64 * 1024

/** A handler's answer with a status other than 200. */
class Reply {
  constructor(status, body) {
    this.status = status
    this.body = body
  }
}
const created = (body) => new Reply(201, body)

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new HttpError(413, 'body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'body must be JSON')
  }
}

const routes = [
  ['GET', /^\/health$/, async () => ({ ok: true })],
  [
    'GET',
    /^\/accounts$/,
    requireUser(async ({ store, user, url }) => {
      const page = url.searchParams.has('page') ? Number(url.searchParams.get('page')) : 1
      return publicPage(listAccounts(store, { ownerId: user.id, page }), publicAccount)
    }),
  ],
  [
    'POST',
    /^\/accounts$/,
    requireUser(async ({ store, user, body }) => {
      const account = openAccount(store, { ...body, ownerId: user.id, actorId: user.id })
      await store.save()
      return created(publicAccount(account))
    }),
  ],
  [
    'GET',
    /^\/accounts\/([^/]+)$/,
    requireUser(async ({ store, user, params }) => publicAccount(getOwnAccount(store, user, params[0]))),
  ],
  [
    'POST',
    /^\/accounts\/([^/]+)\/close$/,
    requireUser(async ({ store, user, params }) => {
      const closed = closeAccount(store, user, params[0])
      await store.save()
      return publicAccount(closed)
    }),
  ],
  [
    'GET',
    /^\/accounts\/([^/]+)\/transfers$/,
    requireUser(async ({ store, user, params }) => {
      const account = getOwnAccount(store, user, params[0])
      return transfersFor(store, account.id).map(publicTransfer)
    }),
  ],
  [
    'POST',
    /^\/transfers$/,
    requireUser(async ({ store, user, body }) => {
      const row = transfer(store, user, body)
      await store.save()
      return created(publicTransfer(row))
    }),
  ],
  [
    'POST',
    /^\/deposits$/,
    requireRole('admin', async ({ store, user, body }) => {
      const account = deposit(store, user, body)
      await store.save()
      return created(publicAccount(account))
    }),
  ],
  [
    'POST',
    /^\/withdrawals$/,
    requireRole('admin', async ({ store, user, body }) => {
      const account = withdraw(store, user, body)
      await store.save()
      return created(publicAccount(account))
    }),
  ],
  ['GET', /^\/summary$/, requireRole('admin', async ({ store }) => summary(store))],
  [
    'POST',
    /^\/accounts\/([^/]+)\/export$/,
    requireUser(async ({ store, user, params, exportDir }) => {
      const account = getOwnAccount(store, user, params[0])
      const { rows } = await exportTransfers(store, account, exportDir)
      return { exported: rows }
    }),
  ],
]

/** The HTTP server over a store. `exportDir` is where CSV exports land. */
export function createServer(store, { exportDir } = {}) {
  const dir = exportDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'exports')
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const route = routes.find(([method, pattern]) => method === req.method && pattern.test(url.pathname))
    try {
      if (!route) throw new HttpError(404, 'no such route')
      const params = route[1].exec(url.pathname).slice(1)
      const body = req.method === 'POST' ? await readJson(req) : {}
      const result = await route[2]({ req, store, url, params, body, exportDir: dir })
      const [status, payload] = result instanceof Reply ? [result.status, result.body] : [200, result]
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(payload))
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500
      if (status === 500) console.error('request failed', req.method, url.pathname, err)
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: status === 500 ? 'internal error' : err.message }))
    }
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.env.LEDGER_FILE ?? path.join(process.cwd(), 'data', 'ledger.json')
  const store = await Store.open(file)
  await store.migrate(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations'))
  const port = Number(process.env.PORT ?? 3000)
  createServer(store).listen(port, () => console.log(`ledger on :${port}`))
}
