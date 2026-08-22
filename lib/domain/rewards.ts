/**
 * Picking the Mythic+ reward curve out of the game's MythicPlusSeasonRewardLevels
 * table.
 *
 * The table lists several ActivityTierIDs per season — M+, delves, raid — and nothing
 * in it says which is which. Two observations separate them, verified across the eight
 * most recent seasons:
 *
 *   - M+ vault rewards start at key level 2. Delve and raid tiers start at 0 or 1.
 *   - The M+ tier is the substantial one (9-19 rows); the others are one or two rows.
 *
 * Selecting on "starts at >= 2" alone is ambiguous in recent seasons (120 matches three
 * tiers), so the row count breaks the tie. That resolved uniquely for every season
 * tested, with no ties.
 *
 * Sanity check on live data: season 120 tier 256 gives +4 -> 308, and a character whose
 * best keys are +2..+4 has best items of exactly 302-308.
 */

export type RewardRow = {
  seasonId: number;
  activityTierId: number;
  keyLevel: number;
  vaultItemLevel: number;
};

/** Below this many rows the tier is an outlier, not the M+ curve. */
const MIN_ROWS = 3;

export function parseRewardCsv(csv: string): RewardRow[] {
  const lines = csv.trim().split('\n');
  const header = lines[0].split(',').map((h) => h.trim());

  const col = (name: string) => {
    const index = header.indexOf(name);
    if (index === -1) throw new Error(`MythicPlusSeasonRewardLevels is missing "${name}".`);
    return index;
  };

  const iSeason = col('MythicPlusSeasonID');
  const iTier = col('ActivityTierID');
  const iDiff = col('DifficultyLevel');
  const iWeekly = col('WeeklyRewardLevel');

  const rows: RewardRow[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cells = line.split(',');
    const row = {
      seasonId: Number(cells[iSeason]),
      activityTierId: Number(cells[iTier]),
      keyLevel: Number(cells[iDiff]),
      vaultItemLevel: Number(cells[iWeekly]),
    };
    if (Object.values(row).every(Number.isFinite)) rows.push(row);
  }
  return rows;
}

/** Highest season present. Blizzard adds the new one when it goes live. */
export function latestSeasonId(rows: RewardRow[]): number | null {
  if (rows.length === 0) return null;
  return Math.max(...rows.map((r) => r.seasonId));
}

/**
 * The M+ curve for a season, or null when nothing in the data looks like one — better
 * to switch the feature off than to publish a curve taken from delves.
 */
export function selectMythicPlusCurve(rows: RewardRow[], seasonId: number): RewardRow[] {
  const season = rows.filter((r) => r.seasonId === seasonId);
  if (season.length === 0) return [];

  const byTier = new Map<number, RewardRow[]>();
  for (const row of season) {
    const list = byTier.get(row.activityTierId);
    if (list) list.push(row);
    else byTier.set(row.activityTierId, [row]);
  }

  const candidates = [...byTier.entries()]
    .filter(([, tierRows]) => Math.min(...tierRows.map((r) => r.keyLevel)) >= 2)
    .filter(([, tierRows]) => tierRows.length >= MIN_ROWS)
    .sort((a, b) => b[1].length - a[1].length);

  if (candidates.length === 0) return [];

  return candidates[0][1].slice().sort((a, b) => a.keyLevel - b.keyLevel);
}

/**
 * Vault item level for a key level. Rewards plateau above the highest tabled key, so a
 * +17 gets the +10 value — which is correct, not a clamp for convenience.
 */
export function vaultRewardFor(
  curve: { keyLevel: number; vaultItemLevel: number }[],
  keyLevel: number,
): { itemLevel: number; cappedAt: number | null } | null {
  if (curve.length === 0 || keyLevel < curve[0].keyLevel) return null;

  const highest = curve[curve.length - 1];
  if (keyLevel >= highest.keyLevel) {
    return {
      itemLevel: highest.vaultItemLevel,
      cappedAt: keyLevel > highest.keyLevel ? highest.keyLevel : null,
    };
  }

  let match = curve[0];
  for (const row of curve) {
    if (row.keyLevel <= keyLevel) match = row;
    else break;
  }
  return { itemLevel: match.vaultItemLevel, cappedAt: null };
}
