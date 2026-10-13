# Running and deploying the ledger

The service is one process over one JSON file (`LEDGER_FILE`, default `data/ledger.json`).
It migrates the file on start, then listens on `PORT` (default 3000).

## Rollout order

Two copies can run against one file during a deploy. So:

1. **Migrations are additive first.** A migration may add a key or a collection, and
   must leave every key the previous release reads in place. Removing a key is its own
   later migration, shipped once no running copy reads it.
2. **Readers tolerate both shapes** during the window: a reader of a new key falls back
   to the old one until the removal migration has run.
3. **Deploy, then remove.** The release that stops reading a key goes out before the
   migration that deletes it.

The store's `SCHEMA` lists what each collection keeps; a write carrying a key not in
it stores nothing for that key. Add the key to `SCHEMA` in the same change that starts
writing it.
