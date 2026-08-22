import { Banner, EmptyState, PageHeader } from '@/components/ui';

export default function GearPage() {
  return (
    <>
      <PageHeader
        title="Build Gear Finder"
        lead="Rank this season’s gear by how much of its secondary budget lands on the stats you care about."
      />

      <div className="mb-6">
        <Banner variant="warn">
          <strong className="text-ink">Stat-fit ranking &mdash; not a simulation.</strong> This
          scores how an item&rsquo;s secondary stats are distributed. It knows nothing about procs,
          cooldowns, breakpoints or your rotation. Sim the real answer on Raidbots.
        </Banner>
      </div>

      <EmptyState
        title="Not built yet"
        body="The build form and ranked results land in Step 7. The scoring module lands in Step 6."
        command="see planning/07-steps.md"
      />
    </>
  );
}
