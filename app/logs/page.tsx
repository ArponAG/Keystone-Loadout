import { desc, sql } from 'drizzle-orm';

import { PageHeader } from '@/components/ui';
import { db, dbReady, schema } from '@/lib/db';
import { ago } from '@/lib/domain/format';
import { flagUrl, isPrivateIp, visitorName } from '@/lib/domain/visitors';

/**
 * Who is using this.
 *
 * Deliberately not linked from the header, like /sync: it is an operator page about the
 * people using the app, and the app is served to those same people.
 *
 * Grouped by visitor id — a first-party cookie — rather than by IP, because the whole
 * point is that addresses move. A friend on a VPN is one person with five addresses,
 * and grouping by IP would report five people.
 */
export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

export default function LogsPage() {
  if (!dbReady()) {
    return (
      <>
        <PageHeader title="Usage" />
        <p className="rounded-xl bg-surface/70 px-4 py-6 text-sm text-ink-faint">
          The database has not been created yet. Run <code className="font-mono text-accent">npx drizzle-kit migrate</code>.
        </p>
      </>
    );
  }

  const now = Date.now();

  const visitors = db
    .select({
      visitorId: schema.pageViews.visitorId,
      views: sql<number>`count(*)`.as('views'),
      firstSeen: sql<number>`min(${schema.pageViews.at})`.as('first_seen'),
      lastSeen: sql<number>`max(${schema.pageViews.at})`.as('last_seen'),
      device: sql<string | null>`max(${schema.pageViews.device})`.as('device'),
      screen: sql<string | null>`max(${schema.pageViews.screen})`.as('screen'),
    })
    .from(schema.pageViews)
    .groupBy(schema.pageViews.visitorId)
    .orderBy(desc(sql`max(${schema.pageViews.at})`))
    .all();

  if (visitors.length === 0) {
    return (
      <>
        <PageHeader title="Usage" />
        <p className="rounded-xl bg-surface/70 px-4 py-8 text-center text-sm text-ink-faint">
          No visits recorded yet. Open any page and it will appear here.
        </p>
      </>
    );
  }

  // Addresses per visitor, newest first. A VPN user has several; that is the interesting
  // part rather than a problem to collapse away.
  const addresses = db
    .select({
      visitorId: schema.pageViews.visitorId,
      ip: schema.pageViews.ip,
      lastSeen: sql<number>`max(${schema.pageViews.at})`.as('last_seen'),
      countryCode: schema.ipGeo.countryCode,
      countryName: schema.ipGeo.countryName,
      city: schema.ipGeo.city,
    })
    .from(schema.pageViews)
    .leftJoin(schema.ipGeo, sql`${schema.ipGeo.ip} = ${schema.pageViews.ip}`)
    .groupBy(schema.pageViews.visitorId, schema.pageViews.ip)
    .orderBy(desc(sql`max(${schema.pageViews.at})`))
    .all();

  const topPaths = db
    .select({ path: schema.pageViews.path, views: sql<number>`count(*)`.as('views') })
    .from(schema.pageViews)
    .groupBy(schema.pageViews.path)
    .orderBy(desc(sql`count(*)`))
    .limit(8)
    .all();

  const recent = db
    .select({
      visitorId: schema.pageViews.visitorId,
      path: schema.pageViews.path,
      at: schema.pageViews.at,
    })
    .from(schema.pageViews)
    .orderBy(desc(schema.pageViews.at))
    .limit(15)
    .all();

  const totalViews = visitors.reduce((n, v) => n + v.views, 0);
  const activeToday = visitors.filter((v) => now - v.lastSeen < DAY).length;

  return (
    <>
      <PageHeader title="Usage" />

      <div className="mb-4 flex flex-wrap gap-2">
        <Stat value={visitors.length} label={visitors.length === 1 ? 'Device' : 'Devices'} />
        <Stat value={activeToday} label="Active today" tone={activeToday > 0 ? 'var(--color-ok)' : undefined} />
        <Stat value={totalViews} label="Page views" />
      </div>

      <section className="mb-6">
        <h2 className="mb-2 text-xs tracking-wide text-ink-faint uppercase">Devices</h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {visitors.map((v) => (
            <VisitorCard
              key={v.visitorId}
              visitor={v}
              now={now}
              addresses={addresses.filter((a) => a.visitorId === v.visitorId)}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs tracking-wide text-ink-faint uppercase">Most visited</h2>
          <div className="space-y-1 rounded-xl bg-surface/70 p-3">
            {topPaths.map((p) => (
              <div key={p.path} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate font-mono text-xs text-ink-soft">{p.path}</span>
                {/* Bar widths are relative to the busiest path, so the shape of the
                    distribution reads even when every number is small. */}
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-inset">
                  <span
                    className="block h-full rounded-full bg-accent/70"
                    style={{ width: `${Math.max(4, (p.views / topPaths[0].views) * 100)}%` }}
                  />
                </span>
                <span className="tabular w-8 shrink-0 text-right text-xs text-ink-faint">{p.views}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs tracking-wide text-ink-faint uppercase">Recent</h2>
          <div className="divide-y divide-line rounded-xl bg-surface/70">
            {recent.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-28 shrink-0 truncate text-xs font-medium text-ink-soft">
                  {visitorName(r.visitorId)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-faint">{r.path}</span>
                <span className="shrink-0 text-[10px] text-ink-faint">{ago(r.at)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

type Visitor = {
  visitorId: string;
  views: number;
  firstSeen: number;
  lastSeen: number;
  device: string | null;
  screen: string | null;
};

type Address = {
  ip: string | null;
  lastSeen: number;
  countryCode: string | null;
  countryName: string | null;
  city: string | null;
};

function VisitorCard({
  visitor,
  addresses,
  now,
}: {
  visitor: Visitor;
  addresses: Address[];
  now: number;
}) {
  const online = now - visitor.lastSeen < 5 * 60_000;

  return (
    <article className="rounded-xl bg-surface/70 p-3.5">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: online ? 'var(--color-ok)' : 'var(--color-line-strong)' }}
          title={online ? 'Active in the last 5 minutes' : `Last seen ${ago(visitor.lastSeen)}`}
        />
        {/* A word pair rather than the raw UUID: these are people you know, and
            "Amber Drake" is something you can actually refer to out loud. */}
        <h3 className="flex-1 truncate text-item font-semibold text-ink">
          {visitorName(visitor.visitorId)}
        </h3>
        <span className="tabular text-xs font-semibold text-ink-soft">{visitor.views}</span>
        <span className="text-[10px] text-ink-faint">views</span>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-faint">
        <span>{visitor.device ?? 'Unknown device'}</span>
        {visitor.screen ? <span className="tabular">{visitor.screen}</span> : null}
      </p>

      <div className="mt-2.5 space-y-1">
        {addresses.map((a) => (
          <AddressRow key={a.ip ?? 'unknown'} address={a} />
        ))}
      </div>

      <p className="mt-2.5 text-[10px] text-ink-faint">
        First seen {ago(visitor.firstSeen)} &middot; last {ago(visitor.lastSeen)}
      </p>
    </article>
  );
}

function AddressRow({ address }: { address: Address }) {
  const flag = flagUrl(address.countryCode);
  // On a LAN every address is 192.168.x.x and has no country. Saying so is more useful
  // than a blank space that looks like a lookup that failed.
  const lan = address.ip ? isPrivateIp(address.ip) : false;

  return (
    <div className="flex items-center gap-2">
      <span className="grid h-[13px] w-[18px] shrink-0 place-items-center">
        {flag ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flag} alt={address.countryName ?? ''} width={18} height={13} className="rounded-[2px]" />
        ) : (
          <span className="h-[13px] w-[18px] rounded-[2px] bg-inset" />
        )}
      </span>
      <span className="tabular text-xs text-ink-soft">{address.ip ?? 'unknown'}</span>
      <span className="min-w-0 truncate text-[10px] text-ink-faint">
        {lan ? 'local network' : [address.city, address.countryName].filter(Boolean).join(', ')}
      </span>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <span className="flex items-baseline gap-1.5 rounded-lg bg-surface/70 px-3 py-2">
      <span className="tabular text-h2 font-bold" style={{ color: tone ?? 'var(--color-ink)' }}>
        {value}
      </span>
      <span className="text-[11px] text-ink-faint">{label}</span>
    </span>
  );
}
