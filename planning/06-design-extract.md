# 06 — Design tokens

> **Status change.** The brief specified extracting tokens from
> `reference/existing.html`. That file does not exist and will not — the decision was
> to build from scratch. So this is a **design definition**, not an extraction.
> Nothing here was pulled from a prior artifact; everything is chosen deliberately below.

## 1. Principle

This is a data-density tool, not a marketing page. The design job is to make ~400 rows
of item data scannable, and to keep the honesty caveats visible without letting them
become wallpaper the user learns to ignore.

Three rules:

1. **Item quality colour is data, not decoration.** WoW players read item colour
   pre-attentively. Using the canonical quality colours is a functional decision.
2. **Fit score needs its own visual channel, separate from quality.** Otherwise a
   purple epic reads as "better" than a blue rare regardless of its 38% fit.
3. **Dark by default.** The subject matter is a dark game UI, and this is a tool used
   next to a running client.

## 1b. Token naming (updated at Step 1)

Tailwind v4 takes theme config **in CSS via `@theme`**, not `tailwind.config.ts`. Token
names therefore follow Tailwind's namespace convention (`--color-*`, `--text-*`,
`--radius-*`), and the generated utility is the token name minus its namespace.

Names were flattened so the utilities read well — `--color-surface` gives `bg-surface`,
where a nested `bg.surface` would have given the stuttering `bg-bg-surface`.
Source of truth is [`app/globals.css`](../app/globals.css).

## 2. Palette

### Surface
```
--color-base      #0e0f13    page background      -> bg-base
--color-surface   #16181f    cards, tables        -> bg-surface
--color-raised    #1e212b    hovered rows         -> bg-raised
--color-inset     #0a0b0e    code blocks, inputs  -> bg-inset
--color-line        #2a2e3a  default hairline     -> border-line
--color-line-strong #3a3f4f  emphasised divider   -> border-line-strong
```

### Text
```
--color-ink         #e8eaf0   primary    -> text-ink
--color-ink-soft    #a2a8b8   secondary  -> text-ink-soft
--color-ink-faint   #6b7285   muted; timestamps, "not gear" -> text-ink-faint
--color-ink-inverse #0e0f13   on light   -> text-ink-inverse
```

### Accent
```
--accent        #c8a45c    muted gold. Primary actions, active nav, season badge.
--accent-hover  #dbb96f
--accent-muted  #5a4c2e    accent at low emphasis (badge backgrounds)
```
Gold rather than Blizzard blue: blue collides with the Rare quality colour, and quality
colours must win any conflict.

### Item quality — canonical, do not alter
```
--color-q-poor       #9d9d9d     -> text-q-poor
--color-q-common     #ffffff
--color-q-uncommon   #1eff00
--color-q-rare       #0070dd
--color-q-epic       #a335ee
--color-q-legendary  #ff8000
--color-q-artifact   #e6cc80
--color-q-heirloom   #00ccff
```
`--color-q-rare` at #0070dd on `--color-surface` is low contrast for body text. Use quality
colour on **item names only** (bold, ≥14px), never on small or secondary text. Where a
name would fail contrast, the row keeps a 3px left border in the quality colour and the
name renders in `--text-primary`.

### Fit score — sequential ramp, deliberately not the quality hue range
```
--color-fit-90   #4ade80    90-100%          -> text-fit-90 / bg-fit-90
--color-fit-75   #a3e635    75-89%
--color-fit-60   #facc15    60-74%
--color-fit-40   #fb923c    40-59%
--color-fit-0    #f87171    below 40%
--color-fit-none #6b7285    NO_SECONDARIES
```
Green-to-red is defensible here because the scale is genuinely ordinal and single-
dimensioned. Each badge shows **the number as text** as well as the colour, so the
colour is redundant encoding, not the only channel.

### Status
```
--color-ok      #4ade80    synced <24h    -> text-ok
--color-stale   #facc15    <7d            -> text-stale
--color-error   #f87171    error / >7d    -> text-error
--color-running #60a5fa    in flight      -> text-running
```

## 3. Type

System stack — no webfont. This is a local tool; a font request is latency for nothing.

```
--font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
             "Liberation Mono", monospace;
```

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `text-display` | 32px / 1.15 | 600 | Page titles |
| `text-h1` | 24px / 1.25 | 600 | Surface headings |
| `text-h2` | 18px / 1.3 | 600 | Instance / slot section headers |
| `text-h3` | 15px / 1.4 | 600 | Encounter names |
| `text-body` | 14px / 1.5 | 400 | Default |
| `text-item` | 14px / 1.4 | 600 | Item names (carries quality colour) |
| `text-sm` | 13px / 1.45 | 400 | Stat lines, source tags |
| `text-xs` | 11px / 1.4 | 500 | Badges, timestamps, table headers |
| `text-num` | 14px / 1 | 600 | **mono** — fit scores, ilvl, stat values |

Numeric columns use `--font-mono` with `font-variant-numeric: tabular-nums` so stat
values align down a column. In a table of 400 rows this is the difference between
scannable and not.

## 4. Spacing

4px base. Tailwind's default scale, restricted to: `1 2 3 4 6 8 12 16`
(4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px).

Rhythm:
- Table row vertical padding: `2` (8px). Dense by intent.
- Card padding: `4` (16px).
- Section gap: `8` (32px).
- Page gutter: `6` (24px), `4` on mobile.

## 5. Radii and elevation

```
--radius-sm   4px    badges, inputs
--radius-md   6px    buttons, rows
--radius-lg   10px   cards, panels
--radius-full 9999px pills
```

No drop shadows. Depth comes from `--bg-surface` → `--bg-raised` steps plus `--border`.
Shadows on a near-black background are invisible work.

