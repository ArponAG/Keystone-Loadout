import Link from 'next/link';

import { ShellIcon } from '@/components/WowIcon';
import { PageHeader } from '@/components/ui';
import { SHELL_ICONS } from '@/lib/domain/icons';

const SURFACES = [
  {
    href: '/gear',
    icon: SHELL_ICONS.gearFinder,
    title: 'Build Gear Finder',
    body: 'Pick armor type, primary stat and rank your secondaries. Get gear per slot, ranked by stat fit.',
  },
  {
    href: '/loot',
    icon: SHELL_ICONS.loot,
    title: 'Dungeon Loot Directory',
    body: 'This season’s rotation, boss by boss, with the full loot table for each.',
  },
  {
    href: '/character',
    icon: SHELL_ICONS.character,
    title: 'Character Lookup',
    body: 'Raider.IO profile — equipped gear, M+ score, raid progression.',
  },
  {
    href: '/news',
    icon: SHELL_ICONS.news,
    title: 'News',
    body: 'Wowhead retail and in-development feeds, cached locally.',
  },
];

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Keystone Loadout"
        lead="A personal companion for WoW Retail. Everything is served from a local database synced from Blizzard, Raidbots, Raider.IO and Wowhead."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {SURFACES.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-raised"
          >
            <ShellIcon slug={s.icon} size={44} />
            <div>
              <h2 className="text-h2 text-ink">{s.title}</h2>
              <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
