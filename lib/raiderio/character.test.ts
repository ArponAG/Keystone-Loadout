/**
 * Regression tests for the Raider.IO shaping functions.
 *
 * Every case here is a bug that actually shipped and was caught by looking at the
 * rendered page, not by a test. That is the gap this file closes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cacheKey,
  normaliseName,
  normaliseRealm,
  shapeMythicPlus,
  shapeTalents,
  type CharacterProfile,
} from './shape';

// --- helpers ---------------------------------------------------------------

type RawNode = NonNullable<CharacterProfile['talentLoadout']>['loadout'][number];
type RawEntry = RawNode['node']['entries'][number];

/** Build one loadout node. Flat options — an earlier version of this helper merged
 *  nested overrides and silently discarded them, which produced two false failures. */
function mk(options: {
  name?: string;
  posX?: number;
  subTreeId?: number;
  row?: number;
  rank?: number;
  entryIndex?: number;
  granted?: boolean;
  entries?: RawEntry[];
}): RawNode {
  const {
    name = 'Talent',
    posX = 1800,
    subTreeId = 0,
    row = 1,
    rank = 1,
    entryIndex = 0,
    granted = false,
    entries = [{ maxRanks: 1, spell: { id: 1, name, icon: 'icon' } }],
  } = options;

  return {
    node: { subTreeId, row, posX, entries },
    entryIndex,
    rank,
    grantedNode: granted,
  };
}

const withTalents = (loadout: RawNode[]): CharacterProfile =>
  ({
    talentLoadout: { loadout_spec_id: 71, loadout_text: 'ABC', loadout },
  }) as CharacterProfile;

// --- normalisation ---------------------------------------------------------

test('realm names normalise to slugs', () => {
  assert.equal(normaliseRealm('Moon Guard'), 'moon-guard');
  assert.equal(normaliseRealm("Mal'Ganis"), 'malganis');
  assert.equal(normaliseRealm('  Twisting Nether  '), 'twisting-nether');
  assert.equal(normaliseRealm('Kel’Thuzad'), 'kelthuzad'); // curly apostrophe
});

test('cache keys are case-insensitive', () => {
  assert.equal(
    cacheKey({ region: 'US', realm: 'Moon-Guard', name: 'Bjornzerker' }),
    cacheKey({ region: 'us', realm: 'moon-guard', name: 'bjornzerker' }),
  );
});

test('character names lose stray whitespace', () => {
  assert.equal(normaliseName('  Bjornzerker '), 'Bjornzerker');
});

// --- talents ---------------------------------------------------------------

test('granted nodes are dropped — they are automatic, not chosen', () => {
  const build = shapeTalents(withTalents([mk({}), mk({ granted: true })]));
  assert.equal(build!.picks.length, 1);
});

test('REGRESSION: the hero-tree selector node is dropped, not rendered as "Unknown"', () => {
  // A node with no spell on any entry records which hero tree was chosen. It shipped
  // once as an "Unknown" chip with a question-mark icon.
  const selector = mk({
    entries: [
      { maxRanks: 1, spell: undefined },
      { maxRanks: 1, spell: undefined },
    ],
    entryIndex: 1,
  });
  const build = shapeTalents(withTalents([mk({}), selector]));
  assert.equal(build!.picks.length, 1);
  assert.ok(!build!.picks.some((p) => p.name === 'Unknown'));
});

test('REGRESSION: rank never exceeds maxRanks', () => {
  // Warrior's "Master of Warfare" spreads rank 4 across three same-named entries with
  // maxRanks 1, 2, 1 — reading the chosen entry alone rendered an impossible "4/1".
  const build = shapeTalents(
    withTalents([
      mk({
        rank: 4,
        entryIndex: 2,
        entries: [
          { maxRanks: 1, spell: { id: 1, name: 'Master of Warfare', icon: 'i' } },
          { maxRanks: 2, spell: { id: 1, name: 'Master of Warfare', icon: 'i' } },
          { maxRanks: 1, spell: { id: 1, name: 'Master of Warfare', icon: 'i' } },
        ],
      }),
    ]),
  );
  const pick = build!.picks[0];
  assert.equal(pick.rank, 4);
  assert.ok(pick.rank <= pick.maxRanks, `${pick.rank}/${pick.maxRanks} is impossible`);
});