## 6. Components

| Component | Composition |
|---|---|
| `<FitScoreBadge>` | Pill, `--radius-full`, `text-num`, background = fit ramp at 18% alpha, text = fit colour at full. Shows `87%` plus a `·2` secondary count in `text-xs`. `NO_SECONDARIES` → grey pill reading "no secondaries". |
| `<ItemName>` | `text-item` in quality colour; falls back to `--text-primary` with a 3px quality left-border when contrast fails. |
| `<StatLine>` | `text-sm`, `--text-secondary`, stats joined by `·`. The build's #1 secondary rendered in `--text-primary` to make matches pop. |
| `<SourceTag>` | `text-xs`, `--text-muted`, format `Instance — Boss`. |
| `<Badge>` | `--radius-full`, `text-xs`, uppercase, `--accent-muted` background. Used for "in rotation", "not gear". |
| `<Card>` | `--bg-surface`, `--border` hairline, `--radius-lg`, `p-4`. Hover → `--bg-raised`. |
| `<DataTable>` | Header row `text-xs` uppercase `--text-muted` with `--border-strong` bottom. Rows striped only on hover. |
| `<Banner>` | Left border 3px in status colour, tinted background at 8% alpha, `--radius-md`. Info / warn / error variants. |
| `<EmptyState>` | Centred, `text-h2` + `text-body` + a `--font-mono` command chip on `--bg-inset`. |
| `<QualityBorder>` | 3px left border, the row-level quality carrier. |

## 7. Tailwind mapping

**There is no `tailwind.config.ts`.** Tailwind v4 (4.3.3) configures the theme in CSS.
The live definition is [`app/globals.css`](../app/globals.css); this is its shape:

```css
@import 'tailwindcss';

@theme {
  --color-base: #0e0f13;          /* -> bg-base            */
  --color-surface: #16181f;       /* -> bg-surface         */
  --color-raised: #1e212b;
  --color-inset: #0a0b0e;

  --color-line: #2a2e3a;          /* -> border-line        */
  --color-line-strong: #3a3f4f;

  --color-ink: #e8eaf0;           /* -> text-ink           */
  --color-ink-soft: #a2a8b8;
  --color-ink-faint: #6b7285;

  --color-accent: #c8a45c;
  --color-accent-hover: #dbb96f;
  --color-accent-muted: #5a4c2e;

  --color-q-poor: #9d9d9d;        /* ... through q-heirloom */
  --color-fit-90: #4ade80;        /* ... through fit-none   */
  --color-ok: #4ade80;            /* stale / error / running */

  --text-display: 32px;           /* -> text-display        */
  --text-display--line-height: 1.15;
  --text-display--font-weight: 600;
  /* ... h1 h2 h3 body item sm xs num */

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 10px;
}
```

Two notes for later steps:

- **Type tokens carry their own line-height and weight** via the `--text-*--line-height`
  and `--text-*--font-weight` suffixes, so `text-h2` alone sets all three. Do not pair it
  with a separate `font-semibold`.
- **Tailwind v4 tree-shakes unused theme values.** The quality and fit colours will not
  appear in the emitted CSS until a component actually uses them, which is expected —
  they were verified to resolve correctly at Step 1 and simply have no consumer yet.

## 7b. Game artwork (added at Step 2)

Two CDNs, both verified reachable. `lib/domain/icons.ts` is the only place URLs are built.

| Use | Source | Addressing |
|---|---|---|
| Item icons | `render.worldofwarcraft.com/{region}/icons/{56\|18}/{fileDataId}.jpg` | **numeric fileDataId** from `/data/wow/media/item/{id}` |
| Instance zone art | `render.worldofwarcraft.com/{region}/zones/{name}-small.jpg` | full URL stored from `/data/wow/media/journal-instance/{id}` |
| Fixed shell icons | `wow.zamimg.com/images/wow/icons/{large\|medium\|small}/{slug}.jpg` | readable slug, e.g. `inv_misc_gear_01` |

- **Blizzard's CDN is primary** for anything data-driven. Wowhead's CDN is used only for
  the handful of decorative shell icons, where there is no item id to resolve — and
  Wowhead is credited in the footer.
- **There is no readable icon slug in the Game Data API.** The `inv_helm_*` names on
  Wowhead come from elsewhere. Do not plan around having them.
- Zone art exists **only** in the `-small` variant; the bare filename returns 403.
- `<WowIcon>` renders a plain `<img>`, not `next/image`: these are 1–3 KB JPEGs already
  at display size, so the optimizer adds latency and config for no gain.
- **Missing-icon handling is pure CSS.** The question mark sits as a `background-image`
  behind the `<img>`; a 404 lets it show through with zero client JavaScript. This
  matters because loot tables render hundreds of icons at once. Shell icons load
  `eager` so the fallback does not flash before the real icon arrives.
- Every slug in `SHELL_ICONS` was confirmed to return 200 before use. Adding one without
  checking renders a broken tile.

## 8. Accessibility notes

- Fit score is never colour-only — the number is always present.
- "In rotation" is a text badge, not a colour cue.
- Quality colour is never the sole carrier of meaning; quality is also a text column
  in loot tables.
- All body text meets 4.5:1 on its background. `--text-muted` (#6b7285) on
  `--bg-surface` sits at ~4.6:1 and is restricted to `text-xs` metadata.
- Focus rings: 2px `--accent`, 2px offset. Never removed.

## 9. Not carried over

The brief's §7 asked to note anything in the existing HTML with no counterpart in the
four surfaces. There is no existing HTML, so this section is empty by construction.
Recorded here so a future reader does not go looking for a file that was never adopted.
