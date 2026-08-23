/**
 * Weekly and daily reset countdowns.
 *
 * Anchors are expressed as a wall-clock time in a named zone rather than a fixed UTC
 * hour, because the US reset follows Pacific time and therefore moves an hour twice a
 * year. Modelling it as "15:00 UTC" would be right today and wrong every winter.
 *
 * Both anchors were derived from observed values rather than memory, and reset.test.ts
 * pins them to those exact instants:
 *
 *   US  daily  2026-08-24 15:00Z   weekly  Tue 2026-08-25 15:00Z
 *   EU  daily  2026-08-24 04:00Z   weekly  Wed 2026-08-26 04:00Z
 *
 * NOTE on the EU anchor. In August the fixed-UTC reading and a Europe/Paris 06:00
 * reading produce the same instant, so the reference data cannot distinguish them; they
 * diverge by an hour once European DST ends. EU is modelled as UTC here, which is how
 * Blizzard's EU reset is normally documented. If the countdown is an hour out in winter,
 * this constant is the single thing to change.
 */

export type ResetRegion = 'us' | 'eu';
export type ResetKind = 'daily' | 'weekly';

type Anchor = {
  /** IANA zone the wall-clock time below is expressed in. */
  zone: string;
  hour: number;
  /** 0 = Sunday. Weekly resets only. */
  weekday: number;
  label: string;
};

export const RESET_ANCHORS: Record<ResetRegion, Anchor> = {
  us: { zone: 'America/Los_Angeles', hour: 8, weekday: 2, label: 'US' },
  eu: { zone: 'UTC', hour: 4, weekday: 3, label: 'EU' },
};

export const RESET_REGIONS: ResetRegion[] = ['us', 'eu'];

/**
 * How far the zone is ahead of UTC at a given instant, in milliseconds.
 *
 * Done with Intl rather than a date library: the app has no date dependency and this is
 * the only place that needs zone arithmetic.
 */
function zoneOffsetMs(zone: string, at: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(at));

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // hour can format as 24 at midnight in some locales/zones; normalise it.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The UTC instant of a wall-clock time in a zone. */
function zonedToUtc(zone: string, y: number, m: number, d: number, hour: number): number {
  const guess = Date.UTC(y, m, d, hour);
  // One correction pass is enough: the offset at the guess is wrong only when the guess
  // straddles a DST change, and re-solving with the corrected offset lands on the right
  // side of it.
  const corrected = guess - zoneOffsetMs(zone, guess);
  return guess - zoneOffsetMs(zone, corrected);
}

/** Calendar parts of an instant, as seen in a zone. */
function zonedParts(zone: string, at: number) {
  const local = at + zoneOffsetMs(zone, at);
  const d = new Date(local);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

/** The next daily or weekly reset for a region, as an epoch millisecond value. */
export function nextReset(region: ResetRegion, kind: ResetKind, now: number = Date.now()): number {
  const anchor = RESET_ANCHORS[region];
  const { year, month, day, weekday } = zonedParts(anchor.zone, now);

  if (kind === 'daily') {
    const today = zonedToUtc(anchor.zone, year, month, day, anchor.hour);
    // Strictly future: at the exact reset instant the next one is tomorrow's, not a
    // countdown frozen at zero.
    return today > now ? today : zonedToUtc(anchor.zone, year, month, day + 1, anchor.hour);
  }

  let delta = (anchor.weekday - weekday + 7) % 7;
  const candidate = zonedToUtc(anchor.zone, year, month, day + delta, anchor.hour);
  if (candidate > now) return candidate;

  // Today is reset day but the hour has passed - go a full week on.
  delta += 7;
  return zonedToUtc(anchor.zone, year, month, day + delta, anchor.hour);
}

/**
 * "1d 22h 29m 02s". Days and hours drop off once they are zero, but minutes and seconds
 * stay padded so the line does not change width every second and jitter the layout.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${m}m ${pad(s)}s`;
}
