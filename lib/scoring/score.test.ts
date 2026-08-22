/**
 * Fixtures are REAL items returned by scripts/probe.ts and sync:loot, with their
 * arithmetic worked by hand in planning/04-scoring.md §6.
 *
 * The last four tests are the ones that matter most: they encode assumptions that
 * would silently produce plausible-looking but wrong results if they ever regressed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkEligibility, type Build } from '../domain/filters';
import type { RawStat } from '../domain/items';
import { compareScores, scoreItem } from './score';

// --- helpers ---------------------------------------------------------------

const stat = (statKey: string, amount: number, isNegated = 0): RawStat => ({
  statKey,
  amount,
  isNegated,
});

/** cloth / intellect / haste > crit > mastery > vers */
const HASTE_FIRST: Build = {
  armorType: 'cloth',
  primary: 'intellect',
  secondaryOrder: ['haste', 'crit', 'mastery', 'vers'],
};

const item = (over: Partial<Parameters<typeof checkEligibility>[0]> = {}) => ({
  slot: 'chest',
  itemClass: 4,
  itemSubClass: 1,
  isEquippable: 1,
  ...over,
});

const CLOSE = 1e-4;

// --- worked examples from planning/04-scoring.md §6 -------------------------

test('Worldroot Canopy (crit 5, mastery 9) scores 0.5393 on a haste-first build', () => {
  const score = scoreItem(
    [stat('INTELLECT', 7), stat('STAMINA', 11), stat('CRIT_RATING', 5), stat('MASTERY_RATING', 9)],
    HASTE_FIRST,
  );
  // (5 x 0.70 + 9 x 0.45) / 14 = 7.55 / 14
  assert.ok(Math.abs(score.fitScore! - 0.5393) < CLOSE, `got ${score.fitScore}`);
  assert.equal(score.percent, 54);
  assert.equal(score.secondaryCount, 2);
});

test("Spare Speaker's Hood (crit 8, haste 11) scores 0.8737", () => {
  const score = scoreItem(
    [
      stat('INTELLECT', 10),
      stat('AGILITY', 10, 1),
      stat('STAMINA', 15),
      stat('CRIT_RATING', 8),
      stat('HASTE_RATING', 11),
    ],
    HASTE_FIRST,
  );
  // (8 x 0.70 + 11 x 1.00) / 19 = 16.60 / 19
  assert.ok(Math.abs(score.fitScore! - 0.8737) < CLOSE, `got ${score.fitScore}`);
  assert.equal(score.percent, 87);
});

test('Yoke of the Charging Bear (crit 7, haste 13) scores 0.8950', () => {
  const score = scoreItem(
    [stat('STAMINA', 6), stat('CRIT_RATING', 7), stat('HASTE_RATING', 13)],
    HASTE_FIRST,
  );
  // (7 x 0.70 + 13 x 1.00) / 20 = 17.90 / 20
  assert.ok(Math.abs(score.fitScore! - 0.895) < CLOSE, `got ${score.fitScore}`);
  assert.equal(score.percent, 90);
});

test("Lightwarden's Bind (vers 7, mastery 13) scores 0.3800", () => {
  const score = scoreItem(
    [stat('STAMINA', 6), stat('VERSATILITY', 7), stat('MASTERY_RATING', 13)],
    HASTE_FIRST,
  );
  // (7 x 0.25 + 13 x 0.45) / 20 = 7.60 / 20
  assert.ok(Math.abs(score.fitScore! - 0.38) < CLOSE, `got ${score.fitScore}`);
  assert.equal(score.percent, 38);
});

// --- edge cases ------------------------------------------------------------

test('Seed of Radiant Hope (primary only) is null, not 0%', () => {
  const score = scoreItem([stat('INTELLECT', 7)], HASTE_FIRST);
  assert.equal(score.fitScore, null);
  assert.equal(score.percent, null);
  assert.equal(score.noSecondaries, true);
  assert.equal(score.secondaryCount, 0);
});

test('all secondary budget on the #1 stat scores exactly 1.0', () => {
  const score = scoreItem([stat('HASTE_RATING', 42)], HASTE_FIRST);
  assert.equal(score.fitScore, 1);
  assert.equal(score.percent, 100);
});

test('all secondary budget on the #4 stat scores exactly 0.25', () => {
  const score = scoreItem([stat('VERSATILITY', 42)], HASTE_FIRST);
  assert.equal(score.fitScore, 0.25);
  assert.equal(score.percent, 25);
});

test('Stamina and Leech are tertiary and never enter the denominator', () => {
  const withTertiaries = scoreItem(
    [
      stat('STAMINA', 500),
      stat('COMBAT_RATING_LIFESTEAL', 8),
      stat('HASTE_RATING', 10),
      stat('CRIT_RATING', 10),
    ],
    HASTE_FIRST,
  );
  const withoutTertiaries = scoreItem(
    [stat('HASTE_RATING', 10), stat('CRIT_RATING', 10)],
    HASTE_FIRST,
  );
  assert.equal(withTertiaries.fitScore, withoutTertiaries.fitScore);
  assert.equal(withTertiaries.secondaryCount, 2);
});

