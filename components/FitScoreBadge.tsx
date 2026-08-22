import type { Score } from '@/lib/scoring/score';

/**
 * The fit percentage, colour-coded.
 *
 * Colour is redundant encoding only — the number is always present as text, and the
 * secondary count sits beside it. See planning/06-design-extract.md §8.
 *
 * Colours come from CSS custom properties rather than Tailwind classes because the
 * bucket is chosen at runtime, and Tailwind cannot see dynamically built class names.
 */
function bucket(percent: number): string {
  if (percent >= 90) return 'var(--color-fit-90)';
  if (percent >= 75) return 'var(--color-fit-75)';
  if (percent >= 60) return 'var(--color-fit-60)';
  if (percent >= 40) return 'var(--color-fit-40)';
  return 'var(--color-fit-0)';
}

export function FitScoreBadge({ score }: { score: Score }) {
  if (score.noSecondaries || score.percent === null) {
    return (
      <span
        className="inline-flex items-center rounded-full px-2.5 py-1 text-xs whitespace-nowrap"
        style={{ color: 'var(--color-fit-none)', backgroundColor: 'color-mix(in srgb, var(--color-fit-none) 18%, transparent)' }}
        title="This item has no secondary stats, so there is nothing to score. It is not a 0% item."
      >
        no secondaries
      </span>
    );
  }

  const colour = bucket(score.percent);

  return (
    <span
      className="inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 whitespace-nowrap"
      style={{ color: colour, backgroundColor: `color-mix(in srgb, ${colour} 18%, transparent)` }}
      title={`${score.percent}% of this item's secondary budget is on your higher-ranked stats, across ${score.secondaryCount} secondaries.`}
    >
      <span className="tabular text-num">{score.percent}%</span>
      <span className="text-xs opacity-70">·{score.secondaryCount}</span>
    </span>
  );
}
