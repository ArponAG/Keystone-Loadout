import { NextResponse } from 'next/server';

/**
 * Character typeahead, proxied through the server.
 *
 * NOTE: this uses Raider.IO's internal site search (`/api/search`), not their
 * documented v1 API. It is what raider.io's own search box calls, but it carries no
 * stability guarantee — so every failure here degrades to "no suggestions" and the
 * form still works by typing realm and name manually. Nothing depends on it.
 *
 * Kept server-side for the same reasons as every other outbound call: CORS would block
 * the browser anyway, and this keeps the User-Agent honest and the throttling in one
 * place. See planning/01-architecture.md §4.
 */
const SEARCH_URL = 'https://raider.io/api/search';
const UA = 'KeystoneLoadout/0.1 (personal project)';

const MIN_TERM = 2;
const MAX_RESULTS = 8;
const CACHE_TTL_MS = 60_000;

export type Suggestion = {
  name: string;
  realm: string;
  realmSlug: string;
  region: string;
  regionLabel: string;
  className: string;
  faction: string;
  thumbnail: string | null;
};

type RawMatch = {
  type?: string;
  data?: {
    name?: string;
    faction?: string;
    region?: { slug?: string; short_name?: string };
    realm?: { name?: string; slug?: string };
    class?: { name?: string };
    thumbnail_url?: string;
  };
};

// A tiny in-process cache. Typeahead fires a lot; repeating the same term within a
// minute should not become a request to someone else's server.
const cache = new Map<string, { at: number; data: Suggestion[] }>();

function fromCache(term: string): Suggestion[] | null {
  const hit = cache.get(term);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(term);
    return null;
  }
  return hit.data;
}

export async function GET(request: Request) {
  const term = (new URL(request.url).searchParams.get('term') ?? '').trim();

  if (term.length < MIN_TERM) {
    return NextResponse.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const key = term.toLowerCase();
  const cached = fromCache(key);
  if (cached) {
    return NextResponse.json({ suggestions: cached }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let matches: RawMatch[] = [];
  try {
    const res = await fetch(`${SEARCH_URL}?term=${encodeURIComponent(term)}`, {
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { matches?: RawMatch[] };
    matches = body.matches ?? [];
  } catch {
    // Degrade silently — the form still works without suggestions.
    return NextResponse.json({ suggestions: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const suggestions: Suggestion[] = matches
    .filter((m) => m.type === 'character' && m.data?.name && m.data?.realm?.slug)
    .slice(0, MAX_RESULTS)
    .map((m) => {
      const d = m.data!;
      const thumb = d.thumbnail_url ?? null;
      return {
        name: d.name!,
        realm: d.realm!.name ?? d.realm!.slug!,
        realmSlug: d.realm!.slug!,
        region: d.region?.slug ?? 'us',
        regionLabel: d.region?.short_name ?? (d.region?.slug ?? 'us').toUpperCase(),
        className: d.class?.name ?? '',
        faction: d.faction ?? '',
        // Raider.IO returns protocol-relative URLs.
        thumbnail: thumb ? (thumb.startsWith('//') ? `https:${thumb}` : thumb) : null,
      };
    });

  cache.set(key, { at: Date.now(), data: suggestions });

  return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'no-store' } });
}
