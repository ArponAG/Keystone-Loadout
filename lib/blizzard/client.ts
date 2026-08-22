/**
 * Rate-limited Blizzard Game Data API client.
 *
 * Blizzard allows 100 req/s and 36,000 req/hr. We pace at 200 ms (5 req/s) — a full
 * season loot sync is ~530 calls, so speed is not the constraint and politeness costs
 * us ~90 seconds. See planning/01-architecture.md §5.
 *
 * ETL-only. Nothing in app/ imports this.
 */
import { getToken, invalidateToken } from './auth';

const REGION = process.env.BLIZZARD_REGION ?? 'us';
const BASE = `https://${REGION}.api.blizzard.com`;
const UA = 'KeystoneLoadout/0.1 (personal project)';

/** Minimum gap between outbound Blizzard requests. */
export const REQUEST_SPACING_MS = 200;
const MAX_RETRIES = 3;

export type Namespace = 'static' | 'dynamic' | 'profile';

export class BlizzardError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = 'BlizzardError';
  }

  /** 404s are routine during a sync — an item id in a journal that no longer resolves. */
  get isNotFound(): boolean {
    return this.status === 404;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Serialised queue: every request awaits the previous one's spacing window. This is a
// single-process ETL, so a simple promise chain is sufficient and avoids a dependency.
let gate: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  const wait = gate.then(() => sleep(REQUEST_SPACING_MS));
  gate = wait;
  return wait;
}

type FetchOptions = {
  namespace?: Namespace;
  locale?: string;
  /** Return null instead of throwing when the resource 404s. */
  tolerate404?: boolean;
};

async function request<T>(path: string, options: FetchOptions, attempt: number): Promise<T | null> {
  const { namespace = 'static', locale = 'en_US', tolerate404 = false } = options;

  await throttle();

  const url = `${BASE}${path}?namespace=${namespace}-${REGION}&locale=${locale}`;
  const token = await getToken();

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA },
    });
  } catch (cause) {
    // Network-level failure (DNS, socket reset). Retry with backoff.
    if (attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 500);
      return request<T>(path, options, attempt + 1);
    }
    throw new BlizzardError(`Network failure on ${path}: ${String(cause)}`, 0, path);
  }

  if (res.status === 401) {
    // Token expired or revoked mid-run. Discard and retry once; a second 401 is fatal.
    if (attempt < 1) {
      invalidateToken();
      return request<T>(path, options, attempt + 1);
    }
    throw new BlizzardError(`Unauthorised on ${path} after token refresh.`, 401, path);
  }

  if (res.status === 404) {
    if (tolerate404) return null;
    throw new BlizzardError(`Not found: ${path}`, 404, path);
  }

  if (res.status === 429 || res.status >= 500) {
    if (attempt < MAX_RETRIES) {
      await sleep(2 ** attempt * 500);
      return request<T>(path, options, attempt + 1);
    }
    throw new BlizzardError(
      `${res.status} on ${path} after ${MAX_RETRIES} retries.`,
      res.status,
      path,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BlizzardError(`${res.status} on ${path}: ${body}`, res.status, path);
  }

  return (await res.json()) as T;
}

/** Fetch a Game Data resource. Throws BlizzardError on failure. */
export async function blizz<T = unknown>(path: string, options: FetchOptions = {}): Promise<T> {
  const result = await request<T>(path, { ...options, tolerate404: false }, 0);
  return result as T;
}

/** Fetch a resource, returning null when it 404s rather than throwing. */
export async function blizzOrNull<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T | null> {
  return request<T>(path, { ...options, tolerate404: true }, 0);
}

// ---------------------------------------------------------------- media helpers

type MediaResponse = {
  assets?: { key: string; value: string; file_data_id?: number }[];
};

/**
 * Item icon.
 *
 * Returns the numeric fileDataId, not a readable slug — Blizzard's CDN serves icons as
 * `/icons/{size}/{fileDataId}.jpg`. The human-readable `inv_*` names you see on Wowhead
 * come from a different source and are not available here.
 *
 * Costs one request per item, which is why sync:loot fetches these in a lazy second
 * pass and treats failure as non-fatal.
 */
export async function fetchItemIconFileId(itemId: number): Promise<number | null> {
  const media = await blizzOrNull<MediaResponse>(`/data/wow/media/item/${itemId}`);
  const icon = media?.assets?.find((a) => a.key === 'icon');
  return icon?.file_data_id ?? null;
}

/**
 * Instance zone art. Returns a full URL — unlike item icons this is not derivable from
 * an id, and only the `-small` variant exists (the bare filename 403s).
 */
export async function fetchInstanceTileUrl(instanceId: number): Promise<string | null> {
  const media = await blizzOrNull<MediaResponse>(
    `/data/wow/media/journal-instance/${instanceId}`,
  );
  const tile = media?.assets?.find((a) => a.key === 'tile') ?? media?.assets?.[0];
  return tile?.value ?? null;
}
