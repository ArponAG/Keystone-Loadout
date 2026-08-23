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

  /*
    busy_timeout FIRST, and it is not optional.

    Opening the database happens at module load, so anything that imports this module
    opens a connection — including every one of the workers Next uses. `next build`
    collects page data with 12 of them in parallel, and `journal_mode = WAL` needs a
    write lock, so on a database file that does not exist yet they all race to create it
    and set the same pragma. The losers get SQLITE_BUSY and the build dies with
    "Failed to collect page data for /sync".

    That failure is intermittent, which is what makes it nasty: it took down a deploy,
    then "passed" on the next attempt only because Docker had cached the layer.

    Without a timeout SQLite fails a contended lock immediately rather than waiting.
    Five seconds is far longer than any of these writes needs and costs nothing when
    uncontended. This matters at runtime too — the production server also serves from
    multiple workers against one file.
  */
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

const sqlite = globalForDb.__sqlite ?? createConnection();
if (process.env.NODE_ENV !== 'production') globalForDb.__sqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
