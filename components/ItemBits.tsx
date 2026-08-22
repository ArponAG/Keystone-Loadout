import { WowIcon } from '@/components/WowIcon';
import { itemIconUrl, qualityColor, wowheadItemUrl } from '@/lib/domain/icons';
import { primaryLabel, type StatView } from '@/lib/domain/items';

/**
 * Item name in its canonical quality colour.
 *
 * Rare (#0070dd) is low-contrast on our surface, so colour is only ever applied to the
 * name itself — bold, 14px — never to small or secondary text. Quality is also shown
 * as a text column in loot tables, so colour is never the sole carrier of meaning.
 */
export function ItemName({
  id,
  name,
  quality,
  muted = false,
}: {
  id: number;
  name: string;
  quality: string | null;
  muted?: boolean;
}) {
  return (
    <a
      href={wowheadItemUrl(id)}
      target="_blank"
      rel="noreferrer"
      className="text-item hover:underline"
      style={{ color: muted ? 'var(--color-ink-faint)' : qualityColor(quality) }}
      title="View on Wowhead"
    >
      {name}
    </a>
  );
}

export function ItemIcon({
  iconFileId,
  quality,
  size = 32,
}: {
  iconFileId: number | null;
  quality?: string | null;
  size?: number;
}) {
  return <WowIcon src={itemIconUrl(iconFileId)} size={size} quality={quality} rounded="sm" />;
}

/**
 * "Int / Agi · Crit 8 · Haste 11"
 *
 * Primaries are shown as a union because that is what they mean — a plate item listing
 * negated STRENGTH still serves Strength users.
 */
export function StatLine({ view, emphasise }: { view: StatView; emphasise?: string }) {
  const primaries = primaryLabel(view.primaries);

  if (view.secondaries.length === 0 && !primaries) {
    return <span className="text-sm text-ink-faint">—</span>;
  }

  return (
    <span className="text-sm text-ink-soft">
      {primaries ? <span className="text-ink">{primaries}</span> : null}
      {primaries && view.secondaries.length > 0 ? ' · ' : null}
      {view.secondaries.map((s, i) => (
        <span key={s.key}>
          <span className={emphasise === s.key ? 'text-ink' : undefined}>
            {s.label} <span className="tabular">{s.amount}</span>
          </span>
          {i < view.secondaries.length - 1 ? ' · ' : null}
        </span>
      ))}
    </span>
  );
}

/** Small uppercase pill used for "in rotation", "not gear", armor type. */
export function Tag({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode;
  tone?: 'accent' | 'muted';
}) {
  const styles =
    tone === 'accent'
      ? 'bg-accent-muted/40 text-accent'
      : 'bg-raised text-ink-faint';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs tracking-wide uppercase ${styles}`}>
      {children}
    </span>
  );
}
