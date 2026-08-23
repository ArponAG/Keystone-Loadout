/**
 * Wowhead item links carry the wearer's actual item, not the generic one.
 *
 * The bug these cover: a bare `item=` link makes Wowhead render an item at its DEFAULT
 * upgrade track, which is the MAXIMUM one. A Hero 1/6 weapon at 305 displayed as
 * Myth 6/6 at 334 — the tooltip flattered every unupgraded item by ~30 item levels,
 * which is precisely the gap this app exists to help people close.
 *
 * The real values below are from Thousandcuts-turalyon's mainhand (Thorned Reply),
 * checked against nether.wowhead.com/tooltip/item/251195.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { wowheadItemUrl } from './icons';

const THORNED_REPLY = 251195;

test('an item with no instance data is a bare link', () => {
  // The gear finder lists items nobody owns yet — there is no instance to describe.
  assert.equal(wowheadItemUrl(THORNED_REPLY), 'https://www.wowhead.com/item=251195');
  assert.equal(wowheadItemUrl(THORNED_REPLY, {}), 'https://www.wowhead.com/item=251195');
});

test('bonus ids are sent colon-separated, because they carry the upgrade track', () => {
  assert.equal(
    wowheadItemUrl(THORNED_REPLY, { bonuses: [12841, 13440, 6652, 12701] }),
    'https://www.wowhead.com/item=251195?bonus=12841:13440:6652:12701',
  );
});

test('enchant and gems ride along with bonuses', () => {
  assert.equal(
    wowheadItemUrl(THORNED_REPLY, { bonuses: [12841], enchants: [7983], gems: [213482, 213482] }),
    'https://www.wowhead.com/item=251195?bonus=12841&ench=7983&gems=213482:213482',
  );
});

test('empty and null instance fields are omitted, never sent as blanks', () => {
  // `?bonus=&ench=` would be worse than sending nothing: Wowhead would parse the
  // empty values rather than falling back to its defaults.
  assert.equal(
    wowheadItemUrl(THORNED_REPLY, { bonuses: [], enchants: null, gems: undefined }),
    'https://www.wowhead.com/item=251195',
  );
});

test('an unenchanted item still gets its bonus ids', () => {
  // Most gear carries no enchant; that must not cost it the upgrade track.
  assert.equal(
    wowheadItemUrl(263739, { bonuses: [6652, 12825, 13662], enchants: [] }),
    'https://www.wowhead.com/item=263739?bonus=6652:12825:13662',
  );
});
