import Link from 'next/link';

import { PageHeader } from '@/components/ui';

const SURFACES = [
  {
    href: '/gear',
    title: 'Build Gear Finder',
    body: 'Pick armor type, primary stat and rank your secondaries. Get gear per slot, ranked by stat fit.',
  },
  {
    href: '/loot',
    title: 'Dungeon Loot Directory',
    body: 'This season\u2019s rotation, boss by boss, with the full loot table for each.',
  },
  {
    href: '/character',
    title: 'Character Lookup',
    body: 'Raider.IO profile \u2014 equipped gear, M+ score, raid progression.',
  },
  {
    href: '/news',
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
            className="rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-raised"
          >
            <h2 className="text-h2 text-ink">{s.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{s.body}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
