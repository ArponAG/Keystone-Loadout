'use client';

import { useEffect, useRef, useState } from 'react';

import type { Suggestion } from '@/app/api/character/search/route';

const MIN_TERM = 2;
const DEBOUNCE_MS = 250;

const FACTION_COLOUR: Record<string, string> = {
  alliance: 'var(--color-q-rare)',
  horde: 'var(--color-fit-0)',
};

/**
 * Typeahead over Raider.IO's character search.
 *
 * Suggestions are a convenience, never a requirement: if the upstream search fails the
 * dropdown simply stays empty and the manual realm/name fields below still work. That
 * matters because the search endpoint is undocumented — see the route handler.
 */
export function CharacterSearch({
  onPick,
}: {
  onPick: (pick: { region: string; realm: string; name: string }) => void;
}) {
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch. Every keystroke aborts the previous request so a slow response
  // for "ni" can never overwrite the results for "niina".
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/character/search?term=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        setSuggestions(body.suggestions ?? []);
        setHighlight(-1);
      } catch {
        // Aborted or failed — leave whatever is on screen rather than flashing empty.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [term]);

  // Close on outside click.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function choose(s: Suggestion) {
    setTerm(s.name);
    setOpen(false);
    onPick({ region: s.region, realm: s.realmSlug, name: s.name });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault();
      choose(suggestions[highlight]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const tooShort = term.trim().length > 0 && term.trim().length < MIN_TERM;

  return (
    <div ref={boxRef} className="relative">
      <label className="flex flex-col gap-1">
        <span className="text-xs tracking-wide text-ink-faint uppercase">Search characters</span>
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Start typing a character name…"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="character-suggestions"
          className="w-full rounded-md border border-line-strong bg-inset px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
      </label>

      {open && (tooShort || loading || suggestions.length > 0) ? (
        <ul
          id="character-suggestions"
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-line-strong bg-raised shadow-lg"
        >
          {tooShort ? (
            <li className="px-3 py-2 text-center text-xs text-ink-faint">
              Enter at least {MIN_TERM} characters to search
            </li>
          ) : suggestions.length === 0 && loading ? (
            <li className="px-3 py-2 text-center text-xs text-ink-faint">Searching…</li>
          ) : (
            suggestions.map((s, i) => (
              <li key={`${s.region}-${s.realmSlug}-${s.name}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(s)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    i === highlight ? 'bg-surface' : ''
                  }`}
                >
                  {s.thumbnail ? (
                    <img
                      src={s.thumbnail}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-sm object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="h-8 w-8 shrink-0 rounded-sm bg-inset" />
                  )}

                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-item"
                      style={{ color: FACTION_COLOUR[s.faction] ?? 'var(--color-ink)' }}
                    >
                      {s.name}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {s.regionLabel} · {s.realm}
                      {s.className ? ` · ${s.className}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
