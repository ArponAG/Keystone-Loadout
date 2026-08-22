import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRecommendations, toLootSlot, type CandidateItem } from './recommend';
import type { Score } from '../scoring/score';

const score = (percent: number | null, secondaryCount = 2): Score =>
  ({
    fitScore: percent === null ? null : percent / 100,
    percent,
    noSecondaries: percent === null,
    secondaryCount,
    view: { primaries: [], secondaries: [], secondaryTotal: 0, noSecondaries: percent === null },
  }) as Score;

const item = (
  id: number,
  name: string,
  slot: string,
  instanceId: number,
  instanceName: string,
  percent: number | null,
): CandidateItem => ({
  id,
  name,
  quality: 'EPIC',
  iconFileId: null,
  slot,
  instanceId,
  instanceName,
  encounterName: 'Boss',
  score: score(percent),
});

const CANDIDATES: Record<string, CandidateItem[]> = {
  finger: [
    item(1, 'Great Ring', 'finger', 100, 'Altar of Fangs', 90),
    item(2, 'Good Ring', 'finger', 200, 'Murder Row', 70),
    item(3, 'Poor Ring', 'finger', 100, 'Altar of Fangs', 30),
    item(4, 'Worst Ring', 'finger', 300, 'Kings Rest', 25),
  ],
  head: [
    item(5, 'Great Hood', 'head', 100, 'Altar of Fangs', 88),
    item(6, 'Ok Hood', 'head', 200, 'Murder Row', 60),
  ],
  feet: [],
};

const lookup = (slot: string) => CANDIDATES[slot] ?? [];

test('character slots map to loot slots', () => {
  assert.equal(toLootSlot('finger1'), 'finger');
  assert.equal(toLootSlot('trinket2'), 'trinket');
  assert.equal(toLootSlot('head'), 'head');
});

test('slots are ordered by biggest item level gap, not by stat fit', () => {
  // The headline ordering must need no configuration from a new player.
  const recs = buildRecommendations(
    [
      { slot: 'head', itemLevel: 290, belowVault: 15 },
      { slot: 'finger1', itemLevel: 259, belowVault: 46 },
    ],
    305,
    lookup,
    [],
  );
  assert.deepEqual(
    recs.bySlot.map((r) => r.slot),
    ['finger1', 'head'],
  );
  assert.equal(recs.bySlot[0].gain, 46);
});

test('candidates within a slot are ordered by stat fit and capped', () => {
  const recs = buildRecommendations([{ slot: 'finger1', itemLevel: 259, belowVault: 46 }], 305, lookup, []);
  assert.equal(recs.bySlot[0].candidates.length, 3, 'capped at three');
  assert.deepEqual(
    recs.bySlot[0].candidates.map((c) => c.name),
    ['Great Ring', 'Good Ring', 'Poor Ring'],
  );
});

test('slots already at the ceiling are excluded, not listed with an empty gain', () => {
  const recs = buildRecommendations(
    [
      { slot: 'finger1', itemLevel: 259, belowVault: 46 },
      { slot: 'chest', itemLevel: 308, belowVault: null },
    ],
    305,
    lookup,
    ['chest'],
  );
  assert.equal(recs.bySlot.length, 1);
  assert.deepEqual(recs.slotsAtCeiling, ['chest']);
});

test('a slot with no obtainable item is dropped rather than shown empty', () => {
  const recs = buildRecommendations([{ slot: 'feet', itemLevel: 250, belowVault: 55 }], 305, lookup, []);
  assert.equal(recs.bySlot.length, 0, 'no candidates means no recommendation');
});

test('dungeons are ranked by how many slots one run can upgrade', () => {
  const recs = buildRecommendations(
    [
      { slot: 'finger1', itemLevel: 259, belowVault: 46 },
      { slot: 'head', itemLevel: 290, belowVault: 15 },
    ],
    305,
    lookup,
    [],
  );
  // Altar of Fangs covers both slots; Murder Row also covers both; Kings Rest is
  // outside the top-3 cut for finger and so contributes nothing.
  const top = recs.byDungeon[0];
  assert.equal(top.slots.length, 2);
  assert.ok(['Altar of Fangs', 'Murder Row'].includes(top.instanceName));
  assert.equal(top.totalGain, 61, '46 + 15');
});

test('a dungeon is not double counted when it holds two candidates for one slot', () => {
  // Altar of Fangs supplies both 'Great Ring' and 'Poor Ring' for finger1.
  const recs = buildRecommendations([{ slot: 'finger1', itemLevel: 259, belowVault: 46 }], 305, lookup, []);
  const altar = recs.byDungeon.find((d) => d.instanceName === 'Altar of Fangs')!;
  assert.deepEqual(altar.slots, ['finger1']);
  assert.equal(altar.totalGain, 46, 'counted once, not 92');
});

test('no weak slots yields empty recommendations rather than throwing', () => {
  const recs = buildRecommendations([], 305, lookup, []);
  assert.deepEqual(recs.bySlot, []);
  assert.deepEqual(recs.byDungeon, []);
});

test('unscoreable candidates still appear, sorted last', () => {
  const withNull = {
    finger: [item(1, 'No Secondaries', 'finger', 100, 'A', null), item(2, 'Scored', 'finger', 100, 'A', 50)],
  };
  const recs = buildRecommendations(
    [{ slot: 'finger1', itemLevel: 259, belowVault: 46 }],
    305,
    (s) => (withNull as Record<string, CandidateItem[]>)[s] ?? [],
    [],
  );
  assert.deepEqual(
    recs.bySlot[0].candidates.map((c) => c.name),
    ['Scored', 'No Secondaries'],
  );
});
