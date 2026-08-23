/**
 * Minimal by request. The Blizzard trademark line stays: it is required by the Game
 * Data API terms, not a stylistic choice, so it is the one thing here that is not
 * negotiable.
 *
 * The "Data from Raidbots · Raider.IO · Wowhead · Blizzard" source list was removed.
 * Note for whoever revisits this: the Raidbots backlink was not decoration — it is
 * their published request in return for use of their static data files, which
 * `scripts/sync-loot.ts` reads. Fine to leave out for a personal LAN instance; worth
 * restoring if this is ever put somewhere public. See planning/05-ui.md §8.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        <p className="text-xs text-ink-faint">
          World of Warcraft® and Blizzard Entertainment® are trademarks of Blizzard
          Entertainment, Inc.
        </p>
      </div>
    </footer>
  );
}
