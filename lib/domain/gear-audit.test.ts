import assert from 'node:assert/strict';
import { test } from 'node:test';

import { auditGear, typicalKeyLevel } from './gear-audit';
import { latestSeasonId, parseRewardCsv, selectMythicPlusCurve, vaultRewardFor } from './rewards';

// --- reward curve selection ------------------------------------------------

/** Shaped like the real table: an M+ tier starting at +2 plus delve/raid outliers. */
const CSV = [
  'ID,MythicPlusSeasonID,ActivityTierID,DifficultyLevel,WeeklyRewardLevel,EndOfRunRewardLevel',
  '470,120,254,0,289,0',
  '471,120,255,0,302,0',
  '472,120,256,2,305,0',
  '473,120,256,3,305,0',
  '474,120,256,4,308,0',
  '475,120,256,5,308,0',
  '476,120,256,6,311,0',
  '477,120,256,7,315,0',
  '478,120,256,8,315,0',
  '479,120,256,9,315,0',
  '480,120,256,10,318,0',
  '491,120,250,1,279,0',
  '492,120,251,5,292,0',
  '493,120,252,8,305,0',
  '400,117,103,2,259,0',
  '401,117,103,3,262,0',
  '402,117,103,4,266,0',
].join('\n');

test('the reward CSV parses into typed rows', () => {
  const rows = parseRewardCsv(CSV);
  assert.equal(rows.length, 17);
  assert.deepEqual(rows[2], { seasonId: 120, activityTierId: 256, keyLevel: 2, vaultItemLevel: 305 });
});

test('a CSV missing an expected column throws rather than silently yielding NaN', () => {
  assert.throws(() => parseRewardCsv('ID,Something\n1,2'), /MythicPlusSeasonID/);
});

test('the latest season is the highest id present', () => {
  assert.equal(latestSeasonId(parseRewardCsv(CSV)), 120);
  assert.equal(latestSeasonId([]), null);
});

test('the M+ curve is selected over delve and raid tiers', () => {
  const curve = selectMythicPlusCurve(parseRewardCsv(CSV), 120);
  assert.equal(curve[0].activityTierId, 256, 'picked the wrong tier');
  assert.equal(curve.length, 9);
  assert.equal(curve[0].keyLevel, 2);
  assert.equal(curve[curve.length - 1].vaultItemLevel, 318);
});

test('single-row tiers starting at >= 2 do not win on the "starts at 2" rule alone', () => {
  // Tiers 251 (+5) and 252 (+8) also start above 2; row count must break the tie.
  const curve = selectMythicPlusCurve(parseRewardCsv(CSV), 120);
  assert.ok(curve.every((r) => r.activityTierId === 256));
});

test('a season with no plausible M+ tier yields an empty curve, not a guess', () => {
  const onlyDelves = parseRewardCsv(
    ['ID,MythicPlusSeasonID,ActivityTierID,DifficultyLevel,WeeklyRewardLevel,EndOfRunRewardLevel',
     '1,999,1,0,100,0', '2,999,1,1,110,0'].join('\n'),
  );
  assert.deepEqual(selectMythicPlusCurve(onlyDelves, 999), []);
});

// --- vault lookup ----------------------------------------------------------

const CURVE = selectMythicPlusCurve(parseRewardCsv(CSV), 120);

test('an exact key level returns its own reward', () => {
  assert.equal(vaultRewardFor(CURVE, 4)!.itemLevel, 308);
});

test('rewards plateau above the highest tabled key, and say so', () => {
  const capped = vaultRewardFor(CURVE, 17)!;
  assert.equal(capped.itemLevel, 318);
  assert.equal(capped.cappedAt, 10);
  assert.equal(vaultRewardFor(CURVE, 10)!.cappedAt, null, 'exactly at the top is not "capped"');
});

test('a key below the table has no reward rather than the lowest one', () => {
  assert.equal(vaultRewardFor(CURVE, 1), null);
});

