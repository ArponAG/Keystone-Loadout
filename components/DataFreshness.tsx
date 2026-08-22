import Link from 'next/link';

import { Banner } from '@/components/ui';
import { describeAge, type Freshness } from '@/lib/db/freshness';

/**
 * Tells the reader how much to trust the numbers below.
 *
 * Ranked results look exactly the same whether the underlying loot sync covered all
 * eight dungeons or six of them, so incomplete and stale data have to be stated rather
 * than left to be inferred.
 */
export function DataFreshness({
  freshness,
  coverage,
}: {
  freshness: Freshness;
  coverage: { withLoot: number; expected: number };
}) {
  const incomplete = coverage.expected > 0 && coverage.withLoot < coverage.expected;

  if (freshness.running) {
    return (
      <Wrap><Banner variant="info">
        A loot sync is running now — results below are from the previous sync and will
        change when it finishes. <SyncLink />
      </Banner></Wrap>
    );
  }

  if (freshness.status === 'error') {
    return (
      <Wrap><Banner variant="error">
        The last loot sync <strong className="text-ink">failed</strong>{' '}
        {freshness.lastRunAt ? describeAge(freshness.lastRunAt) : ''}. Results below are
        whatever survived from before it. <SyncLink />
      </Banner></Wrap>
    );
  }

  if (incomplete) {
    return (
      <Wrap><Banner variant="warn">
        Loot data is incomplete — <strong className="text-ink">
          {coverage.withLoot} of {coverage.expected}
        </strong>{' '}
        rotation dungeons have loot synced. Items from the missing ones cannot appear
        below. <SyncLink />
      </Banner></Wrap>
    );
  }

  if (freshness.status === 'partial') {
    return (
      <Wrap><Banner variant="warn">
        The last loot sync finished with{' '}
        <strong className="text-ink">{freshness.warnings.length} warning(s)</strong> — some
        items may be missing or out of date. <SyncLink />
      </Banner></Wrap>
    );
  }

  if (freshness.stale && freshness.lastRunAt) {
    return (
      <Wrap><Banner variant="warn">
        Loot data was last synced{' '}
        <strong className="text-ink">{describeAge(freshness.lastRunAt)}</strong>. A patch
        since then would not be reflected here. <SyncLink />
      </Banner></Wrap>
    );
  }

  return null;
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mb-6">{children}</div>;
}

function SyncLink() {
  return (
    <Link href="/sync" className="text-accent hover:underline">
      Open Sync
    </Link>
  );
}
