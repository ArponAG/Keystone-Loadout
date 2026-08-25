import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db, dbReady, schema } from '@/lib/db';
import { clientIp, deviceLabel, isPrivateIp } from '@/lib/domain/visitors';

/**
 * Records one page view.
 *
 * Called from the browser rather than from middleware, because middleware runs on the
 * Edge runtime and cannot open better-sqlite3. It is a POST so that a prefetch, a
 * crawler or a link preview cannot manufacture views.
 *
 * Never fails loudly. A logging endpoint that can break a page is worse than no logging
 * at all, so every path returns 200 and the caller ignores the body.
 */
export const dynamic = 'force-dynamic';

const COOKIE = 'keystone_vid';
/** A year. Long enough that a friend stays the same "person" across a season. */
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Re-check a known address occasionally; VPN exits get reassigned between countries. */
const GEO_TTL_MS = 7 * 86_400_000;

export async function POST(request: Request) {
  if (!dbReady()) return NextResponse.json({ ok: false });

  try {
    const body = (await request.json().catch(() => ({}))) as { path?: string; screen?: string };

    const path = typeof body.path === 'string' ? body.path.slice(0, 200) : '/';
    const screen = typeof body.screen === 'string' ? body.screen.slice(0, 20) : null;

    // The cookie is the identity. Absent means a new browser, so mint one.
    const cookieHeader = request.headers.get('cookie') ?? '';
    const existing = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);

    const visitorId = existing && existing.length >= 8 ? existing : crypto.randomUUID();

    const ip = clientIp(request.headers);

    db.insert(schema.pageViews)
      .values({
        visitorId,
        path,
        ip,
        device: deviceLabel(request.headers.get('user-agent')),
        screen,
        at: Date.now(),
      })
      .run();

    // Deliberately not awaited: geolocation is a third-party round trip and the browser
    // is waiting on this response. The row is already written; the country fills in a
    // moment later and the dashboard picks it up on its next render.
    if (ip) void resolveCountry(ip);

    const response = NextResponse.json({ ok: true });

    if (!existing) {
      response.cookies.set(COOKIE, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: COOKIE_MAX_AGE,
        path: '/',
        // Not `secure`: this is served over plain HTTP on a LAN, and a secure cookie
        // would simply never be stored, so every visit would look like a new person.
        secure: false,
      });
    }

    return response;
  } catch {
    // Swallowed on purpose - see the note above.
    return NextResponse.json({ ok: false });
  }
}

/**
 * Look up and cache the country for an address.
 *
 * Private ranges are cached with a null country and never looked up again: on a LAN
 * every visitor is 192.168.x.x, which no geolocation service can place, and asking
 * would be a guaranteed-useless request on every single view.
 */
async function resolveCountry(ip: string): Promise<void> {
  try {
    const [known] = db
      .select({ fetchedAt: schema.ipGeo.fetchedAt })
      .from(schema.ipGeo)
      .where(eq(schema.ipGeo.ip, ip))
      .limit(1)
      .all();

    if (known && Date.now() - known.fetchedAt < GEO_TTL_MS) return;

    if (isPrivateIp(ip)) {
      upsertGeo(ip, null, null, null);
      return;
    }

    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,country,city`,
      { headers: { 'User-Agent': 'KeystoneLoadout/0.1 (personal project)' } },
    );
    if (!res.ok) return;

    const data = (await res.json()) as {
      status?: string;
      countryCode?: string;
      country?: string;
      city?: string;
    };
    if (data.status !== 'success') return;

    upsertGeo(ip, data.countryCode?.toLowerCase() ?? null, data.country ?? null, data.city ?? null);
  } catch {
    // A failed lookup leaves the row without a country. The dashboard shows the address
    // without a flag, which is strictly better than the page failing.
  }
}

function upsertGeo(ip: string, code: string | null, name: string | null, city: string | null): void {
  db.insert(schema.ipGeo)
    .values({ ip, countryCode: code, countryName: name, city, fetchedAt: Date.now() })
    .onConflictDoUpdate({
      target: schema.ipGeo.ip,
      set: { countryCode: code, countryName: name, city, fetchedAt: Date.now() },
    })
    .run();
}
