import { EmptyState, PageHeader } from '@/components/ui';

export default async function InstancePage({
  params,
}: {
  params: Promise<{ instanceId: string }>;
}) {
  const { instanceId } = await params;

  return (
    <>
      <PageHeader title={`Instance ${instanceId}`} />
      <EmptyState
        title="No loot data yet"
        body="Boss loot tables are populated by the loot sync, which lands in Step 4."
        command="npm run sync:loot"
      />
    </>
  );
}
