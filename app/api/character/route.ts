import { asc } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, dbReady, schema } from '@/lib/db';
import { auditGear, typicalKeyLevel } from '@/lib/domain/gear-audit';
import { vaultRewardFor } from '@/lib/domain/rewards';
import { resolveUpgradeTrack, type UpgradeTrack } from '@/lib/domain/upgrade-track';
import {
  recommendForCharacter,
  resolveBuild,
} from '@/lib/raiderio/recommend-for-character';

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
  if (!dbReady()) {
    return NextResponse.json(
      { error: 'The database has not been created yet. Run: npx drizzle-kit migrate' },
      { status: 503 },
    );
  }

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

  const mythicPlus = shapeMythicPlus(result.profile);

  // Tier 2 target: what the Great Vault awards at the key level this character
  // actually clears. The curve comes from the game's own reward table (synced by
  // sync:instances); with no curve the audit degrades to the relative signal alone.
  const curve = await db
    .select({
      keyLevel: schema.keystoneRewards.keyLevel,
      vaultItemLevel: schema.keystoneRewards.vaultItemLevel,
    })
    .from(schema.keystoneRewards)
    .orderBy(asc(schema.keystoneRewards.keyLevel));

  const keyLevel = typicalKeyLevel(mythicPlus?.bestRuns ?? []);
  const reward = keyLevel === null ? null : vaultRewardFor(curve, keyLevel);

  const audit = auditGear(
    Object.entries(profile.gear?.items ?? {}).map(([slot, item]) => ({
      slot,
      itemLevel: item.item_level,
    })),
    reward && keyLevel !== null
      ? { keyLevel, itemLevel: reward.itemLevel, cappedAt: reward.cappedAt }
      : null,
  );

  // Upgrade track per slot, resolved server-side. The lookup table is ~100 rows, so it
  // is read whole and turned into a Map rather than queried once per item.
  const trackRows = db
    .select({
      bonusId: schema.upgradeTracks.bonusId,
      track: schema.upgradeTracks.track,
      rank: schema.upgradeTracks.rank,
      maxRank: schema.upgradeTracks.maxRank,
    })
    .from(schema.upgradeTracks)
    .all();

  const trackLookup = new Map(
    trackRows.map((r) => [r.bonusId, { track: r.track, rank: r.rank, maxRank: r.maxRank }]),
  );

  // Keyed by slot rather than folded into the gear items, so the upstream Raider.IO
  // shape stays exactly as Raider.IO sent it. An empty table (sync never run) yields
  // nulls throughout and the UI simply omits the badge.
  const tracks: Record<string, UpgradeTrack | null> = {};
  for (const [slot, item] of Object.entries(profile.gear?.items ?? {})) {
    tracks[slot] = resolveUpgradeTrack(item.bonuses, trackLookup);
  }

  const resolved = await resolveBuild(result.profile, result.profile.talentLoadout?.loadout_spec_id ?? null);

  // Stat priority is the one thing no API knows — it is sim output. Default to a
  // neutral order so a new player gets an answer without configuring anything, and
  // let the UI override it. See planning/05-ui.md.
  const order = (params.get('order') ?? '').split(',').filter(Boolean);
  const secondaryOrder = (
    order.length === 4 ? order : ['haste', 'crit', 'mastery', 'vers']
  ) as unknown as Parameters<typeof recommendForCharacter>[2];

  const recommendations = await recommendForCharacter(audit, resolved, secondaryOrder);

  return NextResponse.json(
    {
      profile,
      tracks,
      build: resolved,
      recommendations,
      // Shaped server-side: Raider.IO's raw talent payload is 31 KB of tree-node data
      // the browser has no use for.
      talents: shapeTalents(result.profile),
      mythicPlus,
      audit,
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
