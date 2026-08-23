import { Suspense } from 'react';

import { CharacterLookup } from '@/components/CharacterLookup';
import { PageHeader } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function CharacterPage() {
  return (
    <>
      {/* No lead line: the search box below says what to do, and the sections name
          themselves. The sentence restated what was already on screen. */}
      <PageHeader title="Character Lookup" />
      <Suspense fallback={<div className="text-sm text-ink-soft">Loading character lookup…</div>}>
        <CharacterLookup />
      </Suspense>
    </>
  );
}
