/**
 * SQLite client singleton.
 *
 * Server-only. Every page in this app reads from here and never from a third-party
 * API at request time — see planning/01-architecture.md.
 */
import 'server-only';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';

import * as schema from './schema';

export const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

/** True when the DB file has not been created yet. Surfaces the "run npm run sync"
 *  empty state instead of a stack trace on a fresh clone. */
export function dbExists(): boolean {
  return existsSync(DB_PATH);
}

// Next dev-server hot reload re-evaluates modules; without this the process
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