test('class and spec are split at the widest posX gap', () => {
  // Two clusters 1800-3000 and 10800-12000, mirroring the real tree layout.
  const at = (posX: number, name: string) => mk({ posX, name });

  const build = shapeTalents(
    withTalents([
      at(1800, 'ClassA'),
      at(2400, 'ClassB'),
      at(3000, 'ClassC'),
      at(10800, 'SpecA'),
      at(11400, 'SpecB'),
      at(12000, 'SpecC'),
    ]),
  );

  const names = (tree: string) =>
    build!.picks.filter((p) => p.tree === tree).map((p) => p.name).sort();
  assert.deepEqual(names('class'), ['ClassA', 'ClassB', 'ClassC']);
  assert.deepEqual(names('spec'), ['SpecA', 'SpecB', 'SpecC']);
});

test('a non-zero subTreeId is always a hero talent, whatever its posX', () => {
  const hero = mk({ subTreeId: 60, posX: 1800, name: 'Hero' });
  const build = shapeTalents(withTalents([mk({ name: 'Normal' }), hero]));
  assert.equal(build!.picks.find((p) => p.name === 'Hero')!.tree, 'hero');
});

test('an evenly spaced tree is not split arbitrarily', () => {
  // No structural gap: every column 600 apart. Splitting here would be invented.
  const at = (posX: number) => mk({ posX, name: `T${posX}` });
  const build = shapeTalents(withTalents([at(1800), at(2400), at(3000), at(3600)]));
  assert.equal(build!.picks.filter((p) => p.tree === 'spec').length, 0);
  assert.equal(build!.picks.filter((p) => p.tree === 'class').length, 4);
});

test('a profile with no talents yields null rather than throwing', () => {
  assert.equal(shapeTalents({} as CharacterProfile), null);
});

// --- mythic+ ---------------------------------------------------------------

const mplusProfile = (over: Partial<CharacterProfile> = {}): CharacterProfile =>
  ({
    mythic_plus_scores_by_season: [
      { scores: { all: 3450.6 }, segments: { all: { score: 3450.6, color: '#ff8000' } } },
    ],
    mythic_plus_ranks: { overall: { world: 15, region: 3, realm: 1 } },
    mythic_plus_best_runs: [
      { dungeon: 'A', short_name: 'A', mythic_level: 17, num_keystone_upgrades: 1, score: 442, clear_time_ms: 1, par_time_ms: 2, url: 'u' },
      { dungeon: 'B', short_name: 'B', mythic_level: 12, num_keystone_upgrades: 0, score: 300, clear_time_ms: 3, par_time_ms: 2, url: 'u' },
    ],
    ...over,
  }) as CharacterProfile;

test('mythic+ shaping carries score, colour and ranks', () => {
  const mplus = shapeMythicPlus(mplusProfile())!;
  assert.equal(mplus.score, 3450.6);
  assert.equal(mplus.colour, '#ff8000');
  assert.deepEqual(mplus.ranks, { world: 15, region: 3, realm: 1 });
});

test('timed runs count only upgraded keys, and highest key is the max', () => {
  const mplus = shapeMythicPlus(mplusProfile())!;
  assert.equal(mplus.timedRuns, 1, 'the +12 was not timed');
  assert.equal(mplus.highestKey, 17);
});

test('a season with no runs yields zeroes, not NaN', () => {
  const mplus = shapeMythicPlus(mplusProfile({ mythic_plus_best_runs: [] }))!;
  assert.equal(mplus.timedRuns, 0);
  assert.equal(mplus.highestKey, 0);
  assert.equal(mplus.bestRuns.length, 0);
});

test('a profile with no season yields null', () => {
  assert.equal(shapeMythicPlus({} as CharacterProfile), null);
});

test('a missing segment colour falls back rather than rendering undefined', () => {
  const mplus = shapeMythicPlus(
    mplusProfile({ mythic_plus_scores_by_season: [{ scores: { all: 100 } }] } as Partial<CharacterProfile>),
  )!;
  assert.equal(mplus.colour, '#ffffff');
});
