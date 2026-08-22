/**
 * sync:loot — Blizzard journal encounters -> items, item_stats, item_sources
 *
 * See planning/03-etl.md §2. Unlike sync:instances this is NOT all-or-nothing:
 * each instance commits in its own transaction, so a bad night leaves you with
 * 6 good dungeons and 2 stale ones rather than an empty database.
 *
 * Usage:
 *   npm run sync:loot                 rotation dungeons + current-expansion raids
 *   npm run sync:loot -- --dungeons   rotation dungeons only (much faster)
 */
import { and, eq, isNull, or } from 'drizzle-orm';

import { BlizzardError, blizz, blizzOrNull, fetchItemIconFileId } from '../lib/blizzard/client';
import { db, schema } from '../lib/db/client';
import { withSyncRun, type SyncContext } from '../lib/db/sync-run';
import { isKnownStat } from '../lib/domain/stats';
import { slotFor } from '../lib/domain/slots';
import season from '../config/season.json';

const DUNGEONS_ONLY = process.argv.includes('--dungeons');

// ------------------------------------------------------------------ API shapes

type JournalEncounter = {
  id: number;
  name: string;
  /** entry.id is the JournalEncounterItem id; the real item id is entry.item.id. */
  items?: { id: number; item: { id: number; name: string } }[];
};

type ItemStat = {
  type: { type: string };
  value: number;
  is_negated?: boolean;
};

type ItemDetail = {
  id: number;
  name: string;
  quality?: { type: string };
  item_class?: { id: number };
  item_subclass?: { id: number };
  inventory_type?: { type: string };
  level?: number;
  preview_item?: {
    binding?: { type: string };
    stats?: ItemStat[];
  };
};

type ResolvedItem = {
  detail: ItemDetail;
  stats: { statKey: string; amount: number; isNegated: number }[];
};

// --------------------------------------------------------------------- helpers

function resolveItem(detail: ItemDetail, ctx: SyncContext): ResolvedItem {
  const raw = detail.preview_item?.stats ?? [];

  const stats = raw.map((s) => {
    if (!isKnownStat(s.type.type)) {
      // Loud, but not fatal: killing a 4-minute sync over one new stat is worse than
      // flagging it. scripts/verify-assumptions.ts is the hard gate (Step 10).
      ctx.warn(
        `Unknown stat "${s.type.type}" on ${detail.name} (${detail.id}). ` +
          `STAT_MAP in lib/domain/stats.ts may be out of date.`,
      );
    }
    return {
      // Stored verbatim, negation included — see planning/02-data-model.md.
      statKey: s.type.type,
      amount: s.value,
      isNegated: s.is_negated ? 1 : 0,
    };
  });

  return { detail, stats };
}

// ------------------------------------------------------------------------ sync

