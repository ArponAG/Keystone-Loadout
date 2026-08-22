/**
 * Blizzard OAuth2 client-credentials flow, with the token cached to disk.
 *
 * Deliberately NOT marked `server-only`: the ETL scripts in scripts/ run under tsx
 * outside Next, and must be able to import this. Nothing in app/ should import it —
 * only scripts/ talks to Blizzard. See planning/01-architecture.md §4.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OAUTH_URL = 'https://oauth.battle.net/token';
const TOKEN_PATH = path.join(process.cwd(), 'data', '.blizzard-token.json');

/** Refresh this long before the stated expiry, so a long sync cannot straddle it. */
const EXPIRY_SKEW_MS = 60_000;

type CachedToken = {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
};

export class BlizzardAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlizzardAuthError';
  }
}

function readCredentials(): { id: string; secret: string } {
  // Scripts run outside Next, which does not load .env.local for them.
  if (!process.env.BLIZZARD_CLIENT_ID || !process.env.BLIZZARD_CLIENT_SECRET) {
    try {
      process.loadEnvFile(path.join(process.cwd(), '.env.local'));
    } catch {
      // handled below
    }
  }

  const id = process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET;

  if (!id || !secret) {
    throw new BlizzardAuthError(
      'Missing Blizzard credentials.\n\n' +
        'Create .env.local in the project root containing:\n' +
        '  BLIZZARD_CLIENT_ID=<your client id>\n' +
        '  BLIZZARD_CLIENT_SECRET=<your client secret>\n' +
        '  BLIZZARD_REGION=us\n\n' +
        'Get these from https://develop.battle.net -> API Access -> Create Client.',
    );
  }

  return { id, secret };
}

function readCache(): CachedToken | null {
  try {
    const parsed = JSON.parse(readFileSync(TOKEN_PATH, 'utf8')) as CachedToken;
    if (typeof parsed.accessToken !== 'string' || typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() >= parsed.expiresAt - EXPIRY_SKEW_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(token: CachedToken): void {
  mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2), { mode: 0o600 });
}

/** Drop the cached token. Called on a 401 so the next request re-authenticates. */
export function invalidateToken(): void {
  inFlight = null;
  try {
    rmSync(TOKEN_PATH, { force: true });
  } catch {
    // best effort
  }
}

// Concurrent callers during a cold start must not each open their own token request.
let inFlight: Promise<string> | null = null;

async function requestToken(): Promise<string> {
  const { id, secret } = readCredentials();

  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new BlizzardAuthError(
      `OAuth failed: ${res.status} ${res.statusText}. ${body}\n` +
        'If this is a 401, the client id or secret in .env.local is wrong.',
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  writeCache({
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  });

  return json.access_token;
}

/** Returns a valid bearer token, from disk cache when possible. */
export async function getToken(): Promise<string> {
  const cached = readCache();
  if (cached) return cached.accessToken;

  inFlight ??= requestToken().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export const TOKEN_CACHE_PATH = TOKEN_PATH;
