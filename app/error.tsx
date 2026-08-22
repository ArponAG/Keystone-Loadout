'use client';

import Link from 'next/link';

/**
 * Last-resort boundary.
 *
 * Every known failure has a real empty state, so reaching this means something
 * unanticipated broke. The most likely cause by far is database setup, so say so
 * plainly and give the commands rather than showing a stack trace — this is the page a
 * first-time user hits when something is wrong, and it should tell them what to do.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const looksLikeSchema = /no such table|no such column|SQLITE/i.test(error.message);

  return (
    <div className="mx-auto max-w-2xl py-12">
      <h1 className="text-display text-ink">Something broke</h1>

      {looksLikeSchema ? (
        <>
          <p className="mt-2 text-body text-ink-soft">
            The database is missing its tables. This is what a fresh clone looks like before
            the first migration.
          </p>
          <div className="mt-4 space-y-2">
            <Command>npx drizzle-kit migrate</Command>
            <Command>npm run sync:all</Command>
          </div>
        </>
      ) : (
        <p className="mt-2 text-body text-ink-soft">
          An unexpected error occurred. If it persists, check the terminal running{' '}
          <code className="font-mono text-ink">npm run dev</code>.
        </p>
      )}

      <pre className="mt-6 overflow-x-auto rounded-md border border-line bg-inset p-3 font-mono text-xs break-words whitespace-pre-wrap text-ink-faint">
        {error.message}
      </pre>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-accent bg-accent-muted/40 px-3 py-1.5 text-sm text-accent hover:bg-accent-muted/60"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-md border border-line-strong bg-raised px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
        >
          Back to the start
        </Link>
      </div>
    </div>
  );
}

function Command({ children }: { children: React.ReactNode }) {
  return (
    <code className="block rounded-md bg-inset px-3 py-2 font-mono text-sm text-accent">
      {children}
    </code>
  );
}
