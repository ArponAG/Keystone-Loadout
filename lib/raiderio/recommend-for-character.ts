import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';

import { db, schema } from '@/lib/db';
import { checkEligibility, type Build } from '@/lib/domain/filters';
import { groupStatsByItem, readStats } from '@/lib/domain/items';
import {
  buildRecommendations,
  type CandidateItem,
  type Recommendations,
} from '@/lib/domain/recommend';
import { ARMOR_TYPE_SUBCLASS, type ArmorType } from '@/lib/domain/slots';
import type { SecondaryKey } from '@/lib/domain/stats';
import { scoreStats } from '@/lib/scoring/score';
import type { GearAudit } from '@/lib/domain/gear-audit';
import type { CharacterProfile } from './shape';

export type ResolvedBuild = {
  armorType: ArmorType | null;
  primary: Build['primary'] | null;
  /** How each was determined, so the UI can be honest about it. */
  armorSource: 'equipped-gear' | 'unknown';
  primarySource: 'blizzard-spec' | 'unknown';
  specName: string | null;
};

const ARMOR_SLOTS = ['head', 'shoulder', 'chest', 'waist', 'legs', 'feet', 'wrist', 'hands'];

const SUBCLASS_TO_ARMOR = new Map<number, ArmorType>(
  (Object.entries(ARMOR_TYPE_SUBCLASS) as [ArmorType, number][]).map(([type, sub]) => [sub, type]),
);

const PRIMARY_FROM_STAT: Record<string, Build['primary']> = {
  STRENGTH: 'strength',
  AGILITY: 'agility',
  INTELLECT: 'intellect',
};

/**
 * Work out what this character can wear, from data rather than a hardcoded class map.
 *
 * Primary stat comes from Blizzard's own spec record. That matters: Midnight's Devourer
 * Demon Hunter is an Intellect spec, so the obvious "Demon Hunter = Agility" map would
 * be silently wrong and would recommend the wrong half of every loot table.
 *
 * Armor type is voted on from the character's equipped armour, looked up in our own
 * items table. When nothing resolves — a character in gear we have never synced — both
 * fall back to null and the caller drops that half of the filter rather than guessing.
 */
export async function resolveBuild(
  profile: CharacterProfile,
  specId: number | null,
): Promise<ResolvedBuild> {
  let primary: Build['primary'] | null = null;
  let specName: string | null = null;

  if (specId !== null) {
    const [spec] = await db
      .select({ name: schema.specs.name, primaryStat: schema.specs.primaryStat })
      .from(schema.specs)
      .where(eq(schema.specs.id, specId))
      .limit(1);

    if (spec) {
      specName = spec.name;
      primary = spec.primaryStat ? (PRIMARY_FROM_STAT[spec.primaryStat] ?? null) : null;
    }
  }

  const equippedIds = ARMOR_SLOTS.map((slot) => profile.gear?.items?.[slot]?.item_id).filter(
    (id): id is number => typeof id === 'number',
  );

  let armorType: ArmorType | null = null;
  if (equippedIds.length > 0) {
    const known = await db
      .select({ subClass: schema.items.itemSubClass })
      .from(schema.items)
      .where(and(inArray(schema.items.id, equippedIds), eq(schema.items.itemClass, 4)));

    // Majority vote. A character can wear a lower armour class in a slot or two, so a
    // single piece is not authoritative.
    const votes = new Map<ArmorType, number>();
    for (const row of known) {
      const type = SUBCLASS_TO_ARMOR.get(row.subClass);
      if (type) votes.set(type, (votes.get(type) ?? 0) + 1);
    }
    armorType = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }

  return {
    armorType,
    primary,
    armorSource: armorType ? 'equipped-gear' : 'unknown',
    primarySource: primary ? 'blizzard-spec' : 'unknown',
    specName,
  };
}

/**
 * Candidate upgrades from the current Mythic+ rotation.
 *
 * Only the rotation, deliberately: those items all arrive at the same item level for a
 * given key level, so they are directly comparable. Mixing in raid loot would compare
 * across tiers, which is the thing this app refuses to do elsewhere.
 */
export async function recommendForCharacter(
  audit: GearAudit,
  build: { armorType: ArmorType | null; primary: Build['primary'] | null },
  secondaryOrder: readonly [SecondaryKey, SecondaryKey, SecondaryKey, SecondaryKey],
): Promise<Recommendations | null> {
  if (!audit.target) return null;

  const rows = await db
    .select({
      id: schema.items.id,
      name: schema.items.name,
      quality: schema.items.quality,
      iconFileId: schema.items.iconFileId,
      slot: schema.items.slot,
      itemClass: schema.items.itemClass,
      itemSubClass: schema.items.itemSubClass,
      isEquippable: schema.items.isEquippable,
      instanceId: schema.instances.id,
      instanceName: schema.instances.name,
      encounterName: schema.encounters.name,
    })
    .from(schema.itemSources)
    .innerJoin(schema.items, eq(schema.items.id, schema.itemSources.itemId))
    .innerJoin(schema.instances, eq(schema.instances.id, schema.itemSources.instanceId))
    .leftJoin(schema.encounters, eq(schema.encounters.id, schema.itemSources.encounterId))
    .where(and(eq(schema.items.isEquippable, 1), eq(schema.instances.inCurrentRotation, 1)));

  if (rows.length === 0) return null;

  const statRows = await db
    .select({
      itemId: schema.itemStats.itemId,
      statKey: schema.itemStats.statKey,
      amount: schema.itemStats.amount,
      isNegated: schema.itemStats.isNegated,
    })
    .from(schema.itemStats);
  const statsByItem = groupStatsByItem(statRows);

  const seen = new Set<number>();
  const bySlot = new Map<string, CandidateItem[]>();

  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const stats = statsByItem.get(row.id) ?? [];

    // Filter on whichever half of the build resolved. An unknown armour type widens
    // the results rather than emptying them.
    if (build.primary || build.armorType) {
      const eligible = checkEligibility(
        row,
        stats,
        {
          armorType: build.armorType ?? 'cloth',
          primary: build.primary ?? 'intellect',
          secondaryOrder,
        },
        { skipArmor: build.armorType === null, skipPrimary: build.primary === null },
      );
      if (!eligible.eligible) continue;
    }

    seen.add(row.id);
    const candidate: CandidateItem = {
      id: row.id,
      name: row.name,
      quality: row.quality,
      iconFileId: row.iconFileId,
      slot: row.slot,
      instanceId: row.instanceId,
      instanceName: row.instanceName,
      encounterName: row.encounterName,
      score: scoreStats(readStats(stats), secondaryOrder),
    };

    const list = bySlot.get(row.slot);
    if (list) list.push(candidate);
    else bySlot.set(row.slot, [candidate]);
  }

  const judged = audit.slots.filter((s) => s.verdict !== 'unjudged');

  return buildRecommendations(
    judged.filter((s) => s.belowVault !== null),
    audit.target.vaultItemLevel,
    (slot) => bySlot.get(slot) ?? [],
    judged.filter((s) => s.belowVault === null).map((s) => s.slot),
  );
}
