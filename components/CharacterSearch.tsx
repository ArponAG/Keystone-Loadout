'use client';

import { useEffect, useRef, useState } from 'react';

import { realmLabel } from '@/lib/domain/format';
import { classColor } from '@/lib/domain/icons';
import type { Suggestion } from '@/app/api/character/search/route';

const MIN_TERM = 2;
const DEBOUNCE_MS = 250;

/**
 * Typeahead over Raider.IO's character search — the only way into a profile, so it owns
 * its own framing rather than sitting inside a generic card.
 *
 * The search endpoint is undocumented (see the route handler), so a failure has to be
 * survivable: the dropdown stays empty and says so rather than throwing. A character can
 * still be reached directly by URL — /character?region=eu&realm=turalyon&name=Foo.
 */
export function CharacterSearch({
  onPick,
  busy,
}: {
  onPick: (pick: { region: string; realm: string; name: string }) => void;
  /** A profile lookup is in flight. Without this the whole page looks inert after a pick. */
  busy?: boolean;
}) {
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch. Every keystroke aborts the previous request so a slow response
  // for "ni" can never overwrite the results for "niina".
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM) {
      setSuggestions([]);
      setLoading(false);
      setFailed(false);
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
        setFailed(false);
        setHighlight(-1);
      } catch (err) {
        // An abort is the normal path on every keystroke, not a failure worth reporting.
        if ((err as Error)?.name !== 'AbortError') setFailed(true);
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

  function clear() {
    setTerm('');
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
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
    }
  }

  const trimmed = term.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_TERM;
  const empty = !loading && !failed && trimmed.length >= MIN_TERM && suggestions.length === 0;
  const showPanel = open && (tooShort || loading || failed || empty || suggestions.length > 0);

  return (
    <div ref={boxRef} className="relative mb-6">
      <div
        className={`flex items-center gap-3 rounded-xl border bg-surface/70 px-4 transition-colors ${
          open ? 'border-line-strong' : 'border-line hover:border-line-strong'
        }`}
      >
        <SearchIcon />

        <input
          ref={inputRef}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for a character…"
          aria-label="Search for a character"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="character-suggestions"
          className="w-full bg-transparent py-3.5 text-base text-ink outline-none placeholder:text-ink-faint"
        />

        {/* One slot, three states: loading a profile, loading suggestions, or offering
            to clear. They are mutually exclusive, so the input never changes width. */}
        <span className="grid h-5 w-5 shrink-0 place-items-center">
          {busy || loading ? (
            <Spinner />
          ) : term ? (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear search"
              title="Clear"
              className="grid h-5 w-5 place-items-center rounded-full text-ink-faint transition-colors hover:bg-raised hover:text-ink"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </span>
      </div>

      {showPanel ? (
        <ul
          id="character-suggestions"
          role="listbox"
          className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-lg"
        >
          {tooShort ? (
            <Note>Keep typing — {MIN_TERM} characters minimum</Note>
          ) : failed ? (
            <Note>Search is unavailable right now. Try again in a moment.</Note>
          ) : suggestions.length === 0 && loading ? (
            <Note>Searching…</Note>
          ) : empty ? (
            <Note>No characters match “{trimmed}”.</Note>
          ) : (
            suggestions.map((s, i) => (
              <li key={`${s.region}-${s.realmSlug}-${s.name}`} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(s)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${
                    i === highlight ? 'bg-surface' : ''
                  }`}
                >
                  {s.thumbnail ? (
                    <img
                      src={s.thumbnail}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-inset text-sm font-semibold"
                      style={{ color: classColor(s.className) }}
                      aria-hidden="true"
                    >
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    {/* Class-coloured, same as the saved rail — one visual language for
                        "this is a character" everywhere in the app. */}
                    <span
                      className="block truncate text-item font-semibold"
                      style={{ color: classColor(s.className) }}
                    >
                      {s.name}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">
                      {realmLabel(s.realm)} · {s.regionLabel}
                    </span>
                  </span>

                  {s.className ? (
                    <span className="shrink-0 text-xs text-ink-faint">{s.className}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-2.5 text-center text-xs text-ink-faint">{children}</li>;
}

function SearchIcon() {
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 text-ink-faint"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-accent" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.25" />
      <path
        d="M21 12a9 9 0 00-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
