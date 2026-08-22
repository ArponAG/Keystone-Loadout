import { NextResponse } from 'next/server';

/**
 * The one live third-party passthrough in the app — a character's gear changes
 * minute to minute and cannot be pre-synced. Implemented in Step 9 with a
 * 15-minute character_cache TTL. See planning/03-etl.md §4.
 */
export function GET() {
  return NextResponse.json({ error: 'Not implemented until Step 9.' }, { status: 501 });
}
