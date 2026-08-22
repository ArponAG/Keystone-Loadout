/**
 * Pure shaping and normalisation for Raider.IO data.
 *
 * Deliberately free of any database import. `character.ts` needs `@/lib/db`, which
 * carries the `server-only` guard and therefore cannot be imported by tests running
 * under plain Node — the same split, for the same reason, as `lib/db/client.ts`.
 * Everything here is a pure function over a payload, which is exactly what is worth
 * testing.
 */
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
export type TalentTree = 'class' | 'hero' | 'spec';

export type TalentPick = {
  name: string;
  icon: string;
  /** Wowhead spell id, so the icon can carry a real talent tooltip. */
  spellId: number | null;
  rank: number;
  maxRanks: number;
  tree: TalentTree;
  row: number;
  col: number;
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
        posX: number;
        entries: { maxRanks: number; spell?: { id?: number; name?: string; icon?: string } }[];
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

  const chosen = raw.loadout.filter((n) => {
    if (n.grantedNode) return false;
    // Drop structural nodes. The hero-tree selector is a node with no spell on any
    // entry — it records which hero tree was chosen, not a talent that was taken,
    // and would otherwise render as an "Unknown" chip.
    const entry = n.node.entries[n.entryIndex] ?? n.node.entries[0];
    return Boolean(entry?.spell?.name);
  });

  // Class and spec talents share subTreeId 0, and nothing in the payload labels which
  // is which. The game lays them out side by side, so posX does separate them: columns
  // sit ~600 apart within a tree, and there is a single large gap between the two.
  // Finding that gap works for any class rather than hardcoding a threshold.
  const mainX = [...new Set(chosen.filter((n) => n.node.subTreeId === 0).map((n) => n.node.posX))].sort(
    (a, b) => a - b,
  );

  let splitX = Infinity;
  let widest = 0;
  for (let i = 1; i < mainX.length; i += 1) {
    const gap = mainX[i] - mainX[i - 1];
    if (gap > widest) {
      widest = gap;
      splitX = (mainX[i] + mainX[i - 1]) / 2;
    }
  }
  // Only trust the split when the gap is clearly structural, not just a sparse column.
  const typicalGap = mainX.length > 1 ? (mainX[mainX.length - 1] - mainX[0]) / (mainX.length - 1) : 0;
  if (widest < typicalGap * 2) splitX = Infinity;

  const picks: TalentPick[] = chosen
    .map((n) => {
      const entry = n.node.entries[n.entryIndex] ?? n.node.entries[0];

      // Some nodes report a rank that spans several same-named entries — Warrior's
      // "Master of Warfare" has three entries (maxRanks 1, 2, 1) and reports rank 4.
      // Taking the chosen entry's maxRanks alone would render an impossible "4/1".
      const maxRanks = Math.max(entry?.maxRanks ?? 1, n.rank);

      const tree: TalentTree =
        n.node.subTreeId !== 0 ? 'hero' : n.node.posX > splitX ? 'spec' : 'class';

      return {
        name: entry?.spell?.name ?? 'Unknown',
        icon: entry?.spell?.icon ?? 'inv_misc_questionmark',
        spellId: entry?.spell?.id ?? null,
        rank: n.rank,
        maxRanks,
        tree,
        row: n.node.row,
        col: n.node.posX,
      };
    })
    .sort((a, b) => a.row - b.row || a.col - b.col);

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
