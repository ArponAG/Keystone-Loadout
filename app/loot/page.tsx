import { EmptyState, PageHeader } from '@/components/ui';

export default function LootPage() {
  return (
    <>
      <PageHeader
        title="Dungeon Loot Directory"
        lead="This season\u2019s Mythic+ rotation and the current raid tier, boss by boss."
      />
      <EmptyState
        title="No instances yet"
        body="Instance and encounter data is populated by the instances sync, which lands in Step 3."
        command="npm run sync:instances"
      />
    </>
  );
}
