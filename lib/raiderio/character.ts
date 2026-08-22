export * from './shape';

/**
 * Raider.IO character lookup with a DB-backed cache.
 *
 * This is the ONE live third-party call the app makes at request time — a character's
 * gear changes minute to minute and cannot be pre-synced. It still never happens from
 * the browser: the Route Handler owns it. See planning/03-etl.md §4.
 */
import { eq } from 'drizzle-orm';

import { db, schema } from '@/lib/db';

import {
  cacheKey,
  type CharacterProfile,
  type CharacterQuery,
  type LookupResult,
} from './shape';

const BASE = 'https://raider.io/api/v1/characters/profile';
const UA = 'KeystoneLoadout/0.1 (personal project)';
const FIELDS =
  'gear,talents,mythic_plus_scores_by_season:current,mythic_plus_ranks,mythic_plus_best_runs:all,raid_progression';

export const CACHE_TTL_MS = 15 * 60_000;

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


