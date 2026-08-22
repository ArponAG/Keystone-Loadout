'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { SecondaryRanker } from '@/components/SecondaryRanker';
import {
  ARMOR_TYPES,
  PRIMARIES,
  buildToQuery,
  type Scope,
} from '@/lib/domain/build';
import type { Build } from '@/lib/domain/filters';
import { ARMOR_TYPE_LABEL } from '@/lib/domain/slots';
import { PRIMARY_LABEL } from '@/lib/domain/stats';

/**
 * Writes the build into the URL rather than into React state — see lib/domain/build.ts.
 * Secondary ranking lives in <SecondaryRanker>, which supports both dragging and
 * keyboard-operable arrows.
 */
export function BuildForm({ build, scope }: { build: Build; scope: Scope }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: Build, nextScope: Scope = scope) {
    startTransition(() => {
      router.push(`/gear?${buildToQuery(next, nextScope)}`, { scroll: false });
    });
  }

  return (
    <div
      className={`rounded-lg border border-line bg-surface p-4 transition-opacity ${pending ? 'opacity-60' : ''}`}
    >
      <div className="grid gap-6 md:grid-cols-3">
        {/* --- armor type --- */}
        <fieldset>
          <legend className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
            Armor type
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {ARMOR_TYPES.map((type) => (
              <Choice
                key={type}
                selected={build.armorType === type}
                onClick={() => apply({ ...build, armorType: type })}
              >
                {ARMOR_TYPE_LABEL[type]}
              </Choice>
            ))}
          </div>
        </fieldset>

        {/* --- primary --- */}
        <fieldset>
          <legend className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
            Primary stat
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PRIMARIES.map((primary) => (
              <Choice
                key={primary}
                selected={build.primary === primary}
                onClick={() => apply({ ...build, primary })}
              >
                {PRIMARY_LABEL[primary]}
              </Choice>
            ))}
          </div>
        </fieldset>

        {/* --- secondary ranking --- */}
        <fieldset>
          <legend className="mb-2 text-xs tracking-wide text-ink-faint uppercase">
            Secondaries, best first
          </legend>
          <SecondaryRanker
            order={build.secondaryOrder}
            onChange={(secondaryOrder) => apply({ ...build, secondaryOrder })}
            disabled={pending}
          />
        </fieldset>
      </div>

      {/* --- scope --- */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <span className="text-xs tracking-wide text-ink-faint uppercase">Compare</span>
        <Choice selected={scope === 'rotation'} onClick={() => apply(build, 'rotation')}>
          M+ rotation only
        </Choice>
        <Choice selected={scope === 'all'} onClick={() => apply(build, 'all')}>
          Everything synced
        </Choice>
        <span className="text-xs text-ink-faint">
          {scope === 'rotation'
            ? 'Same tier, so items are directly comparable.'
            : 'Mixes dungeon and raid tiers — ilvl differs, compare with care.'}
        </span>
      </div>
    </div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-md border px-2.5 py-1 text-sm transition-colors ${
        selected
          ? 'border-accent bg-accent-muted/40 text-accent'
          : 'border-line-strong bg-raised text-ink-soft hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
