/**
 * scripts/probe.ts - Session 1 assumption probe.
 *
 * Standalone. No framework, no DB, no app code. Run with: npm run probe
 *
 * Purpose: prove or disprove every assumption in planning/00-BRIEF.md against
 * live data BEFORE any schema or ETL is written. Everything this prints is
 * evidence; the planning docs are written from this output, not from the brief.
 */

const RAIDBOTS_BASE = 'https://www.raidbots.com/static/data/live';
const BLIZZ_BASE = 'https://us.api.blizzard.com';
const OAUTH_URL = 'https://oauth.battle.net/token';

const BLIZZ_DELAY_MS = 200; // brief: 100 req/s allowed; 200ms is deliberately polite
const UA = 'KeystoneLoadout/0.1 (personal project)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hr(title: string) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

// ---------------------------------------------------------------- env + auth

function loadEnv() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // fall through to the missing-vars check below
  }
  const id = process.env.BLIZZARD_CLIENT_ID;
  const secret = process.env.BLIZZARD_CLIENT_SECRET;
  if (!id || !secret) {
    console.error('MISSING CREDENTIALS.\n');
    console.error('Create a file named .env.local in the project root containing:\n');
    console.error('  BLIZZARD_CLIENT_ID=<your client id>');
    console.error('  BLIZZARD_CLIENT_SECRET=<your client secret>');
    console.error('  BLIZZARD_REGION=us\n');
    console.error('Get these from https://develop.battle.net -> API Access -> Create Client.');
    process.exit(1);
  }
  return { id, secret };
}

async function getToken(id: string, secret: string): Promise<string> {
  const res = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    console.error('OAuth failed: ' + res.status + ' ' + res.statusText);
    console.error(await res.text());
    process.exit(1);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  console.log('OAuth OK. Token expires in ' + json.expires_in + 's (~' + Math.round(json.expires_in / 3600) + 'h).');
  return json.access_token;
}

let token = '';

async function blizz(path: string, namespace = 'static-us'): Promise<any> {
  await sleep(BLIZZ_DELAY_MS);
  const url = BLIZZ_BASE + path + '?namespace=' + namespace + '&locale=en_US';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('Blizzard ' + res.status + ' on ' + path + ': ' + (await res.text()));
  return res.json();
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'gzip', 'User-Agent': UA } });
  if (!res.ok) throw new Error(res.status + ' on ' + url);
  return res.json();
}

// ------------------------------------------------------------------- probe

