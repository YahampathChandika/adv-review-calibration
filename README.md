# Ledger

A small ledger service: accounts, deposits and transfers over one JSON file, with
bearer-token users, an append-only audit log, CSV export, daily interest, outgoing
webhooks and a read cache. No dependencies. Node 20 or later.

```
npm start                 # listens on PORT (3000), reads LEDGER_FILE (data/ledger.json)
node scripts/seed.mjs     # an admin, a member, two accounts; prints the tokens
node scripts/run-jobs.mjs interest   # one day's interest; the scheduler runs it daily
npm test                  # node --test
npm run check             # syntax check of every module
```

## Users and roles

Every request but `/health` carries `Authorization: Bearer <token>`. A token names a
user in the ledger file.

| Role | May |
| :- | :- |
| `member` | open, read, close and export their own accounts; transfer between them |
| `admin` | everything a member may, plus deposits into any account |

## API

Requests and responses are JSON. Errors are `{ "error": "…" }` with a status; an
unexpected failure is a 500 that says nothing about itself.

| Method | Route | Who | Does |
| :- | :- | :- | :- |
| GET | `/health` | anyone | `{ ok: true }` |
| GET | `/accounts` | member | the caller's accounts, newest first, 20 a page (`?page=`) |
| POST | `/accounts` | member | open an account: `{ label, currency? }` |
| GET | `/accounts/:id` | owner | one account |
| POST | `/accounts/:id/close` | owner | close an empty account |
| GET | `/accounts/:id/transfers` | owner | the account's transfers, newest first |
| POST | `/accounts/:id/export` | owner | write the account's transfers as CSV under `exports/` |
| POST | `/transfers` | owner of both | `{ fromId, toId, amountCents, memo? }` |
| POST | `/deposits` | admin | `{ accountId, amountCents }` |
| POST | `/accounts/:id/interest-rate` | admin | `{ interestRateBps }`: the yearly rate, 0 to 2,000 basis points |

An account that is not the caller's reads as absent (404), not forbidden.

## Interest, webhooks and caching

- **Interest.** An account earns its yearly rate, in basis points, divided by 365 each
  day, in whole cents rounded down. `scripts/run-jobs.mjs interest` accrues one day and
  is recorded as `system`. The operator's scheduler runs it once a day.
- **Webhooks.** With `LEDGER_WEBHOOK_URL` and `LEDGER_WEBHOOK_SECRET` set, deposits,
  transfers and closed accounts are POSTed to that endpoint as signed JSON after the
  response, retried twice. See `src/webhooks.js`.
- **Caching.** `GET /accounts/:id` reads through a short-lived cache. The store's change
  hook drops an account's entry on every write, so nothing else invalidates it.

## Rules

See [`docs/security.md`](docs/security.md) for the security rules and
[`docs/deploy.md`](docs/deploy.md) for rollout. In short:

- Amounts are whole cents, always positive; the two sides of a transfer share a currency.
- A transfer of $1,000 or more is screened by the fraud service first; a flagged one is
  refused with 403.
- A memo is at most 140 characters.
- Every write is audited under the user who made it. A job the service runs on its own
  records `system`, never a person who did not act.
- A closed account takes no money in or out, and only an empty account closes.
- The store keeps only the keys its `SCHEMA` lists; a key written without being listed
  there stores nothing. Migrations roll out as `docs/deploy.md` says: additive first,
  removals later.

## Known limitations

- Tokens are kept in the ledger file in plain text and compared with `===`.
- There is no rate limiting.
- One process per ledger file: ids are unique within a process, and a save rewrites
  the whole file.
- The interest job is not safe to run twice in one day.

## About

This repository is the calibration fixture for
[adv-review](https://github.com/YahampathChandika/adv-review). The answer key is kept
in that repository, not here. MIT licence.
