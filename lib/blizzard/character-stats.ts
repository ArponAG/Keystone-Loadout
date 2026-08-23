import 'server-only';

import { SECONDARY_KEYS, type SecondaryKey } from '@/lib/domain/stats';
import { getToken } from './auth';

/**
 * A character's secondary stat spread, summed from what they are actually wearing.
 *
 * This is deliberately NOT called a stat priority. A stat priority is sim output — what
 * a spec *should* stack — and no API exposes it. This is the opposite direction: what
 * this character *does* have, which is a fact we can read. For a well-geared player the
 * two converge, because they have been gearing toward their priority; for a new one it
 * mostly reflects what happened to drop. The UI labels it as gear, not as advice.
 *
 * Why Blizzard rather than our own tables: `item_stats` covered 8 of 16 equipped items
 * for the test character, and holds base values rather than amounts scaled to the item's
 * actual level — so totals from it would be both incomplete and wrong. Blizzard's
 * equipment endpoint returns the real per-item numbers.
 */

/** Blizzard stat type -> our key. Anything else (primaries, stamina) is ignored. */
const SECONDARY_TYPES: Record<string, SecondaryKey> = {
  HASTE_RATING: 'haste',
  CRIT_RATING: 'crit',
  MASTERY_RATING: 'mastery',
  VERSATILITY: 'vers',
};

export type SecondaryProfile = {
  /** Descending by amount — the order recommendations are scored against. */
  order: SecondaryKey[];
  totals: Record<SecondaryKey, number>;
  /** Percentage of total secondary rating, rounded, summing to ~100. */
  share: Record<SecondaryKey, number>;
};

type EquipmentResponse = {
  equipped_items?: { stats?: { type?: { type?: string }; value?: number }[] }[];
};

/**
 * Never throws. A failure here must not take down a character lookup — the caller falls
 * back to a neutral order, which is what the app did for every character before this
 * existed. Returns null when the character cannot be read or has no secondaries at all.
 */
export async function fetchSecondaryProfile(
  region: string,
  realm: string,
  name: string,
): Promise<SecondaryProfile | null> {
  // Host and namespace are per-REGION, not per-install: `lib/blizzard/client.ts` pins
  // both to BLIZZARD_REGION because it only ever runs ETL against our own region. A
  // character lookup can be any region, so this builds its own URL.
  const host = `https://${region}.api.blizzard.com`;
  const path = `/profile/wow/character/${encodeURIComponent(realm)}/${encodeURIComponent(
    name.toLowerCase(),
  )}/equipment`;
  const url = `${host}${path}?namespace=profile-${region}&locale=en_US`;

  let body: EquipmentResponse;
  try {
    const token = await getToken();
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'KeystoneLoadout/0.1 (personal project)',
      },
    });
    // 404 is routine: Blizzard does not know every character Raider.IO has crawled.
    if (!res.ok) return null;
    body = (await res.json()) as EquipmentResponse;
  } catch {
    return null;
  }

  const totals: Record<SecondaryKey, number> = { haste: 0, crit: 0, mastery: 0, vers: 0 };

  for (const item of body.equipped_items ?? []) {
    for (const stat of item.stats ?? []) {
      const key = stat.type?.type ? SECONDARY_TYPES[stat.type.type] : undefined;
      if (key) totals[key] += stat.value ?? 0;
    }
  }

  const sum = SECONDARY_KEYS.reduce((n, k) => n + totals[k], 0);
  if (sum <= 0) return null;

  const share = Object.fromEntries(
    SECONDARY_KEYS.map((k) => [k, Math.round((totals[k] / sum) * 100)]),
  ) as Record<SecondaryKey, number>;

  // Ties broken by the canonical key order so the result is stable across requests
  // rather than depending on sort implementation.
  const order = [...SECONDARY_KEYS].sort(
    (a, b) => totals[b] - totals[a] || SECONDARY_KEYS.indexOf(a) - SECONDARY_KEYS.indexOf(b),
  );

  return { order, totals, share };
}
