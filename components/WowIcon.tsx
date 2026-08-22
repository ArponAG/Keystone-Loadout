import { fallbackIconUrl, qualityColor, slugIconUrl } from '@/lib/domain/icons';

/**
 * A WoW icon tile.
 *
 * Server component on purpose. These render hundreds at a time in loot tables, so
 * there is no `onError` handler — instead the question-mark icon sits behind the
 * <img> as a CSS background. If the image 404s, the fallback shows through with no
 * client JavaScript at all.
 *
 * next/image is deliberately not used: these are 1-3 KB CDN JPEGs already at their
 * display size, so the optimizer would add latency and config for no benefit.
 */
export function WowIcon({
  src,
  alt = '',
  size = 40,
  quality,
  rounded = 'md',
  /** Lazy by default for loot tables. Use 'eager' for the handful of shell icons —
   *  otherwise the question-mark fallback flashes before the real icon arrives. */
  loading = 'lazy',
  className = '',
}: {
  src: string;
  alt?: string;
  size?: number;
  /** When set, draws the canonical item-quality colour as a border. */
  quality?: string | null;
  rounded?: 'sm' | 'md' | 'lg';
  loading?: 'lazy' | 'eager';
  className?: string;
}) {
  const radius = rounded === 'sm' ? '4px' : rounded === 'lg' ? '10px' : '6px';

  return (
    <span
      className={`inline-block shrink-0 overflow-hidden bg-inset bg-cover bg-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundImage: `url(${fallbackIconUrl('medium')})`,
        boxShadow: quality ? `inset 0 0 0 1.5px ${qualityColor(quality)}` : undefined,
      }}
    >
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        style={{ width: size, height: size, borderRadius: radius, display: 'block' }}
      />
    </span>
  );
}

/** Convenience wrapper for the fixed shell icons addressed by readable slug. */
export function ShellIcon({
  slug,
  size = 40,
  alt = '',
  rounded = 'md',
  className = '',
}: {
  slug: string;
  size?: number;
  alt?: string;
  rounded?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  // Shell icons are few and above the fold, so they load eagerly.
  return (
    <WowIcon
      src={slugIconUrl(slug)}
      size={size}
      alt={alt}
      rounded={rounded}
      loading="eager"
      className={className}
    />
  );
}
