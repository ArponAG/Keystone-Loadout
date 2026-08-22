/**
 * Stat vocabulary, built from what scripts/probe.ts actually returned across ~90 items.
 * See planning/04-scoring.md §3 and planning/08-brief-corrections.md §C.
 *
 * The brief predicted combined-primary enums (AGI_STR_INT, AGI_INT, STR_INT).
 * They do not exist. Flexible primaries are expressed through `is_negated` instead.
 */

export type StatKind = 'primary' | 'secondary' | 'tertiary';

export type PrimaryKey = 'intellect' | 'agility' | 'strength';
export type SecondaryKey = 'haste' | 'crit' | 'mastery' | 'vers';

export const STAT_MAP = {
  INTELLECT: { kind: 'primary', key: 'intellect' },
  AGILITY: { kind: 'primary', key: 'agility' },
  STRENGTH: { kind: 'primary', key: 'strength' },
  STAMINA: { kind: 'tertiary', key: 'stamina' },
  // Note: VERSATILITY carries no _RATING suffix, unlike the other three secondaries.
  HASTE_RATING: { kind: 'secondary', key: 'haste' },
  CRIT_RATING: { kind: 'secondary', key: 'crit' },
  MASTERY_RATING: { kind: 'secondary', key: 'mastery' },
  VERSATILITY: { kind: 'secondary', key: 'vers' },
} as const satisfies Record<string, { kind: StatKind; key: string }>;

export type BlizzardStatKey = keyof typeof STAT_MAP;

export const SECONDARY_KEYS: readonly SecondaryKey[] = ['haste', 'crit', 'mastery', 'vers'];
export const PRIMARY_KEYS: readonly PrimaryKey[] = ['intellect', 'agility', 'strength'];

/** Display names for the UI. */
export const SECONDARY_LABEL: Record<SecondaryKey, string> = {
  haste: 'Haste',
  crit: 'Crit',
  mastery: 'Mastery',
  vers: 'Versatility',
};

export const PRIMARY_LABEL: Record<PrimaryKey, string> = {
  intellect: 'Intellect',
  agility: 'Agility',
  strength: 'Strength',
};

export function isKnownStat(key: string): key is BlizzardStatKey {
  return key in STAT_MAP;
}

/**
 * Unknown stat strings throw rather than being silently ignored — a new stat appearing
 * after a patch must be a loud failure, not a quietly wrong ranking.
 * scripts/verify-assumptions.ts asserts this before every sync.
 */
export function statInfo(key: string): (typeof STAT_MAP)[BlizzardStatKey] {
  if (!isKnownStat(key)) {
    throw new Error(
      `Unknown stat key "${key}". STAT_MAP is out of date — a patch may have added a stat. ` +
        `Update lib/domain/stats.ts and re-check planning/04-scoring.md.`,
    );
  }
  return STAT_MAP[key];
}

export function isSecondary(key: string): boolean {
  return isKnownStat(key) && STAT_MAP[key].kind === 'secondary';
}

export function isPrimary(key: string): boolean {
  return isKnownStat(key) && STAT_MAP[key].kind === 'primary';
}

/** Maps a Blizzard stat key to our secondary key, or null if it is not a secondary. */
export function toSecondaryKey(key: string): SecondaryKey | null {
  if (!isKnownStat(key)) return null;
  const info = STAT_MAP[key];
  return info.kind === 'secondary' ? (info.key as SecondaryKey) : null;
}

/** Maps a Blizzard stat key to our primary key, or null if it is not a primary. */
export function toPrimaryKey(key: string): PrimaryKey | null {
  if (!isKnownStat(key)) return null;
  const info = STAT_MAP[key];
  return info.kind === 'primary' ? (info.key as PrimaryKey) : null;
}
