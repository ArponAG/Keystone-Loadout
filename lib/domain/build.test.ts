/**
 * The build URL parser has to survive hand-edited and truncated URLs without ever
 * throwing — /gear reads its entire state from here.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_BUILD, buildToQuery, hasExplicitBuild, parseBuild, parseScope } from './build';

test('empty params yield the default build', () => {
  const build = parseBuild({});
  assert.deepEqual(build, DEFAULT_BUILD);
});

test('valid params are honoured', () => {
  const build = parseBuild({
    armor: 'plate',
    primary: 'strength',
    order: 'mastery,vers,crit,haste',
  });
  assert.equal(build.armorType, 'plate');
  assert.equal(build.primary, 'strength');
  assert.deepEqual(build.secondaryOrder, ['mastery', 'vers', 'crit', 'haste']);
});

test('unknown armor type and primary fall back rather than throwing', () => {
  const build = parseBuild({ armor: 'adamantium', primary: 'charisma' });
  assert.equal(build.armorType, DEFAULT_BUILD.armorType);
  assert.equal(build.primary, DEFAULT_BUILD.primary);
});

test('a partial order is completed from the default ordering', () => {
  const build = parseBuild({ order: 'vers' });
  assert.deepEqual(build.secondaryOrder, ['vers', 'haste', 'crit', 'mastery']);
});

test('duplicates in the order are collapsed, not repeated', () => {
  const build = parseBuild({ order: 'haste,haste,haste,haste' });
  assert.deepEqual(build.secondaryOrder, ['haste', 'crit', 'mastery', 'vers']);
});

test('garbage in the order is ignored and the default fills in', () => {
  const build = parseBuild({ order: ' ,,,' });
  assert.deepEqual(build.secondaryOrder, DEFAULT_BUILD.secondaryOrder);
});

test('unknown secondary names are dropped', () => {
  const build = parseBuild({ order: 'spellpower,mastery' });
  assert.deepEqual(build.secondaryOrder, ['mastery', 'haste', 'crit', 'vers']);
});

test('the order always contains exactly the four secondaries, once each', () => {
  for (const raw of ['', 'haste', 'vers,vers', 'nonsense', 'crit,mastery,crit', ' , ,haste']) {
    const order = parseBuild({ order: raw }).secondaryOrder;
    assert.equal(order.length, 4, `"${raw}" produced ${order.length} entries`);
    assert.equal(new Set(order).size, 4, `"${raw}" produced duplicates`);
  }
});

test('repeated params take the first value', () => {
  const build = parseBuild({ armor: ['mail', 'plate'] });
  assert.equal(build.armorType, 'mail');
});

test('scope defaults to rotation and only accepts a known value', () => {
  assert.equal(parseScope({}), 'rotation');
  assert.equal(parseScope({ scope: 'all' }), 'all');
  assert.equal(parseScope({ scope: 'everything' }), 'rotation');
});

test('hasExplicitBuild distinguishes a chosen build from a default one', () => {
  assert.equal(hasExplicitBuild({}), false);
  assert.equal(hasExplicitBuild({ scope: 'all' }), false);
  assert.equal(hasExplicitBuild({ armor: 'mail' }), true);
});

test('a build round-trips through the query string', () => {
  const build = parseBuild({ armor: 'leather', primary: 'agility', order: 'crit,haste,vers,mastery' });
  const round = parseBuild(Object.fromEntries(new URLSearchParams(buildToQuery(build, 'rotation'))));
  assert.deepEqual(round, build);
});

test('scope is omitted from the query when it is the default', () => {
  const query = buildToQuery(DEFAULT_BUILD, 'rotation');
  assert.ok(!query.includes('scope'));
  assert.ok(buildToQuery(DEFAULT_BUILD, 'all').includes('scope=all'));
});
