# Ledger

A small ledger service: accounts, deposits and transfers over one JSON file, with
bearer-token users, an append-only audit log and CSV export. No dependencies. Node 20
or later.

```
npm start                 # listens on PORT (3000), reads LEDGER_FILE (data/ledger.json)
node scripts/seed.mjs     # an admin, a member, two accounts; prints the tokens
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
| POST | `/accounts/:id/overdraft` | admin | `{ overdraftCents }`: how far below zero the account may go |
| POST | `/deposits` | admin | `{ accountId, amountCents }` |

An account that is not the caller's reads as absent (404), not forbidden.

## Rules

- Amounts are whole cents, always positive; the two sides of a transfer share a currency.
- A transfer may take an account below zero by at most its overdraft limit, 0 unless an
  administrator sets one.
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

## About

This repository is the calibration fixture for
[adv-review](https://github.com/YahampathChandika/adv-review). The answer key is kept
in that repository, not here. MIT licence.