async function run() {
  await withSyncRun('loot', async (ctx) => {
    // --- 1. Which instances are in scope ----------------------------------
    const currentExpansion = season.expansion.blizzardJournalExpansionId;

    const targets = db
      .select()
      .from(schema.instances)
      .where(
        DUNGEONS_ONLY
          ? eq(schema.instances.inCurrentRotation, 1)
          : or(
              eq(schema.instances.inCurrentRotation, 1),
              and(eq(schema.instances.type, 'raid'), eq(schema.instances.expansionId, currentExpansion)),
            ),
      )
      .all();

    if (targets.length === 0) {
      throw new Error('No instances in scope. Run "npm run sync:instances" first.');
    }

    ctx.log(
      `${targets.length} instances in scope` +
        (DUNGEONS_ONLY ? ' (--dungeons: rotation only).' : ' (rotation + current raids).'),
    );

    // Cross-instance cache: the same item drops in more than one place, and a second
    // fetch would cost a request for data we already have.
    const itemCache = new Map<number, ResolvedItem | null>();

    let itemsWritten = 0;
    let sourcesWritten = 0;
    let instancesDone = 0;

    // --- 2. Per instance, per encounter -----------------------------------
    for (const [index, instance] of targets.entries()) {
      const prefix = `[${index + 1}/${targets.length}] ${instance.name}`;

      try {
        const encounters = db
          .select()
          .from(schema.encounters)
          .where(eq(schema.encounters.instanceId, instance.id))
          .all();

        if (encounters.length === 0) {
          ctx.warn(`${instance.name} has no encounters — run sync:instances first.`);
          continue;
        }

        // encounterId -> item ids that drop from it
        const drops = new Map<number, number[]>();

        for (const encounter of encounters) {
          const detail = await blizzOrNull<JournalEncounter>(
            `/data/wow/journal-encounter/${encounter.id}`,
          );

          if (!detail) {
            ctx.warn(`${instance.name}: encounter ${encounter.id} (${encounter.name}) not found.`);
            continue;
          }

          drops.set(
            encounter.id,
            (detail.items ?? []).map((entry) => entry.item.id),
          );
        }

        const uniqueIds = [...new Set([...drops.values()].flat())];
        const toFetch = uniqueIds.filter((id) => !itemCache.has(id));
        ctx.log(`${prefix}: ${encounters.length} bosses, ${uniqueIds.length} items (${toFetch.length} new)`);

        for (const itemId of toFetch) {
          try {
            const detail = await blizz<ItemDetail>(`/data/wow/item/${itemId}`);
            itemCache.set(itemId, resolveItem(detail, ctx));
          } catch (error) {
            if (error instanceof BlizzardError && error.isNotFound) {
              ctx.warn(`Item ${itemId} not found (listed by ${instance.name}).`);
              itemCache.set(itemId, null);
            } else {
              throw error;
            }
          }
        }

        // --- 3. Commit this instance ---------------------------------------
        const syncedAt = Date.now();

        db.transaction((tx) => {
          for (const itemId of uniqueIds) {
            const resolved = itemCache.get(itemId);
            if (!resolved) continue;

            const { detail, stats } = resolved;
            const inventoryType = detail.inventory_type?.type ?? 'NON_EQUIP';
            const slot = slotFor(inventoryType);

            const row = {
              id: detail.id,
              name: detail.name,
              quality: detail.quality?.type ?? null,
              itemClass: detail.item_class?.id ?? 0,
              itemSubClass: detail.item_subclass?.id ?? 0,
              inventoryType,
              slot,
              baseItemLevel: detail.level ?? null,
              binding: detail.preview_item?.binding?.type ?? null,
              // Mounts, recipes and housing decor sit in loot tables. Kept so the loot
              // directory is complete, flagged so the gear finder never scores them.
              isEquippable: slot === 'none' ? 0 : 1,
              syncedAt,
            };

            tx.insert(schema.items)
              .values(row)
              .onConflictDoUpdate({ target: schema.items.id, set: row })
              .run();

            // Replace stats wholesale: a patch can remove a stat, and an upsert alone
            // would leave the old row orphaned on the item.
            tx.delete(schema.itemStats).where(eq(schema.itemStats.itemId, detail.id)).run();

            for (const stat of stats) {
              tx.insert(schema.itemStats)
                .values({
                  itemId: detail.id,
                  statKey: stat.statKey,
                  amount: stat.amount,
                  isNegated: stat.isNegated,
                })
                .onConflictDoNothing()
                .run();
            }

            itemsWritten += 1;
          }

          for (const [encounterId, itemIds] of drops) {
            for (const itemId of itemIds) {
              if (!itemCache.get(itemId)) continue;

              // Count rows actually written, not attempts: a boss can list the same
              // item twice, and the UNIQUE guard drops the repeat.
              const result = tx
                .insert(schema.itemSources)
                .values({
                  itemId,
                  sourceType: instance.type === 'raid' ? 'raid' : 'dungeon',
                  encounterId,
                  instanceId: instance.id,
                  note: null,
                })
                .onConflictDoNothing()
                .run();

              sourcesWritten += result.changes;
            }
          }
        });

        instancesDone += 1;
      } catch (error) {
        // One bad instance must not cost the whole run. Its transaction rolled back,
        // so whatever was there before survives.
        const message = error instanceof Error ? error.message : String(error);
        ctx.warn(`${instance.name} failed and was rolled back: ${message}`);
      }
    }

    ctx.log(`${instancesDone}/${targets.length} instances committed.`);
    ctx.log(`${itemsWritten} item writes, ${sourcesWritten} source rows.`);

    // --- 4. Icons: lazy second pass, non-fatal -----------------------------
    // This roughly doubles the request count, so it runs last: if it is interrupted,
    // everything above is already committed and icons simply fall back to the
    // question mark in the UI.
    const needIcons = db
      .select({ id: schema.items.id })
      .from(schema.items)
      .where(isNull(schema.items.iconFileId))
      .all();

    ctx.log(`Fetching icons for ${needIcons.length} items...`);
    let iconsFetched = 0;

    for (const { id } of needIcons) {
      try {
        const fileId = await fetchItemIconFileId(id);
        if (fileId !== null) {
          db.update(schema.items)
            .set({ iconFileId: fileId })
            .where(eq(schema.items.id, id))
            .run();
          iconsFetched += 1;
        }
      } catch {
        // Non-fatal by design; the UI falls back to the question mark.
      }
    }

    ctx.log(`${iconsFetched} icons fetched.`);
    ctx.setRecordCount(itemsWritten);
  });
}

run();
