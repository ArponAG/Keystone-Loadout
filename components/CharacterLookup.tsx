'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { CharacterSearch } from '@/components/CharacterSearch';
import { SavedCharacters } from '@/components/SavedCharacters';
import { MythicPlusProgression, TalentBuildSection } from '@/components/CharacterSections';
import { NextUpgrades } from '@/components/NextUpgrades';
import { WowIcon } from '@/components/WowIcon';
import { Banner } from '@/components/ui';
import { ago, realmLabel } from '@/lib/domain/format';
import { classColor, slugIconUrl, wowheadItemUrl } from '@/lib/domain/icons';
import {
  characterKey,
  readSaved,
  removeCharacter,
  saveCharacter,
  type SavedCharacter,
} from '@/lib/saved-characters';
import type { GearAudit, SlotAudit } from '@/lib/domain/gear-audit';
import type { Recommendations } from '@/lib/domain/recommend';
import type { SecondaryKey } from '@/lib/domain/stats';
import type { ResolvedBuild } from '@/lib/raiderio/recommend-for-character';
import type { CharacterProfile, MythicPlus, TalentBuild } from '@/lib/raiderio/character';

/** Raider.IO returns gear keyed by slot name, in no particular order. */
const SLOT_ORDER = [
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist',
  'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2',
  'trinket1', 'trinket2', 'mainhand', 'offhand',
];

