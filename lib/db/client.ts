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

/** True when the DB file has not been created yet. Lets the UI show the
 *  "run the migration" empty state instead of a stack trace on a fresh clone. */
export function dbExists(): boolean {
  return existsSync(DB_PATH);
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
