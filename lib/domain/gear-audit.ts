/**
 * Which equipped slots are lagging.
 *
 * Two independent signals, deliberately not merged into one verdict:
 *
 *   Tier 1 — RELATIVE. How far below the character's own average a slot sits. Needs no
 *            outside data and makes no assumption about what content they run.
 *   Tier 2 — ABSOLUTE. How far below the Great Vault reward for their typical key
 *            level. This is the "you can't get raid gear yet" part: the target is what
 *            *their* content awards, not best-in-slot.
 *
 * What this deliberately does NOT do is call an item "bad". Trinkets and weapons are
 * excluded from judgement entirely: trinket value is dominated by on-use and proc
 * effects and weapon value by DPS, neither of which item level captures. A lower-ilvl
 * trinket routinely beats a higher one. Flagging them would be confidently wrong
 * exactly where this app is least able to judge — the same reason /gear warns on those
 * slots. See planning/04-scoring.md §7.3.
 */

/** Slots where item level is a fair proxy for power. */
const JUDGED_SLOTS = new Set([
  'head', 'neck', 'shoulder', 'back', 'chest', 'wrist',
  'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2',
]);

/** Below the character's own average by this much reads as a genuinely weak slot. */
export const WEAK_BELOW_AVERAGE = 8;
/** Above by this much is a standout. */
export const STRONG_ABOVE_AVERAGE = 8;
/** Ignore vault gaps smaller than one upgrade step; noise, not a recommendation. */
export const MEANINGFUL_VAULT_GAP = 3;

export type EquippedItem = { slot: string; itemLevel: number };

export type SlotVerdict = 'strong' | 'fine' | 'weak' | 'unjudged';

export type SlotAudit = {
  slot: string;
  itemLevel: number;
  /** Signed difference from the character's own average, rounded. */
  vsAverage: number;
  verdict: SlotVerdict;
  /** How far below the vault target, or null when at/above it or unjudged. */
  belowVault: number | null;
};

export type GearAudit = {
  averageItemLevel: number;
  /** Tier 2 context. Null when no reward curve or no runs are known. */
  target: {
    keyLevel: number;
    vaultItemLevel: number;
    /** Set when the key level is past the top of the reward table. */
    cappedAt: number | null;
  } | null;
  slots: SlotAudit[];
  weakest: SlotAudit | null;
  /** Judged slots sitting meaningfully below the vault target. */
  belowVaultCount: number;
};

/**
 * The key level the character can actually get rewards from.
 *
 * Median of their best runs, not the maximum: one lucky high key does not mean they
 * reliably clear that level, and the whole point is a realistic target.
 */
export function typicalKeyLevel(bestRuns: { level: number }[]): number | null {
  const timed = bestRuns.map((r) => r.level).sort((a, b) => a - b);
  if (timed.length === 0) return null;
  const mid = Math.floor(timed.length / 2);
  return timed.length % 2 === 0 ? Math.floor((timed[mid - 1] + timed[mid]) / 2) : timed[mid];
}

export function auditGear(
  items: EquippedItem[],
  vaultTarget: { keyLevel: number; itemLevel: number; cappedAt: number | null } | null,
): GearAudit {
  const judged = items.filter((i) => JUDGED_SLOTS.has(i.slot) && i.itemLevel > 0);

  // Average over judged slots only. Including a 331 weapon would drag the baseline up
  // and make ordinary armour look weak.
  const averageItemLevel =
    judged.length > 0
      ? Math.round(judged.reduce((sum, i) => sum + i.itemLevel, 0) / judged.length)
      : 0;

  const slots: SlotAudit[] = items.map((item) => {
    if (!JUDGED_SLOTS.has(item.slot) || item.itemLevel <= 0) {
      return { slot: item.slot, itemLevel: item.itemLevel, vsAverage: 0, verdict: 'unjudged', belowVault: null };
    }

    const vsAverage = item.itemLevel - averageItemLevel;
    const verdict: SlotVerdict =
      vsAverage <= -WEAK_BELOW_AVERAGE ? 'weak' : vsAverage >= STRONG_ABOVE_AVERAGE ? 'strong' : 'fine';

    const gap = vaultTarget ? vaultTarget.itemLevel - item.itemLevel : 0;
    const belowVault = vaultTarget && gap >= MEANINGFUL_VAULT_GAP ? gap : null;

    return { slot: item.slot, itemLevel: item.itemLevel, vsAverage, verdict, belowVault };
  });

  const judgedSlots = slots.filter((s) => s.verdict !== 'unjudged');
  const weakest =
    judgedSlots.length > 0
      ? judgedSlots.reduce((worst, s) => (s.itemLevel < worst.itemLevel ? s : worst))
      : null;

  return {
    averageItemLevel,
    target: vaultTarget
      ? { keyLevel: vaultTarget.keyLevel, vaultItemLevel: vaultTarget.itemLevel, cappedAt: vaultTarget.cappedAt }
      : null,
    slots,
    weakest,
    belowVaultCount: judgedSlots.filter((s) => s.belowVault !== null).length,
  };
}
