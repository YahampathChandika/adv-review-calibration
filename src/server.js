import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeAccount, getOwnAccount, listAccounts, openAccount, setInterestRate, setWebhook } from './accounts.js'
import { HttpError, requireRole, requireUser } from './auth.js'
import { AccountCache } from './cache.js'
import { exportTransfers } from './export.js'
import { publicAccount, publicPage, publicTransfer } from './serialize.js'
import { Store } from './store.js'
import { deposit, transfer, transfersFor } from './transfers.js'
import { createNotifier } from './webhooks.js'

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
    requireUser(async ({ store, user, params, cache }) => publicAccount(getOwnAccount(store, user, params[0], cache))),
  ],
  [
    'POST',
    /^\/accounts\/([^/]+)\/close$/,
    requireUser(async ({ store, user, params, notify }) => {
      const closed = closeAccount(store, user, params[0])
      await store.save()
      notify('account.closed', { accountId: closed.id }, [closed.webhookUrl])
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
    requireUser(async ({ store, user, body, notify }) => {
      const row = transfer(store, user, body)
      await store.save()
      const ends = [store.get('accounts', row.fromId)?.webhookUrl, store.get('accounts', row.toId)?.webhookUrl]
      notify('transfer.created', publicTransfer(row), [...new Set(ends)])
      return created(publicTransfer(row))
    }),
  ],
  [
    'POST',
    /^\/deposits$/,
    requireRole('admin', async ({ store, user, body, notify }) => {
      const account = deposit(store, user, body)
      await store.save()
      notify('deposit.created', { accountId: account.id, amountCents: body.amountCents }, [account.webhookUrl])
      return created(publicAccount(account))
    }),
  ],
  [
    'POST',
    /^\/accounts\/([^/]+)\/webhook$/,
    requireUser(async ({ store, user, params, body }) => {
      const account = setWebhook(store, user, params[0], body.url)
      await store.save()
      return publicAccount(account)
    }),
  ],
  [
    'POST',
    /^\/accounts\/([^/]+)\/interest-rate$/,
    requireRole('admin', async ({ store, user, params, body }) => {
      const account = setInterestRate(store, user, { accountId: params[0], interestRateBps: body.interestRateBps })
      await store.save()
      return publicAccount(account)
    }),
  ],
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

/**
 * The HTTP server over a store. `exportDir` is where CSV exports land; `webhook`
 * configures outgoing webhooks (see webhooks.js); `cacheTtlMs` how long a read of
 * one account is cached. The notifier is on `server.notifier`.
 */
export function createServer(store, { exportDir, webhook, cacheTtlMs } = {}) {
  const dir = exportDir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'exports')
  const cache = new AccountCache(store, { ttlMs: cacheTtlMs })
  const notifier = createNotifier(webhook)
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const route = routes.find(([method, pattern]) => method === req.method && pattern.test(url.pathname))
    try {
      if (!route) throw new HttpError(404, 'no such route')
      const params = route[1].exec(url.pathname).slice(1)
      const body = req.method === 'POST' ? await readJson(req) : {}
      const result = await route[2]({ req, store, url, params, body, exportDir: dir, cache, notify: notifier.notify })
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
  server.notifier = notifier
  return server
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.env.LEDGER_FILE ?? path.join(process.cwd(), 'data', 'ledger.json')
  const store = await Store.open(file)
  await store.migrate(path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations'))
  const port = Number(process.env.PORT ?? 3000)
  const webhook = { url: process.env.LEDGER_WEBHOOK_URL, secret: process.env.LEDGER_WEBHOOK_SECRET }
  createServer(store, { webhook }).listen(port, () => console.log(`ledger on :${port}`))
}
