// A small in-memory stand-in for the D1 binding, on node:sqlite, so the tests
// run the Worker's real SQL against the real schema with no dependency.
//
// Two things about D1 matter to the code under test and are copied here:
//   - Every call is a network round trip. Each one yields to the event loop
//     first, so two requests in flight interleave between their awaits the
//     way they do in production.
//   - batch() is one transaction: all of it or none of it, and nothing else
//     runs in the middle.

import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = new URL('../schema.sql', import.meta.url)

const roundTrip = () => new Promise((resolve) => setImmediate(resolve))

export function makeD1() {
  const db = new DatabaseSync(':memory:')
  db.exec(readFileSync(SCHEMA, 'utf8'))

  /** @param {string} sql @param {unknown[]} params */
  const statement = (sql, params) => ({
    sql,
    params,
    bind: (...values) => statement(sql, values),
    // D1 resolves first() to null, never undefined, when there is no row.
    first: async () => { await roundTrip(); return db.prepare(sql).get(...params) ?? null },
    all: async () => { await roundTrip(); return { results: db.prepare(sql).all(...params), meta: {} } },
    run: async () => {
      await roundTrip()
      const info = db.prepare(sql).run(...params)
      return { results: [], meta: { changes: Number(info.changes) } }
    },
  })

  return {
    /** The raw database, for seeding rows and reading them back in tests. */
    sqlite: db,
    prepare: (sql) => statement(sql, []),
    async batch(statements) {
      await roundTrip()
      db.exec('BEGIN')
      try {
        // all() steps a write to completion too, and gives a SELECT its rows.
        const out = statements.map((s) => ({ results: db.prepare(s.sql).all(...s.params), meta: {} }))
        db.exec('COMMIT')
        return out
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}
