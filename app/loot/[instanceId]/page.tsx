import { asc, eq, inArray } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ItemIcon, ItemName, StatLine, Tag } from '@/components/ItemBits';
import { EmptyState, PageHeader } from '@/components/ui';
import { db, dbExists, schema } from '@/lib/db';
import { groupStatsByItem, readStats, type RawStat } from '@/lib/domain/items';
import { ARMOR_SUBCLASS, SLOT_LABEL, type Slot } from '@/lib/domain/slots';

export const dynamic = 'force-dynamic';

const ARMOR_NAME: Record<number, string> = {
  [ARMOR_SUBCLASS.CLOTH]: 'Cloth',
  [ARMOR_SUBCLASS.LEATHER]: 'Leather',
  [ARMOR_SUBCLASS.MAIL]: 'Mail',
  [ARMOR_SUBCLASS.PLATE]: 'Plate',
  [ARMOR_SUBCLASS.SHIELD]: 'Shield',
};

/** Armor type only means something for armor (class 4); weapons have their own subclasses. */
function armorTypeLabel(itemClass: number, itemSubClass: number): string {
  if (itemClass !== 4) return '';
  return ARMOR_NAME[itemSubClass] ?? '';
}

export default async function InstancePage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;
  const id = Number(instanceId);

  if (!Number.isInteger(id) || !dbExists()) notFound();

  const [instance] = await db
    .select()
    .from(schema.instances)
    .where(eq(schema.instances.id, id))
    .limit(1);

  if (!instance) notFound();

  const encounters = await db
    .select()
    .from(schema.encounters)
    .where(eq(schema.encounters.instanceId, id))
    .orderBy(asc(schema.encounters.orderIndex));

  // Loot for this instance, with the encounter it drops from.
  const loot = await db
    .select({
      encounterId: schema.itemSources.encounterId,
      id: schema.items.id,
      name: schema.items.name,
      quality: schema.items.quality,
      iconFileId: schema.items.iconFileId,
      slot: schema.items.slot,
      itemClass: schema.items.itemClass,
      itemSubClass: schema.items.itemSubClass,
      baseItemLevel: schema.items.baseItemLevel,
      isEquippable: schema.items.isEquippable,
    })
    .from(schema.itemSources)
    .innerJoin(schema.items, eq(schema.items.id, schema.itemSources.itemId))
    .where(eq(schema.itemSources.instanceId, id));

  const itemIds = [...new Set(loot.map((l) => l.id))];
  const statRows: (RawStat & { itemId: number })[] = itemIds.length
    ? await db
        .select({
          itemId: schema.itemStats.itemId,
          statKey: schema.itemStats.statKey,
          amount: schema.itemStats.amount,
          isNegated: schema.itemStats.isNegated,
        })
        .from(schema.itemStats)
        .where(inArray(schema.itemStats.itemId, itemIds))
    : [];

  const statsByItem = groupStatsByItem(statRows);

  const lootByEncounter = new Map<number, typeof loot>();
  for (const row of loot) {
    if (row.encounterId === null) continue;
    const list = lootByEncounter.get(row.encounterId);
    if (list) list.push(row);
    else lootByEncounter.set(row.encounterId, [row]);
  }

  const totalItems = itemIds.length;

  return (
    <>
      <div className="mb-2">
        <Link href="/loot" className="text-sm text-ink-soft hover:text-accent">
          ← All instances
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-display text-ink">{instance.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {encounters.length} {encounters.length === 1 ? 'boss' : 'bosses'} ·{' '}
            {totalItems} items · base ilvl is the journal value, not what a keystone awards
          </p>
        </div>
        {instance.inCurrentRotation === 1 ? <Tag>in rotation</Tag> : null}
      </div>

      {encounters.length === 0 ? (
        <EmptyState
          title="No boss data"
          body="This instance has no encounters recorded. Run the instances sync."
          command="npm run sync:instances"
        />
      ) : totalItems === 0 ? (
        <EmptyState
          title="No loot synced yet"
          body="Bosses are known, but their drops have not been fetched. Run the loot sync."
          command="npm run sync:loot"
        />
      ) : (
        <div className="space-y-8">
          {encounters.map((encounter) => {
            const items = (lootByEncounter.get(encounter.id) ?? []).slice().sort((a, b) => {
              // Gear first, junk last; then by slot, then name.
              if (a.isEquippable !== b.isEquippable) return b.isEquippable - a.isEquippable;
              if (a.slot !== b.slot) return a.slot.localeCompare(b.slot);
              return a.name.localeCompare(b.name);
            });

            return (
              <section key={encounter.id}>
                <h2 className="mb-3 text-h2 text-ink">
                  {encounter.name}
                  <span className="ml-2 text-xs font-normal text-ink-faint">
                    {items.length} {items.length === 1 ? 'drop' : 'drops'}
                  </span>
                </h2>

                {items.length === 0 ? (
                  <p className="rounded-lg border border-line bg-surface px-4 py-6 text-center text-sm text-ink-faint">
                    No loot recorded for this boss.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                    <table className="w-full min-w-[46rem] text-left">
                      <thead>
                        <tr className="border-b border-line-strong text-xs tracking-wide text-ink-faint uppercase">
                          <th className="px-4 py-2 font-medium">Item</th>
                          <th className="px-4 py-2 font-medium">Slot</th>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium">Stats</th>
                          <th className="px-4 py-2 text-right font-medium">Base ilvl</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => {
                          const view = readStats(statsByItem.get(item.id) ?? []);
                          const junk = item.isEquippable === 0;
                          return (
                            <tr
                              key={item.id}
                              className="border-b border-line last:border-0 hover:bg-raised"
                            >
                              <td className="px-4 py-2">
                                <div className="flex items-center gap-3">
                                  <ItemIcon
                                    iconFileId={item.iconFileId}
                                    quality={junk ? null : item.quality}
                                  />
                                  <ItemName
                                    id={item.id}
                                    name={item.name}
                                    quality={item.quality}
                                    muted={junk}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-2 text-sm text-ink-soft">
                                {junk ? <Tag tone="muted">not gear</Tag> : SLOT_LABEL[item.slot as Slot]}
                              </td>
                              <td className="px-4 py-2 text-sm text-ink-soft">
                                {armorTypeLabel(item.itemClass, item.itemSubClass) || '—'}
                              </td>
                              <td className="px-4 py-2">
                                <StatLine view={view} />
                              </td>
                              <td className="tabular px-4 py-2 text-right text-sm text-ink-soft">
                                {junk ? '—' : (item.baseItemLevel ?? '—')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
