import { and, eq, inArray } from 'drizzle-orm';

import { BuildForm } from '@/components/BuildForm';
import { DataFreshness } from '@/components/DataFreshness';
import { FitScoreBadge } from '@/components/FitScoreBadge';
import { ItemIcon, ItemName, StatLine } from '@/components/ItemBits';
import { Banner, EmptyState, PageHeader } from '@/components/ui';
import { db, dbReady, schema } from '@/lib/db';
import { readFreshness, readLootCoverage } from '@/lib/db/freshness';
import { parseBuild, parseScope, type SearchParams } from '@/lib/domain/build';
import { checkEligibility } from '@/lib/domain/filters';
import { raidbotsUrl } from '@/lib/domain/icons';
import { groupStatsByItem, readStats, type RawStat } from '@/lib/domain/items';
import { SLOT_LABEL, SLOT_ORDER, type Slot } from '@/lib/domain/slots';
import { compareScores, scoreStats, type Score } from '@/lib/scoring/score';

export const dynamic = 'force-dynamic';

/** Slots where the score is least trustworthy, and why. */
const CAVEATS: Partial<Record<Slot, string>> = {
  trinket:
    'Trinket value is dominated by on-use and proc effects, which carry no stat weight at all. Treat these rankings as close to meaningless — sim them.',
  'one-hand': 'Weapon DPS usually outweighs secondary distribution entirely. Sim these.',
  'two-hand': 'Weapon DPS usually outweighs secondary distribution entirely. Sim these.',
  ranged: 'Weapon DPS usually outweighs secondary distribution entirely. Sim these.',
};

type Row = {
  id: number;
  name: string;
  quality: string | null;
  iconFileId: number | null;
  slot: string;
  itemClass: number;
  itemSubClass: number;
  baseItemLevel: number | null;
  isEquippable: number;
  instanceName: string;
  encounterName: string | null;
  score: Score;
  /** How many item ids share this name in this slot; see the collapse below. */
  variants?: number;
};

