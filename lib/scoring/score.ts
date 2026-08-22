/**
 * Stat-fit scoring. NOT a simulation — see planning/04-scoring.md.
 *
 * The one question this answers: given an item's fixed secondary-stat budget, what
 * fraction of it lands on the stats you ranked highest?
 */
import { RANK_WEIGHTS } from '@/config/scoring';

import { readStats, type RawStat, type StatView } from '../domain/items';
import type { SecondaryKey } from '../domain/stats';
import type { Build } from '../domain/filters';

export type Score = {
  /** [RANK_WEIGHTS[3], 1.0], or null when the item has no secondaries at all. */
  fitScore: number | null;
  /** 0-100, or null. What the UI displays. */
  percent: number | null;
  /**
   * True when the item carries no secondary stats. The score is null, never 0 —
   * 0% would falsely read as "measured and bad" rather than "not measurable".
   */
  noSecondaries: boolean;
  /**
   * How many distinct secondaries the item has. Shown next to the percentage because
   * a single-secondary item always scores 100% — see planning/04-scoring.md §7.1.
   */
  secondaryCount: number;
  view: StatView;
};

/** Position of a secondary in the build's ordering. */
function rankOf(key: SecondaryKey, order: Build['secondaryOrder']): number {
  const index = order.indexOf(key);
  if (index === -1) {
    throw new Error(`Secondary "${key}" missing from build order [${order.join(', ')}].`);
  }
  return index;
}

/**
 * Weights scaled to integers, once, at module load.
 *
 * All the arithmetic below runs in integers because floats get this wrong at the
 * boundaries: `7 * 0.7` is 4.8999999999999995, which drags a true score of exactly
 * 0.895 down to 0.8949999999999999 and rounds it to 89% instead of 90%.
 *
 * Stat amounts are integers and the weights are 2-decimal values, so scaling by 100
 * makes every intermediate exact. Keep RANK_WEIGHTS to at most two decimals.
 */
const WEIGHTS_X100 = RANK_WEIGHTS.map((w) => Math.round(w * 100));

/**
 * fitScore = Σ(value × weight(rank)) / Σ(value)
 *
 * Because it is a ratio, it is immune to the stat-magnitude inconsistency in Blizzard's
 * data — some items return scaled values (STAMINA=565), others base values (STAMINA=11).
 * Normalising by the total cancels the scale out.
 */
export function scoreStats(view: StatView, order: Build['secondaryOrder']): Score {
  if (view.secondaryTotal === 0) {
    return {
      fitScore: null,
      percent: null,
      noSecondaries: true,
      secondaryCount: 0,
      view,
    };
  }

  // Exact integer accumulator — see WEIGHTS_X100.
  let weightedX100 = 0;
  for (const secondary of view.secondaries) {
    weightedX100 += secondary.amount * WEIGHTS_X100[rankOf(secondary.key, order)];
  }

  return {
    fitScore: weightedX100 / (view.secondaryTotal * 100),
    percent: Math.round(weightedX100 / view.secondaryTotal),
    noSecondaries: false,
    secondaryCount: view.secondaries.length,
    view,
  };
}

export function scoreItem(stats: RawStat[], build: Build): Score {
  return scoreStats(readStats(stats), build.secondaryOrder);
}

/**
 * Sort order for a slot's results: best fit first, then more secondaries first as a
 * tiebreak (a 100%/2-stat item is a better recommendation than a 100%/1-stat one),
 * then unscoreable items last.
 */
export function compareScores(a: Score, b: Score): number {
  if (a.noSecondaries !== b.noSecondaries) return a.noSecondaries ? 1 : -1;
  if (a.fitScore !== null && b.fitScore !== null && a.fitScore !== b.fitScore) {
    return b.fitScore - a.fitScore;
  }
  return b.secondaryCount - a.secondaryCount;
}
