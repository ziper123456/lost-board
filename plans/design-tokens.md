# Implementation Plan — UI overhaul: design-token system

> ✅ **Status: built and merged (PR #42).** Phases 1 + 2 shipped. Custom CSS (Phase 3) dropped by request.

## 1. Goal

Make every component *decoratable*. Today the app exposes only 7 theme colors + a
global radius + per-tile header/content/icon. This adds a **design-token layer**: a
curated set of global CSS variables (surfaces, borders, radius, typography, buttons,
rows/boxes, tiles, accents, effects), exposed in a **Design settings tab** with live
preview, per-token reset and one-click **presets**, layered *over* the existing themes.

## 2. Key design decisions

- **Tokens over an inspector.** A devtools-style per-element editor is unmaintainable;
  a curated token set covering every component *category* is the idiomatic fit and
  flows through config export/import for free.
- **Themes are base palettes; `state.design` overlays them.** `applyAppearance()`
  computes a theme-derived default for every token, then applies any `state.design`
  override, writing all variables to `:root`.
- **`styles.css` consumes tokens with fallbacks** (`var(--token, <current default>)`)
  so an unset token renders exactly as before — the refactor is visually additive.
- **Fonts are offline**: the picker offers installed families + generic categories +
  a custom family field (no web-font loading).
- **Custom CSS** (raw overrides) — considered and **dropped**; the token set + per-tile
  decoration cover the need without the unguarded escape hatch.

## 3. Phases

1. **Phase 1 (built):** `state.design`, `applyAppearance` overlay, `styles.css` token
   refactor for the priority components (buttons, tiles, borders, radius, rows/inputs,
   typography, scrollbars, background gradient), Design tab + presets + font picker.
2. **Phase 2 (built):** per-tile decoration — tile border color/width, radius, shadow,
   background gradient and font size/weight, emitted as per-tile CSS vars on
   `.compartment` (removed when unset so they fall back to the design/theme token).
3. ~~**Phase 3 — Custom CSS escape hatch**~~ — **dropped** (not needed).

## 4. Corrections log

- 2026-10-15: Phase 1 covers the high-impact tokens; a few hardcoded values remain
  (e.g. hover colors on specific variants, shadows on `.settings-panel`/`.ctx-menu`) and
  can be tokenised incrementally as more tokens are added.
- 2026-10-15 (PR #42 review follow-ups): board gradient now applies via a `--board-bg`
  token (was covered by the opaque `.dashboard`); heading-weight and transition tokens are
  now consumed; `.wea-clock` uses `var(--font)`; Design sliders debounce `saveState`.
- 2026-10-15: Custom CSS (Phase 3) dropped by request.