const QUALITY_BY_INDEX = ['POOR', 'COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'ARTIFACT', 'HEIRLOOM'];

type Response = {
  profile: CharacterProfile;
  talents: TalentBuild | null;
  mythicPlus: MythicPlus | null;
  audit: GearAudit;
  build: ResolvedBuild;
  recommendations: Recommendations | null;
  cachedAt: number;
  stale: boolean;
  normalised: { region: string; realm: string; name: string };
};

/** Separator between the header's metadata fragments. */
function Dot() {
  return <span className="text-line-strong">·</span>;
}

export function CharacterLookup() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Response | null>(null);
  const [saved, setSaved] = useState<SavedCharacter[]>([]);
  const [order, setOrder] = useState<SecondaryKey[]>(['haste', 'crit', 'mastery', 'vers']);
  const [lastQuery, setLastQuery] = useState<{ region: string; realm: string; name: string } | null>(null);

  // Pinned characters live in localStorage, not the database — see lib/saved-characters.ts.
  // Loaded in an effect because localStorage does not exist during server rendering.
  useEffect(() => {
    setSaved(readSaved());

    // Direct URL entry — /character?region=eu&realm=turalyon&name=Foo. This is the way
    // in when the typeahead cannot find someone, now that there is no manual form.
    const r = searchParams.get('region') ?? 'us';
    const rm = searchParams.get('realm');
    const n = searchParams.get('name');
    if (rm && n) void lookup({ region: r, realm: rm, name: n });
  }, [searchParams]);

  const activeKey = data
    ? characterKey(data.normalised.region, data.normalised.realm, data.normalised.name)
    : null;
  const isSaved = saved.some((c) => c.cacheKey === activeKey);

  async function lookup(
    q: { region: string; realm: string; name: string },
    nextOrder?: SecondaryKey[],
  ) {
    setLoading(true);
    setError(null);
    setLastQuery(q);

    try {
      const query = new URLSearchParams({ ...q, order: (nextOrder ?? order).join(',') });
      const res = await fetch(`/api/character?${query}`);
      const body = await res.json();

      if (!res.ok) {
        setError(body.error ?? `Lookup failed (${res.status}).`);
        setData(null);
      } else {
        setData(body as Response);
      }
    } catch {
      setError('Could not reach the lookup route.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  function onPick(pick: { region: string; realm: string; name: string }) {
    void lookup(pick);
  }

  function toggleSave() {
    if (!data || !activeKey) return;

    setSaved(
      isSaved
        ? removeCharacter(activeKey)
        : saveCharacter({
            cacheKey: activeKey,
            ...data.normalised,
            className: data.profile.class,
            specName: data.profile.active_spec_name,
            faction: data.profile.faction,
            thumbnail: data.profile.thumbnail_url,
            itemLevel: Math.round(data.profile.gear?.item_level_equipped ?? 0),
            mplusScore: data.mythicPlus ? Math.round(data.mythicPlus.score) : null,
          }),
    );
  }

  return (
    <>
      <SavedCharacters
        saved={saved}
        activeKey={activeKey}
        onPick={(c) => void lookup({ region: c.region, realm: c.realm, name: c.name })}
        onRemove={(c) => setSaved(removeCharacter(c.cacheKey))}
      />

      <CharacterSearch onPick={onPick} busy={loading} />

      {error ? (
        <Banner variant="error">{error}</Banner>
      ) : data ? (
        <Profile
          data={data}
          isSaved={isSaved}
          onToggleSave={toggleSave}
          order={order}
          onReorder={(next) => {
            setOrder(next);
            if (lastQuery) void lookup(lastQuery, next);
          }}
        />
      ) : null}
    </>
  );
}

function Profile({
  data,
  isSaved,
  onToggleSave,
  order,
  onReorder,
}: {
  data: Response;
  isSaved: boolean;
  onToggleSave: () => void;
  order: SecondaryKey[];
  onReorder: (next: SecondaryKey[]) => void;
}) {
  const { profile } = data;
  const scores = profile.mythic_plus_scores_by_season?.[0]?.scores;
  const items = profile.gear?.items ?? {};

  return (
    <div className="space-y-8">
      {data.stale ? (
        <Banner variant="warn">
          Raider.IO is unreachable — showing data cached {ago(data.cachedAt)}.
        </Banner>
      ) : null}

      {/* Character Hero Summary Card */}
      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface/90 p-5 shadow-xs">
        {profile.thumbnail_url ? (
          <img
            src={profile.thumbnail_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-xl object-cover"
            loading="lazy"
          />
        ) : null}

        <div className="min-w-0">
          {/* The name takes the class colour, as it does in the saved rail and the search
              results. It also makes the spec/class label beside it a caption rather than
              the only place the class is stated. */}
          <h2 className="text-h1 font-bold" style={{ color: classColor(profile.class) }}>
            <a
              href={profile.profile_url}
              target="_blank"
              rel="noreferrer"
              className="transition-opacity hover:opacity-80"
            >
              {profile.name}
            </a>
          </h2>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
            <span className="font-medium text-ink">
              {profile.active_spec_name} {profile.class}
            </span>
            <Dot />
            <span>{profile.race}</span>
            <Dot />
            <span>
              {realmLabel(data.normalised.realm)} ({data.normalised.region.toUpperCase()})
            </span>
            {/* Cache age lives here rather than in its own strip below the card: it is a
                footnote about this character, not a section of the page. The Raider.IO
                crawl timestamp that used to sit beside it said nothing actionable. */}
            <Dot />
            <span className="text-ink-faint">
              {data.stale ? 'stale, cached' : 'cached'} {ago(data.cachedAt)}
            </span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-6">
          <Stat label="Item level" value={Math.round(profile.gear?.item_level_equipped ?? 0)} />
          <Stat
            label="M+ score"
            value={scores?.all != null ? Math.round(scores.all) : '—'}
            color={data.mythicPlus?.colour}
          />
          {/*
            Icon only, so state has to be carried by the icon itself: a hollow bookmark
            is an invitation, a filled one is a fact. aria-pressed and aria-label do the
            work the removed label used to, since a lone glyph names nothing.
          */}
          <button
            type="button"
            onClick={onToggleSave}
            aria-pressed={isSaved}
            aria-label={isSaved ? `Unpin ${profile.name}` : `Pin ${profile.name}`}
            title={isSaved ? 'Unpin this character' : 'Pin this character'}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors ${
              isSaved
                ? 'bg-accent-muted/40 text-accent hover:bg-accent-muted/60'
                : 'text-ink-faint hover:bg-raised hover:text-accent'
            }`}
          >
            <svg
              className="h-[18px] w-[18px] transition-transform active:scale-90"
              viewBox="0 0 24 24"
              fill={isSaved ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 1. Equipped Gear Section */}
      <section className="space-y-4">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-2.5">
            <div className="flex items-baseline gap-3">
              <h3 className="text-h2 font-semibold text-ink">Equipped Gear</h3>
              <span className="text-sm text-ink-faint">
                Average <span className="tabular font-medium text-ink">{data.audit.averageItemLevel}</span>
                {data.audit.target ? (
                  <>
                    {' · +'}
                    {data.audit.target.keyLevel} keys award{' '}
                    <span className="tabular font-medium text-ink">{data.audit.target.vaultItemLevel}</span> in Vault
                    {data.audit.target.cappedAt ? ` (max +${data.audit.target.cappedAt})` : ''}
                  </>
                ) : null}
              </span>
            </div>

            {data.audit.target && data.audit.belowVaultCount > 0 ? (
              <span className="text-xs font-medium text-stale">
                {data.audit.belowVaultCount} slot{data.audit.belowVaultCount > 1 ? 's' : ''} below current key vault reward
              </span>
            ) : null}
          </div>
          <div className="h-px w-full bg-gradient-to-r from-accent/20 via-line/20 to-transparent" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SLOT_ORDER.filter((slot) => items[slot]).map((slot) => {
            const item = items[slot];
            const slotAudit = data.audit.slots.find((s) => s.slot === slot);
            const qualityName = QUALITY_BY_INDEX[item.item_quality] ?? null;

            return (
              <div
                key={slot}
                className="group flex items-center gap-3.5 rounded-xl border border-line bg-surface/80 p-2.5 transition-colors hover:border-line-strong hover:bg-raised"
                style={
                  slotAudit?.verdict === 'weak'
                    ? { borderColor: 'color-mix(in srgb, var(--color-stale) 40%, transparent)' }
                    : undefined
                }
              >
                <WowIcon
                  src={slugIconUrl(item.icon)}
                  size={38}
                  quality={qualityName}
                  rounded="md"
                />
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium tracking-wider text-ink-faint uppercase">
                    {slot.replace(/(\d+)$/, ' $1')}
                  </span>
                  <a
                    href={wowheadItemUrl(item.item_id, item)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-item font-semibold text-ink group-hover:text-accent transition-colors"
                  >
                    {item.name}
                  </a>
                  {item.enchants_detail?.length ? (
                    <span
                      className="block truncate text-xs text-fit-90"
                      title={item.enchants_detail.map((e) => e.name).join(', ')}
                    >
                      {item.enchants_detail
                        // "Enchant Weapon - Berserker's Rage" is mostly prefix. The slot
                        // is already the row label, so only the enchant name is new.
                        .map((e) => e.name.replace(/^Enchant\s+\w+\s+-\s+/, ''))
                        .join(', ')}
                    </span>
                  ) : null}
                </div>
                <SlotStanding audit={slotAudit} itemLevel={item.item_level} />
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. What to Get Next Section */}
      {data.recommendations ? (
        <NextUpgrades
          recommendations={data.recommendations}
          build={data.build}
          order={order}
          onReorder={onReorder}
        />
      ) : null}

      {/* 3. Mythic+ Progression Section */}
      {data.mythicPlus ? (
        <MythicPlusProgression mplus={data.mythicPlus} role={profile.active_spec_role} />
      ) : null}

      {/* 4. Talent Build Section */}
      {data.talents ? (
        <TalentBuildSection build={data.talents} spec={`${profile.active_spec_name} ${profile.class}`} />
      ) : null}

      {/* 5. Raid Progression Section */}
      {profile.raid_progression ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-h2 font-semibold text-ink pb-2.5">Raid Progression</h3>
            <div className="h-px w-full bg-gradient-to-r from-accent/20 via-line/20 to-transparent" />
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-surface/80">
            <table className="w-full min-w-[28rem] text-left">
              <tbody>
                {Object.entries(profile.raid_progression).map(([raid, progress]) => (
                  <tr key={raid} className="border-b border-line last:border-0 hover:bg-raised transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-ink">
                      {raid.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right text-sm text-ink-soft font-mono">
                      {progress.summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="text-right">
      <div className="tabular text-h1 font-bold text-ink" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">{label}</div>
    </div>
  );
}

function SlotStanding({ audit, itemLevel }: { audit?: SlotAudit; itemLevel: number }) {
  const colour =
    audit?.verdict === 'weak'
      ? 'var(--color-stale)'
      : audit?.verdict === 'strong'
        ? 'var(--color-ok)'
        : 'var(--color-ink-soft)';

  return (
    <span className="flex shrink-0 items-center gap-2">
      {audit?.belowVault ? (
        <span
          className="tabular rounded-md px-1.5 py-0.5 text-xs font-semibold"
          style={{
            color: 'var(--color-stale)',
            backgroundColor: 'color-mix(in srgb, var(--color-stale) 15%, transparent)',
          }}
          title={`${audit.belowVault} below the vault reward for your key level`}
        >
          −{audit.belowVault}
        </span>
      ) : null}
      <span
        className="tabular text-num font-bold"
        style={{ color: colour }}
        title={
          audit && audit.verdict !== 'unjudged'
            ? `${audit.vsAverage >= 0 ? '+' : ''}${audit.vsAverage} vs your average`
            : 'Not judged by item level'
        }
      >
        {itemLevel}
      </span>
    </span>
  );
}
