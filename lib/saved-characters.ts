/**
 * Pinned characters, stored per-browser.
 *
 * These moved out of SQLite deliberately. Once the app is served to more than one
 * person, a database table means everyone shares one list and can delete each other's
 * entries — the data is personal to whoever is looking, not to the server.
 * localStorage gives each visitor their own list with no accounts and no user column.
 *
 * Everything here is defensive: localStorage can be disabled, full, or hold junk from
 * an older version, and none of that should break the page.
 */

const KEY = 'keystone.savedCharacters';
const MAX = 30;

export type SavedCharacter = {
  cacheKey: string;
  region: string;
  realm: string;
  name: string;
  className: string | null;
  specName: string | null;
  faction: string | null;
  thumbnail: string | null;
  itemLevel: number | null;
  mplusScore: number | null;
  savedAt: number;
};

export function characterKey(region: string, realm: string, name: string): string {
  return `${region}:${realm}:${name}`.toLowerCase();
}

function isCharacter(value: unknown): value is SavedCharacter {
  const c = value as SavedCharacter;
  return (
    typeof c === 'object' &&
    c !== null &&
    typeof c.cacheKey === 'string' &&
    typeof c.region === 'string' &&
    typeof c.realm === 'string' &&
    typeof c.name === 'string'
  );
}

export function readSaved(): SavedCharacter[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Drop anything malformed rather than throwing — a bad entry from an older build
    // should cost that one row, not the whole list.
    return parsed.filter(isCharacter).sort((a, b) => (b.mplusScore ?? 0) - (a.mplusScore ?? 0));
  } catch {
    return [];
  }
}

function write(list: SavedCharacter[]): SavedCharacter[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Private browsing, quota, or storage disabled. The list still works for this
    // session; it just will not persist.
  }
  return list;
}

/** Add or refresh. Re-saving keeps the original savedAt so the list does not reshuffle. */
export function saveCharacter(character: Omit<SavedCharacter, 'savedAt'>): SavedCharacter[] {
  const existing = readSaved();
  const previous = existing.find((c) => c.cacheKey === character.cacheKey);

  const next = [
    { ...character, savedAt: previous?.savedAt ?? Date.now() },
    ...existing.filter((c) => c.cacheKey !== character.cacheKey),
  ].sort((a, b) => (b.mplusScore ?? 0) - (a.mplusScore ?? 0));

  return write(next);
}

export function removeCharacter(cacheKey: string): SavedCharacter[] {
  return write(readSaved().filter((c) => c.cacheKey !== cacheKey));
}
