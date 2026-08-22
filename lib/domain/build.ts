/**
 * Build state lives in the URL, not in React state.
 *
 * That keeps /gear a Server Component with one small Client island for the form, and
 * makes a build shareable, bookmarkable and refresh-proof. Anything unparseable falls
 * back to a default rather than erroring — a hand-edited URL should never 500.
 */
import type { Build } from './filters';
import { ARMOR_TYPE_LABEL, type ArmorType } from './slots';
import { SECONDARY_KEYS, type PrimaryKey, type SecondaryKey } from './stats';

export type Scope = 'rotation' | 'all';

export const ARMOR_TYPES = Object.keys(ARMOR_TYPE_LABEL) as ArmorType[];
export const PRIMARIES: PrimaryKey[] = ['intellect', 'agility', 'strength'];

export const DEFAULT_BUILD: Build = {
  armorType: 'cloth',
  primary: 'intellect',
  secondaryOrder: ['haste', 'crit', 'mastery', 'vers'],
};

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseOrder(raw: string | undefined): Build['secondaryOrder'] {
  if (!raw) return DEFAULT_BUILD.secondaryOrder;

  const parts = raw.split(',').map((s) => s.trim()) as SecondaryKey[];
  const valid = parts.filter((p) => SECONDARY_KEYS.includes(p));
  const unique = [...new Set(valid)];

  // Tolerate a partial or duplicated list by appending whatever is missing, in the
  // default order. A truncated URL still produces a usable build.
  for (const key of DEFAULT_BUILD.secondaryOrder) {
    if (!unique.includes(key)) unique.push(key);
  }

  return unique.slice(0, 4) as unknown as Build['secondaryOrder'];
}

export function parseBuild(params: SearchParams): Build {
  const armor = first(params.armor) as ArmorType | undefined;
  const primary = first(params.primary) as PrimaryKey | undefined;

  return {
    armorType: armor && ARMOR_TYPES.includes(armor) ? armor : DEFAULT_BUILD.armorType,
    primary: primary && PRIMARIES.includes(primary) ? primary : DEFAULT_BUILD.primary,
    secondaryOrder: parseOrder(first(params.order)),
  };
}

export function parseScope(params: SearchParams): Scope {
  return first(params.scope) === 'all' ? 'all' : 'rotation';
}

/** True when the user has actually chosen something, rather than landing on defaults. */
export function hasExplicitBuild(params: SearchParams): boolean {
  return Boolean(first(params.armor) || first(params.primary) || first(params.order));
}

export function buildToQuery(build: Build, scope: Scope): string {
  const query = new URLSearchParams({
    armor: build.armorType,
    primary: build.primary,
    order: build.secondaryOrder.join(','),
  });
  if (scope !== 'rotation') query.set('scope', scope);
  return query.toString();
}
