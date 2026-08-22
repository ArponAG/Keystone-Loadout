import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, schema } from '@/lib/db';
import { cacheKey, normaliseName, normaliseRealm } from '@/lib/raiderio/character';

/**
 * Pinned characters. Stored in SQLite rather than localStorage so the list survives a
 * cleared browser and is visible to any tab — this is a local single-user app, the DB
 * is already there, and it costs one table.
 *
 * The stored ilvl/score are a snapshot for the list label. Clicking a saved character
 * runs a real lookup, which refreshes them.
 */
const REGIONS = new Set(['us', 'eu', 'tw', 'kr', 'cn']);
const noStore = { headers: { 'Cache-Control': 'no-store' } };

export type SavedCharacter = {
  cacheKey: string;
  region: string;
  realm: string;
  name: string;
  className: string | null;
  specName: string | null;
  faction: string | null;
  thumbnail: string | null;
  itemLevel: number | null;
  mplusScore: number | null;
};

export async function GET() {
  const rows = await db
    .select()
    .from(schema.savedCharacters)
    .orderBy(desc(schema.savedCharacters.mplusScore), desc(schema.savedCharacters.savedAt));

  return NextResponse.json({ saved: rows }, noStore);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<SavedCharacter> | null;

  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });

  const region = (body.region ?? '').toLowerCase();
  const realm = normaliseRealm(body.realm ?? '');
  const name = normaliseName(body.name ?? '');

  if (!REGIONS.has(region) || !realm || !name) {
    return NextResponse.json({ error: 'region, realm and name are required.' }, { status: 400 });
  }

  const key = cacheKey({ region, realm, name });
  const now = Date.now();

  const row = {
    cacheKey: key,
    region,
    realm,
    name,
    className: body.className ?? null,
    specName: body.specName ?? null,
    faction: body.faction ?? null,
    thumbnail: body.thumbnail ?? null,
    itemLevel: body.itemLevel ?? null,
    mplusScore: body.mplusScore ?? null,
    savedAt: now,
    refreshedAt: now,
  };

  // Re-saving an existing character refreshes its snapshot but keeps the original
  // savedAt, so the list does not reshuffle every time you view someone.
  db.insert(schema.savedCharacters)
    .values(row)
    .onConflictDoUpdate({
      target: schema.savedCharacters.cacheKey,
      set: {
        className: row.className,
        specName: row.specName,
        faction: row.faction,
        thumbnail: row.thumbnail,
        itemLevel: row.itemLevel,
        mplusScore: row.mplusScore,
        refreshedAt: now,
      },
    })
    .run();

  return NextResponse.json({ ok: true, cacheKey: key }, noStore);
}

export async function DELETE(request: Request) {
  const key = new URL(request.url).searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key is required.' }, { status: 400 });

  db.delete(schema.savedCharacters).where(eq(schema.savedCharacters.cacheKey, key)).run();

  return NextResponse.json({ ok: true }, noStore);
}
