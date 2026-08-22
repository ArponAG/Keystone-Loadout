/**
 * inventory_type -> slot normalisation.
 *
 * Blizzard returns inventory_type as a STRING enum object, not the integer the brief
 * assumed: {"type": "CLOAK", "name": "Back"}. All values below were observed by
 * scripts/probe.ts. See planning/02-data-model.md §2.
 */

export type Slot =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'back'
  | 'chest'
  | 'waist'
  | 'legs'
  | 'feet'
  | 'wrist'
  | 'hands'
  | 'finger'
  | 'trinket'
  | 'one-hand'
  | 'two-hand'
  | 'off-hand'
  | 'ranged'
  | 'none';

export const INVENTORY_TYPE_TO_SLOT: Record<string, Slot> = {
  HEAD: 'head',
  NECK: 'neck',
  SHOULDER: 'shoulder',
  CLOAK: 'back',
  CHEST: 'chest',
  ROBE: 'chest', // ROBE and CHEST are the same slot
  WAIST: 'waist',
  LEGS: 'legs',
  FEET: 'feet',
  WRIST: 'wrist',
  HAND: 'hands', // singular in the API
  FINGER: 'finger',
  TRINKET: 'trinket',
  WEAPON: 'one-hand',
  WEAPONMAINHAND: 'one-hand',
  WEAPONOFFHAND: 'off-hand',
  TWOHWEAPON: 'two-hand',
  SHIELD: 'off-hand',
  HOLDABLE: 'off-hand',
  RANGED: 'ranged',
  RANGEDRIGHT: 'ranged', // bows and wands — not in the brief at all
  NON_EQUIP: 'none', // mounts, recipes, housing decor found in loot tables
};

export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Head',
  neck: 'Neck',
  shoulder: 'Shoulder',
  back: 'Back',
  chest: 'Chest',
  waist: 'Waist',
  legs: 'Legs',
  feet: 'Feet',
  wrist: 'Wrist',
  hands: 'Hands',
  finger: 'Finger',
  trinket: 'Trinket',
  'one-hand': 'One-Hand',
  'two-hand': 'Two-Hand',
  'off-hand': 'Off-Hand',
  ranged: 'Ranged',
  none: 'Not gear',
};

/** Display order. Trinkets last — their score is the least trustworthy. */
export const SLOT_ORDER: readonly Slot[] = [
  'head',
  'neck',
  'shoulder',
  'back',
  'chest',
  'wrist',
  'hands',
  'waist',
  'legs',
  'feet',
  'finger',
  'one-hand',
  'two-hand',
  'off-hand',
  'ranged',
  'trinket',
  'none',
];

/**
 * Armor-class filtering applies ONLY to these slots.
 *
 * This gate is load-bearing. A cloak is item_class=4, item_sub_class=1 (Cloth) but is
 * wearable by every class — filtering it by subclass would delete every cloak from a
 * plate user's results. Rings, necks, trinkets and off-hands are subclass 0 and equally
 * must escape the filter. See planning/04-scoring.md §4.2.
 */
export const ARMOR_FILTERED_SLOTS: ReadonlySet<Slot> = new Set<Slot>([
  'head',
  'shoulder',
  'chest',
  'waist',
  'legs',
  'feet',
  'wrist',
  'hands',
]);

export function slotFor(inventoryType: string): Slot {
  return INVENTORY_TYPE_TO_SLOT[inventoryType] ?? 'none';
}

export function isArmorFiltered(slot: Slot): boolean {
  return ARMOR_FILTERED_SLOTS.has(slot);
}

/** item_class values seen in loot tables. Only 2 and 4 are gear. */
export const ITEM_CLASS = {
  WEAPON: 2,
  ARMOR: 4,
  RECIPE: 9,
  MISCELLANEOUS: 15,
  HOUSING: 20,
} as const;

/** item_sub_class for item_class 4 (Armor). */
export const ARMOR_SUBCLASS = {
  MISCELLANEOUS: 0, // necks, rings, trinkets, off-hands
  CLOTH: 1, // also cloaks
  LEATHER: 2,
  MAIL: 3,
  PLATE: 4,
  SHIELD: 6,
} as const;

export type ArmorType = 'cloth' | 'leather' | 'mail' | 'plate';

export const ARMOR_TYPE_SUBCLASS: Record<ArmorType, number> = {
  cloth: ARMOR_SUBCLASS.CLOTH,
  leather: ARMOR_SUBCLASS.LEATHER,
  mail: ARMOR_SUBCLASS.MAIL,
  plate: ARMOR_SUBCLASS.PLATE,
};

export const ARMOR_TYPE_LABEL: Record<ArmorType, string> = {
  cloth: 'Cloth',
  leather: 'Leather',
  mail: 'Mail',
  plate: 'Plate',
};

/** Non-equippable junk that sits in loot tables: mounts, recipes, housing decor. */
export function isEquippable(inventoryType: string): boolean {
  return slotFor(inventoryType) !== 'none';
}
