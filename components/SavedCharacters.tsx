'use client';

import type { SavedCharacter } from '@/lib/saved-characters';

const FACTION_COLOUR: Record<string, string> = {
  alliance: 'var(--color-q-rare)',
  horde: 'var(--color-fit-0)',
};

/**
 * The pinned-character rail. Renders from the stored snapshot so it appears instantly
 * with no upstream calls; clicking runs a real lookup and refreshes the snapshot.
 */
export function SavedCharacters({
  saved,
  activeKey,
  onPick,
  onRemove,
}: {
  saved: SavedCharacter[];
  activeKey: string | null;
  onPick: (c: SavedCharacter) => void;
  onRemove: (c: SavedCharacter) => void;
}) {
  if (saved.length === 0) return null;

  return (
    <div className="mb-3">
      <h2 className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
        Saved characters ({saved.length})
      </h2>

      <div className="flex flex-wrap gap-2">
        {saved.map((character) => {
          const active = character.cacheKey === activeKey;
          return (
            <div
              key={character.cacheKey}
              className={`group relative flex items-center gap-2.5 rounded-lg border bg-surface py-1.5 pr-8 pl-1.5 transition-colors ${
                active ? 'border-accent' : 'border-line hover:border-line-strong'
              }`}
            >
              <button
                type="button"
                onClick={() => onPick(character)}
                className="flex items-center gap-2.5 text-left"
              >
                {character.thumbnail ? (
                  <img
                    src={character.thumbnail}
                    alt=""
                    className="h-9 w-9 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="h-9 w-9 rounded-md bg-inset" />
                )}

                <span>
                  <span
                    className="block text-item"
                    style={{ color: FACTION_COLOUR[character.faction ?? ''] ?? 'var(--color-ink)' }}
                  >
                    {character.name}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {character.region.toUpperCase()} · {character.realm}
                  </span>
                </span>

                <span className="ml-2 flex gap-3 border-l border-line pl-3">
                  <span className="text-center">
                    <span className="tabular block text-sm text-ink">
                      {character.itemLevel ?? '—'}
                    </span>
                    <span className="block text-xs text-ink-faint">ilvl</span>
                  </span>
                  <span className="text-center">
                    <span className="tabular block text-sm text-ink">
                      {character.mplusScore ?? '—'}
                    </span>
                    <span className="block text-xs text-ink-faint">M+</span>
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRemove(character)}
                aria-label={`Remove ${character.name}`}
                title="Remove"
                className="absolute top-1 right-1 rounded-sm px-1.5 text-xs text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-error focus-visible:opacity-100"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
