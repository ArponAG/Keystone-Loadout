/**
 * An item's upgrade track — "Hero 1/6" — resolved from its bonus ids.
 *
 * Pure and database-free so it can be tested under plain Node; the lookup map is passed
 * in by the caller, which reads it from the `upgrade_tracks` table.
 */

export type UpgradeTrack = {
  /** 'Explorer' | 'Adventurer' | 'Veteran' | 'Champion' | 'Hero' | 'Myth' */
  track: string;
  rank: number;
  maxRank: number;
};

/** Ascending power. Anything unrecognised sorts below everything known. */
const TRACK_ORDER = ['Explorer', 'Adventurer', 'Veteran', 'Champion', 'Hero', 'Myth'];

export function trackRank(track: string): number {
  return TRACK_ORDER.indexOf(track);
}

/**
 * Find the track among an item's bonus ids.
 *
 * Exactly one bonus id carries the track; the rest encode sockets, tertiary stats,
 * crafting and so on. Rather than guess which position it occupies, every id is looked
 * up and the non-matches fall away.
 *
 * If several match — which would mean contradictory data, not a legitimate item — the
 * highest track wins, so gear is never displayed as weaker than it provably is.
 */
export function resolveUpgradeTrack(
  bonuses: number[] | null | undefined,
  lookup: Map<number, UpgradeTrack>,
): UpgradeTrack | null {
  if (!bonuses?.length) return null;

  let best: UpgradeTrack | null = null;
  for (const id of bonuses) {
    const hit = lookup.get(id);
    if (!hit) continue;
    if (
      !best ||
      trackRank(hit.track) > trackRank(best.track) ||
      (trackRank(hit.track) === trackRank(best.track) && hit.rank > best.rank)
    ) {
      best = hit;
    }
  }

  return best;
}

/** Colour token for a track. Unknown tracks fall back to neutral rather than guessing. */
export function trackColor(track: string): string {
  const slug = track.toLowerCase();
  return TRACK_ORDER.some((t) => t.toLowerCase() === slug)
    ? `var(--color-track-${slug})`
    : 'var(--color-ink-faint)';
}

/** "Hero 1/6" — the label the game itself uses. */
export function formatTrack(t: UpgradeTrack): string {
  return `${t.track} ${t.rank}/${t.maxRank}`;
}

/**
 * How much room is left on the track, as a fraction. 1 means fully upgraded.
 * Used to show at a glance which pieces still have cheap item levels available.
 */
export function trackProgress(t: UpgradeTrack): number {
  return t.maxRank > 0 ? t.rank / t.maxRank : 0;
}
