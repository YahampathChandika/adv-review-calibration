import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The keys each collection stores. A write carrying any other key has that key
 * dropped by `pick`, so a caller that writes a key it did not add here stores
 * nothing for it and gets no error.
 */
export const SCHEMA = {
  users: ['id', 'name', 'token', 'role', 'createdAt'],
  accounts: ['id', 'ownerId', 'label', 'currency', 'balanceCents', 'interestRateBps', 'closedAt', 'createdAt', 'updatedAt'],
  transfers: ['id', 'fromId', 'toId', 'amountCents', 'memo', 'actorId', 'createdAt'],
  audit: ['id', 'actorId', 'action', 'target', 'at'],
}

/** Only the keys the collection stores. */
export function pick(collection, row) {
  const keys = SCHEMA[collection]
  if (!keys) throw new Error(`unknown collection: ${collection}`)
  const out = {}
  for (const key of keys) if (row[key] !== undefined) out[key] = row[key]
  return out
}

let counter = 0
export function newId(prefix) {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`
}

export const now = () => new Date().toISOString()

const EMPTY = () => ({ version: 0, users: [], accounts: [], transfers: [], audit: [] })

/**
 * A JSON file, held in memory and written whole on every save. Saves are
 * atomic on disk (write beside, then rename) so a crash never leaves a
 * half-written file.
 */
export class Store {
  constructor(file) {
    this.file = file
    this.data = EMPTY()
    this.listeners = []
  }

  /** Call `fn(collection, row)` after every insert and update, with the stored row. */
  onChange(fn) {
    this.listeners.push(fn)
  }

  static async open(file) {
    const store = new Store(file)
    await store.load()
    return store
  }

  async load() {
    try {
      this.data = { ...EMPTY(), ...JSON.parse(await readFile(this.file, 'utf8')) }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      this.data = EMPTY()
    }
  }

  async save() {
    await mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(this.data, null, 2))
    await rename(tmp, this.file)
  }

  all(collection) {
    if (!SCHEMA[collection]) throw new Error(`unknown collection: ${collection}`)
    return this.data[collection]
  }

  get(collection, id) {
    return this.all(collection).find((row) => row.id === id) ?? null
  }

  insert(collection, row) {
    const stored = pick(collection, row)
    this.all(collection).push(stored)
    for (const fn of this.listeners) fn(collection, stored)
    return stored
  }

  update(collection, id, patch) {
    const rows = this.all(collection)
    const index = rows.findIndex((row) => row.id === id)
    if (index < 0) throw new Error(`${collection}: no row ${id}`)
    rows[index] = pick(collection, { ...rows[index], ...patch })
    for (const fn of this.listeners) fn(collection, rows[index])
    return rows[index]
  }

  /**
   * Run every migration in `dir` whose version is above the store's, in
   * order, and record the new version. Each file exports `version` and
   * `up(data)`. Nothing is written until every pending migration has run.
   */
  async migrate(dir) {
    const files = (await readdir(dir)).filter((f) => f.endsWith('.js')).sort()
    const applied = []
    for (const file of files) {
      const mod = await import(pathToFileURL(path.join(dir, file)).href)
      if (typeof mod.version !== 'number' || typeof mod.up !== 'function') {
        throw new Error(`migration ${file} must export version and up`)
      }
      if (mod.version <= this.data.version) continue
      await mod.up(this.data)
      this.data.version = mod.version
      applied.push(file)
    }
    if (applied.length) await this.save()
    return applied
  }
}
