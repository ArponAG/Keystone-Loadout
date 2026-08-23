/**
 * Upgrade track resolution.
 *
 * The fixtures are real: these bonus ids and tracks came from probing Wowhead, and the
 * item levels cross-check against Thousandcuts-turalyon, whose head (12838, Champion
 * 6/6) and chest (12842, Hero 2/6) are both item level 308 — the same number meaning
 * two different things, which is exactly why the badge exists.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatTrack,
  resolveUpgradeTrack,
  trackColor,
  trackProgress,
  type UpgradeTrack,
} from './upgrade-track';

const LOOKUP = new Map<number, UpgradeTrack>([
  [12825, { track: 'Veteran', rank: 1, maxRank: 6 }],
  [12838, { track: 'Champion', rank: 6, maxRank: 6 }],
  [12841, { track: 'Hero', rank: 1, maxRank: 6 }],
  [12842, { track: 'Hero', rank: 2, maxRank: 6 }],
  [12854, { track: 'Myth', rank: 6, maxRank: 6 }],
]);

test('the track is found wherever it sits in the bonus list', () => {
  // Thousandcuts' mainhand. 12841 is third here; position carries no meaning.
  const track = resolveUpgradeTrack([12841, 13440, 6652, 12701], LOOKUP);
  assert.deepEqual(track, { track: 'Hero', rank: 1, maxRank: 6 });
});

test('bonus ids that encode anything else are ignored', () => {
  // 6652 and 13662 appear on nearly every item and are not tracks.
  assert.equal(resolveUpgradeTrack([6652, 13662, 12701], LOOKUP), null);
});

test('no bonuses at all yields no track rather than throwing', () => {
  assert.equal(resolveUpgradeTrack([], LOOKUP), null);
  assert.equal(resolveUpgradeTrack(null, LOOKUP), null);
  assert.equal(resolveUpgradeTrack(undefined, LOOKUP), null);
});

test('an empty lookup degrades to no badge, never to a wrong one', () => {
  // This is the "sync has not been run" path.
  assert.equal(resolveUpgradeTrack([12841], new Map()), null);
});

test('contradictory data resolves to the higher track, never the lower', () => {
  // Should not occur on a real item. If it does, understating gear is the worse error:
  // it would tell someone to replace a piece that is already strong.
  assert.deepEqual(resolveUpgradeTrack([12825, 12854], LOOKUP), {
    track: 'Myth',
    rank: 6,
    maxRank: 6,
  });
  // Same track, different ranks — the higher rank wins for the same reason.
  assert.deepEqual(resolveUpgradeTrack([12841, 12842], LOOKUP), {
    track: 'Hero',
    rank: 2,
    maxRank: 6,
  });
});

test('two items at the same item level can hold different tracks', () => {
  // Both 308 on the real character; the badge is the only thing distinguishing them.
  const head = resolveUpgradeTrack([6652, 13696, 13662, 12838], LOOKUP);
  const chest = resolveUpgradeTrack([12842, 13440, 6652, 13662, 12699], LOOKUP);

  assert.equal(formatTrack(head!), 'Champion 6/6');
  assert.equal(formatTrack(chest!), 'Hero 2/6');
  assert.equal(trackProgress(head!), 1, 'Champion 6/6 has nothing left');
  assert.ok(trackProgress(chest!) < 1, 'Hero 2/6 still has upgrades');
});

test('track colours resolve for known tracks and fall back for unknown ones', () => {
  assert.equal(trackColor('Hero'), 'var(--color-track-hero)');
  assert.equal(trackColor('Myth'), 'var(--color-track-myth)');
  // A track added in a future patch must not emit a var() that resolves to nothing.
  assert.equal(trackColor('Ascendant'), 'var(--color-ink-faint)');
});
