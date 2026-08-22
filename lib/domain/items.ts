/**
 * Reading an item's stats into something the UI and the scorer can both use.
 *
 * The one rule that matters here: the set of primaries an item can serve is the UNION
 * of all primary stats present, negated or not. A cloak lists INTELLECT plus negated
 * AGILITY and STRENGTH because everyone can wear it. See planning/04-scoring.md §4.1.
 */
import {
  PRIMARY_LABEL,
  SECONDARY_LABEL,
  type PrimaryKey,
  type SecondaryKey,
  toPrimaryKey,
  toSecondaryKey,
} from './stats';

export type RawStat = { statKey: string; amount: number; isNegated: number };

export type StatView = {
  /** Every primary the item can serve, negated or not. Empty = usable by anyone. */
  primaries: PrimaryKey[];
  secondaries: { key: SecondaryKey; label: string; amount: number }[];
  /** Sum over secondaries — the fitScore denominator. */
  secondaryTotal: number;
  /** True when the item has no secondaries at all; score is null, not 0. */
  noSecondaries: boolean;
};

export function readStats(stats: RawStat[]): StatView {
  const primaries: PrimaryKey[] = [];
  const secondaries: StatView['secondaries'] = [];

  for (const stat of stats) {
    const primary = toPrimaryKey(stat.statKey);
    if (primary) {
      // Negation is deliberately ignored: it marks an alternative primary, not absence.
      if (!primaries.includes(primary)) primaries.push(primary);
      continue;
    }

    const secondary = toSecondaryKey(stat.statKey);
    if (secondary) {
      secondaries.push({
        key: secondary,
        label: SECONDARY_LABEL[secondary],
        amount: stat.amount,
      });
    }
    // Tertiaries (Stamina, Leech) and anything unknown fall through on purpose —
    // they must never reach the fitScore denominator.
  }

  secondaries.sort((a, b) => b.amount - a.amount);
  const secondaryTotal = secondaries.reduce((sum, s) => sum + s.amount, 0);

  return {
    primaries,
    secondaries,
    secondaryTotal,
    noSecondaries: secondaryTotal === 0,
  };
}

/** "Int / Agi" — short labels, in a stable order. Empty string when anyone can use it. */
export function primaryLabel(primaries: PrimaryKey[]): string {
  const order: PrimaryKey[] = ['strength', 'agility', 'intellect'];
  return order
    .filter((p) => primaries.includes(p))
    .map((p) => PRIMARY_LABEL[p].slice(0, 3))
    .join(' / ');
}

/** Group a flat list of stat rows by item id. */
export function groupStatsByItem(rows: (RawStat & { itemId: number })[]): Map<number, RawStat[]> {
  const map = new Map<number, RawStat[]>();
  for (const row of rows) {
    const list = map.get(row.itemId);
    if (list) list.push(row);
    else map.set(row.itemId, [row]);
  }
  return map;
}
