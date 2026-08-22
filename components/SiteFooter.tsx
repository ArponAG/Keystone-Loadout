/**
 * Required on every page. The Raidbots backlink is their published request for use
 * of the static data files; the Blizzard trademark line is required by their API ToS.
 * Non-commercial personal use. See planning/05-ui.md §8.
 */
const SOURCES = [
  { href: 'https://www.raidbots.com', label: 'Raidbots' },
  { href: 'https://raider.io', label: 'Raider.IO' },
  { href: 'https://www.wowhead.com', label: 'Wowhead' },
  { href: 'https://develop.battle.net', label: 'Blizzard Game Data API' },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 sm:px-6">
        <p className="text-sm text-ink-faint">
          World of Warcraft® and Blizzard Entertainment® are trademarks of Blizzard
          Entertainment, Inc.
        </p>
        <p className="text-sm text-ink-faint">
          Data from{' '}
          {SOURCES.map((s, i) => (
            <span key={s.href}>
              <a
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="text-ink-soft underline decoration-line underline-offset-2 hover:text-accent"
              >
                {s.label}
              </a>
              {i < SOURCES.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
