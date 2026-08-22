/**
 * SQLite connection and Drizzle instance.
 *
 * This module has NO `server-only` guard, because the ETL scripts in scripts/ run
 * under tsx outside Next and must be able to import it. App code should import
 * `@/lib/db` instead, which re-exports this behind that guard.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';

import * as schema from './schema';

export const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

/**
 * True once the schema actually exists.
 *
 * Checking for the FILE is not enough and was a real first-run bug: better-sqlite3
 * creates the database on connect, so a fresh clone ended up with a 4 KB file
 * containing zero tables. `existsSync` happily returned true, every "run the migration"
 * empty state was skipped, and four pages returned a raw 500 with "no such table" —
 * which is precisely the experience someone cloning the repo would hit first.
 *
 * So ask the schema, not the filesystem. The answer is memoised only once it is true;
 * a false result is rechecked, so the app starts working the moment migrations run,
 * with no restart.
 */
let schemaReady = false;

export function dbReady(): boolean {
  if (schemaReady) return true;
  if (!existsSync(DB_PATH)) return false;

  try {
    const row = sqlite
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='instances'")
      .get() as { n: number };
    schemaReady = row.n > 0;
  } catch {
    schemaReady = false;
  }
  return schemaReady;
}

/** @deprecated Use dbReady() — the file existing does not mean the schema does. */
export function dbExists(): boolean {
  return dbReady();
}

// Next's dev server re-evaluates modules on hot reload; without this the process
// accumulates open SQLite handles until it runs out of file descriptors.
const globalForDb = globalThis as unknown as { __sqlite?: Database.Database };

function createConnection(): Database.Database {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

const sqlite = globalForDb.__sqlite ?? createConnection();
if (process.env.NODE_ENV !== 'production') globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