export default async function GearPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const build = parseBuild(params);
  const scope = parseScope(params);

  const header = (
    <PageHeader
      title="Build Gear Finder"
      lead="Rank this season’s gear by how much of its secondary budget lands on the stats you care about."
    />
  );

  const disclaimer = (
    <div className="mb-6">
      <Banner variant="warn">
        <strong className="text-ink">Stat-fit ranking — not a simulation.</strong> This scores
        how an item’s secondary stats are distributed. It knows nothing about procs, cooldowns,
        breakpoints, diminishing returns or your rotation.{' '}
        <a
          href={raidbotsUrl()}
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          Sim the real answer on Raidbots
        </a>
        .
      </Banner>
    </div>
  );

  if (!dbReady()) {
    return (
      <>
        {header}
        <EmptyState
          title="No database yet"
          body="Create it, then sync instances and loot."
          command="npx drizzle-kit migrate"
        />
      </>
    );
  }

  // Everything equippable that has a known source, scoped to the current rotation by
  // default so items being compared share a tier.
  const rows = await db
    .select({
      id: schema.items.id,
      name: schema.items.name,
      quality: schema.items.quality,
      iconFileId: schema.items.iconFileId,
      slot: schema.items.slot,
      itemClass: schema.items.itemClass,
      itemSubClass: schema.items.itemSubClass,
      baseItemLevel: schema.items.baseItemLevel,
      isEquippable: schema.items.isEquippable,
      instanceName: schema.instances.name,
      encounterName: schema.encounters.name,
    })
    .from(schema.itemSources)
    .innerJoin(schema.items, eq(schema.items.id, schema.itemSources.itemId))
    .innerJoin(schema.instances, eq(schema.instances.id, schema.itemSources.instanceId))
    .leftJoin(schema.encounters, eq(schema.encounters.id, schema.itemSources.encounterId))
    .where(
      scope === 'rotation'
        ? and(eq(schema.items.isEquippable, 1), eq(schema.instances.inCurrentRotation, 1))
        : eq(schema.items.isEquippable, 1),
    );

  if (rows.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title="No loot data yet"
          body="Instances and their drops have not been synced. Run the syncs, or start them from the Sync page."
          command="npm run sync:instances && npm run sync:loot"
        />
      </>
    );
  }

  const [freshness, coverage] = await Promise.all([readFreshness('loot'), readLootCoverage()]);

  const itemIds = [...new Set(rows.map((r) => r.id))];
  const statRows: (RawStat & { itemId: number })[] = await db
    .select({
      itemId: schema.itemStats.itemId,
      statKey: schema.itemStats.statKey,
      amount: schema.itemStats.amount,
      isNegated: schema.itemStats.isNegated,
    })
    .from(schema.itemStats)
    .where(inArray(schema.itemStats.itemId, itemIds));

  const statsByItem = groupStatsByItem(statRows);

  // Filter, score, and keep the best source per item — an item that drops from two
  // bosses should appear once, not twice.
  const seen = new Set<number>();
  const scored: Row[] = [];

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const stats = statsByItem.get(row.id) ?? [];
    if (!checkEligibility(row, stats, build).eligible) continue;

    seen.add(row.id);
    scored.push({ ...row, score: scoreStats(readStats(stats), build.secondaryOrder) });
  }

  const bySlot = new Map<string, Row[]>();
  for (const row of scored) {
    const list = bySlot.get(row.slot);
    if (list) list.push(row);
    else bySlot.set(row.slot, [row]);
  }

  for (const [slot, list] of bySlot) {
    list.sort((a, b) => compareScores(a.score, b.score));

    // Collapse reissued items. When an old dungeon re-enters the M+ rotation, Blizzard
    // publishes a second item id under the same name — the legacy version carries only
    // a primary and Stamina, the reissue has the modern secondary template. Both are
    // genuinely in the journal, so the loot directory still shows both; here the
    // unscoreable twin is pure noise, so the better-scoring one wins.
    const best = new Map<string, Row>();
    for (const row of list) {
      const existing = best.get(row.name);
      if (!existing) {
        best.set(row.name, { ...row, variants: 1 });
      } else {
        existing.variants = (existing.variants ?? 1) + 1;
      }
    }
    bySlot.set(slot, [...best.values()]);
  }

  const slots = SLOT_ORDER.filter((slot) => bySlot.has(slot));
  // Count what is actually shown, after collapsing reissued duplicates.
  const shownCount = [...bySlot.values()].reduce((n, list) => n + list.length, 0);

  return (
    <>
      {header}
      {disclaimer}

      <DataFreshness freshness={freshness} coverage={coverage} />

      <div className="mb-6">
        <BuildForm build={build} scope={scope} />
      </div>

      {shownCount === 0 ? (
        <EmptyState
          title="Nothing matches this build"
          body={`No ${build.armorType} gear for ${build.primary} in the ${
            scope === 'rotation' ? 'current rotation' : 'synced data'
          }. Try a different armor type, or browse everything unfiltered.`}
          command="/loot"
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-faint">
            {shownCount} items match · ranked within each slot
          </p>

          <div className="space-y-8">
            {slots.map((slot) => {
              const items = bySlot.get(slot)!;
              const caveat = CAVEATS[slot];

              return (
                <section key={slot}>
                  <h2 className="mb-2 text-h2 text-ink">
                    {SLOT_LABEL[slot]}
                    <span className="ml-2 text-xs font-normal text-ink-faint">
                      {items.length}
                    </span>
                  </h2>

                  {caveat ? (
                    <div className="mb-3">
                      <Banner variant="warn">{caveat}</Banner>
                    </div>
                  ) : null}

                  <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                    <table className="w-full min-w-[44rem] text-left">
                      <thead>
                        <tr className="border-b border-line-strong text-xs tracking-wide text-ink-faint uppercase">
                          <th className="px-4 py-2 font-medium">Fit</th>
                          <th className="px-4 py-2 font-medium">Item</th>
                          <th className="px-4 py-2 font-medium">Stats</th>
                          <th className="px-4 py-2 font-medium">Source</th>
                          <th className="px-4 py-2 text-right font-medium">Base ilvl</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr
                            key={item.id}
                            className="border-b border-line last:border-0 hover:bg-raised"
                          >
                            <td className="px-4 py-2">
                              <FitScoreBadge score={item.score} />
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-3">
                                <ItemIcon iconFileId={item.iconFileId} quality={item.quality} />
                                <ItemName
                                  id={item.id}
                                  name={item.name}
                                  quality={item.quality}
                                />
                                {(item.variants ?? 1) > 1 ? (
                                  <span
                                    className="text-xs text-ink-faint"
                                    title="Blizzard publishes more than one item id under this name — a legacy version and a reissue. Showing the better-scoring one; /loot lists both."
                                  >
                                    ×{item.variants}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <StatLine
                                view={item.score.view}
                                emphasise={build.secondaryOrder[0]}
                              />
                            </td>
                            <td className="px-4 py-2 text-xs text-ink-faint">
                              {item.instanceName}
                              {item.encounterName ? ` — ${item.encounterName}` : ''}
                            </td>
                            <td className="tabular px-4 py-2 text-right text-sm text-ink-soft">
                              {item.baseItemLevel ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>

          <p className="mt-8 text-xs text-ink-faint">
            Base ilvl is the journal value, not what a keystone awards — it differs between
            dungeons in the same rotation. Use it to compare tiers by eye, not as a reward
            prediction.
          </p>
        </>
      )}
    </>
  );
}
