/**
 * "What should I get next?"
 *
 * Written for someone new to the game. A new player does not know their stat priority
 * and should not have to before getting an answer, so the ordering that matters most is
 * deliberately the one that needs no configuration:
 *
 *   1. Which slot is furthest behind          (pure item level — no opinion required)
 *   2. Where to farm it                       (dungeon + boss)
 *   3. Which of the candidates suits them     (stat fit — a refinement, not the headline)
 *
 * This is well-posed for one specific reason: Mythic+ normalises reward item level by
 * key level, so every rotation item arrives at the *same* item level for a given
 * player. Choosing between them is therefore purely slot need and stat fit, with none
 * of the cross-tier comparison problems that make `base_item_level` untrustworthy.
 */
import type { Score } from '../scoring/score';
import { compareScores } from '../scoring/score';
import { SLOT_LABEL, type Slot } from './slots';

export type CandidateItem = {
  id: number;
  name: string;
  quality: string | null;
  iconFileId: number | null;
  slot: string;
  instanceId: number;
  instanceName: string;
  instanceType?: string;
  encounterName: string | null;
  score: Score;
};

export type SlotRecommendation = {
  /** Character gear slot, e.g. 'finger1'. */
  slot: string;
  label: string;
  currentItemLevel: number;
  targetItemLevel: number;
  /**
   * How many item levels the vault target is above what they wear now.
   *
   * This describes the SLOT, not any individual candidate: it is the gap between what
   * is worn and the Mythic+ vault reward for this character's key level. It is exact
   * for a Mythic+ drop and indicative only for a raid one, whose level depends on the
   * difficulty it drops at — something our data does not carry (`base_item_level` reads
   * 197/219 for raid and 59/108/219/250 for dungeons, none of which resemble what
   * players actually receive). The UI labels raid rows and says so once.
   */
  gain: number;
  /** Best candidates for this slot, ranked by stat fit across whichever sources were queried. */
  candidates: CandidateItem[];
};

export type DungeonRecommendation = {
  instanceId: number;
  instanceName: string;
  /** Slots this one dungeon can upgrade. */
  slots: string[];
  /** Total item levels gained if every one of those slots dropped here. */
  totalGain: number;
};

export type Recommendations = {
  bySlot: SlotRecommendation[];
  byDungeon: DungeonRecommendation[];
  /** Slots that are already at or above the vault target — nothing M+ can do. */
  slotsAtCeiling: string[];
};

/** Candidates shown per slot when the caller expresses no preference. */
export const DEFAULT_PER_SLOT = 3;

/** What the user may choose from. More than eight is a loot table, not advice. */
export const PER_SLOT_CHOICES = [3, 5, 8] as const;

/** Raider.IO slots are finger1/finger2/trinket1; our loot table stores finger/trinket. */
export function toLootSlot(characterSlot: string): string {
  return characterSlot.replace(/[12]$/, '');
}

export function buildRecommendations(
  weakSlots: { slot: string; itemLevel: number; belowVault: number | null }[],
  targetItemLevel: number,
  candidatesForSlot: (lootSlot: string) => CandidateItem[],
  atCeiling: string[],
  perSlot: number = DEFAULT_PER_SLOT,
): Recommendations {
  const bySlot: SlotRecommendation[] = [];

  for (const weak of weakSlots) {
    if (weak.belowVault === null) continue;

    // One ranked list across whatever the caller queried. Which sources are in play is
    // decided by the SQL filter, not here, so "All" genuinely compares a raid drop and
    // a dungeon drop on the same footing rather than stapling two lists together.
    const candidates = candidatesForSlot(toLootSlot(weak.slot))
      .slice()
      .sort((a, b) => compareScores(a.score, b.score))
      .slice(0, perSlot);

    // A slot with no obtainable item is not a recommendation, it is noise.
    if (candidates.length === 0) continue;

    bySlot.push({
      slot: weak.slot,
      label: SLOT_LABEL[toLootSlot(weak.slot) as Slot] ?? weak.slot,
      currentItemLevel: weak.itemLevel,
      targetItemLevel,
      gain: weak.belowVault,
      candidates,
    });
  }

  // Biggest gap first: the most item levels for one drop.
  bySlot.sort((a, b) => b.gain - a.gain);

  // Which single dungeon covers the most ground? This is the question a new player
  // actually has — "what should I run tonight" — and it is not answerable from a
  // per-slot list without doing the cross-referencing in your head.
  const dungeons = new Map<number, DungeonRecommendation>();
  for (const rec of bySlot) {
    const seenHere = new Set<number>();
    for (const candidate of rec.candidates) {
      // Raids are excluded: this answers "which key should I run tonight", and a raid
      // boss is not a key. A raid is also not a thing you can repeat on demand.
      if (candidate.instanceType === 'raid') continue;
      if (seenHere.has(candidate.instanceId)) continue;
      seenHere.add(candidate.instanceId);

      const existing = dungeons.get(candidate.instanceId);
      if (existing) {
        if (!existing.slots.includes(rec.slot)) {
          existing.slots.push(rec.slot);
          existing.totalGain += rec.gain;
        }
      } else {
        dungeons.set(candidate.instanceId, {
          instanceId: candidate.instanceId,
          instanceName: candidate.instanceName,
          slots: [rec.slot],
          totalGain: rec.gain,
        });
      }
    }
  }

  const byDungeon = [...dungeons.values()].sort(
    (a, b) => b.slots.length - a.slots.length || b.totalGain - a.totalGain,
  );

  return { bySlot, byDungeon, slotsAtCeiling: atCeiling };
}
