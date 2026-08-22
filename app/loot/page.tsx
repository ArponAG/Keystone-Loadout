import { asc, desc, sql } from 'drizzle-orm';
import Link from 'next/link';

import { Tag } from '@/components/ItemBits';
import { EmptyState, PageHeader } from '@/components/ui';
import { db, dbReady, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

type InstanceCardData = {
  id: number;
  name: string;
  type: string;
  tileUrl: string | null;
  inCurrentRotation: number;
  bosses: number;
  items: number;
};

function InstanceCard({ instance }: { instance: InstanceCardData }) {
  return (
    <Link
      href={`/loot/${instance.id}`}
      className="group overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong"
    >
      <div className="relative h-28 bg-inset">
        {instance.tileUrl ? (
          // Blizzard zone art. Plain <img> for the same reason as WowIcon — these are
          // ~18 KB JPEGs served at display size.
          <img
            src={instance.tileUrl}
            alt=""
            className="h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-100"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent" />
        {instance.inCurrentRotation === 1 ? (
          <span className="absolute top-2 right-2">
            <Tag>in rotation</Tag>
          </span>
        ) : null}
      </div>

      <div className="p-4 pt-3">
        <h3 className="text-h3 text-ink group-hover:text-accent">{instance.name}</h3>
        <p className="mt-1 text-xs text-ink-faint">
          {instance.bosses} {instance.bosses === 1 ? 'boss' : 'bosses'}
          {instance.items > 0 ? ` · ${instance.items} items` : ' · no loot synced'}
        </p>
      </div>
    </Link>
  );
}

function Section({ title, instances }: { title: string; instances: InstanceCardData[] }) {
  if (instances.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-h2 text-ink">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {instances.map((i) => (
          <InstanceCard key={i.id} instance={i} />
        ))}
      </div>
    </section>
  );
}

export default async function LootPage() {
  if (!dbReady()) {
    return (
      <>
        <PageHeader title="Dungeon Loot Directory" />
        <EmptyState
          title="No database yet"
          body="Create it, then sync the instance list."
          command="npx drizzle-kit migrate"
        />
      </>
    );
  }

  // Three plain queries rather than correlated subqueries: at 19 instances the join
  // cost is irrelevant, and this is far easier to verify than inlined SQL.
  const [instances, bossCounts, itemCounts] = await Promise.all([
    db
      .select({
        id: schema.instances.id,
        name: schema.instances.name,
        type: schema.instances.type,
        tileUrl: schema.instances.tileUrl,
        inCurrentRotation: schema.instances.inCurrentRotation,
      })
      .from(schema.instances)
      .orderBy(desc(schema.instances.inCurrentRotation), asc(schema.instances.name)),

    db
      .select({
        instanceId: schema.encounters.instanceId,
        count: sql<number>`COUNT(*)`,
      })
      .from(schema.encounters)
      .groupBy(schema.encounters.instanceId),

    db
      .select({
        instanceId: schema.itemSources.instanceId,
        count: sql<number>`COUNT(DISTINCT ${schema.itemSources.itemId})`,
      })
      .from(schema.itemSources)
      .groupBy(schema.itemSources.instanceId),
  ]);

  const bossByInstance = new Map(bossCounts.map((r) => [r.instanceId, r.count]));
  const itemsByInstance = new Map(itemCounts.map((r) => [r.instanceId, r.count]));

  const rows: InstanceCardData[] = instances.map((i) => ({
    ...i,
    bosses: bossByInstance.get(i.id) ?? 0,
    items: itemsByInstance.get(i.id) ?? 0,
  }));

  if (rows.length === 0) {
    return (
      <>
        <PageHeader title="Dungeon Loot Directory" />
        <EmptyState
          title="No instances yet"
          body="Nothing has been synced. Run the instances sync, or start it from the Sync page."
          command="npm run sync:instances"
        />
      </>
    );
  }

  const rotation = rows.filter((r) => r.inCurrentRotation === 1);
  const otherDungeons = rows.filter((r) => r.inCurrentRotation === 0 && r.type === 'dungeon');
  const raids = rows.filter((r) => r.inCurrentRotation === 0 && r.type === 'raid');

  return (
    <>
      <PageHeader
        title="Dungeon Loot Directory"
        lead="This season’s Mythic+ rotation and the current raid tier, boss by boss."
      />

      <Section title={`Mythic+ rotation (${rotation.length})`} instances={rotation} />
      <Section title="Other dungeons" instances={otherDungeons} />
      <Section title="Raids" instances={raids} />
    </>
  );
}
