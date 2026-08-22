import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';

import { Banner, EmptyState, PageHeader } from '@/components/ui';
import { db, dbExists, schema } from '@/lib/db';

export const dynamic = 'force-dynamic';

const FEEDS = [
  { key: 'retail', label: 'Retail' },
  { key: 'in-dev', label: 'In development' },
] as const;

type FeedKey = (typeof FEEDS)[number]['key'];

const DAY = 86_400_000;

function ago(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  if (d < DAY) return `${Math.floor(d / 3_600_000)} h ago`;
  if (d < 30 * DAY) return `${Math.floor(d / DAY)} d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.feed) ? params.feed[0] : params.feed;
  const feed: FeedKey = raw === 'in-dev' ? 'in-dev' : 'retail';

  const header = <PageHeader title="News" lead="Wowhead retail and in-development feeds." />;

  if (!dbExists()) {
    return (
      <>
        {header}
        <EmptyState
          title="No database yet"
          body="Create it, then fetch the feeds."
          command="npx drizzle-kit migrate"
        />
      </>
    );
  }

  const items = await db
    .select()
    .from(schema.news)
    .where(eq(schema.news.feed, feed))
    .orderBy(desc(schema.news.publishedAt))
    .limit(40);

  const lastFetched = items.length > 0 ? Math.max(...items.map((i) => i.fetchedAt)) : null;
  const stale = lastFetched !== null && Date.now() - lastFetched > DAY;

  const tabs = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {FEEDS.map((f) => (
        <Link
          key={f.key}
          href={f.key === 'retail' ? '/news' : `/news?feed=${f.key}`}
          className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
            feed === f.key
              ? 'border-accent bg-accent-muted/40 text-accent'
              : 'border-line-strong bg-raised text-ink-soft hover:text-ink'
          }`}
        >
          {f.label}
        </Link>
      ))}
      {lastFetched !== null ? (
        <span className="text-xs text-ink-faint">Last fetched {ago(lastFetched)}</span>
      ) : null}
    </div>
  );

  if (items.length === 0) {
    return (
      <>
        {header}
        {tabs}
        <EmptyState
          title="No news yet"
          body="This feed has not been fetched. Run the news sync, or start it from the Sync page."
          command="npm run sync:news"
        />
      </>
    );
  }

  return (
    <>
      {header}
      {tabs}

      {stale ? (
        <div className="mb-4">
          <Banner variant="warn">
            This feed was last fetched {ago(lastFetched!)}. Run{' '}
            <code className="font-mono">npm run sync:news</code> for the latest.
          </Banner>
        </div>
      ) : null}

      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.guid}
            className="overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong"
          >
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-4 p-4 sm:flex-row"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-24 w-full shrink-0 rounded-md object-cover sm:w-40"
                  loading="lazy"
                  decoding="async"
                />
              ) : null}

              <div className="min-w-0">
                <h2 className="text-h3 text-ink">{item.title}</h2>
                {/* Stripped summary only. Full article bodies are never stored or
                    rendered — we link out. See planning/03-etl.md §3. */}
                <p className="mt-1 text-sm text-ink-soft">{item.summary}</p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  {item.category ? (
                    <span className="rounded-full bg-raised px-2 py-0.5 tracking-wide uppercase">
                      {item.category}
                    </span>
                  ) : null}
                  <span>{ago(item.publishedAt)}</span>
                  <span className="text-accent">Read on Wowhead →</span>
                </p>
              </div>
            </a>
          </article>
        ))}
      </div>
    </>
  );
}
