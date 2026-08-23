'use client';

import { realmLabel } from '@/lib/domain/format';
import { classColor } from '@/lib/domain/icons';
import type { SavedCharacter } from '@/lib/saved-characters';

/**
 * The pinned-character rail. Renders from the stored snapshot so it appears instantly
 * with no upstream calls; clicking runs a real lookup and refreshes the snapshot.
 *
 * The active card is marked by a filled background rather than an accent outline. An
 * outline competes with the class colours these cards are built around — WoW UIs colour
 * names by class, and a gold ring around a pink Paladin name fights it. Fill sits behind
 * the content instead of drawing a second edge around it.
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
    <div className="mb-4">
      <h2 className="mb-2 flex items-center gap-2 text-xs tracking-wide text-ink-faint uppercase">
        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
        </svg>
        Saved characters
        <span className="tabular text-ink-faint/70">{saved.length}</span>
      </h2>

      <div className="flex flex-wrap gap-2">
        {saved.map((character) => {
          const active = character.cacheKey === activeKey;
          const spec = [character.specName, character.className].filter(Boolean).join(' ');

          return (
            <div
              key={character.cacheKey}
              className={`group relative flex items-center rounded-lg transition-colors ${
                active ? 'bg-accent-muted/35' : 'bg-raised/50 hover:bg-raised'
              }`}
            >
              <button
                type="button"
                onClick={() => onPick(character)}
                title={`${character.name} — ${spec || 'Unknown spec'} · ${realmLabel(character.realm)} (${character.region.toUpperCase()})`}
                className="flex items-center gap-3 py-2 pr-9 pl-2 text-left"
              >
                {character.thumbnail ? (
                  <img
                    src={character.thumbnail}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  // Blizzard's avatar can be missing or 404 on a freshly-renamed
                  // character. An empty square reads as a broken image, so fall back to
                  // the initial in class colour — still identifiable, still deliberate.
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-inset text-base font-semibold"
                    style={{ color: classColor(character.className) }}
                    aria-hidden="true"
                  >
                    {character.name.charAt(0).toUpperCase()}
                  </span>
                )}

                {/* Fixed width, not max-width: names vary from 2 to 12 characters and a
                    ragged rail of differently-sized cards is harder to scan than a grid. */}
                <span className="w-[8.5rem] min-w-0">
                  <span
                    className="block truncate text-item font-semibold"
                    style={{ color: classColor(character.className) }}
                  >
                    {character.name}
                  </span>
                  {/* Class is already carried by the name's colour, so the second line
                      spends its width on spec and realm — the two things the colour
                      cannot say, and the pair that separates two alts of one class. */}
                  <span className="block truncate text-xs text-ink-faint">
                    {character.specName
                      ? `${character.specName} · ${realmLabel(character.realm)}`
                      : `${character.region.toUpperCase()} · ${realmLabel(character.realm)}`}
                  </span>
                </span>

                <span className="flex shrink-0 gap-2.5">
                  <Metric value={character.itemLevel} label="ilvl" />
                  <Metric value={character.mplusScore} label="M+" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => onRemove(character)}
                aria-label={`Unpin ${character.name}`}
                title="Unpin"
                className="absolute top-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full text-ink-faint opacity-0 transition-all group-hover:opacity-100 hover:bg-error/15 hover:text-error focus-visible:opacity-100"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ value, label }: { value: number | null; label: string }) {
  return (
    <span className="w-9 rounded-md bg-base/40 px-1 py-1 text-center">
      <span className="tabular block text-sm leading-none font-semibold text-ink">
        {value ?? '—'}
      </span>
      <span className="mt-1 block text-[10px] leading-none text-ink-faint">{label}</span>
    </span>
  );
}
