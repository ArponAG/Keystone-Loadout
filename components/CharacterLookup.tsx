'use client';

import { useState } from 'react';

import { WowIcon } from '@/components/WowIcon';
import { Banner } from '@/components/ui';
import { slugIconUrl } from '@/lib/domain/icons';
import type { CharacterProfile } from '@/lib/raiderio/character';

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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ region, realm, name });
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

  return (
    <>
      <form
        onSubmit={submit}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4"
      >
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

      {error ? (
        <Banner variant="error">{error}</Banner>
      ) : data ? (
        <Profile data={data} />
      ) : null}
    </>
  );
}

function Profile({ data }: { data: Response }) {
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

        <div className="ml-auto flex gap-6">
          <Stat label="Item level" value={Math.round(profile.gear?.item_level_equipped ?? 0)} />
          <Stat label="M+ score" value={scores?.all != null ? Math.round(scores.all) : '—'} />
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        {data.stale ? 'Stale' : 'Cached'} {ago(data.cachedAt)} · Raider.IO last crawled{' '}
        {profile.last_crawled_at?.slice(0, 16).replace('T', ' ')}
      </p>

      <section>
        <h3 className="mb-3 text-h2 text-ink">Equipped gear</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {SLOT_ORDER.filter((slot) => items[slot]).map((slot) => {
            const item = items[slot];
            return (
              <div
                key={slot}
                className="flex items-center gap-3 rounded-md border border-line bg-surface p-2"
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
                <span className="tabular text-num text-ink-soft">{item.item_level}</span>
              </div>
            );
          })}
        </div>
      </section>

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
