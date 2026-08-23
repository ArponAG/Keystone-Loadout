/**
 * Reset anchors, pinned to observed values rather than to memory.
 *
 * The four instants below were read off a working reset tracker on 2026-08-23 and
 * converted from GMT+6. If Blizzard moves a reset, these fail loudly rather than the
 * countdown quietly being an hour out.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatCountdown, nextReset, previousReset, resetProgress } from './reset';

const at = (iso: string) => Date.parse(iso);

test('US resets land on Tuesday 15:00Z during Pacific daylight time', () => {
  const now = at('2026-08-23T12:00:00Z');
  assert.equal(new Date(nextReset('us', 'daily', now)).toISOString(), '2026-08-23T15:00:00.000Z');
  assert.equal(new Date(nextReset('us', 'weekly', now)).toISOString(), '2026-08-25T15:00:00.000Z');
});

test('EU resets land on Wednesday 04:00Z', () => {
  const now = at('2026-08-23T12:00:00Z');
  assert.equal(new Date(nextReset('eu', 'daily', now)).toISOString(), '2026-08-24T04:00:00.000Z');
  assert.equal(new Date(nextReset('eu', 'weekly', now)).toISOString(), '2026-08-26T04:00:00.000Z');
});

test('the US anchor follows Pacific time across the DST boundary', () => {
  // Pacific leaves daylight time on 2026-11-01, so an 08:00 local reset moves from
  // 15:00Z to 16:00Z. A fixed-UTC model would be an hour wrong for four months.
  const summer = nextReset('us', 'weekly', at('2026-10-20T00:00:00Z'));
  const winter = nextReset('us', 'weekly', at('2026-11-10T00:00:00Z'));

  assert.equal(new Date(summer).toISOString(), '2026-10-20T15:00:00.000Z');
  assert.equal(new Date(winter).toISOString(), '2026-11-10T16:00:00.000Z');
});

test('a reset that has just passed rolls to the next one, never to zero', () => {
  // One second after the weekly reset the answer is next week, not a frozen 0.
  const justAfter = at('2026-08-25T15:00:01Z');
  assert.equal(new Date(nextReset('us', 'weekly', justAfter)).toISOString(), '2026-09-01T15:00:00.000Z');

  const justAfterDaily = at('2026-08-25T15:00:01Z');
  assert.equal(new Date(nextReset('us', 'daily', justAfterDaily)).toISOString(), '2026-08-26T15:00:00.000Z');
});

test('a reset exactly now counts as passed', () => {
  const exactly = at('2026-08-24T04:00:00Z');
  assert.equal(new Date(nextReset('eu', 'daily', exactly)).toISOString(), '2026-08-25T04:00:00.000Z');
});

test('the weekly reset is always further out than the daily one', () => {
  // True by construction, and the property most likely to break if the weekday maths
  // is wrong: a weekly countdown shorter than the daily would be visibly nonsense.
  for (const iso of ['2026-08-23T12:00:00Z', '2026-08-25T14:59:00Z', '2026-12-31T23:00:00Z']) {
    for (const region of ['us', 'eu'] as const) {
      const now = at(iso);
      assert.ok(
        nextReset(region, 'weekly', now) >= nextReset(region, 'daily', now),
        `${region} at ${iso}: weekly resolved before daily`,
      );
    }
  }
});

test('countdown formatting drops empty units but keeps a stable width', () => {
  assert.equal(formatCountdown(((1 * 24 + 22) * 60 * 60 + 29 * 60 + 2) * 1000), '1d 22h 29m 02s');
  assert.equal(formatCountdown((22 * 3600 + 29 * 60 + 2) * 1000), '22h 29m 02s');
  assert.equal(formatCountdown((9 * 60 + 5) * 1000), '9m 05s');
  assert.equal(formatCountdown(0), '0m 00s');
  assert.equal(formatCountdown(-5000), '0m 00s', 'a past reset never renders as negative');
});

test('previousReset brackets now together with nextReset', () => {
  for (const iso of ['2026-08-23T12:00:00Z', '2026-08-25T15:00:01Z', '2026-11-04T09:30:00Z']) {
    for (const region of ['us', 'eu'] as const) {
      for (const kind of ['daily', 'weekly'] as const) {
        const now = at(iso);
        const prev = previousReset(region, kind, now);
        const next = nextReset(region, kind, now);
        assert.ok(prev <= now, `${region}/${kind} at ${iso}: previous is in the future`);
        assert.ok(next > now, `${region}/${kind} at ${iso}: next is in the past`);
      }
    }
  }
});

test('progress spans a DST-shortened day without overflowing', () => {
  // US enters DST early on 2026-03-08, so the 08:00-to-08:00 window that STRADDLES the
  // change is 23 hours: 2026-03-07T16:00Z (PST) to 2026-03-08T15:00Z (PDT). A bar
  // drawn against a hardcoded 24 would stall short of full; measured between the real
  // resets it still fills exactly once.
  const dayStart = nextReset('us', 'daily', at('2026-03-07T00:00:00Z'));
  const dayEnd = nextReset('us', 'daily', dayStart + 1000);

  assert.equal((dayEnd - dayStart) / 3_600_000, 23, 'the DST day really is 23 hours');
  assert.ok(resetProgress('us', 'daily', dayStart + 1000) < 0.01);
  assert.ok(resetProgress('us', 'daily', dayEnd - 1000) > 0.99);
});

test('progress stays inside 0..1', () => {
  for (const iso of ['2026-08-23T12:00:00Z', '2026-12-25T00:00:00Z']) {
    const v = resetProgress('eu', 'weekly', at(iso));
    assert.ok(v >= 0 && v <= 1, `out of range: ${v}`);
  }
});
