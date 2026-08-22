import { NextResponse } from 'next/server';

import {
  lookupCharacter,
  normaliseName,
  normaliseRealm,
  shapeMythicPlus,
  shapeTalents,
} from '@/lib/raiderio/character';

/**
 * The one live third-party passthrough in the app — a character's gear changes minute
 * to minute and cannot be pre-synced. Cached 15 minutes in the DB.
 *
 * The browser calls this route, never Raider.IO directly. That keeps the outbound
 * User-Agent honest and the caching in one place.
 */
const REGIONS = new Set(['us', 'eu', 'tw', 'kr', 'cn']);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;

  const region = (params.get('region') ?? 'us').toLowerCase();
  const realm = normaliseRealm(params.get('realm') ?? '');
  const name = normaliseName(params.get('name') ?? '');

  if (!REGIONS.has(region)) {
    return NextResponse.json(
      { error: `Unknown region "${region}". Use one of: ${[...REGIONS].join(', ')}.` },
      { status: 400 },
    );
  }

  if (!realm || !name) {
    return NextResponse.json({ error: 'Both realm and character name are required.' }, { status: 400 });
  }

  const result = await lookupCharacter({ region, realm, name });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Drop the raw talent tree from what ships to the browser — `talents` below is the
  // same information at a fifth of the size.
  const { talentLoadout: _raw, ...profile } = result.profile;

  return NextResponse.json(
    {
      profile,
      // Shaped server-side: Raider.IO's raw talent payload is 31 KB of tree-node data
      // the browser has no use for.
      talents: shapeTalents(result.profile),
      mythicPlus: shapeMythicPlus(result.profile),
      cachedAt: result.cachedAt,
      stale: result.stale,
      normalised: { region, realm, name },
    },
    {
      // The DB cache is the real one; tell the browser not to add a second layer.
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
