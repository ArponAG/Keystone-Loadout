'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ShellIcon } from '@/components/WowIcon';
import season from '@/config/season.json';
import { SHELL_ICONS } from '@/lib/domain/icons';

const NAV = [
  { href: '/character', label: 'Character' },
  { href: '/gear', label: 'Gear Finder' },
  { href: '/loot', label: 'Loot' },
  { href: '/news', label: 'News' },
  // /sync is deliberately not linked. It is an operator page — it can start syncs that
  // make hundreds of Blizzard requests — and this app is served to other people. The
  // route still works for whoever runs the server; it just is not advertised.
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 text-h2 text-ink transition-colors hover:text-accent">
          <div className="flex items-center justify-center rounded-md border border-accent/40 bg-inset p-0.5 shadow-[0_0_10px_rgba(200,164,92,0.15)] transition-transform group-hover:scale-105">
            <ShellIcon slug={SHELL_ICONS.helm} size={26} rounded="sm" />
          </div>
          <span className="font-semibold tracking-tight">Keystone Loadout</span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {NAV.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 text-body font-medium transition-all ${
                  isActive
                    ? 'bg-raised text-accent border border-line-strong shadow-xs'
                    : 'text-ink-soft hover:bg-raised/60 hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-muted/20 px-3 py-1 text-xs font-semibold tracking-wider text-accent uppercase backdrop-blur-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            {season.expansion.name} — {season.season.shortName}
            {season.season.patch ? ` · Patch ${season.season.patch}` : ''}
          </span>
        </div>
      </div>
    </header>
  );
}
