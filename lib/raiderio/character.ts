/**
 * Raider.IO character lookup with a DB-backed cache.
 *
 * This is the ONE live third-party call the app makes at request time — a character's
 * gear changes minute to minute and cannot be pre-synced. It still never happens from
 * the browser: the Route Handler owns it. See planning/03-etl.md §4.
 */
import { eq } from 'drizzle-orm';

import { db, schema } from '@/lib/db';

const BASE = 'https://raider.io/api/v1/characters/profile';
const UA = 'KeystoneLoadout/0.1 (personal project)';
const FIELDS = 'gear,mythic_plus_scores_by_season:current,raid_progression';

export const CACHE_TTL_MS = 15 * 60_000;

export type CharacterQuery = { region: string; realm: string; name: string };

export type LookupResult =
  | { ok: true; profile: CharacterProfile; cachedAt: number; stale: boolean }
  | { ok: false; status: number; error: string };

export type GearItem = {
  item_id: number;
  item_level: number;
  name: string;
  icon: string;
  item_quality: number;
  // azerite_powers and corruption are deliberately not typed: the probe showed them
  // returning legacy junk (tier 999, spell name "Unknown") on current-expansion gear.
};

export type CharacterProfile = {
  name: string;
  race: string;
  class: string;
  active_spec_name: string;
  active_spec_role: string;
  faction: string;
  realm: string;
  region: string;
  thumbnail_url: string;
  profile_url: string;
  last_crawled_at: string;
  gear: {
    item_level_equipped: number;
    items: Record<string, GearItem>;
  };
  mythic_plus_scores_by_season?: { scores: Record<string, number> }[];
  raid_progression?: Record<string, { summary: string; total_bosses: number; mythic_bosses_killed: number; heroic_bosses_killed: number; normal_bosses_killed: number }>;
};

/**
 * Realm must be a slug: "moon-guard", not "Moon Guard". Normalising here rather than
 * trusting the caller means a lookup fails for real reasons, not formatting ones.
 */
export function normaliseRealm(realm: string): string {
  return realm
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, '');
}

export function cacheKey({ region, realm, name }: CharacterQuery): string {
  return `${region}:${realm}:${name}`.toLowerCase();
}

function readCache(key: string): { payload: string; fetchedAt: number } | null {
  const [row] = db
    .select({ payload: schema.characterCache.payload, fetchedAt: schema.characterCache.fetchedAt })
    .from(schema.characterCache)
    .where(eq(schema.characterCache.cacheKey, key))
    .limit(1)
    .all();
  return row ?? null;
}

function writeCache(key: string, payload: string): number {
  const fetchedAt = Date.now();
  db.insert(schema.characterCache)
    .values({ cacheKey: key, payload, fetchedAt })
    .onConflictDoUpdate({
      target: schema.characterCache.cacheKey,
      set: { payload, fetchedAt },
    })
    .run();
  return fetchedAt;
}

export async function lookupCharacter(query: CharacterQuery): Promise<LookupResult> {
  const key = cacheKey(query);
  const cached = readCache(key);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ok: true,
      profile: JSON.parse(cached.payload) as CharacterProfile,
      cachedAt: cached.fetchedAt,
      stale: false,
    };
  }

  const url =
    `${BASE}?region=${encodeURIComponent(query.region)}` +
    `&realm=${encodeURIComponent(query.realm)}` +
    `&name=${encodeURIComponent(query.name)}` +
    `&fields=${FIELDS}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } });
  } catch {
    // Network failure. A stale profile beats no profile, as long as it is labelled.
    if (cached) {
      return {
        ok: true,
        profile: JSON.parse(cached.payload) as CharacterProfile,
        cachedAt: cached.fetchedAt,
        stale: true,
      };
    }
    return { ok: false, status: 503, error: 'Raider.IO is unreachable. Try again shortly.' };
  }

  if (res.status === 400 || res.status === 404) {
    // Deliberately NOT cached: a typo today should not persist for 15 minutes, and the
    // character may simply not have been crawled yet.
    return {
      ok: false,
      status: 404,
      error:
        'Character not found. Check the realm slug and spelling — Raider.IO only knows characters it has crawled.',
    };
  }

  if (res.status === 429) {
    if (cached) {
      return {
        ok: true,
        profile: JSON.parse(cached.payload) as CharacterProfile,
        cachedAt: cached.fetchedAt,
        stale: true,
      };
    }
    return { ok: false, status: 429, error: 'Too many lookups. Try again in a minute.' };
  }

  if (!res.ok) {
    if (cached) {
      return {
        ok: true,
        profile: JSON.parse(cached.payload) as CharacterProfile,
        cachedAt: cached.fetchedAt,
        stale: true,
      };
    }
    return { ok: false, status: 502, error: `Raider.IO returned ${res.status}.` };
  }

  const text = await res.text();
  const fetchedAt = writeCache(key, text);

  return {
    ok: true,
    profile: JSON.parse(text) as CharacterProfile,
    cachedAt: fetchedAt,
    stale: false,
  };
}
