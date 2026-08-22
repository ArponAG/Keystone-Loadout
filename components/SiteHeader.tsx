import Link from 'next/link';

import { ShellIcon } from '@/components/WowIcon';
import season from '@/config/season.json';
import { SHELL_ICONS } from '@/lib/domain/icons';

const NAV = [
  { href: '/gear', label: 'Gear Finder' },
  { href: '/loot', label: 'Loot' },
  { href: '/character', label: 'Character' },
  { href: '/news', label: 'News' },
  // /sync is deliberately not linked. It is an operator page — it can start syncs that
  // make hundreds of Blizzard requests — and this app is served to other people. The
  // route still works for whoever runs the server; it just is not advertised.
];

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-h2 text-ink hover:text-accent">
          <ShellIcon slug={SHELL_ICONS.helm} size={26} rounded="sm" />
          Keystone Loadout
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-body text-ink-soft transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <span className="ml-auto rounded-full bg-accent-muted/40 px-3 py-1 text-xs tracking-wide text-accent uppercase">
          {season.expansion.name} — {season.season.shortName}
        </span>
      </div>
    </header>
  );
}
