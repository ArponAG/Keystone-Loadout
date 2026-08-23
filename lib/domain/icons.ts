/**
 * WoW artwork URLs.
 *
 * Two CDNs, used for different things — verified reachable by probe at Step 2:
 *
 *  1. render.worldofwarcraft.com — Blizzard's own. Used for everything data-driven
 *     (item icons, instance zone tiles). Icons are addressed by numeric fileDataId,
 *     NOT by the readable `inv_*` slug you see on Wowhead; that name is not exposed
 *     by the Game Data API.
 *
 *  2. wow.zamimg.com — Wowhead's CDN, addressed by readable slug. Used only for the
 *     handful of fixed decorative icons in the app shell, where there is no item id to
 *     resolve. Wowhead is credited in the footer.
 *
 * Zone tiles exist only in the `-small` variant; the bare filename returns 403.
 */

const BLIZZ_RENDER = 'https://render.worldofwarcraft.com';
const ZAMIMG = 'https://wow.zamimg.com/images/wow/icons';

/** The two icon sizes Blizzard's CDN serves. */
export type IconSize = 56 | 18;

/** Item icon by fileDataId, from /data/wow/media/item/{id}. */
export function itemIconUrl(fileDataId: number | null | undefined, size: IconSize = 56): string {
  if (!fileDataId) return fallbackIconUrl();
  const region = process.env.NEXT_PUBLIC_WOW_REGION ?? 'us';
  return `${BLIZZ_RENDER}/${region}/icons/${size}/${fileDataId}.jpg`;
}

/** Readable-slug icon from Wowhead's CDN. For fixed shell decoration only. */
export function slugIconUrl(slug: string, size: 'large' | 'medium' | 'small' = 'large'): string {
  return `${ZAMIMG}/${size}/${slug}.jpg`;
}

/** The classic grey question mark, used whenever an icon is missing. */
export function fallbackIconUrl(size: 'large' | 'medium' | 'small' = 'large'): string {
  return slugIconUrl('inv_misc_questionmark', size);
}

/**
 * Fixed icons for the app shell. Every slug here was confirmed to resolve at Step 2 —
 * do not add one without checking it, a 404 renders as a broken tile.
 */
export const SHELL_ICONS = {
  gearFinder: 'inv_misc_gear_01',
  loot: 'achievement_dungeon_ulduar77',
  character: 'achievement_reputation_01',
  news: 'inv_scroll_03',
  sync: 'trade_engineering',
  helm: 'inv_helmet_44',
  map: 'inv_misc_map_01',
  unknown: 'inv_misc_questionmark',
} as const;

/** Item quality -> the CSS custom property holding its canonical colour. */
export const QUALITY_COLOR_VAR: Record<string, string> = {
  POOR: 'var(--color-q-poor)',
  COMMON: 'var(--color-q-common)',
  UNCOMMON: 'var(--color-q-uncommon)',
  RARE: 'var(--color-q-rare)',
  EPIC: 'var(--color-q-epic)',
  LEGENDARY: 'var(--color-q-legendary)',
  ARTIFACT: 'var(--color-q-artifact)',
  HEIRLOOM: 'var(--color-q-heirloom)',
};

export function qualityColor(quality: string | null | undefined): string {
  return QUALITY_COLOR_VAR[quality ?? ''] ?? 'var(--color-ink)';
}

/**
 * The specific copy of an item somebody is wearing, as opposed to the generic item.
 * Every field is optional so callers holding only an id (the gear finder, which lists
 * items nobody owns yet) can keep passing nothing.
 */
export type ItemInstance = {
  bonuses?: number[] | null;
  enchants?: number[] | null;
  gems?: number[] | null;
};

/**
 * Wowhead item page — every item in the UI links out to the real answer, and the
 * tooltip embed reads these same parameters.
 *
 * Passing `bonus` is not optional polish: Wowhead defaults an item to its maximum
 * upgrade track, so a bare `item=` link showed a Hero 1/6 weapon as Myth 6/6 — about
 * 30 item levels too generous. Verified against nether.wowhead.com/tooltip: bare
 * renders 334 "Myth 6/6", with bonuses it renders the true 305 "Hero 1/6". An `ilvl`
 * parameter does NOT fix it — the track comes from the bonus ids — so it is not sent.
 */
export function wowheadItemUrl(itemId: number, instance?: ItemInstance): string {
  const url = `https://www.wowhead.com/item=${itemId}`;
  if (!instance) return url;

  const params: string[] = [];
  if (instance.bonuses?.length) params.push(`bonus=${instance.bonuses.join(':')}`);
  // Wowhead takes a single enchant; an item only ever carries one.
  if (instance.enchants?.length) params.push(`ench=${instance.enchants[0]}`);
  if (instance.gems?.length) params.push(`gems=${instance.gems.join(':')}`);

  return params.length ? `${url}?${params.join('&')}` : url;
}

/** Raidbots droptimizer — "sim this properly", since our score is only a heuristic. */
export function raidbotsUrl(): string {
  return 'https://www.raidbots.com/simbot/droptimizer';
}
