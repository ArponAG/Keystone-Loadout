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
import { formatTrack, trackColor, type UpgradeTrack } from '@/lib/domain/upgrade-track';
import {
  characterKey,
  readSaved,
  removeCharacter,
  saveCharacter,
  type SavedCharacter,
} from '@/lib/saved-characters';
import type { GearAudit, SlotAudit } from '@/lib/domain/gear-audit';
// One statement, not a value import plus a separate `import type` from the same module:
// the bundler collapses the pair, keeps the type-only marker, and elides the value —
// which typechecks cleanly and then throws ReferenceError in the browser.
import { DEFAULT_PER_SLOT, type Recommendations } from '@/lib/domain/recommend';
import type { SecondaryKey } from '@/lib/domain/stats';
import type { LootSource, ResolvedBuild } from '@/lib/raiderio/recommend-for-character';
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
  /** Upgrade track per slot, resolved server-side from bonus ids. */
  tracks?: Record<string, UpgradeTrack | null>;
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
  // Recommendation shape lives here rather than in NextUpgrades: changing either one
  // re-queries the server, so they belong with the other lookup parameters.
  const [perSlot, setPerSlot] = useState<number>(DEFAULT_PER_SLOT);
  const [source, setSource] = useState<LootSource>('all');
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
    overrides?: { order?: SecondaryKey[]; perSlot?: number; source?: LootSource },
  ) {
    setLoading(true);
    setError(null);
    setLastQuery(q);

    try {
      const query = new URLSearchParams({
        ...q,
        order: (overrides?.order ?? order).join(','),
        perSlot: String(overrides?.perSlot ?? perSlot),
        source: overrides?.source ?? source,
      });
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
            if (lastQuery) void lookup(lastQuery, { order: next });
          }}
          perSlot={perSlot}
          onPerSlot={(n) => {
            setPerSlot(n);
            if (lastQuery) void lookup(lastQuery, { perSlot: n });
          }}
          source={source}
          onSource={(v) => {
            setSource(v);
            if (lastQuery) void lookup(lastQuery, { source: v });
          }}
          busy={loading}
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
  perSlot,
  onPerSlot,
  source,
  onSource,
  busy,
}: {
  data: Response;
  isSaved: boolean;
  onToggleSave: () => void;
  order: SecondaryKey[];
  onReorder: (next: SecondaryKey[]) => void;
  perSlot: number;
  onPerSlot: (n: number) => void;
  source: LootSource;
  onSource: (v: LootSource) => void;
  busy: boolean;
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
      <section>
        {/*
          The three numbers that used to be a run-on sentence ("Average 304 · +8 keys
          award 315 in Vault … 10 slots below current key vault reward") are now a stat
          strip. They are the same three numbers, but as figures they can be compared at
          a glance — which is the entire question this section answers.
        */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <h3 className="text-h2 font-semibold text-ink">Equipped Gear</h3>

          <div className="flex flex-wrap items-center gap-2">
            <GearStat value={data.audit.averageItemLevel} label="Average ilvl" />
            {data.audit.target ? (
              <GearStat
                value={data.audit.target.vaultItemLevel}
                label={`Vault at +${data.audit.target.keyLevel}`}
                title={
                  data.audit.target.cappedAt
                    ? `Vault rewards cap at +${data.audit.target.cappedAt}`
                    : undefined
                }
              />
            ) : null}
            {data.audit.target && data.audit.belowVaultCount > 0 ? (
              <GearStat
                value={data.audit.belowVaultCount}
                label={`Slot${data.audit.belowVaultCount > 1 ? 's' : ''} below vault`}
                tone="var(--color-stale)"
              />
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {SLOT_ORDER.filter((slot) => items[slot]).map((slot) => {
            const item = items[slot];
            const slotAudit = data.audit.slots.find((s) => s.slot === slot);
            const qualityName = QUALITY_BY_INDEX[item.item_quality] ?? null;
            const track = data.tracks?.[slot] ?? null;
            const weak = slotAudit?.verdict === 'weak';

            return (
              <div
                key={slot}
                /*
                  A weak slot is tinted rather than outlined. The amber border it used to
                  get drew a hard box around the very rows the eye should be able to sweep
                  past — and with the softer line tokens it had become the loudest edge on
                  the page. Fill marks the row without fencing it off.
                */
                className={`group flex items-center gap-3 rounded-xl p-2.5 transition-colors ${
                  weak ? 'bg-stale/8 hover:bg-stale/12' : 'bg-surface/70 hover:bg-raised'
                }`}
              >
                <WowIcon src={slugIconUrl(item.icon)} size={40} quality={qualityName} rounded="md" />

                <div className="min-w-0 flex-1">
                  <span className="block text-[10px] leading-none font-medium tracking-wider text-ink-faint uppercase">
                    {slot.replace(/(\d+)$/, ' $1')}
                  </span>
                  <a
                    href={wowheadItemUrl(item.item_id, item)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-item font-semibold text-ink transition-colors group-hover:text-accent"
                  >
                    {item.name}
                  </a>
                  {item.enchants_detail?.length ? (
                    <span
                      className="mt-0.5 block truncate text-xs text-fit-90"
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

                <SlotStanding audit={slotAudit} itemLevel={item.item_level} track={track} />
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
          perSlot={perSlot}
          onPerSlot={onPerSlot}
          source={source}
          onSource={onSource}
          busy={busy}
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

function SlotStanding({
  audit,
  itemLevel,
  track,
}: {
  audit?: SlotAudit;
  itemLevel: number;
  track: UpgradeTrack | null;
}) {
  const colour =
    audit?.verdict === 'weak'
      ? 'var(--color-stale)'
      : audit?.verdict === 'strong'
        ? 'var(--color-ok)'
        : 'var(--color-ink-soft)';

  const maxed = track ? track.rank >= track.maxRank : false;
  const remaining = track ? track.maxRank - track.rank : 0;
  const trackTone = track ? trackColor(track.track) : 'var(--color-ink-faint)';

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <span className="flex items-center gap-2">
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

      {/*
        The track badge sits under the item level because it explains it: 308 means
        something different on a Champion 6/6 than on a Hero 2/6. Track and rank are one
        badge, since "Hero" without "2/6" hides the half that says what to do next.

        The pills carry a 22% tint rather than a whisper of one. At 14% only the
        brightest track read as a badge at all and the rest looked like loose text, so
        the same component appeared to be two different designs down the column.
      */}
      {track ? (
        <span
          className="flex items-center gap-1.5 rounded-md py-0.5 pr-1.5 pl-2 text-[10px] leading-none font-semibold tracking-wide"
          style={{
            color: trackTone,
            backgroundColor: `color-mix(in srgb, ${trackTone} 22%, transparent)`,
          }}
          title={
            maxed
              ? `${formatTrack(track)} — fully upgraded`
              : `${formatTrack(track)} — ${remaining} upgrade${remaining > 1 ? 's' : ''} still available`
          }
        >
          {track.track}
          {/* Dimmed rather than full-strength: the rank qualifies the track name, so it
              should read as a suffix and not compete with it. */}
          <span className="tabular opacity-75">
            {track.rank}/{track.maxRank}
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** One figure in the Equipped Gear summary strip. */
function GearStat({
  value,
  label,
  tone,
  title,
}: {
  value: number;
  label: string;
  tone?: string;
  title?: string;
}) {
  return (
    <span
      className="flex items-baseline gap-1.5 rounded-lg bg-surface/70 px-2.5 py-1.5"
      title={title}
    >
      <span className="tabular text-sm font-bold" style={{ color: tone ?? 'var(--color-ink)' }}>
        {value}
      </span>
      <span className="text-[11px] text-ink-faint">{label}</span>
    </span>
  );
}
