/** Display formatting shared across components. Pure string work, no dependencies. */

/**
 * "tarren-mill" is how realms travel through the APIs; "Tarren Mill" is how they should
 * read on screen. Every realm reference in the UI goes through this so the saved rail
 * and the character header cannot disagree about the same realm.
 */
export function realmLabel(realm: string): string {
  return realm
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Relative time for cache ages. Deliberately coarse — the exact second never matters. */
export function ago(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  return `${Math.floor(d / 3_600_000)} h ago`;
}
