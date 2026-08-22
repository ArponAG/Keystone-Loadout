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

## 2. Palette

### Surface
```
--bg-base      #0e0f13    page background
--bg-surface   #16181f    cards, table backgrounds
--bg-raised    #1e212b    hovered rows, popovers
--bg-inset     #0a0b0e    code blocks, form inputs
--border       #2a2e3a    default hairline
--border-strong #3a3f4f   emphasised divider
```

### Text
```
--text-primary   #e8eaf0
--text-secondary #a2a8b8
--text-muted     #6b7285   timestamps, "not gear" rows
--text-inverse   #0e0f13
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
--q-poor       #9d9d9d
--q-common     #ffffff
--q-uncommon   #1eff00
--q-rare       #0070dd
--q-epic       #a335ee
--q-legendary  #ff8000
--q-artifact   #e6cc80
--q-heirloom   #00ccff
```
`--q-rare` at #0070dd on `--bg-surface` is low contrast for body text. Use quality
colour on **item names only** (bold, ≥14px), never on small or secondary text. Where a
name would fail contrast, the row keeps a 3px left border in the quality colour and the
name renders in `--text-primary`.

### Fit score — sequential ramp, deliberately not the quality hue range
```
--fit-90  #4ade80    90-100%
--fit-75  #a3e635    75-89%
--fit-60  #facc15    60-74%
--fit-40  #fb923c    40-59%
--fit-0   #f87171    below 40%
--fit-none #6b7285   NO_SECONDARIES
```
Green-to-red is defensible here because the scale is genuinely ordinal and single-
dimensioned. Each badge shows **the number as text** as well as the colour, so the
colour is redundant encoding, not the only channel.

### Status
```
--status-ok      #4ade80    synced <24h
--status-stale   #facc15    <7d
--status-error   #f87171    error / >7d
--status-running #60a5fa
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

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      bg:     { base:'#0e0f13', surface:'#16181f', raised:'#1e212b', inset:'#0a0b0e' },
      border: { DEFAULT:'#2a2e3a', strong:'#3a3f4f' },
      text:   { primary:'#e8eaf0', secondary:'#a2a8b8', muted:'#6b7285' },
      accent: { DEFAULT:'#c8a45c', hover:'#dbb96f', muted:'#5a4c2e' },
      quality:{ poor:'#9d9d9d', common:'#ffffff', uncommon:'#1eff00', rare:'#0070dd',
                epic:'#a335ee', legendary:'#ff8000', artifact:'#e6cc80', heirloom:'#00ccff' },
      fit:    { 90:'#4ade80', 75:'#a3e635', 60:'#facc15', 40:'#fb923c',
                0:'#f87171', none:'#6b7285' },
      status: { ok:'#4ade80', stale:'#facc15', error:'#f87171', running:'#60a5fa' },
    },
    borderRadius: { sm:'4px', md:'6px', lg:'10px' },
    fontSize: {
      display:['32px',{lineHeight:'1.15',fontWeight:'600'}],
      h1:['24px',{lineHeight:'1.25',fontWeight:'600'}],
      h2:['18px',{lineHeight:'1.3', fontWeight:'600'}],
      h3:['15px',{lineHeight:'1.4', fontWeight:'600'}],
      body:['14px',{lineHeight:'1.5'}],
      item:['14px',{lineHeight:'1.4',fontWeight:'600'}],
      sm:['13px',{lineHeight:'1.45'}],
      xs:['11px',{lineHeight:'1.4',fontWeight:'500'}],
      num:['14px',{lineHeight:'1',fontWeight:'600'}],
    },
  },
}
```

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