// --- typical key level -----------------------------------------------------

test('typical key level is the median, so one lucky high key does not set the target', () => {
  assert.equal(typicalKeyLevel([{ level: 2 }, { level: 3 }, { level: 3 }, { level: 17 }]), 3);
});

test('no runs means no typical key level', () => {
  assert.equal(typicalKeyLevel([]), null);
});

// --- the audit -------------------------------------------------------------

const GEAR = [
  { slot: 'head', itemLevel: 279 },
  { slot: 'neck', itemLevel: 292 },
  { slot: 'chest', itemLevel: 308 },
  { slot: 'finger1', itemLevel: 259 },
  { slot: 'finger2', itemLevel: 292 },
  { slot: 'trinket1', itemLevel: 200 },
  { slot: 'mainhand', itemLevel: 331 },
];

test('GUARD: trinkets and weapons are never judged', () => {
  const audit = auditGear(GEAR, null);
  for (const slot of ['trinket1', 'mainhand']) {
    assert.equal(audit.slots.find((s) => s.slot === slot)!.verdict, 'unjudged', `${slot} was judged`);
  }
});

test('GUARD: an unjudged slot never counts against the vault target either', () => {
  // The 200 trinket is far below any target but must not be reported as an upgrade.
  const audit = auditGear(GEAR, { keyLevel: 4, itemLevel: 308, cappedAt: null });
  assert.equal(audit.slots.find((s) => s.slot === 'trinket1')!.belowVault, null);
});

test('the average excludes unjudged slots, so a big weapon does not skew it', () => {
  const audit = auditGear(GEAR, null);
  // (279 + 292 + 308 + 259 + 292) / 5 = 286
  assert.equal(audit.averageItemLevel, 286);
});

test('slots far below the average are weak, far above are strong', () => {
  const audit = auditGear(GEAR, null);
  const by = (slot: string) => audit.slots.find((s) => s.slot === slot)!;
  assert.equal(by('finger1').verdict, 'weak', '259 vs 286 average');
  assert.equal(by('chest').verdict, 'strong', '308 vs 286 average');
  assert.equal(by('neck').verdict, 'fine', '292 vs 286 average');
});

test('the weakest judged slot is identified', () => {
  assert.equal(auditGear(GEAR, null).weakest!.slot, 'finger1');
});

test('Tier 2 reports the gap to the vault target', () => {
  const audit = auditGear(GEAR, { keyLevel: 4, itemLevel: 308, cappedAt: null });
  assert.equal(audit.slots.find((s) => s.slot === 'finger1')!.belowVault, 49);
  assert.equal(audit.slots.find((s) => s.slot === 'chest')!.belowVault, null, 'at target');
  assert.equal(audit.belowVaultCount, 4);
});

test('gaps smaller than one upgrade step are ignored as noise', () => {
  const audit = auditGear([{ slot: 'head', itemLevel: 307 }], { keyLevel: 4, itemLevel: 308, cappedAt: null });
  assert.equal(audit.slots[0].belowVault, null);
});

test('without a reward curve Tier 2 is simply absent, Tier 1 still works', () => {
  const audit = auditGear(GEAR, null);
  assert.equal(audit.target, null);
  assert.equal(audit.belowVaultCount, 0);
  assert.ok(audit.slots.every((s) => s.belowVault === null));
  assert.equal(audit.weakest!.slot, 'finger1', 'relative signal survives');
});

test('an empty or unequipped character does not produce NaN', () => {
  const audit = auditGear([], null);
  assert.equal(audit.averageItemLevel, 0);
  assert.equal(audit.weakest, null);
  assert.ok(Number.isFinite(audit.averageItemLevel));
});

test('items with no item level are skipped rather than dragging the average to zero', () => {
  const audit = auditGear([{ slot: 'head', itemLevel: 300 }, { slot: 'legs', itemLevel: 0 }], null);
  assert.equal(audit.averageItemLevel, 300);
});
