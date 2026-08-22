import Link from 'next/link';

import { ShellIcon } from '@/components/WowIcon';
import { SHELL_ICONS } from '@/lib/domain/icons';

const SURFACES = [
  {
    href: '/character',
    icon: SHELL_ICONS.character,
    title: 'Character Lookup',
    description: 'Inspect Raider.IO character profiles, equipped gear, Mythic+ ratings, and raid progression.',
  },
  {
    href: '/gear',
    icon: SHELL_ICONS.gearFinder,
    title: 'Gear Finder',
    description: 'Find and rank gear upgrades per slot based on your primary and secondary stats.',
  },
  {
    href: '/loot',
    icon: SHELL_ICONS.loot,
    title: 'Dungeon Loot',
    description: 'Browse Season 2 dungeon loot tables, boss drops, and keystone reward tiers.',
  },
  {
    href: '/news',
    icon: SHELL_ICONS.news,
    title: 'News & Updates',
    description: 'Read the latest cached retail and in-development news feeds from Wowhead.',
  },
];

export default function HomePage() {
  return (
    <div className="py-2">
      <div className="grid gap-4 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-start gap-4 rounded-xl border border-line bg-surface/80 p-5 transition-all duration-150 hover:border-line-strong hover:bg-raised"
          >
            <div className="shrink-0 pt-0.5">
              <ShellIcon slug={s.icon} size={42} rounded="md" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-h2 font-medium text-ink transition-colors group-hover:text-accent">
                  {s.title}
                </h2>
                <span className="text-sm text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent">
                  →
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
