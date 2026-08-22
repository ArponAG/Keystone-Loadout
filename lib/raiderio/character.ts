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
const FIELDS =
  'gear,talents,mythic_plus_scores_by_season:current,mythic_plus_ranks,mythic_plus_best_runs:all,raid_progression';

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

/** One chosen talent, trimmed from Raider.IO's full node payload (31 KB -> 6 KB). */
export type TalentPick = {
  name: string;
  icon: string;
  rank: number;
  maxRanks: number;
  /** 0 = class/spec tree; anything else is a hero talent tree. */
  subTreeId: number;
  row: number;
};

export type TalentBuild = {
  specId: number;
  /** The in-game import string — the single most useful thing here. */
  importString: string;
  picks: TalentPick[];
};

export type BestRun = {
  dungeon: string;
  shortName: string;
  level: number;
  upgrades: number;
  score: number;
  clearTimeMs: number;
  parTimeMs: number;
  url: string;
};

export type MythicPlus = {
  score: number;
  /** Raider.IO's own tier colour for the score. */
  colour: string;
  ranks: { world: number; region: number; realm: number } | null;
  bestRuns: BestRun[];
  timedRuns: number;
  highestKey: number;
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
  mythic_plus_scores_by_season?: {
    scores: Record<string, number>;
    segments?: Record<string, { score: number; color: string }>;
  }[];
  mythic_plus_ranks?: Record<string, { world: number; region: number; realm: number }>;
  mythic_plus_best_runs?: {
    dungeon: string;
    short_name: string;
    mythic_level: number;
    num_keystone_upgrades: number;
    score: number;
    clear_time_ms: number;
    par_time_ms: number;
    url: string;
  }[];
  talentLoadout?: {
    loadout_spec_id: number;
    loadout_text: string;
    loadout: {
      node: {
        subTreeId: number;
        row: number;
        entries: { maxRanks: number; spell?: { name?: string; icon?: string } }[];
      };
      entryIndex: number;
      rank: number;
      grantedNode: boolean;
    }[];
  };
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


// ------------------------------------------------------------ client shaping

/**
 * Trim the raw profile before it reaches the browser.
 *
 * Raider.IO's talent payload is 31 KB of full tree-node data; the UI needs a name, an
 * icon and a rank. Granted nodes are dropped because they are automatic, not choices.
 */
export function shapeTalents(profile: CharacterProfile): TalentBuild | null {
  const raw = profile.talentLoadout;
  if (!raw?.loadout) return null;

  const picks: TalentPick[] = raw.loadout
    .filter((n) => {
      if (n.grantedNode) return false;
      // Drop structural nodes. The hero-tree selector is a node with no spell on any
      // entry — it records which hero tree was chosen, not a talent that was taken,
      // and would otherwise render as an "Unknown" chip.
      const entry = n.node.entries[n.entryIndex] ?? n.node.entries[0];
      return Boolean(entry?.spell?.name);
    })
    .map((n) => {
      const entry = n.node.entries[n.entryIndex] ?? n.node.entries[0];

      // Some nodes report a rank that spans several same-named entries — Warrior's
      // "Master of Warfare" has three entries (maxRanks 1, 2, 1) and reports rank 4.
      // Taking the chosen entry's maxRanks alone would render an impossible "4/1".
      const maxRanks = Math.max(entry?.maxRanks ?? 1, n.rank);

      return {
        name: entry?.spell?.name ?? 'Unknown',
        icon: entry?.spell?.icon ?? 'inv_misc_questionmark',
        rank: n.rank,
        maxRanks,
        subTreeId: n.node.subTreeId,
        row: n.node.row,
      };
    })
    .sort((a, b) => a.row - b.row || a.name.localeCompare(b.name));

  return { specId: raw.loadout_spec_id, importString: raw.loadout_text, picks };
}

export function shapeMythicPlus(profile: CharacterProfile): MythicPlus | null {
  const season = profile.mythic_plus_scores_by_season?.[0];
  if (!season) return null;

  const runs = profile.mythic_plus_best_runs ?? [];

  return {
    score: season.scores?.all ?? 0,
    colour: season.segments?.all?.color ?? '#ffffff',
    ranks: profile.mythic_plus_ranks?.overall ?? null,
    bestRuns: runs.map((r) => ({
      dungeon: r.dungeon,
      shortName: r.short_name,
      level: r.mythic_level,
      upgrades: r.num_keystone_upgrades,
      score: r.score,
      clearTimeMs: r.clear_time_ms,
      parTimeMs: r.par_time_ms,
      url: r.url,
    })),
    // Counted from best runs, which is one per dungeon — NOT a lifetime total.
    // Raider.IO's site shows lifetime counts, but the public API does not expose them.
    timedRuns: runs.filter((r) => r.num_keystone_upgrades > 0).length,
    highestKey: runs.reduce((max, r) => Math.max(max, r.mythic_level), 0),
  };
}
