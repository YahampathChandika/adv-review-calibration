import { createHmac } from 'node:crypto'

/**
 * Outgoing webhooks. The operator configures one endpoint and a shared secret
 * (`LEDGER_WEBHOOK_URL`, `LEDGER_WEBHOOK_SECRET`). Every event is POSTed there as
 * JSON with an HMAC-SHA256 of the body in `x-ledger-signature`. Delivery happens
 * after the response, so a slow or failing receiver never delays or fails a
 * request. A failed delivery is tried twice more. The secret is never logged.
 *
 * An account's owner may add an endpoint of their own; its events go there too.
 */
export function createNotifier({ url, secret = '', send = fetch, delays = [1_000, 5_000], log = console } = {}) {
  const pending = new Set()

  const deliver = async (target, event, data) => {
    const body = JSON.stringify({ event, data, at: new Date().toISOString() })
    const signature = createHmac('sha256', secret).update(body).digest('hex')
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const res = await send(target, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-ledger-signature': signature },
          body,
        })
        if (res.ok) return true
      } catch {
        // A receiver that is down is retried like one that answered with an error.
      }
      if (attempt < delays.length) await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }
    log.warn(`webhook ${event} not delivered after ${delays.length + 1} attempts`)
    return false
  }

  return {
    /** Send an event to the operator's endpoint, and to any account endpoints in `also`. */
    notify(event, data, also = []) {
      for (const target of [url, ...also].filter(Boolean)) {
        const delivery = deliver(target, event, data).finally(() => pending.delete(delivery))
        pending.add(delivery)
      }
    },
    /** Resolves once every delivery in flight has finished: for tests and shutdown. */
    idle: () => Promise.all([...pending]),
  }
}
