# Plan — Dynamic board colours from the Spotify cover

Status: ✅ built. Builds on the design-token layer (`design-tokens.md`).
Spec: `spec.md` §2.16, FR-DSN-005 / AC-045.

## Goal

Optional mode: derive a palette from the current Spotify album cover and use it to decorate the
**whole board** (accent + background gradient), with live blend sliders, and have the drill popup
follow. Opt-in, saved with the config, reverts to the theme when nothing is playing.

## Decisions

- Controls live in a dedicated **"Spotify cover colors"** section at the **top of the Design tab**
  (toggle + accent-blend + background-blend sliders + a live swatch/status).
- Palette extraction happens in **Rust** (canvas would taint on the Spotify CDN).
- Scope: **both** accent and board background; text/panels/borders stay from the theme (contrast).
- Popup follows; **nothing playing → revert to theme**.
- One cover fetch per track change (OK per product decision); cached per URL.
- Extraction: pick the **most vivid dominant** bucket as accent, next as secondary; skip near-black/white.

## Implementation

**Rust**
- `spotify_cover_palette(url) -> { accent, secondary }`: `download_image()` → decode (`image`
  crate; jpeg/png enabled) → 64×64 → `pick_palette` (4-bit/channel histogram, `frequency ×
  saturation`, extreme colours penalised) → hex. In-memory cache per URL. Unit test
  `cover_palette_prefers_vivid_colour`.

**JS**
- `src/colors.js` (loaded before `main.js`): `hexToRgb`, `mixHex`, `rgbToHsl`, `clampLightness`,
  `luminance`, `contrastOn` (+ node test `npm run test:colors`).
- `applyAppearance()` computes effective tokens: when `state.design.dynamicSpotify` and a palette
  exists, `--accent = clampLightness(mix(themeAccent, coverAccent, accentMix))` and
  `--board-bg = gradient(mix(themeBg, coverAccent, bgMix), mix(themeBg, coverSecondary, bgMix*0.6))`.
  The popup CSS push uses the same effective accent/board-bg.
- `refreshDynamicPalette(discover)`: fetch when the cover URL changes (or on toggle via
  `spotifyNowPlaying`); stale-response guard; clears on "nothing playing"; keeps last on failure.
- Spotify tile `refresh()` sets `lastSpotifyArt` and calls `refreshDynamicPalette()`.
- State: `state.design.dynamicSpotify` (bool), `dynAccentMix` (default 60), `dynBgMix` (default 35)
  — persisted in the dashboard config and included in export/import.

## Corrections log

- Built as planned. Image crate `jpeg`/`png` features enabled explicitly (already unified via
  `imageproc`, so no extra build cost). All settings persist via `state.design` (saved on toggle
  and debounced on slider drags).