async function main() {
  const { id, secret } = loadEnv();

  hr('STEP 1 - Blizzard OAuth (client credentials)');
  token = await getToken(id, secret);

  // --- 2. Raidbots instances.json ---------------------------------------
  hr('STEP 2 - Raidbots instances.json: instance/encounter spine');
  const instances: any[] = await getJson(RAIDBOTS_BASE + '/instances.json');
  console.log('Fetched ' + instances.length + ' top-level entries.');
  console.log('Distinct "type" values: ' + [...new Set(instances.map((i) => i.type))].join(', '));

  const realDungeons = instances.filter((i) => i.type === 'dungeon');
  const realRaids = instances.filter((i) => i.type === 'raid' && i.id > 0);
  const mplusPool = instances.find((i) => i.type === 'mplus-chest');

  console.log('\nReal dungeons (type="dungeon", positive journal-instance ids): ' + realDungeons.length);
  for (const d of realDungeons) console.log('  ' + d.id + '  ' + d.name + '  (' + d.encounters.length + ' bosses)');

  console.log('\nReal raids (type="raid", positive ids): ' + realRaids.length);
  for (const r of realRaids) console.log('  ' + r.id + '  ' + r.name + '  (' + r.encounters.length + ' bosses)');

  console.log('\nSynthetic aggregate "' + mplusPool?.name + '" (id=' + mplusPool?.id + ')');
  console.log('Its "encounters" are DUNGEONS, not bosses:');
  for (const e of mplusPool?.encounters ?? []) console.log('  ' + e.id + '  ' + e.name);

  // --- 3. journal-encounter shape ---------------------------------------
  hr('STEP 3 - Blizzard /journal-encounter/{id}: does it carry items[]?');
  const probeDungeon =
    realDungeons.find((d) => (mplusPool?.encounters ?? []).some((e: any) => e.id === d.id)) ?? realDungeons[0];
  const probeEncounter = probeDungeon.encounters[0];
  console.log(
    'Probing dungeon "' + probeDungeon.name + '" (' + probeDungeon.id + ') -> boss "' +
      probeEncounter.name + '" (' + probeEncounter.id + ')',
  );

  const enc = await blizz('/data/wow/journal-encounter/' + probeEncounter.id);
  console.log('\nTOP-LEVEL KEYS: ' + Object.keys(enc).join(', '));
  const hasItems = Array.isArray(enc.items);
  console.log('\nANSWER: items[] present? ' + (hasItems ? 'YES' : 'NO') + '  (' + (enc.items?.length ?? 0) + ' entries)');

  if (!hasItems) {
    hr('STEP 5 - FALLBACK REQUIRED: wago.tools DB2');
    const res = await fetch('https://wago.tools/db2/JournalEncounterItem/csv', { headers: { 'User-Agent': UA } });
    const csv = (await res.text()).split('\n').slice(0, 50);
    console.log('COLUMN HEADERS: ' + csv[0]);
    console.log('\n>> journal-encounter has no items[]. The DB2 fallback path is REQUIRED.');
    process.exit(0);
  }

  console.log('\nEXACT ENTRY SHAPE:');
  console.log(JSON.stringify(enc.items[0], null, 2));
  console.log('\n>> GOTCHA: entry.id is the JournalEncounterItem id, NOT the item id.');
  console.log('>> The real item id is entry.item.id.');
  console.log('\nenc.modes (difficulty tiers): ' + JSON.stringify(enc.modes));
  console.log('enc.category: ' + JSON.stringify(enc.category));
  console.log('enc.instance: id=' + enc.instance?.id + ' name=' + enc.instance?.name);

  // --- 4. item detail: stats, slots, classes ----------------------------
  hr('STEP 4 - Blizzard /item/{id}: stat enums, inventory_type, classes');
  const sampleIds: number[] = enc.items.map((i: any) => i.item.id);

  // Widen the sample across two more bosses so the enum set is representative.
  for (const extra of probeDungeon.encounters.slice(1, 3)) {
    const e2 = await blizz('/data/wow/journal-encounter/' + extra.id);
    for (const it of e2.items ?? []) sampleIds.push(it.item.id);
  }
  console.log('Sampling ' + sampleIds.length + ' items from "' + probeDungeon.name + '".\n');

  const statTypes = new Set<string>();
  const invTypes = new Set<string>();
  const classPairs = new Set<string>();
  const negatedExamples: string[] = [];
  const levels = new Set<number>();

  for (const itemId of sampleIds) {
    const it = await blizz('/data/wow/item/' + itemId);
    const p = it.preview_item ?? {};
    const stats = (p.stats ?? []).map((s: any) => ({
      type: s.type.type,
      value: s.value,
      is_negated: s.is_negated ?? false,
    }));
    stats.forEach((s: any) => statTypes.add(s.type));
    invTypes.add(it.inventory_type?.type);
    classPairs.add(
      'class=' + it.item_class?.id + ' sub=' + it.item_subclass?.id +
        ' (' + it.item_class?.name + '/' + it.item_subclass?.name + ')',
    );
    levels.add(it.level);

    if (stats.some((s: any) => s.is_negated)) {
      negatedExamples.push(
        it.name + ': ' +
          stats.map((s: any) => s.type + '=' + s.value + (s.is_negated ? ' [NEGATED]' : '')).join(', '),
      );
    }

    console.log('- [' + itemId + '] ' + it.name);
    console.log('    inventory_type: ' + JSON.stringify(it.inventory_type));
    console.log(
      '    item_class=' + it.item_class?.id + ' item_subclass=' + it.item_subclass?.id +
        ' level=' + it.level + ' quality=' + it.quality?.type,
    );
    console.log('    binding: ' + (p.binding?.type ?? '(none)'));
    console.log('    stats: ' + JSON.stringify(stats));
  }

  hr('STEP 4 SUMMARY - the values that must drive STAT_MAP');
  console.log('DISTINCT preview_item.stats[].type.type STRINGS:');
  [...statTypes].sort().forEach((s) => console.log('  ' + s));
  console.log('\nDISTINCT inventory_type.type STRINGS (NOTE: strings, not integers):');
  [...invTypes].sort().forEach((s) => console.log('  ' + s));
  console.log('\nDISTINCT item_class/item_subclass pairs:');
  [...classPairs].sort().forEach((s) => console.log('  ' + s));
  console.log('\nDISTINCT item levels in this dungeon: ' + [...levels].join(', '));
  console.log('  (constant ilvl within an instance is what makes stat-fit ranking valid)');
  console.log('\nITEMS CARRYING is_negated STATS (the flex-primary mechanism):');
  negatedExamples.forEach((s) => console.log('  ' + s));

  // --- 4b. the assumption that silently corrupts everything -------------
  hr('STEP 4B - Cloak check: does armor-type filtering need a slot gate?');
  console.log('Sweeping further instances until a CLOAK is found...\n');

  let cloak: any = null;
  const otherSlots = new Map<string, string>();

  outer: for (const inst of realDungeons) {
    if (inst.id === probeDungeon.id) continue;
    const full = await blizz('/data/wow/journal-instance/' + inst.id);
    for (const e of full.encounters ?? []) {
      const enc2 = await blizz('/data/wow/journal-encounter/' + e.id);
      for (const entry of enc2.items ?? []) {
        const i = await blizz('/data/wow/item/' + entry.item.id);
        const t = i.inventory_type?.type;
        if (t && !otherSlots.has(t)) {
          otherSlots.set(t, 'class=' + i.item_class?.id + '/' + i.item_subclass?.id + ' ' + i.name);
        }
        if (t === 'CLOAK' && !cloak) {
          cloak = i;
          break outer;
        }
      }
    }
  }

  console.log('Additional inventory_type values seen while sweeping:');
  [...otherSlots.entries()].sort().forEach(([k, v]) => console.log('  ' + k.padEnd(12) + ' ' + v));

  if (!cloak) {
    console.log('\n!! No CLOAK found in the sampled instances. Re-run with a wider sweep.');
  } else {
    const primaries = (cloak.preview_item?.stats ?? []).filter((s: any) =>
      ['INTELLECT', 'AGILITY', 'STRENGTH'].includes(s.type.type),
    );
    console.log('\nCLOAK FOUND: ' + cloak.name + ' (' + cloak.id + ')');
    console.log('  item_class=' + cloak.item_class?.id + ' item_subclass=' + cloak.item_subclass?.id +
      ' (' + cloak.item_class?.name + '/' + cloak.item_subclass?.name + ')');
    console.log('  primaries: ' + primaries.map((s: any) => s.type.type + '=' + s.value + (s.is_negated ? '[NEG]' : '')).join(', '));
    console.log('\n  ASSERTION 1 - cloak is Cloth subclass (so a naive subclass filter would');
    console.log('                delete it for plate users): ' +
      (cloak.item_subclass?.id === 1 ? 'TRUE - slot gate REQUIRED' : 'FALSE - re-examine'));
    console.log('  ASSERTION 2 - cloak lists MORE THAN ONE primary, proving is_negated marks');
    console.log('                alternatives rather than absence: ' +
      (primaries.length > 1 ? 'TRUE - union rule REQUIRED' : 'FALSE - re-examine'));
  }

  // --- 6. Raider.IO season rotation -------------------------------------
  hr('STEP 6 - Raider.IO mythic-plus/static-data: current season rotation');
  // expansion_id 11 = Midnight at probe time. Downstream code must read this
  // from data, never hardcode it.
  const rio = await getJson('https://raider.io/api/v1/mythic-plus/static-data?expansion_id=11');
  console.log('Top-level keys: ' + Object.keys(rio).join(', '));
  console.log('\nExpansion-wide dungeon list (' + rio.dungeons.length + ') - NOT the M+ rotation:');
  rio.dungeons.forEach((d: any) =>
    console.log('  ' + d.name + '  [slug=' + d.slug + ' challenge_mode_id=' + d.challenge_mode_id + ' rio_id=' + d.id + ']'),
  );

  const now = Date.now();
  const current = rio.seasons.find(
    (s: any) => s.is_main_season && Date.parse(s.starts.us) <= now && Date.parse(s.ends.us) > now,
  );
  console.log('\nCURRENT SEASON (is_main_season && now within start/end): ' + current?.slug);
  console.log('  starts: ' + current?.starts?.us + '   ends: ' + current?.ends?.us);
  console.log('  seasonal_affix: ' + JSON.stringify(current?.seasonal_affix));
  console.log('  rotation (' + current?.dungeons.length + '):');
  current?.dungeons.forEach((d: any) =>
    console.log('    ' + d.name + '  [slug=' + d.slug + ' cmid=' + d.challenge_mode_id + ']'),
  );

  console.log('\n>> GOTCHA: Raider.IO ids (rio_id, challenge_mode_id) are NOT Blizzard journal-instance ids.');
  console.log('>> Raidbots "' + mplusPool?.name + '" DOES speak journal-instance ids. Cross-check by name:');
  const rioNames = new Set<string>((current?.dungeons ?? []).map((d: any) => d.name));
  const rbNames = new Set<string>((mplusPool?.encounters ?? []).map((e: any) => e.name));
  const agree = rioNames.size === rbNames.size && [...rioNames].every((n) => rbNames.has(n));
  console.log('>> Rotations agree? ' + (agree ? 'YES - identical sets' : 'NO - DRIFT DETECTED'));
  if (!agree) {
    console.log('   Raider.IO only: ' + [...rioNames].filter((n) => !rbNames.has(n)).join(', '));
    console.log('   Raidbots only:  ' + [...rbNames].filter((n) => !rioNames.has(n)).join(', '));
  }

  // --- 7. Wowhead RSS ----------------------------------------------------
  hr('STEP 7 - Wowhead retail RSS: field names of first item');
  const res = await fetch('https://www.wowhead.com/news/rss/retail', {
    headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip' },
  });
  const xml = await res.text();
  const firstItem = xml.slice(xml.indexOf('<item>'), xml.indexOf('</item>') + 7);
  const tags = [...firstItem.matchAll(/<([a-zA-Z:]+)[\s>]/g)].map((m) => m[1]);
  console.log('HTTP ' + res.status + ', ' + xml.length + ' bytes');
  console.log('Channel <ttl>: ' + (xml.match(/<ttl>(\d+)<\/ttl>/)?.[1] ?? '(none)') + ' minutes');
  console.log('\nFIELD NAMES on first <item>: ' + [...new Set(tags)].join(', '));
  console.log('\nFirst item raw (truncated):\n' + firstItem.slice(0, 700));

  hr('PROBE COMPLETE');
}

main().catch((e) => {
  console.error('\nPROBE FAILED: ' + e.message);
  process.exit(1);
});
