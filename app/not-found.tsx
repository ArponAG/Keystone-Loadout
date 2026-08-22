import Link from 'next/link';

import { EmptyState, PageHeader } from '@/components/ui';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" />
      <EmptyState title="That page does not exist" />
      <p className="mt-4 text-center text-sm text-ink-soft">
        <Link href="/" className="text-accent hover:underline">
          Back to the start
        </Link>
      </p>
    </>
  );
}