test('score is a ratio, so item stat magnitude does not matter', () => {
  const small = scoreItem([stat('HASTE_RATING', 11), stat('CRIT_RATING', 8)], HASTE_FIRST);
  const large = scoreItem([stat('HASTE_RATING', 1100), stat('CRIT_RATING', 800)], HASTE_FIRST);
  assert.equal(small.fitScore, large.fitScore);
});

test('sorting puts best fit first and unscoreable items last', () => {
  const good = scoreItem([stat('HASTE_RATING', 20)], HASTE_FIRST);
  const bad = scoreItem([stat('VERSATILITY', 20)], HASTE_FIRST);
  const none = scoreItem([stat('INTELLECT', 7)], HASTE_FIRST);

  const sorted = [none, bad, good].sort(compareScores);
  assert.deepEqual(
    sorted.map((s) => s.percent),
    [100, 25, null],
  );
});

test('equal fit scores are broken by secondary count, not left arbitrary', () => {
  const onePure = scoreItem([stat('HASTE_RATING', 20)], HASTE_FIRST);
  const twoStat = scoreItem([stat('HASTE_RATING', 20), stat('HASTE_RATING', 0)], HASTE_FIRST);
  // Both are 100%; the one with more secondaries should sort first.
  assert.equal(onePure.percent, 100);
  assert.equal(twoStat.percent, 100);
  assert.ok(compareScores(twoStat, onePure) < 0);
});

// --- regression guards: the three assumptions that silently corrupt results --

test('GUARD: a cloak is Cloth subclass but stays eligible for a plate build', () => {
  // Bloodthorn Burnous — item_class 4, item_sub_class 1, slot 'back'.
  // A subclass filter applied without a slot gate would delete every cloak.
  const plateBuild: Build = { ...HASTE_FIRST, armorType: 'plate', primary: 'strength' };
  const cloakStats = [
    stat('INTELLECT', 4),
    stat('AGILITY', 4, 1),
    stat('STRENGTH', 4, 1),
    stat('STAMINA', 6),
    stat('HASTE_RATING', 5),
    stat('MASTERY_RATING', 3),
  ];

  const result = checkEligibility(
    item({ slot: 'back', itemClass: 4, itemSubClass: 1 }),
    cloakStats,
    plateBuild,
  );
  assert.equal(result.eligible, true);
});

test('GUARD: plate legs stay eligible for Strength despite STRENGTH being negated', () => {
  // Bedrock Breeches — INTELLECT=7, STRENGTH=7[NEG].
  // Filtering on is_negated = 0 would hide every plate item from a Strength user.
  const plateBuild: Build = { ...HASTE_FIRST, armorType: 'plate', primary: 'strength' };
  const result = checkEligibility(
    item({ slot: 'legs', itemClass: 4, itemSubClass: 4 }),
    [stat('INTELLECT', 7), stat('STRENGTH', 7, 1), stat('STAMINA', 11)],
    plateBuild,
  );
  assert.equal(result.eligible, true);
});

test('GUARD: junk in loot tables is excluded from scoring', () => {
  // Mounts (class 15), recipes (9), housing decor (20) all arrive as NON_EQUIP.
  for (const itemClass of [9, 15, 20]) {
    const result = checkEligibility(
      item({ slot: 'none', itemClass, itemSubClass: 0, isEquippable: 0 }),
      [],
      HASTE_FIRST,
    );
    assert.equal(result.eligible, false);
    assert.equal(result.eligible === false && result.reason, 'not-gear');
  }
});

// --- the filters must still actually filter --------------------------------

test('armor filter DOES apply to armor slots', () => {
  const plateBuild: Build = { ...HASTE_FIRST, armorType: 'plate', primary: 'strength' };
  const clothChest = checkEligibility(
    item({ slot: 'chest', itemClass: 4, itemSubClass: 1 }),
    [stat('STRENGTH', 7)],
    plateBuild,
  );
  assert.equal(clothChest.eligible, false);
  assert.equal(clothChest.eligible === false && clothChest.reason, 'wrong-armor-type');
});

test('primary filter excludes an item that cannot serve the build primary', () => {
  const result = checkEligibility(
    item({ slot: 'chest', itemClass: 4, itemSubClass: 1 }),
    [stat('AGILITY', 7), stat('HASTE_RATING', 5)],
    HASTE_FIRST, // wants intellect
  );
  assert.equal(result.eligible, false);
  assert.equal(result.eligible === false && result.reason, 'wrong-primary');
});

test('an item with no primary at all (neck, ring) is eligible for everyone', () => {
  for (const primary of ['intellect', 'agility', 'strength'] as const) {
    const result = checkEligibility(
      item({ slot: 'neck', itemClass: 4, itemSubClass: 0 }),
      [stat('STAMINA', 6), stat('CRIT_RATING', 7), stat('HASTE_RATING', 13)],
      { ...HASTE_FIRST, primary },
    );
    assert.equal(result.eligible, true);
  }
});
