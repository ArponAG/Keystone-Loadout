import type { ReactNode } from 'react';

/** Page title + optional one-line explainer. */
export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="mb-8">
      <h1 className="text-display text-ink">{title}</h1>
      {lead ? <p className="mt-2 max-w-2xl text-body text-ink-soft">{lead}</p> : null}
    </div>
  );
}

/**
 * Empty states name the command that fixes them — the user and the operator are the
 * same person here. Always distinguish "nothing synced" from "nothing matched".
 * See planning/05-ui.md §9.
 */
export function EmptyState({
  title,
  body,
  command,
}: {
  title: string;
  body?: string;
  command?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface px-6 py-12 text-center">
      <p className="text-h2 text-ink">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-body text-ink-soft">{body}</p> : null}
      {command ? (
        <code className="mt-4 inline-block rounded-md bg-inset px-3 py-2 font-mono text-sm text-accent">
          {command}
        </code>
      ) : null}
    </div>
  );
}

const BANNER_STYLES = {
  info: 'border-l-running bg-running/8',
  warn: 'border-l-stale bg-stale/8',
  error: 'border-l-error bg-error/8',
} as const;

/** Left border in the status colour, tinted background. */
export function Banner({
  variant = 'info',
  children,
}: {
  variant?: keyof typeof BANNER_STYLES;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-md border-l-3 px-4 py-3 text-sm text-ink-soft ${BANNER_STYLES[variant]}`}
    >
      {children}
    </div>
  );
}

/** Small uppercase pill. Used for "in rotation", "not gear". */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-accent-muted/40 px-2 py-0.5 text-xs tracking-wide text-accent uppercase">
      {children}
    </span>
  );
}
