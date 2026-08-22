/**
 * Which items a build is allowed to see, before any scoring happens.
 *
 * Three rules, all of which would produce plausible-looking but wrong results if they
 * regressed — hence the dedicated tests in lib/scoring/score.test.ts.
 * See planning/04-scoring.md §4.
 */
import { readStats, type RawStat } from './items';
import {
  ARMOR_TYPE_SUBCLASS,
  ITEM_CLASS,
  isArmorFiltered,
  type ArmorType,
  type Slot,
} from './slots';
import type { PrimaryKey, SecondaryKey } from './stats';

export type Build = {
  armorType: ArmorType;
  primary: PrimaryKey;
  /** Ranked #1 -> #4. */
  secondaryOrder: readonly [SecondaryKey, SecondaryKey, SecondaryKey, SecondaryKey];
};

/** The minimum an item needs to expose to be filtered and scored. */
export type FilterableItem = {
  slot: string;
  itemClass: number;
  itemSubClass: number;
  isEquippable: number;
};

export type Ineligible =
  | 'not-gear'
  | 'wrong-armor-type'
  | 'wrong-primary';

export type Eligibility = { eligible: true } | { eligible: false; reason: Ineligible };

const ELIGIBLE: Eligibility = { eligible: true };

/**
 * Rule 1 — junk exclusion.
 * Loot tables contain mounts, recipes, consumables and housing decor, all reported as
 * `inventory_type: NON_EQUIP`. They are stored so the loot directory stays complete,
 * and must never reach the scorer.
 */
export function isGear(item: FilterableItem): boolean {
  return item.isEquippable === 1;
}

/**
 * Rule 2 — armor-type eligibility, gated on SLOT rather than subclass alone.
 *
 * This gate is the load-bearing one. A cloak is item_class 4 / item_sub_class 1
 * (Cloth) but is wearable by every class; applying the subclass filter to it would
 * delete every cloak from a plate user's results. Rings, necks, trinkets, off-hands
 * and weapons must escape it for the same reason.
 */
export function matchesArmorType(item: FilterableItem, armorType: ArmorType): boolean {
  if (!isArmorFiltered(item.slot as Slot)) return true;
  if (item.itemClass !== ITEM_CLASS.ARMOR) return true;
  return item.itemSubClass === ARMOR_TYPE_SUBCLASS[armorType];
}

/**
 * Rule 3 — primary eligibility, by UNION of primaries present.
 *
 * `is_negated` marks an alternative primary, not an absent one: a plate item reports
 * `INTELLECT, STRENGTH[NEG]` and serves both. Filtering on `is_negated = 0` would hide
 * every plate item from a Strength user — exactly backwards.
 *
 * An empty primary set (necks, rings, many trinkets) means "usable by anyone".
 */
export function matchesPrimary(stats: RawStat[], primary: PrimaryKey): boolean {
  const { primaries } = readStats(stats);
  return primaries.length === 0 || primaries.includes(primary);
}

export function checkEligibility(
  item: FilterableItem,
  stats: RawStat[],
  build: Build,
): Eligibility {
  if (!isGear(item)) return { eligible: false, reason: 'not-gear' };
  if (!matchesArmorType(item, build.armorType)) {
    return { eligible: false, reason: 'wrong-armor-type' };
  }
  if (!matchesPrimary(stats, build.primary)) {
    return { eligible: false, reason: 'wrong-primary' };
  }
  return ELIGIBLE;
}
