/**
 * verify-assumptions — the patch-day tripwire.
 *
 * Re-asserts every load-bearing assumption the app is built on, against live APIs.
 * Exits non-zero on drift. Run before sync:all; `npm run sync:safe` chains them.
 *
 * Each check here exists because if it silently broke, the app would keep working and
 * keep producing plausible, wrong answers. See planning/03-etl.md §5.
 */
import { blizz, blizzOrNull } from '../lib/blizzard/client';
import { latestSeasonId, parseRewardCsv, selectMythicPlusCurve } from '../lib/domain/rewards';
import { isKnownStat } from '../lib/domain/stats';
import { INVENTORY_TYPE_TO_SLOT, slotFor } from '../lib/domain/slots';
import season from '../config/season.json';

const RAIDBOTS_INSTANCES = 'https://www.raidbots.com/static/data/live/instances.json';
const RIO_STATIC = 'https://raider.io/api/v1/mythic-plus/static-data';
const UA = 'KeystoneLoadout/0.1 (personal project)';

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return (await res.json()) as T;
}

async function main() {
  console.log('Verifying assumptions against live APIs...\n');

  // --- 1. journal-encounter still carries items[] in the expected shape ------
  // If this breaks, sync:loot silently writes nothing and the gear finder empties.
  let sampleItemIds: number[] = [];
  try {
    const enc = await blizz<any>('/data/wow/journal-encounter/2878');
    const hasItems = Array.isArray(enc.items) && enc.items.length > 0;
    const entry = enc.items?.[0];
    const shapeOk = Boolean(entry && typeof entry.id === 'number' && typeof entry.item?.id === 'number');
    const idsDiffer = entry && entry.id !== entry.item.id;

    sampleItemIds = (enc.items ?? []).slice(0, 6).map((e: any) => e.item.id);

    record(
      'journal-encounter carries items[]',
      hasItems && shapeOk,
      hasItems
        ? `${enc.items.length} entries; entry.id=${entry.id}, entry.item.id=${entry.item.id}` +
          (idsDiffer ? ' (ids differ, as expected)' : ' (WARNING: ids identical)')
        : 'No items[] — the wago.tools DB2 fallback would be required.',
    );
  } catch (e) {
    record('journal-encounter carries items[]', false, String(e));
  }

  // --- 2. every stat string is known ---------------------------------------
  // An unknown stat cannot inflate a score (toSecondaryKey returns null), but it can
  // silently vanish from a ranking. This is the hard gate that sync:loot's warning isn't.
  try {
    const unknown = new Set<string>();
    const seen = new Set<string>();

    for (const id of sampleItemIds) {
      const item = await blizz<any>(`/data/wow/item/${id}`);
      for (const stat of item.preview_item?.stats ?? []) {
        seen.add(stat.type.type);
        if (!isKnownStat(stat.type.type)) unknown.add(stat.type.type);
      }
    }

    record(
      'all stat keys are in STAT_MAP',
      unknown.size === 0,
      unknown.size === 0
        ? `${seen.size} distinct keys, all known: ${[...seen].sort().join(', ')}`
        : `UNKNOWN: ${[...unknown].join(', ')} — add to lib/domain/stats.ts (tertiary unless proven otherwise)`,
    );
  } catch (e) {
    record('all stat keys are in STAT_MAP', false, String(e));
  }

  // --- 3. every inventory_type maps to a slot -------------------------------
  try {
    const unmapped = new Set<string>();
    for (const id of sampleItemIds) {
      const item = await blizz<any>(`/data/wow/item/${id}`);
      const type = item.inventory_type?.type;
      if (type && !(type in INVENTORY_TYPE_TO_SLOT)) unmapped.add(type);
    }
    record(
      'all inventory_type values map to a slot',
      unmapped.size === 0,
      unmapped.size === 0
        ? 'no unmapped types in the sample'
        : `UNMAPPED: ${[...unmapped].join(', ')} — add to lib/domain/slots.ts`,
    );
  } catch (e) {
    record('all inventory_type values map to a slot', false, String(e));
  }

  // --- 4. the cloak assumption ----------------------------------------------
  // THE one that silently corrupts everything: cloaks are Cloth subclass but wearable
  // by all, and they prove is_negated marks alternatives rather than absence.
  try {
    const cloak = await blizz<any>('/data/wow/item/159288');
    const primaries = (cloak.preview_item?.stats ?? []).filter((s: any) =>
      ['INTELLECT', 'AGILITY', 'STRENGTH'].includes(s.type.type),
    );
    const isCloth = cloak.item_subclass?.id === 1;
    const isBack = slotFor(cloak.inventory_type?.type) === 'back';
    const multiPrimary = primaries.length > 1;

    record(
      'cloak is Cloth subclass, maps to back, and lists >1 primary',
      isCloth && isBack && multiPrimary,
      `${cloak.name}: subclass=${cloak.item_subclass?.id} slot=${slotFor(cloak.inventory_type?.type)} ` +
        `primaries=[${primaries.map((s: any) => s.type.type + (s.is_negated ? '[NEG]' : '')).join(', ')}]` +
        (isCloth && isBack && multiPrimary
          ? ''
          : ' — the slot gate and/or union rule may no longer be justified'),
    );
  } catch (e) {
    record('cloak is Cloth subclass, maps to back, and lists >1 primary', false, String(e));
  }

  // --- 5. the two rotation sources still agree ------------------------------
  // Disagreement means a season rolled over in one source but not the other; syncing
  // loot in that window populates the wrong dungeons.
  try {
    const all = await getJson<any[]>(RAIDBOTS_INSTANCES);
    const pool = all.find((i) => i.type === 'mplus-chest');
    const rbNames = new Set<string>((pool?.encounters ?? []).map((e: any) => e.name));

    const rio = await getJson<any>(
      `${RIO_STATIC}?expansion_id=${season.expansion.raiderIoExpansionId}`,
    );
    const now = Date.now();
    const current = rio.seasons.find(
      (s: any) => s.is_main_season && Date.parse(s.starts.us) <= now && Date.parse(s.ends.us) > now,
    );
    const rioNames = new Set<string>((current?.dungeons ?? []).map((d: any) => d.name));

    const onlyRio = [...rioNames].filter((n) => !rbNames.has(n));
    const onlyRb = [...rbNames].filter((n) => !rioNames.has(n));
    const agree = onlyRio.length === 0 && onlyRb.length === 0 && rioNames.size > 0;

    record(
      'Raidbots and Raider.IO rotations agree',
      agree,
      agree
        ? `${rioNames.size} dungeons, identical sets (season ${current?.slug})`
        : `Raider.IO only: ${onlyRio.join(', ') || '(none)'} | Raidbots only: ${onlyRb.join(', ') || '(none)'}`,
    );

    record(
      'config/season.json matches the live season',
      current?.slug === season.season.slug,
      current?.slug === season.season.slug
        ? `both say ${season.season.slug}`
        : `config says "${season.season.slug}", Raider.IO says "${current?.slug}" — update config/season.json`,
    );
  } catch (e) {
    record('Raidbots and Raider.IO rotations agree', false, String(e));
  }

  // --- 6. Wowhead feed still parses ----------------------------------------
  try {
    const res = await fetch('https://www.wowhead.com/news/rss/retail', {
      headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
    });
    const xml = await res.text();
    const hasItems = xml.includes('<item>');
    const hasGuid = xml.includes('<guid');
    record(
      'Wowhead RSS still has <item> and <guid>',
      res.ok && hasItems && hasGuid,
      `HTTP ${res.status}, ${(xml.length / 1024).toFixed(0)} KB, ttl=${xml.match(/<ttl>(\d+)<\/ttl>/)?.[1] ?? '?'}`,
    );
  } catch (e) {
    record('Wowhead RSS still has <item> and <guid>', false, String(e));
  }

  // --- 7. Mythic+ reward curve ---------------------------------------------
  // The character page's "below vault" judgement rests entirely on this curve being
  // identifiable. If the table's shape changes the feature must go quiet, not guess.
  try {
    const res = await fetch('https://wago.tools/db2/MythicPlusSeasonRewardLevels/csv', {
      headers: { 'Accept-Encoding': 'gzip', 'User-Agent': UA },
    });
    const rows = parseRewardCsv(await res.text());
    const seasonId = latestSeasonId(rows);
    const curve = seasonId === null ? [] : selectMythicPlusCurve(rows, seasonId);

    record(
      'a Mythic+ reward curve is identifiable',
      curve.length >= 3,
      curve.length >= 3
        ? `season ${seasonId} tier ${curve[0].activityTierId}: +${curve[0].keyLevel} -> ` +
          `${curve[0].vaultItemLevel} .. +${curve[curve.length - 1].keyLevel} -> ` +
          `${curve[curve.length - 1].vaultItemLevel}`
        : 'No tier starting at key level 2 with enough rows — the vault comparison will be hidden.',
    );
  } catch (e) {
    record('a Mythic+ reward curve is identifiable', false, String(e));
  }

  // --- summary --------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(64));
  console.log(`${results.length - failed.length}/${results.length} checks passed.`);

  if (failed.length > 0) {
    console.log('\nDRIFT DETECTED — do not sync until these are resolved:');
    for (const f of failed) console.log(`  - ${f.name}`);
    process.exit(1);
  }

  console.log('No drift. Safe to sync.');
}

main().catch((e) => {
  console.error('verify-assumptions crashed:', e);
  process.exit(1);
});
