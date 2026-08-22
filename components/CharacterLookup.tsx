'use client';

import { useCallback, useEffect, useState } from 'react';

import { CharacterSearch } from '@/components/CharacterSearch';
import { SavedCharacters } from '@/components/SavedCharacters';
import { MythicPlusProgression, TalentBuildSection } from '@/components/CharacterSections';
import { WowIcon } from '@/components/WowIcon';
import { Banner } from '@/components/ui';
import { slugIconUrl } from '@/lib/domain/icons';
import type { SavedCharacter } from '@/app/api/character/saved/route';
import type { GearAudit, SlotAudit } from '@/lib/domain/gear-audit';
import type { CharacterProfile, MythicPlus, TalentBuild } from '@/lib/raiderio/character';

const REGIONS = ['us', 'eu', 'tw', 'kr'] as const;

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
  cachedAt: number;
  stale: boolean;
  normalised: { region: string; realm: string; name: string };
};

function ago(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)} min ago`;
  return `${Math.floor(d / 3_600_000)} h ago`;
}

export function CharacterLookup() {
  const [region, setRegion] = useState('us');
  const [realm, setRealm] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Response | null>(null);
  const [saved, setSaved] = useState<SavedCharacter[]>([]);

  const refreshSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/character/saved');
      const body = await res.json();
      setSaved(body.saved ?? []);
    } catch {
      // A missing saved list is not worth an error state; the lookup still works.
    }
  }, []);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  const activeKey = data
    ? `${data.normalised.region}:${data.normalised.realm}:${data.normalised.name}`.toLowerCase()
    : null;
  const isSaved = saved.some((c) => c.cacheKey === activeKey);

  async function toggleSave() {
    if (!data) return;

    if (isSaved && activeKey) {
      await fetch(`/api/character/saved?key=${encodeURIComponent(activeKey)}`, { method: 'DELETE' });
    } else {
      await fetch('/api/character/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data.normalised,
          className: data.profile.class,
          specName: data.profile.active_spec_name,
          faction: data.profile.faction,
          thumbnail: data.profile.thumbnail_url,
          itemLevel: Math.round(data.profile.gear?.item_level_equipped ?? 0),
          mplusScore: data.mythicPlus ? Math.round(data.mythicPlus.score) : null,
        }),
      });
    }
    await refreshSaved();
  }

  async function removeSaved(character: SavedCharacter) {
    await fetch(`/api/character/saved?key=${encodeURIComponent(character.cacheKey)}`, {
      method: 'DELETE',
    });
    await refreshSaved();
  }

  async function lookup(q: { region: string; realm: string; name: string }) {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams(q);
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

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void lookup({ region, realm, name });
  }

  /** Picking a suggestion fills the manual fields and looks the character up at once. */
  function onPick(pick: { region: string; realm: string; name: string }) {
    setRegion(pick.region);
    setRealm(pick.realm);
    setName(pick.name);
    void lookup(pick);
  }

  return (
    <>
      <SavedCharacters
        saved={saved}
        activeKey={activeKey}
        onPick={(c) => void lookup({ region: c.region, realm: c.realm, name: c.name })}
        onRemove={(c) => void removeSaved(c)}
      />

      <div className="mb-3 rounded-lg border border-line bg-surface p-4">
        <CharacterSearch onPick={onPick} />
      </div>

      <details className="mb-6 rounded-lg border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-2 text-sm text-ink-soft hover:text-ink">
          Or enter realm and name manually
        </summary>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3 border-t border-line p-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-ink-faint uppercase">Region</span>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-md border border-line-strong bg-inset px-2 py-1.5 text-sm text-ink"
          >
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-ink-faint uppercase">Realm</span>
          <input
            value={realm}
            onChange={(e) => setRealm(e.target.value)}
            placeholder="moon-guard"
            required
            className="rounded-md border border-line-strong bg-inset px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs tracking-wide text-ink-faint uppercase">Character</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bjornzerker"
            required
            className="rounded-md border border-line-strong bg-inset px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md border border-accent bg-accent-muted/40 px-3 py-1.5 text-sm text-accent transition-colors hover:bg-accent-muted/60 disabled:opacity-50"
        >
          {loading ? 'Looking up…' : 'Look up'}
        </button>

          <p className="w-full text-xs text-ink-faint">
            Realm must be a slug — spaces and apostrophes become hyphens. “Moon Guard” →{' '}
            <code className="font-mono">moon-guard</code>.
          </p>
        </form>
      </details>

      {error ? (
        <Banner variant="error">{error}</Banner>
      ) : data ? (
        <Profile data={data} isSaved={isSaved} onToggleSave={() => void toggleSave()} />
      ) : null}
    </>
  );
}

function Profile({
  data,
  isSaved,
  onToggleSave,
}: {
  data: Response;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const { profile } = data;
  const scores = profile.mythic_plus_scores_by_season?.[0]?.scores;
  const items = profile.gear?.items ?? {};

  return (
    <div className="space-y-6">
      {data.stale ? (
        <Banner variant="warn">
          Raider.IO is unreachable — showing data cached {ago(data.cachedAt)}.
        </Banner>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line bg-surface p-4">
        {profile.thumbnail_url ? (
          <img
            src={profile.thumbnail_url}
            alt=""
            className="h-16 w-16 rounded-lg object-cover"
            loading="lazy"
          />
        ) : null}

        <div className="min-w-0">
          <h2 className="text-h1 text-ink">
            <a
              href={profile.profile_url}
              target="_blank"
              rel="noreferrer"
              className="hover:text-accent"
            >
              {profile.name}
            </a>
          </h2>
          <p className="text-sm text-ink-soft">
            {profile.race} {profile.active_spec_name} {profile.class} ·{' '}
            {data.normalised.realm} ({data.normalised.region.toUpperCase()})
          </p>
        </div>

        <div className="ml-auto flex items-center gap-6">
          <Stat label="Item level" value={Math.round(profile.gear?.item_level_equipped ?? 0)} />
          <Stat label="M+ score" value={scores?.all != null ? Math.round(scores.all) : '—'} />
          <button
            type="button"
            onClick={onToggleSave}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
              isSaved
                ? 'border-accent bg-accent-muted/40 text-accent'
                : 'border-line-strong bg-raised text-ink-soft hover:border-accent hover:text-accent'
            }`}
            title={isSaved ? 'Remove from saved characters' : 'Pin this character'}
          >
            {isSaved ? '★ Saved' : '☆ Save'}
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        {data.stale ? 'Stale' : 'Cached'} {ago(data.cachedAt)} · Raider.IO last crawled{' '}
        {profile.last_crawled_at?.slice(0, 16).replace('T', ' ')}
      </p>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-h2 text-ink">Equipped gear</h3>
          <span className="text-sm text-ink-faint">
            average <span className="tabular text-ink-soft">{data.audit.averageItemLevel}</span>
            {data.audit.target ? (
              <>
                {' · +'}
                {data.audit.target.keyLevel} keys award{' '}
                <span className="tabular text-ink-soft">{data.audit.target.vaultItemLevel}</span> in
                the vault
                {data.audit.target.cappedAt ? ` (capped at +${data.audit.target.cappedAt})` : ''}
              </>
            ) : null}
          </span>
        </div>

        <p className="mb-3 text-xs text-ink-faint">
          {data.audit.target ? (
            <>
              <strong className="text-ink-soft">{data.audit.belowVaultCount}</strong> slots are
              below what your keys already award.{' '}
            </>
          ) : null}
          Trinkets and weapons are not judged — their value is dominated by procs and weapon
          damage, which item level does not capture.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          {SLOT_ORDER.filter((slot) => items[slot]).map((slot) => {
            const item = items[slot];
            const slotAudit = data.audit.slots.find((s) => s.slot === slot);
            return (
              <div
                key={slot}
                className="flex items-center gap-3 rounded-md border border-line bg-surface p-2"
                style={
                  slotAudit?.verdict === 'weak'
                    ? { borderColor: 'color-mix(in srgb, var(--color-stale) 45%, transparent)' }
                    : undefined
                }
              >
                <WowIcon
                  src={slugIconUrl(item.icon)}
                  size={36}
                  quality={QUALITY_BY_INDEX[item.item_quality] ?? null}
                  rounded="sm"
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={`https://www.wowhead.com/item=${item.item_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-item text-ink hover:text-accent"
                  >
                    {item.name}
                  </a>
                  <span className="text-xs text-ink-faint">{slot}</span>
                </div>
                <SlotStanding audit={slotAudit} itemLevel={item.item_level} />
              </div>
            );
          })}
        </div>
      </section>

      {data.mythicPlus ? (
        <MythicPlusProgression mplus={data.mythicPlus} role={profile.active_spec_role} />
      ) : null}

      {data.talents ? (
        <TalentBuildSection build={data.talents} spec={`${profile.active_spec_name} ${profile.class}`} />
      ) : null}

      {profile.raid_progression ? (
        <section>
          <h3 className="mb-3 text-h2 text-ink">Raid progression</h3>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full min-w-[28rem] text-left">
              <tbody>
                {Object.entries(profile.raid_progression).map(([raid, progress]) => (
                  <tr key={raid} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 text-sm text-ink">
                      {raid.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    <td className="tabular px-4 py-2 text-right text-sm text-ink-soft">
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-right">
      <div className="tabular text-h1 text-ink">{value}</div>
      <div className="text-xs tracking-wide text-ink-faint uppercase">{label}</div>
    </div>
  );
}

/**
 * Item level plus how the slot stands.
 *
 * Two signals, kept visually distinct: colour is RELATIVE (versus this character's own
 * average) and the "−N" chip is ABSOLUTE (versus the vault reward their keys already
 * award). Unjudged slots show a plain number and no judgement at all.
 */
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
          className="tabular rounded-sm px-1.5 py-0.5 text-xs"
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
        className="tabular text-num"
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
