/**
 * Server-side database entry point for app code.
 *
 * The `server-only` guard makes importing this from a Client Component a build error.
 * ETL scripts cannot use it (the guard throws under plain Node), so they import
 * `./client` directly — see planning/01-architecture.md §4.
 */
import 'server-only';

export { DB_PATH, db, dbExists, dbReady, schema } from './client';
