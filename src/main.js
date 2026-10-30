/**
 * lost-board — frontend scaffold.
 *
 * Plain JS + a lightweight custom grid. Compartments are rendered from `state`.
 * Native operations (open folder/solution/url, system stats) call the Tauri
 * backend via `window.__TAURI__`. When running in a plain browser (no Tauri),
 * those calls no-op so the UI still renders for prototyping.
 */

// Plain JS frontend (no bundler). Tauri v2 exposes its API globally as
// window.__TAURI__ when running inside the app; in a plain browser it is absent
// and the UI renders in a prototype mode.

const invoke = (cmd, args) => window.__TAURI__.core.invoke(cmd, args);

// Inline SVG icons (stroke-based, inherit currentColor) used by the tile header
// and toolbar buttons instead of emoji glyphs.
const ICON = {
  collapse: (collapsed) =>
    `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${collapsed ? '<path d="M6 4l4 4-4 4"/>' : '<path d="M4 6l4 4 4-4"/>'}</svg>`,
  preview: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="1.8"/></svg>`,
  settings: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>`,
  rename: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z"/><path d="M10 4l2 2"/></svg>`,
  remove: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  folder: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4.5a1 1 0 0 1 1-1h3l1.5 1.5h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>`,
  solution: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z"/><path d="M9 1.5v4h4"/></svg>`,
  file: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5z"/><path d="M9 1.5v4h4"/><circle cx="8" cy="10.5" r="1.2"/></svg>`,
  volumeOn: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6v4h2.5L8 13V3L4.5 6z"/><path d="M10 5.5a3.5 3.5 0 0 1 0 5M11.8 3.7a6 6 0 0 1 0 8.6"/></svg>`,
  volumeOff: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6v4h2.5L8 13V3L4.5 6z"/><path d="M10.5 6.5l3 3M13.5 6.5l-3 3"/></svg>`,
  copy: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/></svg>`,
  plus: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M3 8h10"/></svg>`,
  panel: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6h12"/></svg>`,
};

// ---------------------------------------------------------------------------
// State (persisted to localStorage). Each compartment has a `kind` and `data`.
// ---------------------------------------------------------------------------
const DEFAULT_STATE = {
  columns: 12,
  zoom: 1,
  previewWidth: 320,
  theme: "dark",
  cornerRadius: 10,
  wall: false,
  backgroundMode: false,
  lyricsOffsets: {},
  lyricsTranslate: false,
  lyricsLang: {},
  lyricsTargets: {},
  backup: {
    enabled: false,
    dir: "",
    schedule: "daily",
    time: "03:00",
    lastExportAt: 0,
    lastError: "",
    lastErrorAt: 0,
  },
  captions: {
    lang: "de",
    deviceId: "",
    autoSave: true,
    saveDir: "",
    finalizeMs: 700,
  },
  compartments: [
    { id: "sys", kind: "system", title: "System", x: 0, y: 0, w: 3, h: 2 },
    { id: "wea", kind: "weather", title: "Weather", x: 3, y: 0, w: 3, h: 2, data: { location: "" } },
    { id: "bmk", kind: "bookmarks", title: "Bookmarks", x: 6, y: 0, w: 6, h: 2, data: { urls: [] } },
    { id: "lch", kind: "launcher", title: "Folders & Files", x: 0, y: 2, w: 6, h: 3, data: { items: [] } },
  ],
};

// Default translation targets per source language. Languages outside
// EN/DE/ES/VI fall back to `default` (English).
const DEFAULT_LYRICS_TARGETS = {
  en: ["de", "es"],
  de: ["en", "es"],
  es: ["en", "de"],
  vi: ["de", "es"],
  default: ["en"],
};
// Reserved drill category: random translated lyric phrases (never graded).
const LYRICS_CAT = "__lyrics__";

function lyricsTargetsConfig() {
  if (!state.lyricsTargets || typeof state.lyricsTargets !== "object") state.lyricsTargets = {};
  const map = state.lyricsTargets;
  for (const key of ["en", "de", "es", "vi", "default"]) {
    if (!Array.isArray(map[key])) map[key] = [...DEFAULT_LYRICS_TARGETS[key]];
  }
  return map;
}

// Built-in themes: CSS variable palettes applied to :root.
const THEMES = {
  dark: { bg: "#101014", panel: "#1a1a20", panel2: "#23232b", border: "#2c2c36", text: "#e6e6ea", muted: "#9a9aa6", accent: "#7c3aed" },
  light: { bg: "#f4f4f7", panel: "#ffffff", panel2: "#eceef2", border: "#d7d9e0", text: "#1c1c22", muted: "#6b6b76", accent: "#7c3aed" },
  midnight: { bg: "#0a0e14", panel: "#111722", panel2: "#18202e", border: "#243044", text: "#dbe4f0", muted: "#7d8ca3", accent: "#38bdf8" },
  emerald: { bg: "#0b1512", panel: "#0f1c18", panel2: "#15251f", border: "#1f3a30", text: "#e0f0e8", muted: "#7fa593", accent: "#10b981" },
  amber: { bg: "#16120a", panel: "#1f180d", panel2: "#2a2113", border: "#3a2f1c", text: "#f2ead9", muted: "#a89570", accent: "#f59e0b" },
  dracula: { bg: "#282a36", panel: "#353746", panel2: "#44475a", border: "#4d5170", text: "#f8f8f2", muted: "#9a9cbf", accent: "#bd93f9" },
  nord: { bg: "#2e3440", panel: "#3b4252", panel2: "#434c5e", border: "#4c566a", text: "#eceff4", muted: "#8b98b0", accent: "#88c0d0" },
  solarizedDark: { bg: "#002b36", panel: "#073642", panel2: "#0d4b5c", border: "#155e75", text: "#839496", muted: "#5f7a85", accent: "#268bd2" },
  solarizedLight: { bg: "#fdf6e3", panel: "#eee8d5", panel2: "#e3dabf", border: "#d3c9a8", text: "#657b83", muted: "#93a1a1", accent: "#268bd2" },
  rosePine: { bg: "#191724", panel: "#1f1d2e", panel2: "#26233a", border: "#403d52", text: "#e0def4", muted: "#908caa", accent: "#eb6f92" },
  gruvbox: { bg: "#282828", panel: "#3c3836", panel2: "#504945", border: "#665c54", text: "#ebdbb2", muted: "#a89984", accent: "#fabd2f" },
};

// Apply the theme palette, then layer the optional design-token overrides on
// top, plus the corner radius and background gradient. All tokens are written
// to :root as CSS variables; styles.css consumes them with fallbacks, so an
// unset token always resolves to the theme default.
let dynamicPalette = null; // { url, accent, secondary } — transient, from the current cover
let lastSpotifyArt = "";   // last seen cover URL (drives the dynamic palette)

function applyAppearance() {
  const t = THEMES[state.theme] || THEMES.dark;
  const d = state.design || {};
  const v = (k, fb) => (d[k] !== undefined && d[k] !== null && d[k] !== "" ? d[k] : fb);
  const px = (k, fb) => `${v(k, fb)}px`;
  const root = document.documentElement.style;
  // Dynamic colours derived from the current Spotify cover (optional).
  const dynOn = !!(d.dynamicSpotify && dynamicPalette && typeof Colors !== "undefined");
  const pct = (x, fb) => (Number.isFinite(Number(x)) ? Math.max(0, Math.min(100, Number(x))) : fb);
  const baseAccent = v("accent", t.accent);
  const effectiveAccent = dynOn
    ? Colors.clampLightness(Colors.mixHex(baseAccent, dynamicPalette.accent, pct(d.dynAccentMix, 60) / 100), 0.42, 0.82)
    : baseAccent;
  const baseBg = v("bg", t.bg);
  let boardBg;
  if (dynOn && pct(d.dynBgMix, 35) > 0) {
    const amt = pct(d.dynBgMix, 35) / 100;
    const from = Colors.mixHex(baseBg, dynamicPalette.accent, amt);
    const to = Colors.mixHex(baseBg, dynamicPalette.secondary || dynamicPalette.accent, amt * 0.6);
    boardBg = `linear-gradient(${v("bgAngle", 135)}deg, ${from}, ${to})`;
  } else {
    boardBg = d.bgFrom && d.bgTo ? `linear-gradient(${v("bgAngle", 135)}deg, ${d.bgFrom}, ${d.bgTo})` : "var(--bg)";
  }
  // Dynamic tiles: tint the border with the cover accent and give tiles a soft
  // cover-coloured glow (both scale with the accent blend).
  const dynAmt = pct(d.dynAccentMix, 60) / 100;
  const tileBorderBase = d.tileBorderColor || v("borderColor", t.border);
  const effectiveTileBorder = dynOn
    ? Colors.mixHex(tileBorderBase, effectiveAccent, dynAmt)
    : v("tileBorderColor", "var(--border)");
  let effectiveTileShadow = v("tileShadow", "none");
  if (dynOn) {
    const c = Colors.hexToRgb(dynamicPalette.accent);
    const alpha = (0.12 + dynAmt * 0.22).toFixed(2);
    effectiveTileShadow = `0 6px 22px rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
  }
  // Surfaces: panels, borders, inputs, tiles and scrollbar get a subtle tint
  // (own slider, kept low so text stays readable).
  const surfAmt = dynOn ? pct(d.dynSurfaceMix, 30) / 100 : 0;
  const mixSurf = (key, baseHex, factor, cssDefault) =>
    dynOn && surfAmt > 0
      ? Colors.mixHex(d[key] || baseHex, dynamicPalette.accent, surfAmt * factor)
      : v(key, cssDefault);
  const effectivePanel = mixSurf("panel", t.panel, 0.35, t.panel);
  const effectivePanel2 = mixSurf("panel2", t.panel2, 0.35, t.panel2);
  const effectiveBorder = mixSurf("borderColor", t.border, 0.5, t.border);
  // Borders of boxes inside tiles (folder rows, bookmarks, Azure repos, preview,
  // drill controls) lean harder into the dynamic accent than the global border.
  const effectiveBoxBorder = dynOn
    ? Colors.mixHex(effectiveBorder, effectiveAccent, dynAmt * 0.5)
    : effectiveBorder;
  const effectiveTileBg = mixSurf("tileBg", t.panel, 0.3, "var(--panel)");
  const effectiveInputBg = mixSurf("inputBg", t.panel2, 0.25, "var(--panel-2)");
  const effectiveScroll = mixSurf("scrollThumb", t.panel2, 0.4, "var(--panel-2)");
  const effectiveBtnHover = mixSurf("btnHoverBg", t.border, 0.4, "var(--border)");
  root.setProperty("--bg", v("bg", t.bg));
  root.setProperty("--panel", effectivePanel);
  root.setProperty("--panel-2", effectivePanel2);
  root.setProperty("--border", effectiveBorder);
  root.setProperty("--box-border", effectiveBoxBorder);
  root.setProperty("--text", v("text", t.text));
  root.setProperty("--muted", v("muted", t.muted));
  root.setProperty("--accent", effectiveAccent);
  root.setProperty("--green", v("green", "#22c55e"));
  root.setProperty("--red", v("red", "#ef4444"));
  root.setProperty("--amber", v("amber", "#f59e0b"));
  const radiusGlobal = v("radiusGlobal", state.cornerRadius != null ? state.cornerRadius : 10);
  root.setProperty("--radius", `${radiusGlobal}px`);
  root.setProperty("--btn-radius", px("radiusButton", 6));
  root.setProperty("--input-radius", px("radiusInput", 6));
  root.setProperty("--tile-radius", px("radiusTile", radiusGlobal));
  root.setProperty("--btn-bg", v("btnBg", "var(--panel-2)"));
  root.setProperty("--btn-text", v("btnText", "var(--text)"));
  root.setProperty("--btn-border", v("btnBorder", "var(--border)"));
  root.setProperty("--btn-hover-bg", effectiveBtnHover);
  root.setProperty("--row-bg", v("rowBg", "transparent"));
  root.setProperty("--input-bg", effectiveInputBg);
  root.setProperty("--tile-bg", effectiveTileBg);
  root.setProperty("--tile-border", effectiveTileBorder);
  root.setProperty("--tile-border-w", px("tileBorderWidth", 1));
  root.setProperty("--tile-shadow", effectiveTileShadow);
  root.setProperty("--font", v("font", '"Segoe UI", system-ui, sans-serif'));
  root.setProperty("--font-size", px("fontBase", 16));
  root.setProperty("--scroll-thumb", effectiveScroll);
  // Heading weight / transition are only set when overridden, so their per-element
  // CSS fallbacks preserve the current look until the user changes them.
  if (d.headingWeight != null) root.setProperty("--heading-weight", String(d.headingWeight));
  else root.removeProperty("--heading-weight");
  if (d.transitionMs != null) root.setProperty("--transition", `${d.transitionMs}ms`);
  else root.removeProperty("--transition");
  // Board background: theme/design gradient, or the cover-derived one above.
  root.setProperty("--board-bg", boardBg);
  // Push the computed tokens to the drill popup (separate window, own stylesheet).
  if (window.__TAURI__) {
    // The popup paints --board-bg as a background *image layer* (under a scrim),
    // so a plain colour must be normalised to a gradient or the layer is invalid.
    const popupBoardBg =
      boardBg === "var(--bg)"
        ? `linear-gradient(${v("bg", t.bg)}, ${v("bg", t.bg)})`
        : boardBg;
    const popupScheme =
      typeof Colors !== "undefined" && Colors.luminance(v("bg", t.bg)) > 0.5 ? "light" : "dark";
    const popupCss =
      ":root{" +
      `color-scheme:${popupScheme};` +
      `--bg:${v("bg", t.bg)};` +
      `--panel:${effectivePanel};` +
      `--panel-2:${effectivePanel2};` +
      `--border:${effectiveBorder};` +
      `--box-border:${effectiveBoxBorder};` +
      `--tile-bg:${effectiveTileBg};` +
      `--text:${v("text", t.text)};` +
      `--muted:${v("muted", t.muted)};` +
      `--accent:${effectiveAccent};` +
      `--green:${v("green", "#22c55e")};` +
      `--red:${v("red", "#ef4444")};` +
      `--amber:${v("amber", "#f59e0b")};` +
      `--radius:${radiusGlobal}px;` +
      `--font:${v("font", '"Segoe UI", system-ui, sans-serif')};` +
      `--font-size:${v("fontBase", 16)}px;` +
      `--board-bg:${popupBoardBg};` +
      "}";
    void native.setPopupTheme(popupCss).catch(() => {});
  }
}

// Live swatch in the Design tab (if visible).
function updateDynSwatch() {
  const sw = document.getElementById("dyn-swatch");
  const st = document.getElementById("dyn-status");
  if (sw) sw.style.background = dynamicPalette ? dynamicPalette.accent : "";
  if (st) {
    if (!(state.design && state.design.dynamicSpotify)) st.textContent = "off";
    else if (dynamicPalette) st.textContent = "";
    else st.textContent = lastSpotifyArt ? "loading…" : "no track playing";
  }
}

// Fetch the current cover's palette when dynamic colours are on. Only re-fetches
// when the cover URL changes; keeps the last palette on transient failures.
async function refreshDynamicPalette(discover) {
  const d = state.design || {};
  if (!d.dynamicSpotify) return;
  // When enabling the toggle without a Spotify tile polling, look up the cover.
  if (!lastSpotifyArt && discover) {
    try {
      const t = await native.spotifyNowPlaying();
      if (t && t.art) lastSpotifyArt = t.art;
    } catch {
      /* not connected */
    }
  }
  if (!lastSpotifyArt) {
    if (dynamicPalette) {
      dynamicPalette = null;
      applyAppearance();
      updateDynSwatch();
    }
    return;
  }
  if (dynamicPalette && dynamicPalette.url === lastSpotifyArt) return;
  const url = lastSpotifyArt;
  try {
    const p = await native.spotifyCoverPalette(url);
    if (!p || lastSpotifyArt !== url) return; // stale response
    dynamicPalette = { url, accent: p.accent, secondary: p.secondary };
    applyAppearance();
    updateDynSwatch();
  } catch {
    /* keep the theme / previous palette */
  }
}

// Set of collapsed tiles currently showing their floating body overlay.
// Per-tile and transient (not persisted), so opening one doesn't affect others.
const openTiles = new Set();

const STORAGE_KEY = "lost-board.state.v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULT_STATE), ...parsed };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (window.__TAURI__) {
      void native.saveState(state).catch((e) => console.error("Failed to persist app state", e));
    }
  } catch (e) {
    console.error("Failed to persist state", e);
  }
}

// ---------------------------------------------------------------------------
// Native (Tauri) helpers — safe in-browser fallbacks.
// ---------------------------------------------------------------------------
const native = {
async openFolder(path) {
    if (window.__TAURI__) return invoke("open_folder", { path });
    console.log("[native] open_folder", path);
  },
  async openSolution(path) {
    if (window.__TAURI__) return invoke("open_solution", { path });
    console.log("[native] open_solution", path);
  },
  async openUrl(url) {
    if (window.__TAURI__) return invoke("open_url", { url });
    window.open(url, "_blank");
  },
  async pickFolder() {
    if (window.__TAURI__) return invoke("pick_folder");
    return prompt("Folder path (browser prototype):") || null;
  },
  async pickSolution() {
    if (window.__TAURI__) return invoke("pick_solution");
    return prompt("Solution path (.sln) (browser prototype):") || null;
  },
  async classifyPath(path) {
    if (window.__TAURI__) return invoke("classify_path", { path });
    return /\.(sln|slnx|csproj)$/i.test(path) ? "sln" : "dir";
  },
  async fetchRss(url) {
    if (window.__TAURI__) return invoke("fetch_rss", { url });
    return { feed_title: "", items: [] };
  },
  async cacheFavicon(host) {
    if (window.__TAURI__) return invoke("cache_favicon", { host });
    return "";
  },
  async setDeeplKey(key) {
    if (window.__TAURI__) return invoke("set_deepl_key", { key });
  },
  async deeplKeyStatus() {
    if (window.__TAURI__) return invoke("deepl_key_status");
    return false;
  },
  async clearDeeplKey() {
    if (window.__TAURI__) return invoke("clear_deepl_key");
  },
  async deeplTranslate(text, sourceLang, targetLang) {
    if (window.__TAURI__) return invoke("deepl_translate", { text, sourceLang, targetLang });
    return "";
  },
  async loadTileIcon(path) {
    if (window.__TAURI__) return invoke("load_tile_icon", { path });
    return "";
  },
  async pickIcon() {
    if (window.__TAURI__) return invoke("pick_icon");
    return null;
  },
  async pickImage() {
    if (window.__TAURI__) return invoke("pick_image");
    return null;
  },
  async loadFrameImage(path) {
    if (window.__TAURI__) return invoke("load_frame_image", { path });
    return "";
  },
  async scanProjectRoot(root) {
    if (window.__TAURI__) return invoke("scan_project_root", { root });
    return [];
  },
  async setSpotifyClientId(id) {
    if (window.__TAURI__) return invoke("set_spotify_client_id", { id });
  },
  async spotifyConnected() {
    if (window.__TAURI__) return invoke("spotify_connected");
    return false;
  },
  async spotifyBegin() {
    if (window.__TAURI__) return invoke("spotify_begin");
    return "";
  },
  async spotifyCapture() {
    if (window.__TAURI__) return invoke("spotify_capture");
  },
  async spotifyNowPlaying() {
    if (window.__TAURI__) return invoke("spotify_now_playing");
    return null;
  },
  async spotifyCoverPalette(url) {
    if (window.__TAURI__) return invoke("spotify_cover_palette", { url });
    return null;
  },
  async lyricsGet(title, artist, album, durationMs) {
    if (window.__TAURI__) return invoke("lyrics_get", { title, artist, album, durationMs });
    return null;
  },
  async lyricsDetect(text) {
    if (window.__TAURI__) return invoke("lyrics_detect", { text });
    return null;
  },
  async lyricsTranslate(lines, source, targets) {
    if (window.__TAURI__) return invoke("lyrics_translate", { lines, source, targets });
    return null;
  },
  async lyricsTranslationsClear() {
    if (window.__TAURI__) return invoke("lyrics_translations_clear");
    return null;
  },
  async lyricsTranslationsExport() {
    if (window.__TAURI__) return invoke("lyrics_translations_export");
    return null;
  },
  async lyricsTranslationsImport() {
    if (window.__TAURI__) return invoke("lyrics_translations_import");
    return null;
  },
  async spotifyPlay(play) {
    if (window.__TAURI__) return invoke("spotify_play", { play });
  },
  async spotifySkip(next) {
    if (window.__TAURI__) return invoke("spotify_skip", { next });
  },
  async spotifyJump(contextUri, trackUri) {
    // Tauri maps Rust `context_uri`/`track_uri` params from camelCase keys
    // (same as save_state <- stateJson); snake_case keys arrive as missing.
    if (window.__TAURI__) return invoke("spotify_jump", { contextUri, trackUri });
  },
  async spotifyShuffle(state) {
    if (window.__TAURI__) return invoke("spotify_shuffle", { state });
  },
  async spotifyRepeat(state) {
    if (window.__TAURI__) return invoke("spotify_repeat", { state });
  },
  async spotifyVolume(percent) {
    if (window.__TAURI__) return invoke("spotify_volume", { percent });
  },
  async spotifySeek(positionMs) {
    if (window.__TAURI__) return invoke("spotify_seek", { positionMs });
  },
  async spotifyQueue() {
    if (window.__TAURI__) return invoke("spotify_queue");
    return [];
  },
  async systemStats() {
    if (window.__TAURI__) return invoke("get_system_stats");
    return { cpu_percent: 0, ram_used_bytes: 0, ram_total_bytes: 1, ram_percent: 0 };
  },
  async loadState() {
    if (window.__TAURI__) return invoke("load_state");
    return null;
  },
  async saveState(nextState) {
    if (window.__TAURI__) return invoke("save_state", { stateJson: JSON.stringify(nextState) });
  },
  async exportConfig(filename) {
    if (window.__TAURI__) return invoke("export_config", { filename });
    return null;
  },
  async importConfig() {
    if (window.__TAURI__) return invoke("import_config");
    return null;
  },
  async backupExport(destDir, filename, stateJson, localStorageJson) {
    if (window.__TAURI__)
      return invoke("backup_export", { destDir, filename, stateJson, localStorageJson });
    return null;
  },
  async captionDevices() {
    if (window.__TAURI__) return invoke("caption_devices");
    return [];
  },
  async captionModels() {
    if (window.__TAURI__) return invoke("caption_models");
    return [];
  },
  async captionDownloadModel(modelId) {
    if (window.__TAURI__) return invoke("caption_download_model", { modelId });
  },
  async captionRemoveModel(modelId) {
    if (window.__TAURI__) return invoke("caption_remove_model", { modelId });
  },
  async captionStart(modelId, deviceId, autoSave, saveDir, finalizeMs) {
    if (window.__TAURI__)
      return invoke("caption_start", { modelId, deviceId, autoSave, saveDir, finalizeMs });
  },
  async captionStop() {
    if (window.__TAURI__) return invoke("caption_stop");
  },
  async captionSetDevice(deviceId) {
    if (window.__TAURI__) return invoke("caption_set_device", { deviceId });
  },
  async captionPoll() {
    if (window.__TAURI__) return invoke("caption_poll");
    return { status: "idle", lang: "de", device_id: "", device_name: "", partial: "", lines: [], error: "", save_error: "", session: 0 };
  },
  async captionClear() {
    if (window.__TAURI__) return invoke("caption_clear");
  },
  async captionSave() {
    if (window.__TAURI__) return invoke("caption_save");
    return null;
  },
  async captionOpenFolder() {
    if (window.__TAURI__) return invoke("caption_open_folder");
  },
  async setAutostart(enabled) {
    if (window.__TAURI__) return invoke("set_autostart", { enabled });
  },
  async autostartEnabled() {
    if (window.__TAURI__) return invoke("autostart_enabled");
    return false;
  },
  async readVocabCards(count, categories) {
    if (window.__TAURI__) return invoke("read_vocab_cards", { count, categories: categories || [] });
    return [];
  },
  async openVocabPopup(lang, categories, pos, position, practice) {
    if (window.__TAURI__) return invoke("open_vocab_popup", { lang, categories: categories || [], pos: pos || [], position: position || "bottom-right", practice: practice === true });
    return "disabled";
  },
  async vocabCategories() {
    if (window.__TAURI__) return invoke("vocab_categories");
    return [];
  },
  async vocabPosCounts() {
    if (window.__TAURI__) return invoke("vocab_pos_counts");
    return [];
  },
  async vocabDueCard(categories, pos) {
    if (window.__TAURI__) return invoke("vocab_due_card", { categories: categories || [], pos: pos || [] });
    return null;
  },
  async vocabDueBatch(categories, pos, limit, preferStruggling) {
    if (window.__TAURI__) return invoke("vocab_due_batch", { categories: categories || [], pos: pos || [], limit: limit || 0, preferStruggling: preferStruggling === true });
    return [];
  },
  async vocabPracticeBatch(categories, pos, limit) {
    if (window.__TAURI__) return invoke("vocab_practice_batch", { categories: categories || [], pos: pos || [], limit: limit || 0 });
    return [];
  },
  async lyricsPhraseCount(lang) {
    if (window.__TAURI__) return invoke("lyrics_phrase_count", { lang: lang || "es" });
    return 0;
  },
  async vocabLyricsBatch(lang, limit) {
    if (window.__TAURI__) return invoke("vocab_lyrics_batch", { lang: lang || "es", limit: limit || 0 });
    return [];
  },
  async vocabDueCount(categories, pos) {
    if (window.__TAURI__) return invoke("vocab_due_count", { categories: categories || [], pos: pos || [] });
    return 0;
  },
  async vocabResetSrs() {
    if (window.__TAURI__) return invoke("vocab_reset_srs");
  },
  async vocabSetSrs(enabled) {
    if (window.__TAURI__) return invoke("vocab_set_srs", { enabled });
  },
  async vocabSrsEnabled() {
    if (window.__TAURI__) return invoke("vocab_srs_enabled");
    return false;
  },
  async vocabSrsStats(categories, pos) {
    if (window.__TAURI__) return invoke("vocab_srs_stats", { categories: categories || [], pos: pos || [] });
    return null;
  },
  async vocabCategoryStats(categories, pos) {
    if (window.__TAURI__) return invoke("vocab_category_stats", { categories: categories || [], pos: pos || [] });
    return [];
  },
  async setPopupTheme(css) {
    if (window.__TAURI__) return invoke("set_popup_theme", { css });
  },
  async vocabTick() {
    if (window.__TAURI__) return invoke("vocab_tick");
    return "disabled";
  },
  async clearVocabSnooze() {
    if (window.__TAURI__) return invoke("clear_vocab_snooze");
  },
  async vocabPopupState() {
    if (window.__TAURI__) return invoke("vocab_popup_state");
    return null;
  },
  async fetchImageCached(url) {
    if (window.__TAURI__) return invoke("fetch_image_cached", { url });
    return "";
  },
  async importImageFile(path) {
    if (window.__TAURI__) return invoke("import_image_file", { path });
    return null;
  },
  async loadCachedImage(key) {
    if (window.__TAURI__) return invoke("load_cached_image", { key });
    return "";
  },
  async saveMemePng(dir, filename, pngBase64) {
    // Rust params are (dir, filename, png_base64): camelCase keys, same
    // lesson as spotify_jump <- { contextUri, trackUri }.
    if (window.__TAURI__) return invoke("save_meme_png", { dir, filename, pngBase64 });
    return null;
  },
  async saveMemeSource(dir, stem, cacheKey, sourceUrl) {
    if (window.__TAURI__) return invoke("save_meme_source", { dir, stem, cacheKey, sourceUrl });
    return null;
  },
  async saveMemeCaptionedGif(dir, stem, cacheKey, sourceUrl, top, bottom) {
    if (window.__TAURI__) return invoke("save_meme_captioned_gif", { dir, stem, cacheKey, sourceUrl, top, bottom });
    return null;
  },
};

// ---------------------------------------------------------------------------
// Grid rendering (simple absolute-positioned grid for the scaffold).
// ---------------------------------------------------------------------------
const dashboard = document.getElementById("dashboard");
const gridEl = document.getElementById("grid");
const scalerEl = document.getElementById("grid-scaler");

// Registry of interval timers owned by compartment bodies, keyed by the body
// element they render into. Tracked at module scope so they are cleared even
// for compartments that have been removed from `state`. Keying by body lets us
// clear a single body's timers (e.g. the preview panel) without nuking others.
const compartmentTimers = new Map();

// Bodies of vocab tiles with speech enabled. Tracked so teardown (collapse,
// remove, re-render) also stops any in-flight utterance via clearBodyTimers.
const vocabSpeakingBodies = new Set();

function addTimer(body, t) {
  if (!compartmentTimers.has(body)) compartmentTimers.set(body, []);
  compartmentTimers.get(body).push(t);
}
function clearBodyTimers(body) {
  const arr = compartmentTimers.get(body);
  if (arr) {
    // Entries are interval ids or cleanup functions (e.g. shared-poll unsubscribes).
    arr.forEach((t) => (typeof t === "function" ? t() : clearInterval(t)));
    compartmentTimers.delete(body);
  }
  if (vocabSpeakingBodies.has(body)) {
    vocabSpeakingBodies.delete(body);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }
}

// ---------------------------------------------------------------------------
// Shared Spotify playback: ONE 5s now-playing poll feeds every Spotify and
// Lyrics tile (avoids duplicate API traffic). Consumers register a callback and
// an unsubscribe is tied to the tile body via addTimer.
// ---------------------------------------------------------------------------
const playbackSubs = new Set();
let playbackTimer = null;
let playbackIntervalMs = 0;

async function pollPlayback() {
  if (!playbackSubs.size) return;
  let track = null;
  try {
    track = await native.spotifyNowPlaying();
  } catch {
    track = null;
  }
  const at = performance.now();
  for (const entry of [...playbackSubs]) {
    try {
      entry.fn(track, at);
    } catch {
      /* one consumer must not break the others */
    }
  }
}

// Lyrics want a tighter cadence for seek responsiveness; 5s otherwise.
function desiredPlaybackInterval() {
  return playbackSubs.size && [...playbackSubs].some((e) => e.fast) ? 2500 : 5000;
}

function ensurePlaybackTimer() {
  const ms = desiredPlaybackInterval();
  if (playbackTimer && playbackIntervalMs === ms) return;
  if (playbackTimer) clearInterval(playbackTimer);
  playbackTimer = null;
  playbackIntervalMs = 0;
  if (!playbackSubs.size) return;
  playbackIntervalMs = ms;
  playbackTimer = setInterval(pollPlayback, ms);
  void pollPlayback();
}

function subscribePlayback(body, fn, opts) {
  const entry = { fn, fast: !!(opts && opts.fast) };
  playbackSubs.add(entry);
  ensurePlaybackTimer();
  addTimer(body, () => {
    playbackSubs.delete(entry);
    ensurePlaybackTimer();
  });
}

const ROW_H = 44;
const GUTTER = 8;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;

// Current zoom (1 = 100%). Applied as a CSS transform: scale() on the grid so
// tiles, text and buttons all scale uniformly; geometry stays in unscaled px.
let zoom = 1;

// Pixel geometry for a compartment given the current column count and the
// dashboard's live width. Positions are cell-based: x/w in columns, y/h in rows.
function cellWidth() {
  return (dashboard.clientWidth - GUTTER) / state.columns;
}
function applyBox(el, c) {
  const cw = cellWidth();
  el.style.left = `${GUTTER / 2 + c.x * cw}px`;
  el.style.top = `${GUTTER / 2 + c.y * ROW_H}px`;
  el.style.width = `${c.w * cw - GUTTER}px`;
  el.style.height = `${c.h * ROW_H - GUTTER}px`;
}
function gridHeight() {
  const rows = state.compartments.reduce((m, c) => Math.max(m, c.y + tileRows(c)), 0);
  return GUTTER / 2 + rows * ROW_H;
}
// A collapsed tile occupies just its header (1 row) in the grid layout, so
// other tiles can flow into the freed space instead of being pushed down.
function tileRows(c) {
  return c.collapsed === true ? 1 : c.h;
}
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + tileRows(b) && b.y < a.y + tileRows(a);
}
// Push overlapping compartments below `anchor` until the grid is collision-free.
function resolveCollisions(anchor) {
  let guard = 0;
  while (guard++ < 200) {
    let moved = false;
    for (const o of state.compartments) {
      if (o.id === anchor.id) continue;
      if (overlaps(anchor, o)) {
        o.y = anchor.y + tileRows(anchor);
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// Signatures used to decide what actually needs rebuilding. A tile's header is
// rebuilt only when its title/collapse state changes; its body only when its
// kind/data changes. Positions/sizes are always updated cheaply. This avoids
// tearing down every tile (and re-fetching System stats / news / weather) on
// unrelated actions like editing a bookmark.
function tileHeaderSig(c) {
  return JSON.stringify({
    t: c.title,
    c: c.collapsed === true,
    col: c.collapsible !== false,
    hl: c.hideHeader === true,
    icon: c.icon ? `${c.icon.type}:${c.icon.value}` : "",
    ic: c.iconColor || "",
    hc: c.headerColor || "",
    cc: c.contentColor || "",
  });
}
function tileBodySig(c) {
  // Lyrics also depend on the global translation setting + remembered languages,
  // so toggling those must rebuild the tile body.
  const extra =
    c.kind === "lyrics"
      ? { tr: state.lyricsTranslate === true, langs: state.lyricsLang || {}, targets: state.lyricsTargets || {} }
      : c.kind === "caption"
        ? { captions: state.captions || {} }
        : {};
  return JSON.stringify({ k: c.kind, d: c.data || {}, ...extra });
}
function tileIconHtml(c) {
  if (!c.icon) return "";
  if (c.icon.type === "file" && c.icon.value) {
    return c.iconColor
      ? `<span class="tile-icon"><span class="tile-icon-mask" style="background-color:${escapeHtml(c.iconColor)};-webkit-mask-image:url('${escapeHtml(c.icon.value)}');mask-image:url('${escapeHtml(c.icon.value)}')"></span></span>`
      : `<span class="tile-icon"><img src="${escapeHtml(c.icon.value)}" alt="" /></span>`;
  }
  if (c.icon.type === "text" && c.icon.value) {
    return `<span class="tile-icon">${escapeHtml(c.icon.value)}</span>`;
  }
  return "";
}
function buildHeaderHtml(c) {
  const collapsed = c.collapsed === true;
  const collapsible = c.collapsible !== false;
  // Bare mode: header hidden on an open tile so the body fills it entirely.
  const bare = c.hideHeader === true && !collapsed;
  const icon = tileIconHtml(c);
  if (bare) {
    // No header, no resize handle: the body owns the whole tile.
    return `<div class="compartment-body" data-id="${c.id}"></div>`;
  }
  return `
    <div class="compartment-header">
      <span class="comp-title-wrap">${icon}<span class="comp-title">${escapeHtml(c.title)}</span></span>
      <div class="header-actions">
        ${collapsible ? `<button class="btn ghost icon-btn collapse" data-id="${c.id}" title="${collapsed ? "Open" : "Collapse"}">${ICON.collapse(collapsed)}</button>` : ""}
        <button class="btn ghost icon-btn preview-tile" data-id="${c.id}" title="Preview">${ICON.preview}</button>
        <button class="btn ghost icon-btn settings-tile" data-id="${c.id}" title="Settings">${ICON.settings}</button>
      </div>
    </div>
    <div class="compartment-body" data-id="${c.id}"></div>
    <div class="resize-handle" title="Resize"></div>
  `;
}
// --- Tile actions --------------------------------------------------------
// Shared by the header buttons and the right-click context menu, so both
// paths always behave identically.

// Hide/show the header on an open tile. When hidden the body fills the tile
// and move/resize are unavailable (no header/handle) until toggled back.
function toggleHideHeader(c) {
  c.hideHeader = !c.hideHeader;
  saveState();
  render();
}

function toggleTileCollapse(c) {
  if (c.collapsed === true) {
    if (openTiles.has(c.id)) openTiles.delete(c.id);
    else openTiles.add(c.id);
    render();
  } else {
    c.collapsed = true;
    openTiles.delete(c.id);
    saveState();
    render();
  }
}

function startTileRename(c, el) {
  const span = el.querySelector(".comp-title");
  if (span) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "comp-title-input";
    input.value = c.title;
    span.replaceWith(input);
    input.focus();
    input.select();

    const restore = (title) => {
      const s = document.createElement("span");
      s.className = "comp-title";
      s.textContent = title;
      input.replaceWith(s);
    };
    const commit = () => {
      const val = input.value.trim();
      if (val && val !== c.title) {
        c.title = val;
        saveState();
      }
      // Restore the span locally (header won't be rebuilt if title is unchanged).
      if (input.isConnected) restore(c.title);
      render();
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
      if (ev.key === "Escape") {
        if (input.isConnected) restore(c.title);
        render();
      }
    });
    input.addEventListener("blur", commit);
    return;
  }

  // Bare tile (header hidden): show a transient overlay header to rename, then
  // hide it again on Enter / click-outside (Escape cancels).
  const overlay = document.createElement("div");
  overlay.className = "compartment-header compartment-header-overlay";
  overlay.innerHTML = `<span class="comp-title-wrap">${tileIconHtml(c)}</span>`;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "comp-title-input";
  input.value = c.title;
  overlay.querySelector(".comp-title-wrap").appendChild(input);
  el.appendChild(overlay);
  input.focus();
  input.select();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const val = input.value.trim();
    if (save && val && val !== c.title) {
      c.title = val;
      saveState();
    }
    overlay.remove();
    render();
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") finish(true);
    else if (ev.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));
}

function removeTile(c) {
  showConfirmPopup(`Are you sure you want to delete "${c.title}" tile?`, {
    onConfirm: () => {
      state.compartments = state.compartments.filter((x) => x.id !== c.id);
      openTiles.delete(c.id);
      saveState();
      render();
    },
  });
}

function duplicateTile(c) {
  const copy = JSON.parse(JSON.stringify(c));
  copy.id = "c" + Date.now();
  copy.title = `${c.title} copy`;
  copy.x = Math.min(c.x + 1, Math.max(0, state.columns - c.w));
  copy.y = c.y + 1;
  state.compartments.push(copy);
  saveState();
  render();
  gridEl.querySelector(`.compartment[data-id="${copy.id}"]`)?.scrollIntoView({ block: "nearest" });
}

function wireHeader(rec, c) {
  const el = rec.el;
  el.querySelector(".collapse")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTileCollapse(c);
  });
  // Header actions are absent in bare mode (hidden header) — chain them.
  el.querySelector(".preview-tile")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openPreview(c.id);
  });
  el.querySelector(".settings-tile")?.addEventListener("click", (e) => {
    e.stopPropagation();
    openTileSettings(c.id);
  });
}

// --- Right-click context menu --------------------------------------------
// One floating menu reused for tiles (actions) and the empty grid (add tile).
let ctxMenuEl = null;
let ctxMenuPos = null; // last opened position, so a confirm lands in place

function closeCtxMenu() {
  if (ctxMenuEl) {
    ctxMenuEl.remove();
    ctxMenuEl = null;
  }
}

// Place a floating popup at (x, y), clamped so it never spills off-screen.
function positionCtxMenu(el, x, y) {
  const r = el.getBoundingClientRect();
  const px = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
  const py = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
  el.style.left = `${px}px`;
  el.style.top = `${py}px`;
}

function showCtxMenu(items, clientX, clientY) {
  closeCtxMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.setAttribute("role", "menu");
  for (const it of items) {
    if (it.heading) {
      const h = document.createElement("div");
      h.className = "ctx-heading";
      h.textContent = it.heading;
      menu.appendChild(h);
      continue;
    }
    if (it.divider) {
      const d = document.createElement("div");
      d.className = "ctx-divider";
      menu.appendChild(d);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ctx-item" + (it.danger ? " danger" : "");
    b.setAttribute("role", "menuitem");
    b.innerHTML = `<span class="ctx-icon">${it.icon || ""}</span><span class="ctx-label">${escapeHtml(it.label)}</span>`;
    b.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeCtxMenu();
      it.action();
    });
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  positionCtxMenu(menu, clientX, clientY);
  ctxMenuEl = menu;
  ctxMenuPos = { x: clientX, y: clientY };
}

// Small in-app confirmation (replaces window.confirm). Styled like the context
// menu, positioned where it was opened, focused on Cancel so a stray Enter is
// safe. Confirm runs onConfirm; Cancel / outside-click / Escape dismiss.
function showConfirmPopup(message, { x, y, confirmLabel = "Remove", onConfirm } = {}) {
  closeCtxMenu();
  const pop = document.createElement("div");
  pop.className = "ctx-menu confirm-popup";
  pop.setAttribute("role", "dialog");
  pop.setAttribute("aria-modal", "true");
  const msg = document.createElement("div");
  msg.className = "confirm-msg";
  msg.textContent = message;
  const actions = document.createElement("div");
  actions.className = "confirm-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "btn ghost";
  cancel.textContent = "Cancel";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "btn danger";
  confirm.textContent = confirmLabel;
  actions.append(cancel, confirm);
  pop.append(msg, actions);
  document.body.appendChild(pop);
  const px = x ?? ctxMenuPos?.x ?? window.innerWidth / 2;
  const py = y ?? ctxMenuPos?.y ?? window.innerHeight / 2;
  positionCtxMenu(pop, px, py);
  ctxMenuEl = pop;
  cancel.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeCtxMenu();
  });
  confirm.addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeCtxMenu();
    onConfirm?.();
  });
  cancel.focus();
}

function openTileMenu(clientX, clientY, compId) {
  const c = state.compartments.find((x) => x.id === compId);
  if (!c) return;
  const el = tileEls.get(c.id)?.el;
  const collapsed = c.collapsed === true;
  const items = [];
  if (c.collapsible !== false) {
    items.push({
      label: collapsed ? "Open" : "Collapse",
      icon: ICON.collapse(collapsed),
      action: () => toggleTileCollapse(c),
    });
  }
  items.push(
    { label: c.hideHeader ? "Show header" : "Hide header", icon: ICON.panel, action: () => toggleHideHeader(c) },
    { label: "Preview", icon: ICON.preview, action: () => openPreview(c.id) },
    { label: "Settings", icon: ICON.settings, action: () => openTileSettings(c.id) },
    { label: "Rename", icon: ICON.rename, action: () => { if (el) startTileRename(c, el); } },
    { label: "Duplicate", icon: ICON.copy, action: () => duplicateTile(c) },
    { divider: true },
    { label: "Remove", icon: ICON.remove, danger: true, action: () => removeTile(c) }
  );
  showCtxMenu(items, clientX, clientY);
}

// Add-tile items, one per kind (mirrors the Settings > Grid add control).
function openGridMenu(clientX, clientY) {
  const order = [
    ["launcher", "Folders & Files"], ["project", "Projects"], ["bookmarks", "Bookmarks"],
    ["azure", "Azure DevOps"], ["spotify", "Spotify"], ["lyrics", "Lyrics"], ["caption", "Captions"], ["vocab", "Vocab"], ["meme", "Memes"], ["calendar", "Calendar"],
    ["weather", "Weather"], ["news", "News"], ["translate", "Translate"], ["frame", "Frame"],
    ["system", "System"],
  ];
  const items = [{ heading: "Add a tile" }];
  for (const [kind, label] of order) {
    items.push({ label, icon: ICON.plus, action: () => addTile(kind) });
  }
  showCtxMenu(items, clientX, clientY);
}

// Global dismissal for the context menu.
document.addEventListener("mousedown", (e) => {
  if (ctxMenuEl && !ctxMenuEl.contains(e.target)) closeCtxMenu();
});
window.addEventListener("blur", closeCtxMenu);
window.addEventListener("resize", closeCtxMenu);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeCtxMenu();
});


// Live tile elements by compartment id, so re-renders reuse them instead of
// rebuilding the whole board.
const tileEls = new Map();
const overlayEls = new Map();

function render() {
  closeCtxMenu(); // a re-render invalidates any open context menu
  // Unscaled grid size; a CSS transform scales it visually, and the scaler is
  // sized to the scaled dimensions so the dashboard scrolls correctly.
  const w = dashboard.clientWidth;
  const h = gridHeight();
  gridEl.style.width = `${w}px`;
  gridEl.style.height = `${h}px`;
  gridEl.style.transform = `scale(${zoom})`;
  scalerEl.style.width = `${w * zoom}px`;
  scalerEl.style.height = `${h * zoom}px`;
  // Tool-wall dots sized to the actual grid cell so they line up with tiles.
  if (state.wall) {
    gridEl.style.backgroundImage = `radial-gradient(var(--border) 1.6px, transparent 1.7px)`;
    gridEl.style.backgroundSize = `${cellWidth()}px ${ROW_H}px`;
  } else {
    gridEl.style.backgroundImage = "";
  }

  // Drop tiles for compartments that no longer exist.
  for (const [id, rec] of tileEls) {
    if (!state.compartments.some((c) => c.id === id)) {
      clearBodyTimers(rec.bodyEl);
      rec.el.remove();
      tileEls.delete(id);
    }
  }

  for (const c of state.compartments) {
    const collapsed = c.collapsed === true;
    let rec = tileEls.get(c.id);
    if (!rec) {
      const el = document.createElement("div");
      el.className = "compartment";
      el.dataset.id = c.id;
      el.style.position = "absolute";
      gridEl.appendChild(el);
      rec = { el, headerSig: null, bodySig: null, bodyEl: null };
      tileEls.set(c.id, rec);
    }

    // Cheap, always-updated geometry.
    applyBox(rec.el, c);
    rec.el.classList.toggle("collapsed", collapsed);
    rec.el.classList.toggle("headerless", c.hideHeader === true && !collapsed);
    if (collapsed) rec.el.style.height = `${ROW_H - GUTTER}px`;
    // Per-tile colors (CSS variables consumed by the header/body).
    rec.el.style.setProperty("--tile-header", c.headerColor || "transparent");
    rec.el.style.setProperty("--tile-content", c.contentColor || "transparent");
    // Per-tile decoration. Only set a variable when the tile defines it, so an
    // unset one falls back to the global/design token (remset to avoid an empty
    // value, which would invalidate the declaration instead of using the fallback).
    const setTileVar = (name, val) => {
      if (val) rec.el.style.setProperty(name, val);
      else rec.el.style.removeProperty(name);
    };
    const dynBorderPct =
      state.design?.dynamicSpotify && dynamicPalette
        ? Math.max(0, Math.min(100, Number(state.design?.dynAccentMix ?? 60)))
        : 0;
    setTileVar(
      "--tile-border",
      c.borderColor
        ? dynBorderPct > 0
          ? `color-mix(in srgb, ${c.borderColor} ${100 - dynBorderPct}%, var(--accent))`
          : c.borderColor
        : ""
    );
    setTileVar("--tile-border-w", c.borderWidth != null ? `${c.borderWidth}px` : "");
    setTileVar("--tile-radius", c.radius != null ? `${c.radius}px` : "");
    setTileVar("--tile-shadow", c.shadow || "");
    setTileVar("--tile-font-size", c.fontSize != null ? `${c.fontSize}px` : "");
    setTileVar("--tile-font-weight", c.fontWeight != null ? String(c.fontWeight) : "");
    setTileVar(
      "--tile-bg",
      c.bgFrom && c.bgTo
        ? `linear-gradient(${c.bgAngle != null ? c.bgAngle : 135}deg, ${c.bgFrom}, ${c.bgTo})`
        : c.tileBg || ""
    );

    // Header — rebuild only when title / collapse / collapsible changed.
    const hs = tileHeaderSig(c);
    if (rec.headerSig !== hs) {
      if (rec.bodyEl) clearBodyTimers(rec.bodyEl);
      rec.el.innerHTML = buildHeaderHtml(c);
      rec.bodyEl = rec.el.querySelector(".compartment-body");
      rec.headerSig = hs;
      rec.bodySig = null;
      wireHeader(rec, c);
    }

    // Body — render only when collapsed state or body data changed.
    if (collapsed) {
      if (rec.bodyEl) {
        clearBodyTimers(rec.bodyEl);
        rec.bodyEl.innerHTML = "";
        rec.bodySig = null;
      }
    } else {
      const bs = tileBodySig(c);
      if (rec.bodySig !== bs) {
        clearBodyTimers(rec.bodyEl);
        rec.bodySig = bs;
        renderCompartmentBody(c, rec.bodyEl);
      }
    }
  }

  renderOverlays();
  // Keep the preview panel in sync if it's open (guarded by its own signature).
  if (previewTileId) renderPreview();
}

// Collapsed tiles that are "open" show their body as a floating overlay.
function renderOverlays() {
  const desired = new Set(
    state.compartments.filter((c) => c.collapsed === true && openTiles.has(c.id)).map((c) => c.id)
  );

  for (const [id, rec] of overlayEls) {
    if (!desired.has(id)) {
      clearBodyTimers(rec.bodyEl);
      rec.el.remove();
      overlayEls.delete(id);
    }
  }

  for (const c of state.compartments) {
    if (!desired.has(c.id)) continue;
    let rec = overlayEls.get(c.id);
    if (!rec) {
      const el = document.createElement("div");
      el.className = "compartment-overlay";
      el.dataset.id = c.id;
      el.innerHTML = `<div class="compartment-body" data-id="${c.id}"></div>`;
      gridEl.appendChild(el);
      rec = { el, bodyEl: el.querySelector(".compartment-body"), bodySig: null };
      overlayEls.set(c.id, rec);
    }
    const cw = cellWidth();
    rec.el.style.left = `${GUTTER / 2 + c.x * cw}px`;
    rec.el.style.top = `${GUTTER / 2 + c.y * ROW_H + ROW_H}px`;
    rec.el.style.width = `${c.w * cw - GUTTER}px`;
    rec.el.style.height = `${(c.h - 1) * ROW_H - GUTTER}px`;

    const bs = tileBodySig(c);
    if (rec.bodySig !== bs) {
      clearBodyTimers(rec.bodyEl);
      rec.bodySig = bs;
      renderCompartmentBody(c, rec.bodyEl);
    }
  }
}

async function renderCompartmentBody(c, body) {
  if (!body) {
    body = gridEl.querySelector(`.compartment-body[data-id="${c.id}"]`);
  }
  if (!body) return;

  if (c.kind === "system") {
    const only = Array.isArray(c.data?.disks) ? c.data.disks : [];
    const wanted = new Set(only.map((m) => String(m).toLowerCase()));
    const renderStats = async () => {
      const s = await native.systemStats();
      const disks = (s.disks || []).filter(
        (d) => wanted.size === 0 || wanted.has(String(d.mount).toLowerCase())
      );
      const diskHtml = disks
        .map(
          (d) => `
          <div class="meter" title="${escapeHtml(d.name || d.mount)}"><span>${escapeHtml(d.mount)}</span><div class="bar"><div class="fill" style="width:${Math.min(100, d.percent)}%"></div></div><span>${d.percent.toFixed(0)}%</span></div>
          <div class="muted">${fmtBytes(d.used_bytes)} / ${fmtBytes(d.total_bytes)}</div>`
        )
        .join("");
      const batt = s.battery
        ? `<div class="meter"><span>Battery</span><div class="bar"><div class="fill" style="width:${s.battery.percent}%"></div></div><span>${s.battery.percent}%${s.battery.charging ? " (charging)" : ""}</span></div>`
        : "";
      body.innerHTML = `
        <div class="meter"><span>CPU</span><div class="bar"><div class="fill" style="width:${s.cpu_percent}%"></div></div><span>${s.cpu_percent.toFixed(0)}%</span></div>
        <div class="meter"><span>RAM</span><div class="bar"><div class="fill" style="width:${s.ram_percent}%"></div></div><span>${s.ram_percent.toFixed(0)}%</span></div>
        <div class="muted">${fmtBytes(s.ram_used_bytes)} / ${fmtBytes(s.ram_total_bytes)}</div>
        ${diskHtml}
        ${batt}
        <div class="muted">Uptime: ${fmtUptime(s.uptime_secs)}</div>`;
    };
    await renderStats();
    const t = setInterval(renderStats, 2000);
    addTimer(body, t);
  } else if (c.kind === "weather") {
    renderWeatherBody(c, body);
  } else if (c.kind === "launcher") {
    const items = c.data?.items || [];
    if (!items.length) {
      body.innerHTML = `<div class="muted">No folders or files yet — add some in Settings.</div>`;
      return;
    }
    body.innerHTML = items
      .map(
        (it, i) => `
        <div class="launcher-tile ${it.kind}">
          <span class="launcher-icon">${
            it.kind === "folder" ? ICON.folder : it.kind === "solution" ? ICON.solution : ICON.file
          }</span>
          <button class="launcher-open" data-id="${c.id}" data-idx="${i}">${escapeHtml(it.label || it.path)}</button>
          <span class="launcher-path" title="${escapeHtml(it.path)}">${escapeHtml(it.path)}</span>
        </div>`
      )
      .join("");
    body.querySelectorAll(".launcher-open").forEach((b) => {
      b.addEventListener("click", async () => {
        const comp = state.compartments.find((x) => x.id === b.dataset.id);
        const it = comp?.data?.items?.[Number(b.dataset.idx)];
        if (!it) return;
        b.classList.remove("err");
        try {
          if (it.kind === "folder") await native.openFolder(it.path);
          else await native.openSolution(it.path); // opens any file via association
        } catch (err) {
          b.classList.add("err");
          b.textContent = "Not found: " + (it.label || it.path);
        }
      });
    });
  } else if (c.kind === "bookmarks") {
    const urls = c.data?.urls || [];
    if (!urls.length) {
      body.innerHTML = `<div class="muted">No bookmarks yet — add them in Settings.</div>`;
      return;
    }
    const favs = await Promise.all(urls.map((u) => faviconData(u.url)));
    body.innerHTML = urls
      .map(
        (u, i) =>
          `<button class="bmk-tile" data-url="${escapeHtml(u.url)}">
             ${faviconHtml(favs[i], u.title || u.url)}
             <span class="bmk-text">
               <span class="bmk-name">${escapeHtml(u.title || u.url)}</span>
               <span class="bmk-host">${escapeHtml(hostOf(u.url))}</span>
             </span>
           </button>`
      )
      .join("");
    body.querySelectorAll(".bmk-tile").forEach((b) =>
      b.addEventListener("click", () => native.openUrl(b.dataset.url))
    );
  } else if (c.kind === "azure") {
    const d = c.data || {};
    const repos = d.repos || [];
    if (!d.org || !d.project || !repos.length) {
      body.innerHTML = `<div class="muted">No Azure repos configured — add some in Settings.</div>`;
      return;
    }
    const encOrg = encodeURIComponent(d.org);
    const encProj = encodeURIComponent(d.project);
    const azFav = await faviconData("https://dev.azure.com");
    body.innerHTML = repos
      .map((r) => {
        const base = `https://dev.azure.com/${encOrg}/${encProj}/_git/${encodeURIComponent(r.repo)}`;
        const name = r.label || r.repo;
        return `
          <div class="azure-repo">
            ${faviconHtml(azFav, name)}
            <span class="azure-name">${escapeHtml(name)}</span>
            <div class="azure-links">
              <button class="btn ghost azure-pr" data-url="${escapeHtml(base)}/pullrequests?_a=mine">PR</button>
              <button class="btn ghost azure-files" data-url="${escapeHtml(base)}">Files</button>
            </div>
          </div>`;
      })
      .join("");
    body.querySelectorAll(".azure-pr, .azure-files").forEach((b) =>
      b.addEventListener("click", () => native.openUrl(b.dataset.url))
    );
  } else if (c.kind === "news") {
    const feeds = c.data?.feeds || [];
    if (!feeds.length) {
      body.innerHTML = `<div class="muted">No news feeds — add some in Settings.</div>`;
      return;
    }
    body.innerHTML = `<div class="muted">${loadingHtml("Loading news")}</div>`;
    renderNewsFeeds(c, body, feeds);
  } else if (c.kind === "translate") {
    renderTranslateBody(c, body);
  } else if (c.kind === "frame") {
    renderFrameBody(c, body);
  } else if (c.kind === "spotify") {
    renderSpotifyBody(c, body);
  } else if (c.kind === "lyrics") {
    renderLyricsBody(c, body);
  } else if (c.kind === "caption") {
    renderCaptionBody(c, body);
  } else if (c.kind === "project") {
    renderProjectsBody(c, body);
  } else if (c.kind === "vocab") {
    renderVocabBody(c, body);
  } else if (c.kind === "meme") {
    renderMemeBody(c, body);
  } else if (c.kind === "calendar") {
    renderCalendarBody(c, body);
  } else {
    body.innerHTML = `<div class="muted">${escapeHtml(c.kind)} compartment (scaffold).</div>`;
  }
}

// ---------------------------------------------------------------------------
// Translate compartment. N language fields (default EN/DE/ES); typing/pasting
// into one and clicking its Translate button fills the other fields via DeepL.
// Field values are transient (not persisted), keyed by compartment id.
// ---------------------------------------------------------------------------
const translateValues = new Map();
function getTranslateValues(id, n) {
  let v = translateValues.get(id);
  if (!Array.isArray(v) || v.length !== n) {
    v = new Array(n).fill("");
    translateValues.set(id, v);
  }
  return v;
}

function renderTranslateBody(c, body) {
  const langs = c.data?.langs?.length ? c.data.langs : ["EN", "DE", "ES"];
  const vals = getTranslateValues(c.id, langs.length);
  // Mark the body so CSS can make the grid fill the tile's full height and the
  // 3 fields stretch proportionally when the tile is resized.
  body.classList.add("tr-body");
  body.innerHTML = `
    <div class="tr-grid">
      ${langs
        .map(
          (lang, i) => `
        <div class="tr-field">
          <div class="tr-head">
            <span class="tr-lang">${escapeHtml(lang)}</span>
            <button class="btn ghost tr-go" data-i="${i}">Translate</button>
          </div>
          <textarea class="tr-text" data-i="${i}" rows="3" placeholder="Type or paste ${escapeHtml(lang)}…">${escapeHtml(vals[i] || "")}</textarea>
        </div>`
        )
        .join("")}
    </div>`;
  body.querySelectorAll(".tr-text").forEach((ta) =>
    ta.addEventListener("input", (e) => {
      vals[Number(e.currentTarget.dataset.i)] = e.target.value;
    })
  );
  body.querySelectorAll(".tr-go").forEach((btn) =>
    btn.addEventListener("click", () => translateFrom(c, body, Number(btn.dataset.i)))
  );
}

async function translateFrom(c, body, i) {
  const langs = c.data?.langs?.length ? c.data.langs : ["EN", "DE", "ES"];
  const vals = getTranslateValues(c.id, langs.length);
  const text = (vals[i] || "").trim();
  if (!text) return;
  const source = langs[i];
  const targets = langs.map((_, j) => j).filter((j) => j !== i);
  const fieldAt = (j) => body.querySelector(`.tr-text[data-i="${j}"]`);
  const btn = body.querySelector(`.tr-go[data-i="${i}"]`);

  if (btn) {
    btn.disabled = true;
    btn.textContent = "…";
  }
  targets.forEach((j) => {
    const ta = fieldAt(j);
    if (ta) ta.classList.add("tr-loading");
  });
  try {
    const results = await Promise.all(targets.map((j) => native.deeplTranslate(text, source, langs[j])));
    if (!body.isConnected) return;
    targets.forEach((j, k) => {
      vals[j] = results[k];
      const ta = fieldAt(j);
      if (ta) {
        ta.value = results[k];
        ta.classList.remove("tr-loading");
      }
    });
  } catch (e) {
    if (body.isConnected) {
      targets.forEach((j) => {
        const ta = fieldAt(j);
        if (ta) {
          ta.value = `⚠ ${e.message || e}`;
          ta.classList.remove("tr-loading");
          ta.classList.add("tr-err");
        }
      });
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Translate";
    }
  }
}

// ---------------------------------------------------------------------------
// Frame tile (photo frame). Shows a local image/GIF stretched to fill the tile
// body, like a picture hanging on the board. Stores the file path; loads to a
// data URI lazily (large GIFs shouldn't bloat the persisted state).
// ---------------------------------------------------------------------------
const frameImageCache = new Map();
async function frameImageData(c) {
  const path = c.data?.path;
  if (!path) return "";
  if (frameImageCache.has(path)) return frameImageCache.get(path);
  let data = "";
  try {
    data = (await native.loadFrameImage(path)) || "";
  } catch {
    data = "";
  }
  frameImageCache.set(path, data);
  return data;
}

async function renderFrameBody(c, body) {
  body.classList.add("frame-body");
  const fit = c.data?.fit || "cover";
  const src = await frameImageData(c);
  if (!src) {
    body.innerHTML = `<div class="muted">No image set — pick one in Settings.</div>`;
    return;
  }
  body.innerHTML = `<img class="frame-img" style="object-fit:${escapeHtml(fit)}" src="${escapeHtml(src)}" alt="" />`;
}

// ---------------------------------------------------------------------------
// Vocab flashcard tile (passive exposure). Rotates trilingual cards from the
// bundled CSV; the drill popup (active recall) lives in drill.html and is
// driven Rust-side via vocab_tick(). One word per popup (spec FR-VOC-005).
// ---------------------------------------------------------------------------
function vocabConfig() {
  state.vocab = state.vocab || {};
  const v = state.vocab;
  if (v.enabled === undefined) v.enabled = false;
  if (!v.everyMin) v.everyMin = 30;
  if (!v.lang) v.lang = "es";
  if (v.quietStart === undefined) v.quietStart = "";
  if (v.quietEnd === undefined) v.quietEnd = "";
  if (!Array.isArray(v.drillCats)) v.drillCats = [];
  if (!Array.isArray(v.drillPos)) v.drillPos = [];
  if (!v.popupPosition) v.popupPosition = "bottom-right";
  if (v.cardsPerSession === undefined) v.cardsPerSession = 1; // 0 = all due
  if (v.strugglingFirst === undefined) v.strugglingFirst = true;
  if (v.practicePerSession === undefined) v.practicePerSession = 10; // 0 = all
  return v;
}

// ---------------------------------------------------------------------------
// Lyrics tile — synced lyrics from LRCLIB (fetched in Rust), driven by the
// shared playback sample. Focus = prev/current/next; Full = whole song, and the
// fallback when there's no synced/current line. Inherits theme/design tokens.
// ---------------------------------------------------------------------------
// Translation results keyed by `${trackKey}|${source}|${targets}` (in-memory).
const lyricsTranslationCache = new Map();

async function renderLyricsBody(c, body) {
  const data = c.data || (c.data = {});
  const clampN = (v, d) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(10, Math.max(0, x)) : d;
  };
  const prevN = clampN(data.prevLines, 3);
  const nextN = clampN(data.nextLines, 3);
  const offsetMs = Number(data.offsetMs) || 0;
  const align = ["left", "center", "right"].includes(data.align) ? data.align : "left";
  let full = data.full === true;

  let synced = [];
  let plainLines = [];
  let instrumental = false;
  let trackKey = "";
  let currentIdx = -1;
  let sample = null; // { track, at }
  let token = 0;
  let status = "idle";
  let currentTrack = null;
  let trackOffset = 0; // per-track sync offset (ms), persisted in state.lyricsOffsets
  // Transient fetch failures retry with backoff instead of blocking the track.
  let retryKey = "";
  let retryAt = 0;
  let attempts = 0;
  // Full view is built once per track; only the active line changes. `follow`
  // stops auto-scroll once the user scrolls the list themselves.
  let fullRenderKey = "";
  let follow = true;
  let autoScrolling = false;
  let translations = null; // { lang: [line, ...] } aligned to the current lines
  let translating = false;

  body.innerHTML = `
    <div class="lyr-wrap">
      <div class="lyr-head">
        <span class="lyr-track" title=""></span>
        <span class="lyr-tools">
          <button class="btn ghost lyr-nudge" data-d="-100" title="Lyrics 0.1s earlier">−</button>
          <span class="lyr-off" title="Per-track lyric offset">0.0s</span>
          <button class="btn ghost lyr-nudge" data-d="100" title="Lyrics 0.1s later">+</button>
          <button class="btn ghost lyr-mode" title="Toggle full lyrics">Full</button>
        </span>
      </div>
      <div class="lyr-trans" hidden></div>
      <div class="lyr-lines"></div>
      <div class="lyr-empty" hidden></div>
    </div>`;
  const trackEl = body.querySelector(".lyr-track");
  const modeBtn = body.querySelector(".lyr-mode");
  const offEl = body.querySelector(".lyr-off");
  const transEl = body.querySelector(".lyr-trans");
  const linesEl = body.querySelector(".lyr-lines");
  const emptyEl = body.querySelector(".lyr-empty");
  linesEl.style.textAlign = align;
  emptyEl.style.textAlign = align;

  const updateOffsetLabel = () => {
    offEl.textContent = `${(trackOffset / 1000).toFixed(1)}s`;
    offEl.title = `Per-track offset: ${trackOffset} ms`;
  };
  updateOffsetLabel();

  const posMs = () =>
    LyricsUtil.positionMs(
      sample && sample.track,
      sample && sample.at,
      performance.now(),
      offsetMs + trackOffset
    );

  const emptyMsg = (msg) => {
    fullRenderKey = "";
    linesEl.innerHTML = "";
    linesEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = msg;
  };
  const emptyLoading = (msg) => {
    fullRenderKey = "";
    linesEl.innerHTML = "";
    linesEl.hidden = true;
    emptyEl.hidden = false;
    emptyEl.innerHTML = loadingHtml(msg);
  };

  const scrollCurrent = () => {
    const cur = linesEl.querySelector(".lyr-line.cur");
    if (!cur) return;
    autoScrolling = true;
    cur.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setTimeout(() => {
      autoScrolling = false;
    }, 0);
  };

  // Aligned translation lines under an original line. In focus mode only the
  // current line shows translations (space); full mode shows them all.
  const trHtml = (i, all) => {
    if (!translations) return "";
    // Fixed display order so EN/DE/ES don't shuffle between renders.
    const order = ["en", "de", "es", "vi"];
    const entries = Object.entries(translations).sort((a, b) => {
      const ia = order.indexOf(a[0].toLowerCase());
      const ib = order.indexOf(b[0].toLowerCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a[0].localeCompare(b[0]);
    });
    return entries
      .map(([lang, arr]) => {
        const text = arr && arr[i];
        if (!text) return "";
        return `<div class="lyr-tr"><span class="lyr-flag" title="${escapeHtml(lang.toUpperCase())}">${LyricsUtil.flagSvg(lang)}</span>${escapeHtml(text)}</div>`;
      })
      .join("");
  };

  // Built-in bilingual line from the provider (`original^translation`). Shown as
  // a muted secondary line only when our own translation isn't present.
  const altHtml = (line) =>
    !translations && line && line.alt
      ? `<div class="lyr-tr lyr-tr-b">${escapeHtml(line.alt)}</div>`
      : "";

  const renderLines = () => {
    const plainFallback = synced.length === 0 && plainLines.length > 0;
    const effectiveFull = full || plainFallback || currentIdx < 0;
    if (synced.length === 0 && plainLines.length === 0) {
      modeBtn.disabled = true;
      if (instrumental) emptyMsg("Instrumental");
      else if (status === "loading") emptyLoading("Loading lyrics");
      else emptyMsg("No lyrics for this track.");
      return;
    }
    emptyEl.hidden = true;
    linesEl.hidden = false;
    linesEl.classList.toggle("focus", !effectiveFull);

    if (effectiveFull) {
      const key = `${trackKey}|${synced.length}|${full ? "f" : "p"}|${translations ? "tr" : ""}`;
      if (fullRenderKey !== key) {
        const lines = synced.length ? synced.map((l) => l.text) : plainLines;
        linesEl.innerHTML = lines
          .map(
            (text, i) =>
              `<div class="lyr-line" data-i="${i}">${escapeHtml(text)}${altHtml(synced.length ? synced[i] : null)}${trHtml(i, true)}</div>`
          )
          .join("");
        fullRenderKey = key;
      }
      const kids = linesEl.children;
      for (let i = 0; i < kids.length; i++) {
        kids[i].classList.toggle("cur", synced.length > 0 && i === currentIdx);
      }
      if (follow && synced.length && currentIdx >= 0) scrollCurrent();
    } else {
      fullRenderKey = "";
      const win = LyricsUtil.focusWindow(synced.length, currentIdx, prevN, nextN);
      // Focus order is reversed: upcoming lines sit above the current line and
      // older lines fall below it.
      linesEl.innerHTML = synced
        .slice(win.start, win.end)
        .map((l, k) => {
          const i = win.end - 1 - k;
          const cls = i === currentIdx ? " cur" : i < currentIdx ? " prev" : " next";
          return `<div class="lyr-line${cls}" data-i="${i}">${escapeHtml(l.text)}${altHtml(l)}${i === currentIdx ? trHtml(i, false) : ""}</div>`;
        })
        .join("");
    }
    modeBtn.disabled = plainFallback;
    modeBtn.textContent = effectiveFull ? "Focus" : "Full";
    modeBtn.title = plainFallback ? "No synced lyrics — showing full list" : "Toggle full lyrics";
  };

  const updateCurrent = () => {
    if (!synced.length) return;
    const i = LyricsUtil.activeIndex(synced, posMs());
    if (i === currentIdx) return;
    currentIdx = i;
    renderLines();
  };

  const setTrackLabel = (t) => {
    trackEl.textContent = t ? `${t.title}${t.artist ? " — " + t.artist : ""}` : "Nothing playing";
    trackEl.title = trackEl.textContent;
  };

  const showTransStatus = (msg) => {
    transEl.textContent = msg || "";
    transEl.hidden = !msg;
  };

  const targetsFor = (source) => LyricsUtil.targetsFor(lyricsTargetsConfig(), source);

  // Low-confidence/unknown language: let the user pick (remembered per track).
  const showLangPrompt = (detected) => {
    transEl.hidden = false;
    transEl.innerHTML = "";
    const label = document.createElement("span");
    label.className = "lyr-trans-label";
    label.textContent = "Language?";
    const sel = document.createElement("select");
    for (const [code, name] of [["en", "English"], ["de", "German"], ["es", "Spanish"], ["vi", "Vietnamese"]]) {
      const o = document.createElement("option");
      o.value = code;
      o.textContent = name;
      if (detected && code === String(detected).toLowerCase()) o.selected = true;
      sel.appendChild(o);
    }
    const ok = document.createElement("button");
    ok.className = "btn ghost";
    ok.textContent = "Translate";
    ok.addEventListener("click", () => {
      if (!currentTrack) return;
      const key = LyricsUtil.trackKey(currentTrack);
      if (!state.lyricsLang) state.lyricsLang = {};
      state.lyricsLang[key] = sel.value;
      saveState();
      showTransStatus("");
      void startTranslation(currentTrack, key);
    });
    transEl.append(label, sel, ok);
  };

  const translateLines = async (lines, source, targets, key) => {
    const cacheKey = `${key}|${source}|${targets.join(",")}`;
    if (lyricsTranslationCache.has(cacheKey)) {
      translations = lyricsTranslationCache.get(cacheKey);
      fullRenderKey = "";
      renderLines();
      showTransStatus("");
      return;
    }
    if (translating) return;
    translating = true;
    showTransStatus("Translating…");
    try {
      const res = await native.lyricsTranslate(lines, source, targets);
      if (!body.isConnected || key !== trackKey) return;
      if (!res || !res.translations) {
        showTransStatus("Translation unavailable");
        return;
      }
      lyricsTranslationCache.set(cacheKey, res.translations);
      translations = res.translations;
      fullRenderKey = "";
      renderLines();
      showTransStatus("");
    } catch {
      if (body.isConnected && key === trackKey) showTransStatus("Translation unavailable");
    } finally {
      translating = false;
      // If the track changed while translating, the new one was skipped by the
      // guard above — translate it now.
      if (body.isConnected && state.lyricsTranslate && currentTrack) {
        const curKey = LyricsUtil.trackKey(currentTrack);
        if (curKey !== key) void startTranslation(currentTrack, curKey);
      }
    }
  };

  const startTranslation = async (track, key) => {
    if (!state.lyricsTranslate) return;
    const lines = synced.length ? synced.map((l) => l.text) : plainLines;
    if (!lines.length) return;
    let source = (state.lyricsLang || {})[key] || "";
    if (!source) {
      let detected = "";
      let confidence = 0;
      try {
        const det = await native.lyricsDetect(lines.join("\n"));
        detected = det && det.lang ? String(det.lang).toLowerCase() : "";
        confidence = det ? Number(det.confidence) || 0 : 0;
      } catch {
        /* detection optional */
      }
      const known = ["en", "de", "es", "vi"].includes(detected);
      // Unsupported languages (FR, JA, …) use the configurable "Other" targets
      // (English by default) instead of asking with a limited list.
      if (detected && (known ? confidence >= 0.35 : true)) source = detected;
      else {
        showLangPrompt(known ? detected : "");
        return;
      }
    }
    const targets = targetsFor(source);
    if (!targets.length) {
      showTransStatus("No target languages set");
      return;
    }
    await translateLines(lines, source, targets, key);
  };

  const loadLyrics = async (track) => {
    const key = LyricsUtil.trackKey(track);
    currentTrack = track;
    trackOffset = Number((state.lyricsOffsets || {})[key]) || 0;
    updateOffsetLabel();
    if (key === trackKey) return;
    if (key === retryKey && Date.now() < retryAt) return;
    trackKey = key;
    const my = ++token;
    synced = [];
    plainLines = [];
    instrumental = false;
    currentIdx = -1;
    follow = true;
    translations = null;
    showTransStatus("");
    status = "loading";
    setTrackLabel(track);
    renderLines();
    try {
      const res = await native.lyricsGet(track.title, track.artist, track.album, track.duration_ms || 0);
      if (my !== token || !body.isConnected) return;
      retryKey = "";
      attempts = 0;
      if (!res) {
        status = "none";
        renderLines();
        return;
      }
      synced = Array.isArray(res.synced) ? res.synced : [];
      plainLines = typeof res.plain === "string" ? LyricsUtil.parsePlain(res.plain) : [];
      instrumental = res.instrumental === true;
      status = "ready";
      renderLines();
      updateCurrent();
      void startTranslation(track, key);
    } catch {
      if (my !== token || !body.isConnected) return;
      // Allow a later retry (5s, 10s, 20s, 40s, capped at 60s).
      trackKey = "";
      retryKey = key;
      attempts += 1;
      retryAt = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(attempts, 4));
      status = "error";
      renderLines();
    }
  };

  const onTrack = (track, at) => {
    sample = { track, at };
    if (!body.isConnected) return;
    if (!track || !track.title) {
      trackKey = "";
      token++;
      synced = [];
      plainLines = [];
      instrumental = false;
      currentIdx = -1;
      status = "idle";
      currentTrack = null;
      trackOffset = 0;
      translations = null;
      showTransStatus("");
      updateOffsetLabel();
      setTrackLabel(null);
      emptyMsg("Nothing playing");
      return;
    }
    void loadLyrics(track);
    updateCurrent();
  };

  modeBtn.addEventListener("click", () => {
    if (modeBtn.disabled) return;
    full = !full;
    data.full = full;
    follow = true;
    saveState();
    renderLines();
  });
  body.querySelectorAll(".lyr-nudge").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentTrack) return;
      const key = LyricsUtil.trackKey(currentTrack);
      const delta = Number(btn.dataset.d) || 0;
      const cur = Number((state.lyricsOffsets || {})[key]) || 0;
      const next = Math.max(-5000, Math.min(5000, cur + delta));
      if (!state.lyricsOffsets) state.lyricsOffsets = {};
      state.lyricsOffsets[key] = next;
      trackOffset = next;
      updateOffsetLabel();
      saveState();
      const i = LyricsUtil.activeIndex(synced, posMs());
      if (i !== currentIdx) {
        currentIdx = i;
        renderLines();
      }
    });
  });

  // Stop auto-scrolling if the user scrolls the full list.
  linesEl.addEventListener("wheel", () => { if (!autoScrolling) follow = false; }, { passive: true });
  linesEl.addEventListener("touchstart", () => { if (!autoScrolling) follow = false; }, { passive: true });

  subscribePlayback(body, onTrack, { fast: true });
  const t = setInterval(updateCurrent, 400);
  addTimer(body, t);
  setTrackLabel(null);
  emptyMsg("Waiting for Spotify…");
}

async function renderVocabBody(c, body) {
  const intervalSec = Math.max(3, Number(c.data?.intervalSec) || 10);
  const speakOn = c.data?.speak === true && "speechSynthesis" in window;
  const voiceURIs = c.data?.voices || {};
  let cards = [];
  try {
    cards = await native.readVocabCards(20);
  } catch {
    cards = [];
  }
  let due = 0;
  try {
    due = await native.vocabDueCount([], []);
  } catch {
    due = 0;
  }
  if (!body.isConnected) return;
  if (speakOn) vocabSpeakingBodies.add(body);
  else vocabSpeakingBodies.delete(body);
  if (!cards.length) {
    body.innerHTML = `<div class="muted">No vocabulary cards — check Settings > Vocab.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="vocab-top">
      ${due > 0 ? `<span class="vocab-due muted" title="Cards due for review">Due today: ${due}</span>` : `<span></span>`}
      <button class="btn ghost vocab-practice-btn" title="Extra practice on hard words (not graded)">Practice</button>
    </div>
    <div class="vocab-card">
      <div class="vocab-en"></div>
      <div class="vocab-other"></div>
    </div>
    <div class="vocab-foot">
      <button class="btn ghost icon-btn vocab-speak-toggle" title="Voice enable: speak each card EN, ES, DE">${c.data?.speak ? ICON.volumeOn : ICON.volumeOff}</button>
      <input type="range" class="vocab-vol" min="0" max="100" value="${c.data?.volume === undefined ? 100 : Math.min(100, Math.max(0, Number(c.data.volume) || 0))}" title="Speech volume" />
      <span class="vocab-vol-pct"></span>
    </div>
    <div class="vocab-foot">
      <span class="vocab-rate-label" title="Speech speed">Speed</span>
      <input type="range" class="vocab-rate" min="0.5" max="2" step="0.05" value="${c.data?.rate === undefined ? 0.95 : Math.min(2, Math.max(0.5, Number(c.data.rate) || 0.95))}" title="Speech speed" />
      <span class="vocab-rate-val"></span>
    </div>
  `;
  const volEl = body.querySelector(".vocab-vol");
  const pctEl = body.querySelector(".vocab-vol-pct");
  const syncPct = () => {
    pctEl.textContent = `${volEl.value}%`;
  };
  syncPct();
  let volSaveT = 0;
  volEl.addEventListener("input", () => {
    c.data.volume = Number(volEl.value);
    syncPct();
    clearTimeout(volSaveT);
    volSaveT = setTimeout(saveState, 400);
  });
  volEl.addEventListener("change", () => {
    c.data.volume = Math.min(100, Math.max(0, Number(volEl.value) || 0));
    saveState();
  });
  const rateEl = body.querySelector(".vocab-rate");
  const rateVal = body.querySelector(".vocab-rate-val");
  const syncRate = () => {
    rateVal.textContent = `${Number(rateEl.value).toFixed(2)}×`;
  };
  syncRate();
  let rateSaveT = 0;
  rateEl.addEventListener("input", () => {
    c.data.rate = Number(rateEl.value);
    syncRate();
    clearTimeout(rateSaveT);
    rateSaveT = setTimeout(saveState, 400);
  });
  rateEl.addEventListener("change", () => {
    c.data.rate = Math.min(2, Math.max(0.5, Number(rateEl.value) || 0.95));
    saveState();
  });
  body.querySelector(".vocab-speak-toggle").addEventListener("click", () => {
    c.data.speak = !c.data.speak;
    if (!c.data.speak && "speechSynthesis" in window) window.speechSynthesis.cancel();
    saveState();
    render();
  });
  const practiceBtn = body.querySelector(".vocab-practice-btn");
  if (practiceBtn) {
    practiceBtn.addEventListener("click", () => {
      const v = vocabConfig();
      native.openVocabPopup(v.lang || "es", v.drillCats || [], v.drillPos || [], v.popupPosition || "bottom-right", true).catch(() => {});
    });
  }
  const enEl = body.querySelector(".vocab-en");
  const otherEl = body.querySelector(".vocab-other");
  let i = 0;
  const show = () => {
    if (!body.isConnected) return;
    const card = cards[i % cards.length];
    enEl.textContent = card.en;
    otherEl.textContent = `${card.es} • ${card.de}`;
    i += 1;
    if (speakOn) speakVocabCard(body, card, voiceURIs, c.data?.volume, c.data?.rate);
    if (i % cards.length === 0) {
      // Refresh the batch every full cycle so rotation never goes stale.
      native.readVocabCards(20).then((fresh) => { if (fresh.length) cards = fresh; }).catch(() => {});
    }
  };
  show();
  const t = setInterval(show, intervalSec * 1000);
  addTimer(body, t);
}

// Web Speech voices resolve async in the webview; cache the promise so tile
// and settings share one load.
let speechVoicesPromise = null;
function getSpeechVoices() {
  if (!("speechSynthesis" in window)) return Promise.resolve([]);
  if (!speechVoicesPromise) {
    speechVoicesPromise = new Promise((resolve) => {
      let done = false;
      const take = () => {
        if (done) return;
        const list = window.speechSynthesis.getVoices();
        if (list.length) {
          done = true;
          resolve(list);
        }
      };
      take();
      window.speechSynthesis.addEventListener("voiceschanged", take);
      setTimeout(() => {
        if (!done) {
          done = true;
          resolve(window.speechSynthesis.getVoices());
        }
      }, 2500);
    });
  }
  return speechVoicesPromise;
}

function pickSpeechVoice(voices, voiceURI, langPrefix) {
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  const pref = (langPrefix || "").toLowerCase();
  return voices.find((v) => (v.lang || "").toLowerCase().startsWith(pref)) || null;
}

// (Re)fill one voice dropdown: lang-matched voices first, then the rest.
// Preserves the user's current pick across refills.
function fillVocabVoiceSelect(sel, slot, list, preferred) {
  const cur = sel.value || preferred || "";
  const matches = list.filter((vv) => (vv.lang || "").toLowerCase().startsWith(slot));
  const rest = list.filter((vv) => !(vv.lang || "").toLowerCase().startsWith(slot));
  sel.innerHTML = `<option value="">Default</option>` + [...matches, ...rest]
    .map((vv) => `<option value="${escapeHtml(vv.voiceURI)}" ${vv.voiceURI === cur ? "selected" : ""}>${escapeHtml(vv.name)} (${escapeHtml(vv.lang)})</option>`)
    .join("");
}

// Late-arriving voices (slow OS enumeration) refill any open dropdowns and
// refresh the shared cache so tiles pick them up too.
if ("speechSynthesis" in window) {
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    const list = window.speechSynthesis.getVoices();
    if (!list.length) return;
    speechVoicesPromise = Promise.resolve(list);
    for (const slot of ["en", "es", "de"]) {
      const sel = document.querySelector(`#vocab-voice-${slot}`);
      if (sel) fillVocabVoiceSelect(sel, slot, list);
    }
  });
}

// Speak one card EN -> ES -> DE. Generation-guarded per tile body so a stale
// chain (advance / teardown race) can never talk over the current card.
function speakVocabCard(body, card, voiceURIs, volumePct, rateVal) {
  if (!("speechSynthesis" in window)) return;
  const synth = window.speechSynthesis;
  const gen = (body._vocabSpeakGen = (body._vocabSpeakGen || 0) + 1);
  synth.cancel();
  const volNum = Number(volumePct);
  const volume = Math.min(1, Math.max(0, Number.isFinite(volNum) ? volNum / 100 : 1));
  const rateNum = Number(rateVal);
  const rate = Math.min(2, Math.max(0.5, Number.isFinite(rateNum) ? rateNum : 0.95));
  getSpeechVoices()
    .then(async (voices) => {
      if (!body.isConnected || body._vocabSpeakGen !== gen) return;
      const parts = [
        { text: card.en, lang: "en-US", uri: voiceURIs?.en },
        { text: card.es, lang: "es-ES", uri: voiceURIs?.es },
        { text: card.de, lang: "de-DE", uri: voiceURIs?.de },
      ];
      for (const p of parts) {
        if (!body.isConnected || body._vocabSpeakGen !== gen) return;
        if (!p.text) continue;
        await new Promise((done) => {
          const u = new SpeechSynthesisUtterance(p.text);
          u.lang = p.lang;
          u.rate = rate;
          u.volume = volume;
          const v = pickSpeechVoice(voices, p.uri, p.lang.slice(0, 2));
          if (v) u.voice = v;
          u.onend = done;
          u.onerror = done;
          synth.speak(u);
        });
      }
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Meme tile: ambient rotation (imgflip top-100 + curated collection) plus an
// expanded fullscreen view for browsing, captioning, searching, exporting.
// State holds REFERENCES only (sourceUrl / cacheKey) — never image bytes;
// bytes live in the Rust-side disk cache (fetch_image_cached family).
// ---------------------------------------------------------------------------
const MEME_DAY_MS = 24 * 3600 * 1000;
const MEME_MAX_ENTRIES = 200;
const MEME_DEFAULT_ENGINE = "https://www.pinterest.com/search/pins/?q={q}&rs=typed";
const memeUriCache = new Map(); // entry-key -> data-URI (session only)

function memeCollection() {
  state.memeCollection = Array.isArray(state.memeCollection) ? state.memeCollection : [];
  return state.memeCollection;
}
function memeTop100() {
  if (!state.memeTop100 || !Array.isArray(state.memeTop100.items)) state.memeTop100 = { at: 0, items: [] };
  return state.memeTop100;
}
function memeEngine() {
  if (!state.memeSearchEngine) state.memeSearchEngine = MEME_DEFAULT_ENGINE;
  return state.memeSearchEngine;
}
function memeEntryKey(entry) {
  return entry.id || entry.sourceUrl || entry.cacheKey || entry.url || "";
}
function memeExtOf(pathOrUrl) {
  const ext = (String(pathOrUrl || "").split(/[?#]/)[0].split(".").pop() || "").toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}
async function memeEntryUri(entry) {
  const key = memeEntryKey(entry);
  if (key && memeUriCache.has(key)) return memeUriCache.get(key);
  let uri = "";
  if (entry.cacheKey) {
    try {
      uri = await native.loadCachedImage(entry.cacheKey);
    } catch {
      uri = "";
    }
  }
  if (!uri && entry.sourceUrl) uri = await native.fetchImageCached(entry.sourceUrl);
  if (!uri && entry.url) uri = await native.fetchImageCached(entry.url);
  if (!uri) throw new Error("unresolvable entry");
  if (key) memeUriCache.set(key, uri);
  return uri;
}
async function refreshMemeTop100(force) {
  const t = memeTop100();
  if (!force && t.at && Date.now() - t.at < MEME_DAY_MS && t.items.length) return t;
  try {
    const resp = await fetch("https://api.imgflip.com/get_memes");
    const j = await resp.json();
    if (j.success && Array.isArray(j.data?.memes)) {
      t.at = Date.now();
      t.items = j.data.memes.slice(0, 100).map((m) => ({ id: String(m.id), name: m.name, url: m.url }));
      saveState();
    }
  } catch {
    // Offline or CORS-blocked: keep the old list; rotation continues regardless.
  }
  return t;
}
function memePool() {
  const top = memeTop100().items.map((t) => ({ id: "top:" + t.id, name: t.name, url: t.url }));
  return [...top, ...memeCollection()];
}
async function importMemeFiles(paths) {
  const col = memeCollection();
  let added = 0;
  for (const p of paths) {
    if (col.length >= MEME_MAX_ENTRIES) break;
    try {
      const ref = await native.importImageFile(p);
      if (!ref || !ref.key) continue;
      if (col.some((e) => e.cacheKey === ref.key)) continue; // no dupes
      const entry = {
        id: "m" + Date.now() + added,
        name: p.split(/[\\/]/).pop() || "image",
        sourceUrl: null,
        cacheKey: ref.key,
        ext: memeExtOf(p),
        addedAt: Date.now(),
      };
      col.push(entry);
      memeUriCache.set(entry.id, ref.uri);
      added += 1;
    } catch {
      // Not an image (or unreadable) — skip silently.
    }
  }
  if (added) {
    saveState();
    render();
  }
  return added;
}

async function renderMemeBody(c, body) {
  const intervalSec = Math.max(5, Number(c.data?.intervalSec) || 30);
  body.innerHTML = `
    <div class="meme-wrap">
      <img class="meme-img" alt="" />
      <div class="meme-btns">
        <button class="btn ghost icon-btn meme-next" title="Next meme">↻</button>
        <button class="btn ghost icon-btn meme-expand" title="Expand">⛶</button>
      </div>
      <div class="meme-note muted"></div>
    </div>`;
  const img = body.querySelector(".meme-img");
  const note = body.querySelector(".meme-note");
  const pick = async () => {
    if (!body.isConnected) return;
    try {
      await refreshMemeTop100(false);
    } catch { /* keep old list */ }
    if (!body.isConnected) return;
    const pool = memePool();
    if (!pool.length) {
      note.textContent = "No memes yet — add some in Settings.";
      img.removeAttribute("src");
      return;
    }
    note.textContent = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = pool[Math.floor(Math.random() * pool.length)];
      try {
        const uri = await memeEntryUri(entry);
        if (!body.isConnected) return;
        img.src = uri;
        img.title = entry.name || "";
        body._memeEntry = entry;
        return;
      } catch {
        // Unresolvable (offline + uncached, dead file) — try another entry.
      }
    }
    note.textContent = "Couldn't load a meme image.";
  };
  await pick();
  const t = setInterval(pick, intervalSec * 1000);
  addTimer(body, t);
  body.querySelector(".meme-next").addEventListener("click", (e) => {
    e.stopPropagation();
    pick();
  });
  body.querySelector(".meme-expand").addEventListener("click", (e) => {
    e.stopPropagation();
    openMemeFocus(c.id, body._memeEntry);
  });
}

// ---------------------------------------------------------------------------
// Spotify tile. Remote control for the installed Spotify app / a Connect
// device (the API does not stream audio). Shows now-playing + transport
// controls + a device picker. Requires OAuth via Settings > Spotify.
// ---------------------------------------------------------------------------
async function renderSpotifyBody(c, body) {
  const connected = await native.spotifyConnected();
  if (!connected) {
    body.innerHTML = `<div class="muted">Spotify not connected — connect in Settings.</div>`;
    return;
  }
  // Build the stable layout once; then refresh now-playing + progress in place
  // so the queue isn't re-fetched and sliders aren't rebuilt every poll tick.
  const blur = c.data?.blur ?? 8;
  const bright = c.data?.brightness ?? 0.55;
  body.innerHTML = `
    <div class="spot-bg" style="filter:blur(${blur}px) brightness(${bright})"></div>
    <div class="spot-overlay">
      <div class="spot-track">
        <div class="spot-meta">
          <div class="spot-heading">
            <div class="spot-title"></div>
            <span class="spot-eq" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
          <div class="spot-artist"></div>
          <div class="spot-album"></div>
          <div class="spot-progress-hit"><div class="spot-progress"><div class="spot-fill" style="width:0%"></div></div></div>
        </div>
      </div>
      <div class="spot-controls">
        <div class="spot-controls-left">
          <button class="btn ghost icon-btn spot-shuffle" title="Shuffle">${SHUFFLE_ICON}</button>
          <button class="btn ghost icon-btn spot-prev" title="Previous">${PREV_ICON}</button>
          <button class="btn ghost icon-btn spot-play" title="Play/Pause">${PLAY_ICON}</button>
          <button class="btn ghost icon-btn spot-next" title="Next">${NEXT_ICON}</button>
          <button class="btn ghost icon-btn spot-repeat" title="Repeat: off">${REPEAT_ICON}</button>
        </div>
        <div class="spot-volume">
          <input type="range" class="spot-vol" min="0" max="100" value="50" title="Volume" />
        </div>
      </div>
      <div class="spot-queue"></div>
    </div>
  `;

  const bgEl = body.querySelector(".spot-bg");
  const titleEl = body.querySelector(".spot-title");
  const fillEl = body.querySelector(".spot-fill");
  const eqEl = body.querySelector(".spot-eq");
  let playing = false;
  let shuffleOn = false;
  let repeatMode = "off";
  let lastTitle = null;
  // Progress is interpolated locally from an anchor (progress_ms + wall clock)
  // instead of re-reading the API every tick, so the bar moves smoothly and
  // the now-playing endpoint is hit far less often.
  let anchorProgressMs = 0;
  let anchorAt = 0;
  let durationMs = 0;
  let trackPlaying = false;
  let endRefreshFired = false;
  let seeking = false;
  const renderProgress = () => {
    if (seeking) return; // don't fight the user's drag
    if (!body.isConnected || !durationMs) {
      fillEl.style.width = "0%";
      return;
    }
    const elapsed = trackPlaying ? performance.now() - anchorAt : 0;
    const cur = Math.min(durationMs, anchorProgressMs + elapsed);
    fillEl.style.width = `${(cur / durationMs) * 100}%`;
    // Song should have ended locally: pull fresh state once so the next track
    // appears promptly without polling the API on a fast cadence.
    if (trackPlaying && !endRefreshFired && cur >= durationMs - 250) {
      endRefreshFired = true;
      refresh(true);
    }
  };
  const refresh = async (forceQueue, givenTrack) => {
    let track = givenTrack;
    if (track === undefined) {
      try {
        track = await native.spotifyNowPlaying();
      } catch {
        track = null;
      }
    }
    if (!body.isConnected) return;
    if (!track || !track.title) {
      titleEl.textContent = "Nothing playing";
      body.querySelector(".spot-artist").textContent = "";
      body.querySelector(".spot-album").textContent = "";
      durationMs = 0;
      fillEl.style.width = "0%";
      eqEl.classList.remove("playing");
      lastSpotifyArt = "";
      void refreshDynamicPalette();
      return;
    }
    bgEl.style.backgroundImage = track.art ? `url("${track.art}")` : "";
    lastSpotifyArt = track.art || "";
    void refreshDynamicPalette();
    titleEl.textContent = track.title;
    body.querySelector(".spot-artist").textContent = track.artist;
    body.querySelector(".spot-album").textContent = track.album;
    // Re-anchor progress from the API sample; local interpolation fills the gaps.
    anchorProgressMs = track.progress_ms || 0;
    durationMs = track.duration_ms || 0;
    trackPlaying = !!track.playing;
    eqEl.classList.toggle("playing", trackPlaying);
    anchorAt = performance.now();
    endRefreshFired = false;
    renderProgress();
    playing = track.playing;
    body.querySelector(".spot-play").innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    // Sync shuffle / repeat buttons with the player state.
    const shuffleBtn = body.querySelector(".spot-shuffle");
    shuffleBtn.classList.toggle("active", !!track.shuffle);
    shuffleBtn.classList.toggle("active-smart", !!track.smart_shuffle && !track.shuffle);
    shuffleBtn.title = track.smart_shuffle
      ? "Smart Shuffle is on (enabled in the Spotify app)"
      : track.shuffle ? "Shuffle: on" : "Shuffle: off";
    const repeatBtn = body.querySelector(".spot-repeat");
    const rep = track.repeat || "off";
    repeatBtn.classList.toggle("active", rep !== "off");
    repeatBtn.innerHTML = rep === "track" ? REPEAT_ONE_ICON : REPEAT_ICON;
    repeatBtn.title = `Repeat: ${rep}`;
    shuffleOn = !!track.shuffle;
    repeatMode = rep;
    // Re-fetch the queue only when the track (or explicit request) changed.
    if (forceQueue || track.title !== lastTitle) {
      lastTitle = track.title;
      await loadSpotifyQueue(body);
    }
  };

  body.querySelector(".spot-play").addEventListener("click", async () => {
    try {
      await native.spotifyPlay(!playing);
      await refresh(true);
    } catch (e) {
      alert(`Spotify: ${e.message || e}`);
    }
  });
  body.querySelector(".spot-next").addEventListener("click", async () => {
    try {
      await native.spotifySkip(true);
      lastTitle = null; // track will change -> force queue refresh
      await refresh(true);
    } catch (e) {
      alert(`Spotify: ${e.message || e}`);
    }
  });
  body.querySelector(".spot-prev").addEventListener("click", async () => {
    try {
      await native.spotifySkip(false);
      lastTitle = null;
      await refresh(true);
    } catch (e) {
      alert(`Spotify: ${e.message || e}`);
    }
  });
  body.querySelector(".spot-shuffle").addEventListener("click", async () => {
    try {
      await native.spotifyShuffle(!shuffleOn);
      await refresh(true);
    } catch (e) {
      alert(`Spotify: ${e.message || e}`);
    }
  });
  body.querySelector(".spot-repeat").addEventListener("click", async () => {
    const next = repeatMode === "off" ? "context" : repeatMode === "context" ? "track" : "off";
    try {
      await native.spotifyRepeat(next);
      await refresh(true);
    } catch (e) {
      alert(`Spotify: ${e.message || e}`);
    }
  });
  body.querySelector(".spot-vol").addEventListener("change", async (e) => {
    try {
      await native.spotifyVolume(Number(e.target.value));
    } catch (err) {
      alert(`Spotify: ${err.message || err}`);
    }
  });

  // Seek: click/drag the progress bar to jump to a position. During the drag
  // the fill previews the target; on release we seek the device and re-anchor
  // the local interpolator so the bar continues from the new spot.
  const progressEl = body.querySelector(".spot-progress-hit");
  const fracFromEvent = (e) => {
    const r = progressEl.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  progressEl.addEventListener("pointerdown", (e) => {
    if (!durationMs) return;
    seeking = true;
    try { progressEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    fillEl.style.width = `${fracFromEvent(e) * 100}%`;
  });
  progressEl.addEventListener("pointermove", (e) => {
    if (!seeking) return;
    fillEl.style.width = `${fracFromEvent(e) * 100}%`;
  });
  progressEl.addEventListener("pointerup", async (e) => {
    if (!seeking) return;
    seeking = false;
    const f = fracFromEvent(e);
    const posMs = Math.round(f * durationMs);
    anchorProgressMs = posMs;
    anchorAt = performance.now();
    endRefreshFired = false;
    fillEl.style.width = `${f * 100}%`;
    try {
      await native.spotifySeek(posMs);
    } catch (err) {
      alert(`Spotify: ${err.message || err}`);
    }
  });

  await refresh(true);
  // Metadata (track/queue/shuffle/repeat) updates come from the shared 5s
  // playback poller (also used by the Lyrics tile), so there's only one poll.
  subscribePlayback(body, (track) => {
    if (body.isConnected) void refresh(false, track);
  });
  // Local progress interpolation — smooth, no API traffic.
  const pt = setInterval(renderProgress, 250);
  addTimer(body, pt);
  // Jump to a queue song. Fast path: one PUT /play with context+offset when
  // playing from an album/playlist. Fallback: paced skip-forward loop that
  // stops on rate-limit (429) instead of hammering through.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const setQueueStatus = (text) => {
    const t = body.querySelector(".spot-queue-title");
    if (t) t.textContent = text;
  };
  body._spotJump = async (uri) => {
    if (body._spotJumping) return;
    body._spotJumping = true;
    try {
      const current = await native.spotifyNowPlaying().catch(() => null);
      const ctxUri = current?.context_uri || "";
      const ctxType = current?.context_type || "";
      // Fast path: try a direct jump whenever there is a context. Spotify
      // accepts it for album/playlist (and sometimes more); any rejection
      // falls through to the paced skip loop below, so attempting is safe.
      if (ctxUri) {
        try {
          await native.spotifyJump(ctxUri, uri);
          lastTitle = null; // track will change -> force queue refresh
          await refresh(true);
          return;
        } catch (e) {
          const reason = `${e.message || e}`.replace(/^Spotify HTTP /, "").slice(0, 90);
          console.error("spotifyJump refused:", e);
          setQueueStatus(`Jumping… (direct refused: ${reason}, stepping)`);
        }
      } else {
        setQueueStatus("Jumping… (no playback context, stepping)");
      }
      const q = await native.spotifyQueue();
      const idx = q.findIndex((s) => s.uri && s.uri === uri);
      if (idx < 0) return;
      setQueueStatus("Jumping…");
      for (let k = 0; k <= idx; k++) {
        try {
          await native.spotifySkip(true);
        } catch (e) {
          const msg = `${e.message || e}`;
          if (/429/.test(msg)) {
            setQueueStatus("Rate limited — stopped early");
            break;
          }
          throw e;
        }
        await sleep(175);
      }
      lastTitle = null; // track will change -> force queue refresh
      await refresh(true);
    } catch (e) {
      alert(`Spotify: ${e.message || e}`);
    } finally {
      body._spotJumping = false;
    }
  };
}

async function loadSpotifyQueue(body) {
  let queue = [];
  try {
    queue = await native.spotifyQueue();
  } catch (e) {
    queue = [];
  }
  const box = body.querySelector(".spot-queue");
  if (!box) return;
  if (!queue.length) {
    box.innerHTML = `<div class="muted">Queue is empty.</div>`;
    return;
  }
  box.innerHTML = `<div class="spot-queue-title">Up next</div>` + queue
    .slice(0, 20)
    .map((q) => `<div class="spot-queue-item" data-uri="${escapeHtml(q.uri || "")}" title="Play this next: ${escapeHtml(q.title)}"><span class="spot-queue-name">${escapeHtml(q.title)}</span><span class="spot-queue-artist">${escapeHtml(q.artist)}</span></div>`)
    .join("");
  box.querySelectorAll(".spot-queue-item[data-uri]").forEach((el) =>
    el.addEventListener("click", () => {
      if (el.dataset.uri && typeof body._spotJump === "function") body._spotJump(el.dataset.uri);
    })
  );
}

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const SHUFFLE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20L21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></svg>`;
const REPEAT_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
const REPEAT_ONE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4" stroke-width="1.6"/><circle cx="11.5" cy="10" r="0.4" fill="currentColor"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
// Previous: triangle pointing left + a vertical bar on the right.
const PREV_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 7h2v10H6zM20 5v14L9 12z"/></svg>`;
// Next: a vertical bar on the left + triangle pointing right.
const NEXT_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 7h2v10h-2zM4 5v14l11-7z"/></svg>`;

// ---------------------------------------------------------------------------
// Projects tile. Per repo root, lists each subfolder as a project with a
// Folder button and a Solution button (greyed when none). Roots are grouped,
// each group collapsible. Paths are editable in Settings.
// ---------------------------------------------------------------------------
function renderProjectsBody(c, body) {
  const roots = c.data?.roots || [];
  const groupIcon = (open) =>
    `<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" style="transition:transform .12s;${open ? "" : "transform:rotate(-90deg)"}"><path d="M6 4l4 4-4 4z"/></svg>`;
  const folderBtn = (folder) =>
    `<button class="btn ghost prj-folder" data-path="${escapeHtml(folder)}" title="Open folder">${ICON.folder} Folder</button>`;
  const solBtn = (solution) =>
    solution
      ? `<button class="btn ghost prj-sol" data-path="${escapeHtml(solution)}" title="Open solution">${ICON.solution} Solution</button>`
      : `<button class="btn ghost prj-sol muted" disabled title="No solution found">${ICON.solution} Solution</button>`;

  body.innerHTML =
    (roots.length ? "" : `<div class="prj-note">Configure repo roots in Settings to auto-fill projects.</div>`) +
    roots
      .map((root, ri) => {
        const open = root.collapsed !== true;
        const items = (root.projects || [])
          .map(
            (pr, i) => `
            <div class="prj-row">
              <span class="prj-name">${escapeHtml((pr.folder || "").split(/[\\/]/).pop() || pr.folder || "?")}</span>
              <div class="prj-actions">
                ${folderBtn(pr.folder || "")}
                ${solBtn(pr.solution || "")}
              </div>
            </div>`
          )
          .join("");
        return `
        <div class="prj-group">
          <button class="prj-root" data-root="${ri}" style="${root.color ? `--prj-color:${escapeHtml(root.color)};` : ""}">${groupIcon(open)} <span>${escapeHtml(root.name || (root.path || "").split(/[\\/]/).filter(Boolean).pop() || root.path)}</span></button>
          <div class="prj-items" ${open ? "" : "hidden"}>${items || `<div class="muted">No projects found.</div>`}</div>
        </div>`;
      })
      .join("");

  body.querySelectorAll(".prj-root").forEach((btn) =>
    btn.addEventListener("click", () => {
      const ri = Number(btn.dataset.root);
      roots[ri].collapsed = roots[ri].collapsed !== true;
      saveState();
      render();
    })
  );
  body.querySelectorAll(".prj-folder").forEach((b) =>
    b.addEventListener("click", () => native.openFolder(b.dataset.path).catch((e) => alert(`Folder: ${e.message || e}`)))
  );
  body.querySelectorAll(".prj-sol:not([disabled])").forEach((b) =>
    b.addEventListener("click", () => native.openSolution(b.dataset.path).catch((e) => alert(`Solution: ${e.message || e}`)))
  );
}

// ---------------------------------------------------------------------------
// Weather + world clock. Open-Meteo (no API key). Each weather compartment
// holds its own location (name + lat/lon). timezone=auto returns the local
// utc offset so we can show that location's current time in real time.
// ---------------------------------------------------------------------------
const WEATHER_BASE = "https://api.open-meteo.com/v1/forecast";
const WMO = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm + hail",
  99: "Severe thunderstorm + hail",
};
const wmoLabel = (code) => WMO[code] || "—";

// Transient caches for network compartments (weather, news), keyed by
// compartment id. Kept out of persisted state so a grid drag/resize/rename
// doesn't refetch, but stale data is never saved to disk.
const weatherCache = new Map();
const newsCache = new Map();

async function fetchWeather(lat, lon) {
  const url = `${WEATHER_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather HTTP ${res.status}`);
  const j = await res.json();
  const cur = j.current;
  return {
    temp: cur.temperature_2m,
    code: cur.weather_code,
    wind: cur.wind_speed_10m,
    tz: j.timezone,
  };
}

function renderWeatherBody(c, body) {
  const loc = c.data?.location;
  if (!loc || loc.lat === undefined || loc.lon === undefined) {
    body.innerHTML = `<div class="muted">Weather — add a location in Settings.</div>`;
    return;
  }

  const paint = (w) => {
    const clock = () =>
      new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: w.tz,
        hour12: false,
      });
    body.innerHTML = `
      <div class="wea-card">
        <div class="wea-sky">
          <span class="wea-sun"></span>
          <span class="wea-cloud wea-cloud-back"></span>
          <span class="wea-cloud wea-cloud-front"></span>
        </div>
        <div class="wea-head">
          <span class="wea-name">${escapeHtml(loc.name || "Weather")}</span>
          <span class="wea-clock" data-clock>${clock()}</span>
        </div>
        <div class="wea-temp">${Math.round(w.temp)}°</div>
        <div class="wea-desc">${wmoLabel(w.code)} · wind ${Math.round(w.wind)} km/h</div>
      </div>
    `;
    const clockEl = body.querySelector("[data-clock]");
    if (clockEl) {
      const t = setInterval(() => {
        clockEl.textContent = clock();
      }, 1000);
      addTimer(body, t);
    }
  };

  // Reuse cached data unless the configured location changed, so grid
  // drag/resize/rename re-renders don't hit the weather API every time.
  const sig = `${loc.lat},${loc.lon}`;
  const cached = weatherCache.get(c.id);
  if (cached && cached.sig === sig) {
    paint(cached.data);
    return;
  }

  body.innerHTML = `<div class="muted">${loadingHtml("Loading weather")}</div>`;
  const show = (html) => {
    if (body.isConnected) body.innerHTML = html;
  };

  fetchWeather(loc.lat, loc.lon)
    .then((data) => {
      weatherCache.set(c.id, { sig, data });
      paint(data);
    })
    .catch((e) => {
      show(`<div class="muted wea-err">Weather unavailable (${escapeHtml(e.message || "error")}).</div>`);
    });
}

// ---------------------------------------------------------------------------
// News / RSS. Each news compartment holds a list of feed URLs. Feeds are
// fetched through the native fetch_rss command (avoids CORS). Failures are
// isolated per feed so one broken feed never blocks the others (FR-NEW-003).
// ---------------------------------------------------------------------------
async function renderNewsFeeds(c, body, feeds) {
  // Reuse cached feed data unless the feed list changed, so grid drag/resize/
  // rename re-renders don't refetch every feed each time.
  const sig = JSON.stringify(feeds.map((f) => f.url));
  const cached = newsCache.get(c.id);
  let results = cached && cached.sig === sig ? cached.data : null;

  if (!results) {
    results = await Promise.allSettled(
      feeds.map(async (f) => {
        const r = await native.fetchRss(f.url);
        return { feed: f, r };
      })
    );
    // Cache only if at least one feed succeeded; an all-failed fetch (e.g. a
    // transient network blip) isn't cached so the next render retries — mirrors
    // how weather caches on success only.
    if (results.some((res) => res.status === "fulfilled" && res.value.r.items.length)) {
      newsCache.set(c.id, { sig, data: results });
    }
  }

  if (!body.isConnected) return;
  const parts = [];
  results.forEach((res, i) => {
    const f = feeds[i];
    if (res.status === "fulfilled" && res.value.r.items.length) {
      parts.push(`
        <div class="news-feed">
          <div class="news-feed-title">${escapeHtml(f.label || res.value.r.feed_title || f.url)}</div>
          <div class="news-items">
            ${res.value.r.items
              .map(
                (it) =>
                  `<button class="news-item" data-url="${escapeHtml(it.link)}">${escapeHtml(it.title)}</button>`
              )
              .join("")}
          </div>
        </div>`);
    } else {
      parts.push(`<div class="news-feed news-fail"><span class="news-feed-title">${escapeHtml(f.label || f.url)}</span><span class="news-err">failed to load</span></div>`);
    }
  });

  body.innerHTML = parts.join("") || `<div class="muted">No headlines loaded.</div>`;
  body.querySelectorAll(".news-item").forEach((b) =>
    b.addEventListener("click", () => native.openUrl(b.dataset.url))
  );
}

// ---------------------------------------------------------------------------
// Preview panel (right side). Shows a tile's content read-only, floating above
// the grid (no reflow). Toggled from the toolbar; the eye button on a tile
// header opens it for that tile.
// ---------------------------------------------------------------------------
const previewEl = document.getElementById("preview");
const previewBody = document.getElementById("preview-body");
let previewTileId = null;

function openPreview(id) {
  const comp = state.compartments.find((c) => c.id === id);
  if (!comp) return;
  previewTileId = id;
  previewSig = null;
  document.getElementById("preview-title").textContent = comp.title;
  previewEl.classList.remove("hidden");
  syncPreviewCheckbox();
  renderPreview();
}
function closePreview() {
  previewTileId = null;
  previewSig = null;
  previewEl.classList.add("hidden");
  previewBody.innerHTML = "";
  // Only clear timers bound to the preview body — not the dashboard's live
  // tiles (System stats, Weather clock), which must keep updating.
  clearBodyTimers(previewBody);
}
let previewSig = null;
function renderPreview() {
  if (!previewTileId) return;
  const comp = state.compartments.find((c) => c.id === previewTileId);
  if (!comp) return;
  document.getElementById("preview-title").textContent = comp.title;
  // Skip if the previewed tile's content is unchanged (avoids flicker/refetch
  // when render() is triggered by unrelated actions).
  const sig = tileBodySig(comp);
  if (previewSig === sig && previewBody.childElementCount) return;
  previewSig = sig;
  // Clear any timers still bound to the preview body (e.g. a previous tile's
  // system-stats interval) so they don't keep overwriting the new content.
  clearBodyTimers(previewBody);
  renderCompartmentBody(comp, previewBody);
}

const setPreviewCheckbox = document.getElementById("set-preview");
function syncPreviewCheckbox() {
  if (setPreviewCheckbox) setPreviewCheckbox.checked = !previewEl.classList.contains("hidden");
}
document.getElementById("set-preview").addEventListener("change", (e) => {
  if (e.target.checked) openPreview(previewTileId || state.compartments[0]?.id);
  else closePreview();
});
document.getElementById("preview-close").addEventListener("click", () => {
  closePreview();
  syncPreviewCheckbox();
});

// Preview panel width control.
const previewWidthEl = document.getElementById("preview-width");
function applyPreviewWidth(px) {
  previewEl.style.width = `${px}px`;
  state.previewWidth = px;
  saveState();
}
previewWidthEl.addEventListener("change", (e) => {
  applyPreviewWidth(clamp(Number(e.target.value) || 320, 200, 800));
});

// ---------------------------------------------------------------------------
// Settings overlay wiring.
// ---------------------------------------------------------------------------
const settingsEl = document.getElementById("settings");
const settingsPanel = document.querySelector(".settings-panel");

document.getElementById("btn-settings").addEventListener("click", () => settingsEl.classList.remove("hidden"));
document.getElementById("btn-settings-close").addEventListener("click", () => settingsEl.classList.add("hidden"));

// Fullscreen toggle (button + F11). Uses the window API when in Tauri.
async function toggleFullscreen() {
  if (!window.__TAURI__) return;
  const win = window.__TAURI__.window.getCurrentWindow();
  const fs = await win.isFullscreen();
  await win.setFullscreen(!fs);
}
document.getElementById("btn-fullscreen").addEventListener("click", toggleFullscreen);
window.addEventListener("keydown", (e) => {
  if (e.key === "F11") {
    e.preventDefault();
    toggleFullscreen();
  }
});

// Background mode: pin the window fullscreen behind all windows (tray icon
// stays the way back in). Leaving it does NOT force-exit fullscreen;
// F11 / the toggle still control that independently.
async function applyBackgroundMode(on) {
  const next = on === true;
  if (window.__TAURI__) {
    const win = window.__TAURI__.window.getCurrentWindow();
    await win.setAlwaysOnBottom(next);
    await win.setSkipTaskbar(next);
    if (next) await win.setFullscreen(true);
  }
  // Persist only after the window calls succeed, so a failure never leaves
  // a checked box / saved state for a mode that isn't applied.
  state.backgroundMode = next;
  saveState();
}
document.getElementById("set-background").addEventListener("change", async (e) => {
  try {
    await applyBackgroundMode(e.target.checked);
  } catch (err) {
    e.target.checked = state.backgroundMode === true;
    alert(`Background mode: ${err.message || err}`);
  }
  render();
});
document.getElementById("set-autostart").addEventListener("change", async (e) => {
  try {
    await native.setAutostart(e.target.checked);
  } catch (err) {
    e.target.checked = !e.target.checked;
    alert(`Autostart: ${err.message || err}`);
  }
});

// Drag the settings window by its header so it can be moved aside to see the
// dashboard behind it. The panel is centered via transform; we switch to
// explicit left/top once the user starts dragging so it stays where they drop it.
let settingsDrag = null;
settingsPanel.querySelector("header").addEventListener("mousedown", (e) => {
  if (e.target.closest("button")) return; // don't start a drag on the close button
  const rect = settingsPanel.getBoundingClientRect();
  settingsPanel.style.transform = "none";
  settingsPanel.style.left = `${rect.left}px`;
  settingsPanel.style.top = `${rect.top}px`;
  settingsDrag = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
  e.preventDefault();
});
document.addEventListener("mousemove", (e) => {
  if (!settingsDrag) return;
  settingsPanel.style.left = `${settingsDrag.origX + e.clientX - settingsDrag.startX}px`;
  settingsPanel.style.top = `${settingsDrag.origY + e.clientY - settingsDrag.startY}px`;
});
document.addEventListener("mouseup", () => {
  settingsDrag = null;
});

function activateTab(tabName) {
  document.querySelectorAll(".settings-tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tabName));
  if (tabName === "folders") renderFoldersSettings();
  if (tabName === "bookmarks") renderBookmarksSettings();
  if (tabName === "azure") renderAzureSettings();
  if (tabName === "weather") renderWeatherSettings();
  if (tabName === "news") renderNewsSettings();
  if (tabName === "system") renderSystemSettings();
  if (tabName === "translate") renderTranslateSettings();
  if (tabName === "frame") renderFrameSettings();
  if (tabName === "spotify") renderSpotifySettings();
  if (tabName === "lyrics") renderLyricsSettings();
  if (tabName === "projects") renderProjectsSettings();
  if (tabName === "config") renderConfigSettings();
  if (tabName === "backup") renderBackupSettings();
  if (tabName === "vocab") renderVocabSettings();
  if (tabName === "meme") renderMemeSettings();
  if (tabName === "calendar") renderCalendarSettings();
  if (tabName === "captions") renderCaptionSettings();
  if (tabName === "design") renderDesignSettings();
}

// Map a compartment kind to its dedicated Settings tab (used by the per-tile
// settings button so it lands on the right panel and preselects the tile).
const KIND_TAB = {
  launcher: "folders",
  bookmarks: "bookmarks",
  azure: "azure",
  system: "system",
  weather: "weather",
  news: "news",
  translate: "translate",
  frame: "frame",
  spotify: "spotify",
  lyrics: "lyrics",
  project: "projects",
  vocab: "vocab",
  meme: "meme",
  calendar: "calendar",
  caption: "captions",
};

function openTileSettings(id) {
  const comp = state.compartments.find((c) => c.id === id);
  if (!comp) return;
  const tab = KIND_TAB[comp.kind] || "grid";
  if (comp.kind === "launcher") selectedLauncherId = id;
  if (comp.kind === "bookmarks") selectedBookmarksId = id;
  if (comp.kind === "azure") selectedAzureId = id;
  if (comp.kind === "weather") selectedWeatherId = id;
  if (comp.kind === "news") selectedNewsId = id;
  if (comp.kind === "system") selectedSystemId = id;
  if (comp.kind === "translate") selectedTranslateId = id;
  if (comp.kind === "frame") selectedFrameId = id;
  if (comp.kind === "spotify") selectedSpotifyId = id;
  if (comp.kind === "lyrics") selectedLyricsId = id;
  if (comp.kind === "caption") selectedCaptionId = id;
  if (comp.kind === "project") selectedProjectId = id;
  if (comp.kind === "vocab") selectedVocabId = id;
  if (comp.kind === "meme") selectedMemeId = id;
  if (comp.kind === "calendar") selectedCalendarId = id;
  activateTab(tab);
  settingsEl.classList.remove("hidden");
}

document.querySelectorAll(".settings-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
});

// ---------------------------------------------------------------------------
// Folders / Solutions settings editor. Operates on the launcher compartment
// the user selects in the panel (not merely the first launcher), so edits are
// predictable even with multiple launcher compartments on the grid.
// ---------------------------------------------------------------------------
let selectedLauncherId = null;

// Per-tile 'collapsible' control shown in every settings tab's tile-selection
// row. When off, the collapse button is hidden. Persisted per compartment.
function appendCollapsibleRow(panel, comp) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <label>Collapsible
      <input type="checkbox" class="collapsible switch" ${comp.collapsible !== false ? "checked" : ""} />
    </label>
    <label>Hide header
      <input type="checkbox" class="hide-header switch" ${comp.hideHeader ? "checked" : ""} />
    </label>`;
  row.querySelector(".collapsible").addEventListener("change", (e) => {
    comp.collapsible = e.target.checked;
    openTiles.delete(comp.id);
    // Turning collapsible OFF on a currently-collapsed tile would leave it as a
    // header-only bar with no button to expand it — so force it expanded.
    if (!comp.collapsible && comp.collapsed) comp.collapsed = false;
    saveState();
    render();
    renderTabPanel(comp);
  });
  row.querySelector(".hide-header").addEventListener("change", (e) => {
    comp.hideHeader = e.target.checked;
    saveState();
    render();
    renderTabPanel(comp);
  });
  panel.appendChild(row);
}

// Per-tile appearance controls shown in every settings tab: a header icon
// (text character or image file), and header/content background colors.
function appendAppearanceRow(panel, comp) {
  comp.icon = comp.icon || { type: "", value: "" };

  const iconRow = document.createElement("div");
  iconRow.className = "item-row";
  iconRow.innerHTML = `
    <label>Icon</label>
    <select class="icon-type">
      <option value="" ${!comp.icon.type ? "selected" : ""}>None</option>
      <option value="text" ${comp.icon.type === "text" ? "selected" : ""}>Text</option>
      <option value="file" ${comp.icon.type === "file" ? "selected" : ""}>Image</option>
    </select>
    <input class="icon-text" type="text" maxlength="3" placeholder="e.g. ★" value="${escapeHtml(comp.icon.type === "text" ? comp.icon.value : "")}" ${comp.icon.type === "text" ? "" : "hidden"} />
    <button class="btn ghost icon-browse" ${comp.icon.type === "file" ? "" : "hidden"}>Browse…</button>
    <label class="icon-color-label" ${comp.icon.type === "file" ? "" : "hidden"}>SVG color
      <input class="icon-color" type="color" value="${comp.iconColor || "#e6e6ea"}" />
    </label>
    <button class="btn ghost icon-color-reset" ${comp.iconColor ? "" : "hidden"} title="Reset color">✕</button>
    <span class="icon-preview">${
      comp.icon.type === "file" && comp.icon.value
        ? comp.iconColor
          ? `<span class="tile-icon-mask" style="background-color:${escapeHtml(comp.iconColor)};-webkit-mask-image:url('${escapeHtml(comp.icon.value)}');mask-image:url('${escapeHtml(comp.icon.value)}')"></span>`
          : `<img src="${escapeHtml(comp.icon.value)}" alt="" />`
        : comp.icon.type === "text" && comp.icon.value
          ? escapeHtml(comp.icon.value)
          : ""
    }</span>`;
  panel.appendChild(iconRow);

  const colorRow = document.createElement("div");
  colorRow.className = "item-row";
  colorRow.innerHTML = `
    <label>Header color</label>
    <input class="col-header" type="color" value="${comp.headerColor || "#23232b"}" />
    <button class="btn ghost col-header-reset" title="Reset">✕</button>
    <label>Content color</label>
    <input class="col-content" type="color" value="${comp.contentColor || "#1a1a20"}" />
    <button class="btn ghost col-content-reset" title="Reset">✕</button>`;
  panel.appendChild(colorRow);

  const commit = () => {
    saveState();
    render();
  };

  const typeSel = iconRow.querySelector(".icon-type");
  const textInput = iconRow.querySelector(".icon-text");
  const browseBtn = iconRow.querySelector(".icon-browse");
  const preview = iconRow.querySelector(".icon-preview");
  const iconColorLabel = iconRow.querySelector(".icon-color-label");
  const iconColorInput = iconRow.querySelector(".icon-color");
  const iconColorReset = iconRow.querySelector(".icon-color-reset");

  const paintPreview = () => {
    if (comp.icon.type === "file" && comp.icon.value) {
      preview.innerHTML = comp.iconColor
        ? `<span class="tile-icon-mask" style="background-color:${escapeHtml(comp.iconColor)};-webkit-mask-image:url('${escapeHtml(comp.icon.value)}');mask-image:url('${escapeHtml(comp.icon.value)}')"></span>`
        : `<img src="${escapeHtml(comp.icon.value)}" alt="" />`;
    } else if (comp.icon.type === "text" && comp.icon.value) {
      preview.textContent = comp.icon.value;
    } else {
      preview.innerHTML = "";
    }
    iconColorLabel.hidden = comp.icon.type !== "file";
    iconColorReset.hidden = !comp.iconColor;
  };

  typeSel.addEventListener("change", (e) => {
    comp.icon.type = e.target.value;
    if (comp.icon.type !== "text") comp.icon.value = comp.icon.type === "file" ? comp.icon.value : "";
    textInput.hidden = comp.icon.type !== "text";
    browseBtn.hidden = comp.icon.type !== "file";
    if (comp.icon.type === "text" && !comp.icon.value) comp.icon.value = "★";
    paintPreview();
    commit();
    renderTabPanel(comp);
  });
  textInput.addEventListener("input", (e) => {
    comp.icon.value = e.target.value;
    preview.textContent = e.target.value;
    commit();
  });
  browseBtn.addEventListener("click", async () => {
    const p = await native.pickIcon();
    if (!p) return;
    try {
      comp.icon.value = await native.loadTileIcon(p);
      paintPreview();
      commit();
      renderTabPanel(comp);
    } catch (err) {
      alert(`Could not load icon: ${err.message || err}`);
    }
  });
  iconColorInput.addEventListener("change", (e) => {
    comp.iconColor = e.target.value;
    paintPreview();
    commit();
  });
  iconColorReset.addEventListener("click", () => {
    comp.iconColor = "";
    paintPreview();
    commit();
    renderTabPanel(comp);
  });
  colorRow.querySelector(".col-header").addEventListener("change", (e) => {
    comp.headerColor = e.target.value;
    commit();
  });
  colorRow.querySelector(".col-header-reset").addEventListener("click", () => {
    comp.headerColor = "";
    commit();
    renderTabPanel(comp);
  });
  colorRow.querySelector(".col-content").addEventListener("change", (e) => {
    comp.contentColor = e.target.value;
    commit();
  });
  colorRow.querySelector(".col-content-reset").addEventListener("click", () => {
    comp.contentColor = "";
    commit();
    renderTabPanel(comp);
  });

  appendDecorationRow(panel, comp);
}

// Per-tile decoration (Phase 2): border color/width, radius, shadow and a
// background gradient. Each control writes to the tile object and re-renders so
// render() pushes the values as per-tile CSS variables.
function appendDecorationRow(panel, comp) {
  const commit = () => { saveState(); render(); };

  const bRow = document.createElement("div");
  bRow.className = "item-row";
  bRow.innerHTML = `
    <label>Tile border</label>
    <input type="color" class="td-border" value="${comp.borderColor || "#2c2c36"}" />
    <button class="btn ghost td-reset" data-k="borderColor" title="Reset">✕</button>
    <label>Width <input type="number" class="td-bw" min="0" max="6" step="1" placeholder="1" value="${comp.borderWidth != null ? comp.borderWidth : ""}" /></label>
    <button class="btn ghost td-reset" data-k="borderWidth" title="Reset">✕</button>`;
  panel.appendChild(bRow);

  const rRow = document.createElement("div");
  rRow.className = "item-row";
  rRow.innerHTML = `
    <label>Tile radius <input type="number" class="td-radius" min="0" max="40" step="1" placeholder="theme" value="${comp.radius != null ? comp.radius : ""}" /></label>
    <button class="btn ghost td-reset" data-k="radius" title="Reset">✕</button>
    <label>Shadow
      <select class="td-shadow">
        <option value="">Theme default</option>
        ${DESIGN_SHADOWS.map(([l, v]) => `<option value="${escapeHtml(v)}" ${comp.shadow === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </label>
    <button class="btn ghost td-reset" data-k="shadow" title="Reset">✕</button>`;
  panel.appendChild(rRow);

  const fRow = document.createElement("div");
  fRow.className = "item-row";
  fRow.innerHTML = `
    <label>Font size <input type="number" class="td-fsize" min="8" max="32" step="1" placeholder="theme" value="${comp.fontSize != null ? comp.fontSize : ""}" /></label>
    <button class="btn ghost td-reset" data-k="fontSize" title="Reset">✕</button>
    <label>Weight
      <select class="td-fweight">
        <option value="">Theme default</option>
        ${[["Normal", 400], ["Medium", 500], ["Semi-bold", 600], ["Bold", 700]].map(([l, v]) => `<option value="${v}" ${comp.fontWeight === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
    </label>
    <button class="btn ghost td-reset" data-k="fontWeight" title="Reset">✕</button>`;
  panel.appendChild(fRow);

  const gradOn = !!(comp.bgFrom && comp.bgTo);
  const gRow = document.createElement("div");
  gRow.className = "item-row";
  gRow.innerHTML = `
    <label>Tile gradient <input type="checkbox" class="td-grad-on switch" ${gradOn ? "checked" : ""} /></label>
    <span class="td-grad-fields" ${gradOn ? "" : "hidden"}>
      <input type="color" class="td-grad-from" value="${comp.bgFrom || "#1a1a20"}" />
      <input type="color" class="td-grad-to" value="${comp.bgTo || "#2a1a4a"}" />
      <input type="number" class="td-grad-angle" min="0" max="360" step="5" value="${comp.bgAngle != null ? comp.bgAngle : 135}" />
    </span>
    <button class="btn ghost td-reset" data-k="grad" title="Reset">✕</button>`;
  panel.appendChild(gRow);

  bRow.querySelector(".td-border").addEventListener("input", (e) => { comp.borderColor = e.target.value; commit(); });
  bRow.querySelector(".td-bw").addEventListener("input", (e) => {
    const v = e.target.value;
    if (v === "") delete comp.borderWidth; else comp.borderWidth = Number(v);
    commit();
  });
  rRow.querySelector(".td-radius").addEventListener("input", (e) => {
    const v = e.target.value;
    if (v === "") delete comp.radius; else comp.radius = Number(v);
    commit();
  });
  rRow.querySelector(".td-shadow").addEventListener("change", (e) => {
    if (e.target.value) comp.shadow = e.target.value; else delete comp.shadow;
    commit();
  });
  fRow.querySelector(".td-fsize").addEventListener("input", (e) => {
    const v = e.target.value;
    if (v === "") delete comp.fontSize; else comp.fontSize = Number(v);
    commit();
  });
  fRow.querySelector(".td-fweight").addEventListener("change", (e) => {
    if (e.target.value) comp.fontWeight = Number(e.target.value); else delete comp.fontWeight;
    commit();
  });
  const gradFields = gRow.querySelector(".td-grad-fields");
  gRow.querySelector(".td-grad-on").addEventListener("change", (e) => {
    if (e.target.checked) {
      comp.bgFrom = comp.bgFrom || "#1a1a20";
      comp.bgTo = comp.bgTo || "#2a1a4a";
      gradFields.hidden = false;
    } else {
      delete comp.bgFrom;
      delete comp.bgTo;
      gradFields.hidden = true;
    }
    commit();
  });
  gRow.querySelector(".td-grad-from").addEventListener("input", (e) => { comp.bgFrom = e.target.value; commit(); });
  gRow.querySelector(".td-grad-to").addEventListener("input", (e) => { comp.bgTo = e.target.value; commit(); });
  gRow.querySelector(".td-grad-angle").addEventListener("input", (e) => { comp.bgAngle = Number(e.target.value); commit(); });

  panel.querySelectorAll(".td-reset").forEach((b) =>
    b.addEventListener("click", () => {
      const k = b.dataset.k;
      if (k === "grad") {
        delete comp.bgFrom; delete comp.bgTo; delete comp.bgAngle;
      } else {
        delete comp[k];
      }
      saveState();
      render();
      renderTabPanel(comp);
    })
  );
}

function renderTabPanel(comp) {
  if (comp.kind === "launcher") renderFoldersSettings();
  if (comp.kind === "bookmarks") renderBookmarksSettings();
  if (comp.kind === "azure") renderAzureSettings();
  if (comp.kind === "weather") renderWeatherSettings();
  if (comp.kind === "news") renderNewsSettings();
  if (comp.kind === "system") renderSystemSettings();
  if (comp.kind === "translate") renderTranslateSettings();
  if (comp.kind === "frame") renderFrameSettings();
  if (comp.kind === "spotify") renderSpotifySettings();
  if (comp.kind === "project") renderProjectsSettings();
  if (comp.kind === "vocab") renderVocabSettings();
  if (comp.kind === "meme") renderMemeSettings();
  if (comp.kind === "calendar") renderCalendarSettings();
  if (comp.kind === "caption") renderCaptionSettings();
}

function ensureLauncher() {
  const launchers = state.compartments.filter((c) => c.kind === "launcher");
  if (launchers.length === 0) {
    const launcher = {
      id: "launcher" + Date.now(),
      kind: "launcher",
      title: "Folders & Files",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 4,
      h: 3,
      data: { items: [] },
    };
    state.compartments.push(launcher);
    selectedLauncherId = launcher.id;
    return launcher;
  }
  if (!launchers.some((l) => l.id === selectedLauncherId)) {
    selectedLauncherId = launchers[0].id;
  }
  const launcher = state.compartments.find((c) => c.id === selectedLauncherId);
  launcher.data = launcher.data || {};
  launcher.data.items = launcher.data.items || [];
  return launcher;
}

function commitLauncher(launcher) {
  saveState();
  render();
  renderFoldersSettings();
}

function renderFoldersSettings() {
  const panel = document.getElementById("folders-list");
  if (!panel) return;
  const launcher = ensureLauncher();
  const launchers = state.compartments.filter((c) => c.kind === "launcher");
  const items = launcher.data.items;

  panel.innerHTML = "";

  // Compartment selector — which launcher tile these items belong to.
  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="launcher-select">
      ${launchers
        .map((l) => `<option value="${l.id}" ${l.id === launcher.id ? "selected" : ""}>${escapeHtml(l.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, launcher);
  appendAppearanceRow(panel, launcher);

  items.forEach((it, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <select class="it-kind" data-i="${i}">
        <option value="folder" ${it.kind === "folder" ? "selected" : ""}>Folder</option>
        <option value="solution" ${it.kind === "solution" ? "selected" : ""}>Solution</option>
      </select>
      <input class="it-label" data-i="${i}" type="text" placeholder="Label" value="${escapeHtml(it.label || "")}" />
      <input class="it-path" data-i="${i}" type="text" placeholder="Path" value="${escapeHtml(it.path || "")}" readonly />
      <button class="btn ghost it-browse" data-i="${i}">Browse</button>
      <button class="btn ghost danger icon-btn it-remove" data-i="${i}" title="Remove">${ICON.remove}</button>`;
    panel.appendChild(row);
  });

  const addRow = document.createElement("div");
  addRow.className = "item-row";
  addRow.innerHTML = `<button class="btn primary" id="add-folder">+ Folder</button><button class="btn primary" id="add-solution">+ Solution</button>`;
  panel.appendChild(addRow);

  panel.querySelector("#launcher-select").addEventListener("change", (e) => {
    selectedLauncherId = e.target.value;
    renderFoldersSettings();
  });
  panel.querySelectorAll(".it-kind").forEach((sel) =>
    sel.addEventListener("change", (e) => {
      items[Number(e.currentTarget.dataset.i)].kind = e.target.value;
      commitLauncher(launcher);
    })
  );
  panel.querySelectorAll(".it-label").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      items[Number(e.currentTarget.dataset.i)].label = e.target.value;
      commitLauncher(launcher);
    })
  );
  panel.querySelectorAll(".it-browse").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const i = Number(e.currentTarget.dataset.i);
      const it = items[i];
      const isFolder = it.kind === "folder";
      const p = isFolder ? await native.pickFolder() : await native.pickSolution();
      if (!p) return;
      it.path = p;
      if (!it.label) it.label = p.split(/[\\/]/).pop();
      commitLauncher(launcher);
    })
  );
  panel.querySelectorAll(".it-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const i = Number(e.currentTarget.dataset.i);
      const it = items[i];
      showConfirmPopup(`Remove "${it?.label || it?.path || "this item"}"?`, {
        x: e.clientX,
        y: e.clientY,
        onConfirm: () => {
          items.splice(i, 1);
          commitLauncher(launcher);
        },
      });
    })
  );
  panel.querySelector("#add-folder").addEventListener("click", () => {
    items.push({ kind: "folder", label: "", path: "" });
    commitLauncher(launcher);
  });
  panel.querySelector("#add-solution").addEventListener("click", () => {
    items.push({ kind: "solution", label: "", path: "" });
    commitLauncher(launcher);
  });
}

// ---------------------------------------------------------------------------
// Bookmarks settings editor. Mirrors the launcher editor: pick a bookmarks
// compartment tile, then add/edit/remove URLs for that specific tile.
// ---------------------------------------------------------------------------
let selectedBookmarksId = null;

function ensureBookmarksComp() {
  const comps = state.compartments.filter((c) => c.kind === "bookmarks");
  if (comps.length === 0) {
    const comp = {
      id: "bmk" + Date.now(),
      kind: "bookmarks",
      title: "Bookmarks",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 4,
      h: 3,
      data: { urls: [] },
    };
    state.compartments.push(comp);
    selectedBookmarksId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedBookmarksId)) {
    selectedBookmarksId = comps[0].id;
  }
  const comp = state.compartments.find((c) => c.id === selectedBookmarksId);
  comp.data = comp.data || {};
  comp.data.urls = comp.data.urls || [];
  return comp;
}

function commitBookmarks(comp) {
  saveState();
  render();
  renderBookmarksSettings();
}

function renderBookmarksSettings() {
  const panel = document.getElementById("bookmarks-list");
  if (!panel) return;
  const comp = ensureBookmarksComp();
  const comps = state.compartments.filter((c) => c.kind === "bookmarks");
  const urls = comp.data.urls;

  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="bookmarks-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  urls.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input class="bmk-title" data-i="${i}" type="text" placeholder="Label" value="${escapeHtml(u.title || "")}" />
      <input class="bmk-url" data-i="${i}" type="text" placeholder="https://…" value="${escapeHtml(u.url || "")}" />
      <button class="btn ghost danger icon-btn bmk-remove" data-i="${i}" title="Remove">${ICON.remove}</button>`;
    panel.appendChild(row);
  });

  const addRow = document.createElement("div");
  addRow.className = "item-row";
  addRow.innerHTML = `<button class="btn primary" id="add-bookmark">+ Bookmark</button>`;
  panel.appendChild(addRow);

  panel.querySelector("#bookmarks-select").addEventListener("change", (e) => {
    selectedBookmarksId = e.target.value;
    renderBookmarksSettings();
  });
  panel.querySelectorAll(".bmk-title").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      urls[Number(e.currentTarget.dataset.i)].title = e.target.value;
      commitBookmarks(comp);
    })
  );
  panel.querySelectorAll(".bmk-url").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      urls[Number(e.currentTarget.dataset.i)].url = e.target.value;
      commitBookmarks(comp);
    })
  );
  panel.querySelectorAll(".bmk-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const i = Number(e.currentTarget.dataset.i);
      const u = urls[i];
      showConfirmPopup(`Remove bookmark "${u?.title || u?.url || "this bookmark"}"?`, {
        x: e.clientX,
        y: e.clientY,
        onConfirm: () => {
          urls.splice(i, 1);
          commitBookmarks(comp);
        },
      });
    })
  );
  panel.querySelector("#add-bookmark").addEventListener("click", () => {
    urls.push({ title: "", url: "" });
    commitBookmarks(comp);
  });
}

// ---------------------------------------------------------------------------
// Azure DevOps settings editor. Each Azure tile holds an org + project (set
// once) and a list of repos; each repo deep-links to its PRs and Files.
// ---------------------------------------------------------------------------
let selectedAzureId = null;

function ensureAzureComp() {
  const comps = state.compartments.filter((c) => c.kind === "azure");
  if (comps.length === 0) {
    const comp = {
      id: "az" + Date.now(),
      kind: "azure",
      title: "Azure DevOps",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 4,
      h: 4,
      data: { org: "", project: "", repos: [] },
    };
    state.compartments.push(comp);
    selectedAzureId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedAzureId)) {
    selectedAzureId = comps[0].id;
  }
  const comp = state.compartments.find((c) => c.id === selectedAzureId);
  comp.data = comp.data || {};
  comp.data.repos = comp.data.repos || [];
  return comp;
}

function commitAzure(comp) {
  saveState();
  render();
  renderAzureSettings();
}

function renderAzureSettings() {
  const panel = document.getElementById("azure-list");
  if (!panel) return;
  const comp = ensureAzureComp();
  const comps = state.compartments.filter((c) => c.kind === "azure");
  const d = comp.data;
  d.repos = d.repos || [];

  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="azure-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const orgRow = document.createElement("div");
  orgRow.className = "item-row";
  orgRow.innerHTML = `<label>Org</label><input id="azure-org" type="text" placeholder="e.g. b4valuenet" value="${escapeHtml(d.org || "")}" /><label>Project</label><input id="azure-project" type="text" placeholder="e.g. TRAFFIQX Core" value="${escapeHtml(d.project || "")}" />`;
  panel.appendChild(orgRow);

  d.repos.forEach((r, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input class="az-label" data-i="${i}" type="text" placeholder="Label (optional)" value="${escapeHtml(r.label || "")}" />
      <input class="az-repo" data-i="${i}" type="text" placeholder="Repo name" value="${escapeHtml(r.repo || "")}" />
      <button class="btn ghost danger icon-btn az-remove" data-i="${i}" title="Remove">${ICON.remove}</button>`;
    panel.appendChild(row);
  });

  const addRow = document.createElement("div");
  addRow.className = "item-row";
  addRow.innerHTML = `<button class="btn primary" id="add-repo">+ Repo</button>`;
  panel.appendChild(addRow);

  panel.querySelector("#azure-select").addEventListener("change", (e) => {
    selectedAzureId = e.target.value;
    renderAzureSettings();
  });
  panel.querySelector("#azure-org").addEventListener("change", (e) => {
    d.org = e.target.value.trim();
    commitAzure(comp);
  });
  panel.querySelector("#azure-project").addEventListener("change", (e) => {
    d.project = e.target.value.trim();
    commitAzure(comp);
  });
  panel.querySelectorAll(".az-label").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      d.repos[Number(e.currentTarget.dataset.i)].label = e.target.value;
      commitAzure(comp);
    })
  );
  panel.querySelectorAll(".az-repo").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      d.repos[Number(e.currentTarget.dataset.i)].repo = e.target.value;
      commitAzure(comp);
    })
  );
  panel.querySelectorAll(".az-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const i = Number(e.currentTarget.dataset.i);
      const repo = d.repos[i];
      showConfirmPopup(`Remove repo "${repo?.label || repo?.repo || "this repo"}"?`, {
        x: e.clientX,
        y: e.clientY,
        onConfirm: () => {
          d.repos.splice(i, 1);
          commitAzure(comp);
        },
      });
    })
  );
  panel.querySelector("#add-repo").addEventListener("click", () => {
    d.repos.push({ label: "", repo: "" });
    commitAzure(comp);
  });
}

// ---------------------------------------------------------------------------
// Weather settings editor. Each weather compartment has its own location:
// a name plus lat/lon, resolved either by typing coords or by geocoding a
// city name through Open-Meteo's free geocoding API.
// ---------------------------------------------------------------------------
let selectedWeatherId = null;

function ensureWeatherComp() {
  const comps = state.compartments.filter((c) => c.kind === "weather");
  if (comps.length === 0) {
    const comp = {
      id: "wea" + Date.now(),
      kind: "weather",
      title: "Weather",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 3,
      h: 3,
      data: { location: { name: "", lat: undefined, lon: undefined } },
    };
    state.compartments.push(comp);
    selectedWeatherId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedWeatherId)) {
    selectedWeatherId = comps[0].id;
  }
  const comp = state.compartments.find((c) => c.id === selectedWeatherId);
  comp.data = comp.data || {};
  comp.data.location = comp.data.location || { name: "", lat: undefined, lon: undefined };
  return comp;
}

function commitWeather(comp) {
  saveState();
  render();
  renderWeatherSettings();
}

async function geocodeCity(name) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`);
  if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
  const j = await res.json();
  if (!j.results || !j.results.length) throw new Error("place not found");
  return j.results[0];
}

function renderWeatherSettings() {
  const panel = document.getElementById("weather-list");
  if (!panel) return;
  const comp = ensureWeatherComp();
  const comps = state.compartments.filter((c) => c.kind === "weather");
  const loc = comp.data.location;

  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="weather-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const nameRow = document.createElement("div");
  nameRow.className = "item-row";
  nameRow.innerHTML = `<label>City</label><input id="weather-city" type="text" placeholder="e.g. Berlin" value="${escapeHtml(loc.name || "")}" /><button class="btn ghost" id="weather-lookup">Look up</button>`;
  panel.appendChild(nameRow);

  const coordRow = document.createElement("div");
  coordRow.className = "item-row";
  coordRow.innerHTML = `<label>Lat</label><input id="weather-lat" type="text" placeholder="52.52" value="${loc.lat ?? ""}" /><label>Lon</label><input id="weather-lon" type="text" placeholder="13.41" value="${loc.lon ?? ""}" />`;
  panel.appendChild(coordRow);

  panel.querySelector("#weather-select").addEventListener("change", (e) => {
    selectedWeatherId = e.target.value;
    renderWeatherSettings();
  });
  panel.querySelector("#weather-city").addEventListener("change", (e) => {
    loc.name = e.target.value.trim();
    commitWeather(comp);
  });
  panel.querySelector("#weather-lookup").addEventListener("click", async (e) => {
    const city = panel.querySelector("#weather-city").value.trim();
    if (!city) return;
    e.target.disabled = true;
    e.target.textContent = "…";
    try {
      const r = await geocodeCity(city);
      loc.name = r.name;
      loc.lat = r.latitude;
      loc.lon = r.longitude;
      commitWeather(comp);
    } catch (err) {
      alert(`Could not find "${city}": ${err.message}`);
    } finally {
      e.target.disabled = false;
      e.target.textContent = "Look up";
    }
  });
  panel.querySelector("#weather-lat").addEventListener("change", (e) => {
    loc.lat = parseFloat(e.target.value);
    commitWeather(comp);
  });
  panel.querySelector("#weather-lon").addEventListener("change", (e) => {
    loc.lon = parseFloat(e.target.value);
    commitWeather(comp);
  });
}

// ---------------------------------------------------------------------------
// News settings editor. Each news compartment holds a list of feed URLs
// (with optional labels) for that specific tile.
// ---------------------------------------------------------------------------
let selectedNewsId = null;

function ensureNewsComp() {
  const comps = state.compartments.filter((c) => c.kind === "news");
  if (comps.length === 0) {
    const comp = {
      id: "nws" + Date.now(),
      kind: "news",
      title: "News",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 4,
      h: 4,
      data: { feeds: [] },
    };
    state.compartments.push(comp);
    selectedNewsId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedNewsId)) {
    selectedNewsId = comps[0].id;
  }
  const comp = state.compartments.find((c) => c.id === selectedNewsId);
  comp.data = comp.data || {};
  comp.data.feeds = comp.data.feeds || [];
  return comp;
}

function commitNews(comp) {
  saveState();
  render();
  renderNewsSettings();
}

function renderNewsSettings() {
  const panel = document.getElementById("news-list");
  if (!panel) return;
  const comp = ensureNewsComp();
  const comps = state.compartments.filter((c) => c.kind === "news");
  const feeds = comp.data.feeds;

  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="news-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  feeds.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input class="news-label" data-i="${i}" type="text" placeholder="Label (optional)" value="${escapeHtml(f.label || "")}" />
      <input class="news-url" data-i="${i}" type="text" placeholder="https://…/feed.xml" value="${escapeHtml(f.url || "")}" />
      <button class="btn ghost danger icon-btn news-remove" data-i="${i}" title="Remove">${ICON.remove}</button>`;
    panel.appendChild(row);
  });

  const addRow = document.createElement("div");
  addRow.className = "item-row";
  addRow.innerHTML = `<button class="btn primary" id="add-feed">+ Feed</button>`;
  panel.appendChild(addRow);

  panel.querySelector("#news-select").addEventListener("change", (e) => {
    selectedNewsId = e.target.value;
    renderNewsSettings();
  });
  panel.querySelectorAll(".news-label").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      feeds[Number(e.currentTarget.dataset.i)].label = e.target.value;
      commitNews(comp);
    })
  );
  panel.querySelectorAll(".news-url").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      feeds[Number(e.currentTarget.dataset.i)].url = e.target.value;
      commitNews(comp);
    })
  );
  panel.querySelectorAll(".news-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      const i = Number(e.currentTarget.dataset.i);
      const feed = feeds[i];
      showConfirmPopup(`Remove feed "${feed?.label || feed?.url || "this feed"}"?`, {
        x: e.clientX,
        y: e.clientY,
        onConfirm: () => {
          feeds.splice(i, 1);
          commitNews(comp);
        },
      });
    })
  );
  panel.querySelector("#add-feed").addEventListener("click", () => {
    feeds.push({ label: "", url: "" });
    commitNews(comp);
  });
}

// ---------------------------------------------------------------------------
// System settings editor. System tiles have no per-tile content config, but
// they still need the tile-selection row so their collapsible option (and
// rename/preview via the header) is reachable.
// ---------------------------------------------------------------------------
let selectedSystemId = null;

function ensureSystemComp() {
  const comps = state.compartments.filter((c) => c.kind === "system");
  if (comps.length === 0) {
    const comp = {
      id: "sys" + Date.now(),
      kind: "system",
      title: "System",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 3,
      h: 2,
      data: {},
    };
    state.compartments.push(comp);
    selectedSystemId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedSystemId)) {
    selectedSystemId = comps[0].id;
  }
  return state.compartments.find((c) => c.id === selectedSystemId);
}

function renderSystemSettings() {
  const panel = document.getElementById("system-list");
  if (!panel) return;
  const comp = ensureSystemComp();
  const comps = state.compartments.filter((c) => c.kind === "system");

  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="system-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const drivesRow = document.createElement("div");
  drivesRow.className = "item-row";
  drivesRow.innerHTML = `<label>Drives</label><span class="muted">loading…</span>`;
  panel.appendChild(drivesRow);
  native
    .systemStats()
    .then((s) => {
      if (!drivesRow.isConnected) return;
      const disks = (s && s.disks) || [];
      if (!disks.length) {
        drivesRow.innerHTML = `<label>Drives</label><span class="muted">no drives found</span>`;
        return;
      }
      const all = disks.map((d) => d.mount);
      const only = Array.isArray(comp.data?.disks) ? comp.data.disks : [];
      const sel = new Set(only.length ? only : all);
      drivesRow.innerHTML = `<label>Drives</label>
        <div class="vocab-cats">${disks
          .map(
            (d) =>
              `<label class="vocab-cat"><input type="checkbox" data-mount="${escapeHtml(d.mount)}" ${sel.has(d.mount) ? "checked" : ""} />${escapeHtml(d.mount)} <span class="muted">${fmtBytes(d.total_bytes)}</span></label>`
          )
          .join("")}</div>
        <span class="muted">empty = all</span>`;
      drivesRow.querySelectorAll("input[type=checkbox]").forEach((box) =>
        box.addEventListener("change", () => {
          const checked = [...drivesRow.querySelectorAll("input:checked")].map((b) => b.dataset.mount);
          // Keep at least one drive visible; "none" is not a useful tile state.
          if (!checked.length) {
            box.checked = true;
            return;
          }
          comp.data = comp.data || {};
          comp.data.disks = checked.length === all.length ? [] : checked;
          saveState();
          render();
        })
      );
    })
    .catch(() => {
      if (drivesRow.isConnected) drivesRow.innerHTML = `<label>Drives</label><span class="muted">couldn't load drives</span>`;
    });

  panel.querySelector("#system-select").addEventListener("change", (e) => {
    selectedSystemId = e.target.value;
    renderSystemSettings();
  });
}

// ---------------------------------------------------------------------------
// Config export/import (two-machine setup). The state file holds no secrets
// (keys/tokens live in each machine's OS secret store), so exports are safe
// to carry over. Invalid imports are rejected; the current setup is backed
// up to .bak before a valid import replaces it.
// ---------------------------------------------------------------------------
function renderConfigSettings() {
  const panel = document.getElementById("config-list");
  if (!panel) return;
  panel.innerHTML = "";

  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <button class="btn primary" id="config-export">Export…</button>
    <button class="btn ghost" id="config-import">Import…</button>
    <span id="config-status" class="muted"></span>`;
  panel.appendChild(row);

  const note = document.createElement("div");
  note.className = "item-row";
  note.innerHTML = `<span class="muted">Exports never contain API keys or tokens — re-enter them on the other machine. This machine: <span id="config-keys"></span></span>`;
  panel.appendChild(note);

  const statusEl = row.querySelector("#config-status");
  const keysEl = note.querySelector("#config-keys");
  (async () => {
    try {
      const deepl = await native.deeplKeyStatus().catch(() => false);
      const spot = await native.spotifyConnected().catch(() => false);
      keysEl.textContent = `DeepL ${deepl ? "key set" : "no key"}, Spotify ${spot ? "connected" : "not connected"}`;
    } catch {
      keysEl.textContent = "";
    }
  })();

  row.querySelector("#config-export").addEventListener("click", async () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const filename = `lost-board-config-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    statusEl.textContent = "choosing file…";
    try {
      const dest = await native.exportConfig(filename);
      statusEl.textContent = dest ? `exported: ${dest}` : "export cancelled";
    } catch (e) {
      statusEl.textContent = `export failed: ${e.message || e}`;
    }
  });
  row.querySelector("#config-import").addEventListener("click", async () => {
    statusEl.textContent = "choosing file…";
    try {
      const json = await native.importConfig();
      if (!json) {
        statusEl.textContent = "import cancelled";
        return;
      }
      state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(json) };
      saveState(); // backend already wrote the file; this syncs the browser fallback
      zoom = clamp(state.zoom || 1, ZOOM_MIN, ZOOM_MAX);
      updateZoomUI();
      applyAppearance();
      document.getElementById("set-cols").value = state.columns;
      document.getElementById("set-theme").value = THEMES[state.theme] ? state.theme : "dark";
      document.getElementById("set-radius").value = state.cornerRadius != null ? state.cornerRadius : 10;
      document.getElementById("set-wall").checked = state.wall === true;
      render();
      renderConfigSettings();
      panel.querySelector("#config-status").textContent = "imported — previous setup kept as .bak";
    } catch (e) {
      statusEl.textContent = `import failed: ${e}`;
    }
  });
}

// ---------------------------------------------------------------------------
// Scheduled backups ("Backup" settings tab). Each run writes one timestamped
// JSON bundle with the dashboard state, the webview localStorage snapshot, and
// the lyrics translation/fetched-lyrics caches into the chosen folder.
// ---------------------------------------------------------------------------
const BACKUP_SCHEDULES = [
  { value: "4h", label: "Every 4 hours" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every Monday" },
  { value: "monthly", label: "Every month (1st)" },
];

function backupConfig() {
  if (!state.backup || typeof state.backup !== "object") {
    state.backup = {
      enabled: false,
      dir: "",
      schedule: "daily",
      time: "03:00",
      lastExportAt: 0,
      lastError: "",
      lastErrorAt: 0,
    };
  }
  return state.backup;
}

function captionConfig() {
  if (!state.captions || typeof state.captions !== "object") {
    state.captions = { lang: "de", deviceId: "", autoSave: true, saveDir: "", finalizeMs: 700 };
  }
  if (!Number.isFinite(Number(state.captions.finalizeMs))) state.captions.finalizeMs = 700;
  state.captions.finalizeMs = Math.min(5000, Math.max(300, Number(state.captions.finalizeMs) || 700));
  return state.captions;
}

function localStorageSnapshot() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key != null) out[key] = localStorage.getItem(key);
    }
  } catch {
    // localStorage may be unavailable in a locked-down webview; an empty
    // snapshot is still a valid backup.
  }
  return out;
}

function fmtDateTime(ms) {
  if (!ms) return "never";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return "never";
  }
}

let backupBusy = false;
let backupTimer = null;

async function runBackup() {
  const cfg = backupConfig();
  if (!cfg.dir) throw new Error("choose a backup folder first");
  if (backupBusy) return null;
  backupBusy = true;
  try {
    const path = await native.backupExport(
      cfg.dir,
      BackupUtil.backupFilename(),
      JSON.stringify(state),
      JSON.stringify(localStorageSnapshot())
    );
    if (path) {
      cfg.lastExportAt = Date.now();
      cfg.lastError = "";
      cfg.lastErrorAt = 0;
      saveState();
      updateBackupTabBadge();
    }
    return path;
  } finally {
    backupBusy = false;
  }
}

function updateBackupTabBadge() {
  const tab = document.querySelector('.settings-tabs .tab[data-tab="backup"]');
  if (!tab) return;
  const err = state.backup?.lastError;
  tab.classList.toggle("has-error", Boolean(err));
  tab.title = err ? `Backup failed: ${err}` : "";
}

function refreshBackupStatus(message) {
  const el = document.getElementById("backup-status");
  if (!el) return;
  if (message) {
    el.textContent = message;
    return;
  }
  const cfg = backupConfig();
  const next = BackupUtil.nextBackupAt(
    cfg.lastExportAt || 0,
    cfg.schedule || "daily",
    cfg.time || "03:00",
    Date.now()
  );
  const parts = [`Last: ${fmtDateTime(cfg.lastExportAt)}`];
  if (cfg.enabled && cfg.dir) parts.push(`Next: ${fmtDateTime(next)}`);
  if (cfg.lastError) parts.push(`Last error: ${cfg.lastError}`);
  el.textContent = parts.join(" · ");
}

async function checkAutoBackup() {
  const cfg = backupConfig();
  if (!cfg.enabled || !cfg.dir || backupBusy) return;
  const schedule = cfg.schedule || "daily";
  const time = cfg.time || "03:00";
  if (!BackupUtil.backupDue(cfg.lastExportAt || 0, schedule, time, Date.now())) return;
  try {
    const path = await runBackup();
    if (path) console.info("Auto-backup written", path);
    refreshBackupStatus();
  } catch (e) {
    console.error("Auto-backup failed", e);
    cfg.lastError = String(e.message || e);
    cfg.lastErrorAt = Date.now();
    saveState();
    updateBackupTabBadge();
    refreshBackupStatus();
  }
}

function startBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(checkAutoBackup, 60_000);
  setTimeout(checkAutoBackup, 3000);
}

function renderBackupSettings() {
  const panel = document.getElementById("backup-list");
  if (!panel) return;
  panel.innerHTML = "";
  const cfg = backupConfig();

  const enableRow = document.createElement("div");
  enableRow.className = "item-row";
  enableRow.innerHTML = `<label><input type="checkbox" class="switch" id="backup-enabled" ${cfg.enabled ? "checked" : ""} /> Automatic backups</label>`;
  panel.appendChild(enableRow);

  const dirRow = document.createElement("div");
  dirRow.className = "item-row";
  dirRow.innerHTML = `
    <label>Folder</label>
    <span id="backup-dir" class="muted" title="${escapeHtml(cfg.dir || "")}">${cfg.dir ? escapeHtml(cfg.dir) : "not set"}</span>
    <button class="btn ghost" id="backup-pick">Choose…</button>
    <button class="btn ghost" id="backup-clear">Clear</button>`;
  panel.appendChild(dirRow);

  const schedule = cfg.schedule || "daily";
  const showTime = schedule !== "4h";
  const schedRow = document.createElement("div");
  schedRow.className = "item-row";
  schedRow.innerHTML = `
    <label>Schedule</label>
    <select id="backup-schedule">${BACKUP_SCHEDULES.map(
      (s) => `<option value="${s.value}" ${s.value === schedule ? "selected" : ""}>${s.label}</option>`
    ).join("")}</select>
    <label for="backup-time" ${showTime ? "" : "hidden"}>at</label>
    <input type="time" id="backup-time" value="${escapeHtml(cfg.time || "03:00")}" ${showTime ? "" : "hidden"} />`;
  panel.appendChild(schedRow);

  const actionsRow = document.createElement("div");
  actionsRow.className = "item-row";
  actionsRow.innerHTML = `
    <button class="btn primary" id="backup-now">Export now</button>
    <span id="backup-status" class="muted"></span>`;
  panel.appendChild(actionsRow);

  const note = document.createElement("div");
  note.className = "item-row";
  note.innerHTML = `<span class="muted">One timestamped JSON per run: dashboard config, browser localStorage, and the lyrics translation + fetched-lyrics caches. API keys and tokens are never included — they live in the OS secret store. The newest 30 backups are kept; older ones are pruned.</span>`;
  panel.appendChild(note);

  refreshBackupStatus();
  updateBackupTabBadge();

  enableRow.querySelector("#backup-enabled").addEventListener("change", (e) => {
    cfg.enabled = e.target.checked;
    saveState();
    refreshBackupStatus();
    if (cfg.enabled) setTimeout(checkAutoBackup, 200);
  });

  dirRow.querySelector("#backup-pick").addEventListener("click", async () => {
    const dir = await native.pickFolder();
    if (!dir) return;
    cfg.dir = dir;
    saveState();
    const label = dirRow.querySelector("#backup-dir");
    label.textContent = dir;
    label.title = dir;
    refreshBackupStatus();
  });

  dirRow.querySelector("#backup-clear").addEventListener("click", () => {
    cfg.dir = "";
    saveState();
    const label = dirRow.querySelector("#backup-dir");
    label.textContent = "not set";
    label.title = "";
    refreshBackupStatus();
  });

  schedRow.querySelector("#backup-schedule").addEventListener("change", (e) => {
    cfg.schedule = e.target.value;
    const timeish = cfg.schedule !== "4h";
    schedRow.querySelector("#backup-time").hidden = !timeish;
    schedRow.querySelector("label[for=backup-time]").hidden = !timeish;
    saveState();
    refreshBackupStatus();
  });

  schedRow.querySelector("#backup-time").addEventListener("change", (e) => {
    cfg.time = e.target.value || "03:00";
    saveState();
    refreshBackupStatus();
  });

  actionsRow.querySelector("#backup-now").addEventListener("click", async () => {
    const status = actionsRow.querySelector("#backup-status");
    if (!cfg.dir) {
      status.textContent = "choose a folder first";
      return;
    }
    if (backupBusy) {
      status.textContent = "already running…";
      return;
    }
    status.textContent = "exporting…";
    try {
      const path = await runBackup();
      status.textContent = path ? `exported: ${path}` : "already running…";
    } catch (e) {
      cfg.lastError = String(e.message || e);
      cfg.lastErrorAt = Date.now();
      saveState();
      updateBackupTabBadge();
      status.textContent = `export failed: ${e.message || e}`;
    }
  });
}

// ---------------------------------------------------------------------------
// Captions tile + settings. System-audio loopback is owned by the Rust engine;
// the tile polls it for partial/final lines. One language per session.
// ---------------------------------------------------------------------------
let selectedCaptionId = null;

function fmtCaptionTime(at) {
  try {
    return new Date(at * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "";
  }
}

async function renderCaptionBody(c, body) {
  const cfg = captionConfig();
  body.innerHTML = `
    <div class="caption-root">
      <div class="caption-controls">
        <label class="caption-listen"><input type="checkbox" class="switch" id="cap-listen" /> Listen</label>
        <select id="cap-lang" title="Caption model"></select>
        <select id="cap-device" title="Output device"></select>
      </div>
      <div class="caption-status" id="cap-status"></div>
      <div class="caption-lines" id="cap-lines"><div class="muted">No speech yet.</div></div>
      <div class="caption-actions">
        <button class="btn ghost" id="cap-save">Save as…</button>
        <button class="btn ghost" id="cap-open">Open folder</button>
        <button class="btn ghost" id="cap-packs">Packs…</button>
        <button class="btn ghost" id="cap-clear">Clear</button>
      </div>
    </div>`;

  const listen = body.querySelector("#cap-listen");
  const langSel = body.querySelector("#cap-lang");
  const deviceSel = body.querySelector("#cap-device");
  const statusEl = body.querySelector("#cap-status");
  const linesEl = body.querySelector("#cap-lines");

  let installed = [];
  let running = false;
  let modelSig = "";
  let tick = 0;

  const setStatus = (text, isError) => {
    statusEl.textContent = text;
    statusEl.classList.toggle("err", !!isError);
  };

  const installedModels = async () => {
    try {
      const list = await native.captionModels();
      return (list || []).filter((m) => m.installed);
    } catch {
      return [];
    }
  };

  const fillLanguages = () => {
    const keep = cfg.lang;
    langSel.innerHTML = installed.length
      ? installed.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("")
      : `<option value="">No packs installed</option>`;
    const pick = installed.some((m) => m.id === keep) ? keep : installed[0]?.id || "";
    langSel.value = pick;
    if (pick && pick !== cfg.lang) {
      cfg.lang = pick;
      saveState();
    }
    langSel.disabled = running || !installed.length;
    listen.disabled = !installed.length;
  };

  const fillDevices = async () => {
    let list = [];
    try {
      list = await native.captionDevices();
    } catch {
      list = [];
    }
    deviceSel.innerHTML =
      `<option value="">System default</option>` +
      (list || [])
        .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
        .join("");
    if (![...deviceSel.options].some((o) => o.value === cfg.deviceId)) cfg.deviceId = "";
    deviceSel.value = cfg.deviceId;
  };

  const renderLines = (s) => {
    const nearBottom = linesEl.scrollHeight - linesEl.scrollTop - linesEl.clientHeight < 48;
    const lines = (s.lines || [])
      .map(
        (line) =>
          `<div class="caption-line"><span class="caption-time">${escapeHtml(fmtCaptionTime(line.at))}</span>${escapeHtml(line.text)}</div>`
      )
      .join("");
    const partial = s.partial
      ? `<div class="caption-line caption-partial">${escapeHtml(s.partial)}</div>`
      : "";
    linesEl.innerHTML =
      lines || partial ? lines + partial : `<div class="muted">No speech yet.</div>`;
    if (nearBottom) linesEl.scrollTop = linesEl.scrollHeight;
  };

  const refresh = async () => {
    if (!body.isConnected) return;
    let s;
    try {
      s = await native.captionPoll();
    } catch {
      return;
    }
    if (!s || !body.isConnected) return;
    running = s.status === "listening" || s.status === "loading";
    listen.checked = running;
    langSel.disabled = running || !installed.length;
    renderLines(s);

    let statusText;
    let statusError = false;
    if (s.status === "error") {
      statusText = s.error || "Caption engine error";
      statusError = true;
    } else if (s.status === "loading") {
      statusText = `Loading ${s.model_name || "model"}.`;
    } else if (s.status === "listening") {
      statusText = `Listening - ${s.device_name || "output"} - ${s.model_name || String(s.lang || "").toUpperCase()}`;
    } else {
      statusText = installed.length ? "Idle" : "No language packs installed - download one in Settings > Captions.";
    }
    if (s.save_error) {
      statusText = `${statusText} - ${s.save_error}`;
      statusError = true;
    }
    setStatus(statusText, statusError);

    if (!cfg.deviceId && deviceSel.value) deviceSel.value = "";

    if (++tick % 12 === 0) {
      const next = await installedModels();
      const sig = next.map((m) => m.id).join(",");
      if (sig !== modelSig) {
        modelSig = sig;
        installed = next;
        fillLanguages();
      }
    }
  };

  installed = await installedModels();
  modelSig = installed.map((m) => m.id).join(",");
  fillLanguages();
  await fillDevices();
  // Reflect a model chosen in Settings.
  if (installed.some((m) => m.id === cfg.lang)) langSel.value = cfg.lang;
  await refresh();
  const timer = setInterval(refresh, 400);
  addTimer(body, timer);

  listen.addEventListener("change", async () => {
    if (listen.checked) {
      const lang = langSel.value;
      if (!lang) {
        listen.checked = false;
        setStatus("Download a language pack in Settings → Captions.", true);
        return;
      }
      cfg.lang = lang;
      cfg.deviceId = deviceSel.value;
      saveState();
      try {
        await native.captionStart(lang, cfg.deviceId, cfg.autoSave === true, cfg.saveDir || "", cfg.finalizeMs || 700);
      } catch (e) {
        listen.checked = false;
        setStatus(String(e?.message || e), true);
      }
    } else {
      try {
        await native.captionStop();
      } catch {
        /* ignore */
      }
    }
    refresh();
  });

  langSel.addEventListener("change", () => {
    if (running) return;
    cfg.lang = langSel.value;
    saveState();
  });

  deviceSel.addEventListener("change", async () => {
    cfg.deviceId = deviceSel.value;
    saveState();
    try {
      await native.captionSetDevice(cfg.deviceId);
    } catch (e) {
      setStatus(String(e?.message || e), true);
    }
    refresh();
  });

  body.querySelector("#cap-save").addEventListener("click", async () => {
    try {
      const path = await native.captionSave();
      if (path) setStatus(`Saved: ${path}`);
    } catch (e) {
      setStatus(`Save failed: ${e?.message || e}`, true);
    }
  });
  body.querySelector("#cap-open").addEventListener("click", () => {
    native.captionOpenFolder().catch((e) => setStatus(String(e?.message || e), true));
  });
  body.querySelector("#cap-packs").addEventListener("click", () => {
    settingsEl.classList.remove("hidden");
    activateTab("captions");
  });
  body.querySelector("#cap-clear").addEventListener("click", (e) => {
    showConfirmPopup(
      running ? "Stop listening and clear the transcript?" : "Clear the transcript?",
      {
        x: e.clientX,
        y: e.clientY,
        confirmLabel: "Clear",
        onConfirm: async () => {
          try {
            await native.captionStop();
            await native.captionClear();
          } catch (err) {
            setStatus(String(err?.message || err), true);
          }
          refresh();
        },
      }
    );
  });
}

function renderCaptionSettings() {
  const panel = document.getElementById("caption-list");
  if (!panel) return;
  if (panel.__capTimer) {
    clearInterval(panel.__capTimer);
    panel.__capTimer = null;
  }
  panel.innerHTML = "";
  const cfg = captionConfig();

  const intro = document.createElement("p");
  intro.className = "muted";
  intro.textContent =
    "Listens to the whole PC's output audio. One language per session; speech in other languages is decoded as the selected one.";
  panel.appendChild(intro);

  const comps = state.compartments.filter((c) => c.kind === "caption");
  if (comps.length) {
    const comp = comps.find((c) => c.id === selectedCaptionId) || comps[0];
    selectedCaptionId = comp.id;
    comp.data = comp.data || {};

    const tileRow = document.createElement("div");
    tileRow.className = "item-row";
    tileRow.innerHTML = `<label>Tile</label><select id="caption-select">${comps
      .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
      .join("")}</select>`;
    panel.appendChild(tileRow);
    appendCollapsibleRow(panel, comp);
    appendAppearanceRow(panel, comp);
    tileRow.querySelector("#caption-select").addEventListener("change", (e) => {
      selectedCaptionId = e.target.value;
      renderCaptionSettings();
    });
  } else {
    const note = document.createElement("p");
    note.className = "muted";
    note.textContent = "No Captions tile yet — add one from Grid > Add a tile.";
    panel.appendChild(note);
  }

  const statusRow = document.createElement("div");
  statusRow.className = "item-row";
  statusRow.innerHTML = `<span class="muted" id="caption-status-line">idle</span>`;
  panel.appendChild(statusRow);
  const statusLine = statusRow.querySelector("#caption-status-line");

  const listHead = document.createElement("h3");
  listHead.textContent = "Language packs";
  panel.appendChild(listHead);
  const list = document.createElement("div");
  list.className = "caption-models";
  panel.appendChild(list);

  const fillModelRows = async () => {
    let models = [];
    try {
      models = (await native.captionModels()) || [];
    } catch {
      models = [];
    }
    let running = false;
    try {
      const s = await native.captionPoll();
      running = s.status === "listening" || s.status === "loading";
      statusLine.textContent =
        s.status === "listening"
          ? `Listening (${s.model_name || String(s.lang).toUpperCase()} - ${s.device_name || "output"})`
          : s.status === "loading"
            ? `Loading ${s.model_name || "model"}.`
            : s.status === "error"
              ? s.error || "error"
              : "idle";
      if (s.save_error) statusLine.textContent += ` - ${s.save_error}`;
      statusLine.classList.toggle("err", s.status === "error" || !!s.save_error);
    } catch {
      statusLine.textContent = "idle";
    }
    if (!models.length) {
      list.innerHTML = `<span class="muted">couldn't load the model catalog</span>`;
      return;
    }
    list.innerHTML = models
      .map((m) => {
        const state = m.downloading
          ? `${Math.round((m.progress || 0) * 100)}%`
          : m.installed
            ? "Installed"
            : m.error
              ? m.error
              : "Not installed";
        const size = Number(m.size_mb) || 0;
        const sizeText = size >= 1024 ? `${(size / 1024).toFixed(1)} GB` : `${size} MB`;
        const actions = m.installed
          ? `<button class="btn ghost" data-remove="${escapeHtml(m.id)}" ${
              running || m.id === cfg.lang ? "disabled title=\"Stop listening and select another model first\"" : ""
            }>Remove</button>`
          : `<button class="btn ghost" data-download="${escapeHtml(m.id)}" ${
              m.downloading ? "disabled" : ""
            }>Download</button>`;
        return `<div class="caption-model-row">
          <span class="caption-model-name">${escapeHtml(m.name)}</span>
          <span class="muted">${sizeText} · ${escapeHtml(m.license || "")}</span>
          <span class="caption-model-state ${m.error ? "err" : ""}">${escapeHtml(state)}</span>
          ${m.downloading ? `<span class="caption-model-bar"><i style="width:${Math.round((m.progress || 0) * 100)}%"></i></span>` : ""}
          ${actions}
        </div>`;
      })
      .join("");

    list.querySelectorAll("[data-download]").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const modelId = btn.dataset.download;
        btn.disabled = true;
        try {
          await native.captionDownloadModel(modelId);
        } catch (e) {
          statusLine.textContent = String(e?.message || e);
        }
        pollWhileDownloading();
      })
    );
    list.querySelectorAll("[data-remove]").forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const modelId = btn.dataset.remove;
        const model = models.find((m) => m.id === modelId);
        showConfirmPopup(`Remove the ${model?.name || modelId} model?`, {
          x: e.clientX,
          y: e.clientY,
          onConfirm: async () => {
            try {
              await native.captionRemoveModel(modelId);
            } catch (err) {
              statusLine.textContent = String(err?.message || err);
            }
            renderCaptionSettings();
          },
        });
      })
    );
  };

  const pollWhileDownloading = () => {
    if (panel.__capTimer) clearInterval(panel.__capTimer);
    panel.__capTimer = setInterval(async () => {
      const models = await native.captionModels().catch(() => []);
      if (!models.some((m) => m.downloading)) {
        clearInterval(panel.__capTimer);
        panel.__capTimer = null;
        renderCaptionSettings();
        return;
      }
      fillModelRows();
    }, 700);
  };

  const defaults = document.createElement("h3");
  defaults.textContent = "Defaults";
  panel.appendChild(defaults);

  const langRow = document.createElement("div");
  langRow.className = "item-row";
  langRow.innerHTML = `<label>Model</label><select id="caption-lang"></select><span class="muted" id="caption-lang-note">installed packs only</span>`;
  panel.appendChild(langRow);

  const devRow = document.createElement("div");
  devRow.className = "item-row";
  devRow.innerHTML = `<label>Output device</label><select id="caption-device"></select><button class="btn ghost" id="caption-refresh-devices">Refresh</button>`;
  panel.appendChild(devRow);

  const pauseRow = document.createElement("div");
  pauseRow.className = "item-row";
  pauseRow.innerHTML = `<label>Line break pause</label><select id="caption-finalize">
    <option value="500">0.5 s</option>
    <option value="700">0.7 s</option>
    <option value="1000">1.0 s</option>
    <option value="1200">1.2 s</option>
    <option value="1500">1.5 s</option>
    <option value="2000">2.0 s</option>
  </select><span class="muted">silence before a new line; next session</span>`;
  panel.appendChild(pauseRow);

  const saveRow = document.createElement("div");
  saveRow.className = "item-row";
  saveRow.innerHTML = `<label>Auto-save transcript <input type="checkbox" class="switch" id="caption-autosave" ${cfg.autoSave ? "checked" : ""} /></label><span class="muted">next session</span>`;
  panel.appendChild(saveRow);

  const folderRow = document.createElement("div");
  folderRow.className = "item-row";
  folderRow.innerHTML = `<label>Transcript folder</label><span class="muted" id="caption-folder">${cfg.saveDir ? escapeHtml(cfg.saveDir) : "app-data/captions"}</span><button class="btn ghost" id="caption-pick-folder">Choose…</button><button class="btn ghost" id="caption-clear-folder">Clear</button><button class="btn ghost" id="caption-open-folder">Open</button>`;
  panel.appendChild(folderRow);

  const langSel = langRow.querySelector("#caption-lang");
  const devSel = devRow.querySelector("#caption-device");
  const pauseSel = pauseRow.querySelector("#caption-finalize");
  const langNote = langRow.querySelector("#caption-lang-note");
  pauseSel.value = String(Number(cfg.finalizeMs) || 700);

  const loadSelectors = async () => {
    const [models, devices, poll] = await Promise.all([
      native.captionModels().catch(() => []),
      native.captionDevices().catch(() => []),
      native.captionPoll().catch(() => null),
    ]);
    const installed = (models || []).filter((m) => m.installed);
    const running = poll && (poll.status === "listening" || poll.status === "loading");
    langSel.innerHTML = installed.length
      ? installed.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`).join("")
      : `<option value="">No packs installed</option>`;
    if (installed.some((m) => m.id === cfg.lang)) langSel.value = cfg.lang;
    else if (installed.length) {
      cfg.lang = installed[0].id;
      saveState();
      langSel.value = cfg.lang;
    }
    langSel.disabled = !!running || !installed.length;
    langNote.textContent = installed.length ? "installed packs only" : "download a pack below";

    devSel.innerHTML =
      `<option value="">System default</option>` +
      (devices || [])
        .map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)}</option>`)
        .join("");
    if (![...devSel.options].some((o) => o.value === cfg.deviceId)) {
      cfg.deviceId = "";
      saveState();
    }
    devSel.value = cfg.deviceId;
  };

  langSel.addEventListener("change", () => {
    cfg.lang = langSel.value;
    saveState();
    render();
    renderCaptionSettings();
  });
  devSel.addEventListener("change", async () => {
    cfg.deviceId = devSel.value;
    saveState();
    try {
      await native.captionSetDevice(cfg.deviceId);
    } catch (e) {
      statusLine.textContent = String(e?.message || e);
    }
    render();
  });
  devRow.querySelector("#caption-refresh-devices").addEventListener("click", () => {
    loadSelectors();
    render();
  });
  saveRow.querySelector("#caption-autosave").addEventListener("change", (e) => {
    cfg.autoSave = e.target.checked;
    saveState();
  });
  pauseSel.addEventListener("change", () => {
    cfg.finalizeMs = Math.min(5000, Math.max(300, Number(pauseSel.value) || 700));
    saveState();
  });
  folderRow.querySelector("#caption-pick-folder").addEventListener("click", async () => {
    const dir = await native.pickFolder();
    if (!dir) return;
    cfg.saveDir = dir;
    saveState();
    folderRow.querySelector("#caption-folder").textContent = dir;
    render();
  });
  folderRow.querySelector("#caption-clear-folder").addEventListener("click", () => {
    cfg.saveDir = "";
    saveState();
    folderRow.querySelector("#caption-folder").textContent = "app-data/captions";
    render();
  });
  folderRow.querySelector("#caption-open-folder").addEventListener("click", () => {
    const open = cfg.saveDir ? native.openFolder(cfg.saveDir) : native.captionOpenFolder();
    open.catch((e) => {
      statusLine.textContent = String(e?.message || e);
    });
  });

  fillModelRows();
  loadSelectors();
  native
    .captionModels()
    .then((models) => {
      if ((models || []).some((m) => m.downloading)) pollWhileDownloading();
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Translate settings editor. Per-tile language selection + a global DeepL API
// key (stored in the OS secret store, never in config).
// ---------------------------------------------------------------------------
const DEEPL_LANGS = [
  "EN", "DE", "ES", "FR", "IT", "PT", "NL", "PL", "RU", "JA", "ZH", "KO",
  "TR", "SV", "DA", "FI", "CS", "EL", "HU", "RO", "UK", "NB", "ID", "SK",
  "BG", "ET", "LT", "LV", "SL",
];
let selectedTranslateId = null;

function ensureTranslateComp() {
  const comps = state.compartments.filter((c) => c.kind === "translate");
  if (comps.length === 0) {
    const comp = {
      id: "tr" + Date.now(),
      kind: "translate",
      title: "Translate",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 4,
      h: 4,
      data: { langs: ["EN", "DE", "ES"] },
    };
    state.compartments.push(comp);
    selectedTranslateId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedTranslateId)) {
    selectedTranslateId = comps[0].id;
  }
  const comp = state.compartments.find((c) => c.id === selectedTranslateId);
  comp.data = comp.data || {};
  if (!Array.isArray(comp.data.langs) || comp.data.langs.length !== 3) comp.data.langs = ["EN", "DE", "ES"];
  return comp;
}

function commitTranslate(comp) {
  saveState();
  render();
  renderTranslateSettings();
}

function langSelect(comp, i) {
  return `<select class="tr-langsel" data-i="${i}">${DEEPL_LANGS.map(
    (l) => `<option value="${l}" ${comp.data.langs[i] === l ? "selected" : ""}>${l}</option>`
  ).join("")}</select>`;
}

async function renderTranslateSettings() {
  const panel = document.getElementById("translate-list");
  if (!panel) return;
  const comp = ensureTranslateComp();
  const comps = state.compartments.filter((c) => c.kind === "translate");

  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="translate-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const langsRow = document.createElement("div");
  langsRow.className = "item-row";
  langsRow.innerHTML = `<label>Languages</label>${langSelect(comp, 0)}${langSelect(comp, 1)}${langSelect(comp, 2)}`;
  panel.appendChild(langsRow);

  const keyRow = document.createElement("div");
  keyRow.className = "item-row";
  keyRow.innerHTML = `
    <label>DeepL API key</label>
    <input id="deepl-key" type="password" placeholder="DeepL-Auth-Key (stored in OS secret store)" />
    <button class="btn primary" id="deepl-save">Save</button>
    <button class="btn ghost danger" id="deepl-clear">Clear</button>
    <span id="deepl-status" class="muted"></span>`;
  panel.appendChild(keyRow);

  const statusEl = keyRow.querySelector("#deepl-status");
  const refreshStatus = async () => {
    try {
      statusEl.textContent = (await native.deeplKeyStatus()) ? "key set" : "no key";
    } catch {
      statusEl.textContent = "";
    }
  };
  refreshStatus();

  panel.querySelector("#translate-select").addEventListener("change", (e) => {
    selectedTranslateId = e.target.value;
    renderTranslateSettings();
  });
  panel.querySelectorAll(".tr-langsel").forEach((sel) =>
    sel.addEventListener("change", (e) => {
      comp.data.langs[Number(e.currentTarget.dataset.i)] = e.target.value;
      translateValues.delete(comp.id);
      commitTranslate(comp);
    })
  );
  panel.querySelector("#deepl-save").addEventListener("click", async () => {
    const val = panel.querySelector("#deepl-key").value.trim();
    if (!val) return;
    try {
      await native.setDeeplKey(val);
      panel.querySelector("#deepl-key").value = "";
      await refreshStatus();
    } catch (err) {
      statusEl.textContent = `error: ${err.message || err}`;
    }
  });
  panel.querySelector("#deepl-clear").addEventListener("click", async () => {
    try {
      await native.clearDeeplKey();
      await refreshStatus();
    } catch (err) {
      statusEl.textContent = `error: ${err.message || err}`;
    }
  });
}

let selectedFrameId = null;
function ensureFrameComp() {
  const comps = state.compartments.filter((c) => c.kind === "frame");
  if (comps.length === 0) {
    const comp = {
      id: "fr" + Date.now(),
      kind: "frame",
      title: "Frame",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 3,
      h: 3,
      data: { path: "", fit: "cover" },
    };
    state.compartments.push(comp);
    selectedFrameId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedFrameId)) selectedFrameId = comps[0].id;
  const comp = state.compartments.find((c) => c.id === selectedFrameId);
  comp.data = comp.data || {};
  comp.data.fit = comp.data.fit || "cover";
  return comp;
}
function commitFrame(comp) {
  saveState();
  render();
  renderFrameSettings();
}
function renderFrameSettings() {
  const panel = document.getElementById("frame-list");
  if (!panel) return;
  const comp = ensureFrameComp();
  const comps = state.compartments.filter((c) => c.kind === "frame");
  panel.innerHTML = "";

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="frame-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const pickRow = document.createElement("div");
  pickRow.className = "item-row";
  pickRow.innerHTML = `
    <label>Image / GIF</label>
    <button class="btn ghost" id="frame-browse">Browse…</button>
    <select class="frame-fit">
      <option value="cover" ${comp.data.fit === "cover" ? "selected" : ""}>Cover (fill)</option>
      <option value="contain" ${comp.data.fit === "contain" ? "selected" : ""}>Contain (fit)</option>
      <option value="stretch" ${comp.data.fit === "stretch" ? "selected" : ""}>Stretch</option>
    </select>
    <span class="muted">${comp.data.path ? escapeHtml(comp.data.path) : "no image set"}</span>`;
  panel.appendChild(pickRow);

  panel.querySelector("#frame-select").addEventListener("change", (e) => {
    selectedFrameId = e.target.value;
    renderFrameSettings();
  });
  panel.querySelector("#frame-browse").addEventListener("click", async () => {
    const p = await native.pickImage();
    if (!p) return;
    comp.data.path = p;
    commitFrame(comp);
  });
  pickRow.querySelector(".frame-fit").addEventListener("change", (e) => {
    comp.data.fit = e.target.value;
    commitFrame(comp);
  });
}

// ---------------------------------------------------------------------------
// Spotify settings editor. Enter the client id, then Connect (PKCE via a local
// callback). Per-tile name/icon/colors handled by the shared rows.
// ---------------------------------------------------------------------------
let selectedSpotifyId = null;
let selectedLyricsId = null;
function ensureSpotifyComp() {
  const comps = state.compartments.filter((c) => c.kind === "spotify");
  if (comps.length === 0) {
    const comp = {
      id: "sp" + Date.now(),
      kind: "spotify",
      title: "Spotify",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 4,
      h: 4,
      data: {},
    };
    state.compartments.push(comp);
    selectedSpotifyId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedSpotifyId)) selectedSpotifyId = comps[0].id;
  return state.compartments.find((c) => c.id === selectedSpotifyId);
}
function renderSpotifySettings() {
  const panel = document.getElementById("spotify-list");
  if (!panel) return;
  const comp = ensureSpotifyComp();
  const comps = state.compartments.filter((c) => c.kind === "spotify");

  panel.innerHTML = "";
  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="spotify-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const idRow = document.createElement("div");
  idRow.className = "item-row";
  idRow.innerHTML = `
    <label>Client ID</label>
    <input type="password" id="spotify-client" placeholder="Spotify developer client id" />
    <button class="btn primary" id="spotify-save-id">Save</button>`;
  panel.appendChild(idRow);

  const connectRow = document.createElement("div");
  connectRow.className = "item-row";
  connectRow.innerHTML = `
    <button class="btn primary" id="spotify-connect">Connect</button>
    <span id="spotify-status" class="muted"></span>`;
  panel.appendChild(connectRow);

  const bgRow = document.createElement("div");
  bgRow.className = "item-row";
  bgRow.innerHTML = `
    <label>BG blur</label>
    <input type="range" class="spot-blur" min="0" max="25" value="${comp.data.blur ?? 8}" />
    <span class="spot-blur-val">${comp.data.blur ?? 8}px</span>
    <label>BG brightness</label>
    <input type="range" class="spot-bright" min="0.1" max="1.4" step="0.05" value="${comp.data.brightness ?? 0.55}" />
  `;
  panel.appendChild(bgRow);

  const statusEl = connectRow.querySelector("#spotify-status");
  const refreshStatus = async () => {
    try {
      statusEl.textContent = (await native.spotifyConnected()) ? "connected" : "not connected";
    } catch {
      statusEl.textContent = "";
    }
  };
  refreshStatus();

  const blurInput = panel.querySelector(".spot-blur");
  const blurVal = panel.querySelector(".spot-blur-val");
  const brightInput = panel.querySelector(".spot-bright");
  const commitBg = () => {
    saveState();
    render();
  };
  blurInput.addEventListener("change", (e) => {
    comp.data.blur = Number(e.target.value);
    blurVal.textContent = `${e.target.value}px`;
    commitBg();
  });
  brightInput.addEventListener("change", (e) => {
    comp.data.brightness = Number(e.target.value);
    commitBg();
  });

  panel.querySelector("#spotify-select").addEventListener("change", (e) => {
    selectedSpotifyId = e.target.value;
    renderSpotifySettings();
  });
  panel.querySelector("#spotify-save-id").addEventListener("click", async () => {
    const v = panel.querySelector("#spotify-client").value.trim();
    if (!v) return;
    try {
      await native.setSpotifyClientId(v);
      panel.querySelector("#spotify-client").value = "";
      await refreshStatus();
    } catch (e) {
      statusEl.textContent = `error: ${e.message || e}`;
    }
  });
  panel.querySelector("#spotify-connect").addEventListener("click", async () => {
    statusEl.textContent = "opening Spotify…";
    try {
      const url = await native.spotifyBegin();
      await native.openUrl(url);
      statusEl.textContent = "waiting for login…";
      await native.spotifyCapture();
      statusEl.textContent = "connected";
      saveState();
      render();
      renderSpotifySettings();
    } catch (e) {
      statusEl.textContent = `error: ${e.message || e}`;
    }
  });
}

// ---------------------------------------------------------------------------
// Projects settings editor. Add repo roots; each root is scanned for projects
// (folder + solution), with editable paths and manual-rows for overrides.
// ---------------------------------------------------------------------------
let selectedProjectId = null;
function ensureProjectComp() {
  const comps = state.compartments.filter((c) => c.kind === "project");
  if (comps.length === 0) {
    const comp = {
      id: "prj" + Date.now(),
      kind: "project",
      title: "Projects",
      x: 0,
      y: state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0),
      w: 5,
      h: 5,
      data: { roots: [] },
    };
    state.compartments.push(comp);
    selectedProjectId = comp.id;
    return comp;
  }
  if (!comps.some((c) => c.id === selectedProjectId)) selectedProjectId = comps[0].id;
  const comp = state.compartments.find((c) => c.id === selectedProjectId);
  comp.data = comp.data || {};
  if (!Array.isArray(comp.data.roots)) comp.data.roots = [];
  return comp;
}
// Non-creating lookup for event handlers — never resurrects a deleted tile.
function findProjectComp() {
  return state.compartments.find((c) => c.id === selectedProjectId && c.kind === "project")
    ?? state.compartments.find((c) => c.kind === "project")
    ?? null;
}
function commitProject(comp) {
  saveState();
  renderProjectsSettings();
  try {
    render();
  } catch (e) {
    console.error("Failed to render grid:", e);
  }
}
function renderLyricsSettings() {
  const panel = document.getElementById("lyrics-list");
  if (!panel) return;
  const comps = state.compartments.filter((c) => c.kind === "lyrics");
  panel.innerHTML = "";
  if (!comps.length) {
    panel.innerHTML = `<div class="muted">No Lyrics tile yet — add one from Grid &gt; Add a tile.</div>`;
    return;
  }
  const comp = comps.find((c) => c.id === selectedLyricsId) || comps[0];
  selectedLyricsId = comp.id;
  comp.data = comp.data || {};

  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `<label>Tile</label><select id="lyrics-select">${comps
    .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
    .join("")}</select>`;
  panel.appendChild(row);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const clampN = (v) => Math.min(10, Math.max(0, Number(v) || 0));
  const row2 = document.createElement("div");
  row2.className = "item-row";
  row2.innerHTML = `
    <label>Previous lines <input id="lyr-prev" type="number" min="0" max="10" value="${clampN(comp.data.prevLines ?? 3)}" /></label>
    <label>Next lines <input id="lyr-next" type="number" min="0" max="10" value="${clampN(comp.data.nextLines ?? 3)}" /></label>
    <label>Sync offset <input id="lyr-offset" type="number" min="-5000" max="5000" step="100" value="${Number(comp.data.offsetMs) || 0}" /> ms</label>
    <label>Align <select id="lyr-align">${["left", "center", "right"]
      .map((v) => `<option value="${v}" ${(comp.data.align || "left") === v ? "selected" : ""}>${v[0].toUpperCase() + v.slice(1)}</option>`)
      .join("")}</select></label>`;
  panel.appendChild(row2);
  const commit = () => {
    saveState();
    render();
  };
  row.querySelector("#lyrics-select").addEventListener("change", (e) => {
    selectedLyricsId = e.target.value;
    renderLyricsSettings();
  });
  row2.querySelector("#lyr-prev").addEventListener("change", (e) => {
    comp.data.prevLines = clampN(e.target.value);
    commit();
  });
  row2.querySelector("#lyr-next").addEventListener("change", (e) => {
    comp.data.nextLines = clampN(e.target.value);
    commit();
  });
  row2.querySelector("#lyr-offset").addEventListener("change", (e) => {
    comp.data.offsetMs = Math.max(-5000, Math.min(5000, Number(e.target.value) || 0));
    commit();
  });
  row2.querySelector("#lyr-align").addEventListener("change", (e) => {
    comp.data.align = e.target.value;
    commit();
  });

  const hint = document.createElement("div");
  hint.className = "item-row";
  hint.innerHTML = `<span class="muted">Focus shows the current line with the configured previous/next lines. Full view toggles from the tile and is the fallback when there is no synced line.</span>`;
  panel.appendChild(hint);

  const trRow = document.createElement("div");
  trRow.className = "item-row";
  trRow.innerHTML = `<label>Show translations (up to 2) <input type="checkbox" class="switch" id="lyr-translate" ${state.lyricsTranslate ? "checked" : ""} /></label>
    <span class="muted">Detects the lyrics language, then translates into the other two of EN/DE/ES (VI → DE+ES). LLM via opencode first, DeepL fallback — lyrics are sent to that provider.</span>`;
  panel.appendChild(trRow);
  trRow.querySelector("#lyr-translate").addEventListener("change", (e) => {
    state.lyricsTranslate = e.target.checked;
    saveState();
    render();
    renderLyricsSettings();
  });

  const ioRow = document.createElement("div");
  ioRow.className = "item-row";
  ioRow.innerHTML = `<button class="btn ghost" id="lyr-tr-export">Export translation cache</button>
    <button class="btn ghost" id="lyr-tr-import">Import translation cache</button>
    <span id="lyr-tr-io" class="muted"></span>`;
  panel.appendChild(ioRow);
  const ioStatus = ioRow.querySelector("#lyr-tr-io");
  ioRow.querySelector("#lyr-tr-export").addEventListener("click", async () => {
    ioStatus.textContent = "exporting…";
    try {
      const n = await native.lyricsTranslationsExport();
      ioStatus.textContent = n === null || n === undefined ? "cancelled" : `exported ${n} entries`;
    } catch (e) {
      ioStatus.textContent = `failed: ${e.message || e}`;
    }
  });
  ioRow.querySelector("#lyr-tr-import").addEventListener("click", async () => {
    ioStatus.textContent = "importing…";
    try {
      const n = await native.lyricsTranslationsImport();
      if (n === null || n === undefined) {
        ioStatus.textContent = "cancelled";
        return;
      }
      // Drop the in-memory cache so the imported disk entries are used.
      lyricsTranslationCache.clear();
      ioStatus.textContent = `added ${n} new entries (existing kept)`;
      render();
    } catch (e) {
      ioStatus.textContent = `failed: ${e.message || e}`;
    }
  });

  // Per-source-language translation targets (max 2; "Other" covers the rest).
  const tgtHead = document.createElement("div");
  tgtHead.className = "item-row";
  tgtHead.innerHTML = `<label>Targets per language</label><span class="muted">max 2 per source; “Other” handles languages outside EN/DE/ES/VI</span>`;
  panel.appendChild(tgtHead);
  const tgtGrid = document.createElement("div");
  tgtGrid.className = "lyr-targets";
  panel.appendChild(tgtGrid);
  const tgtMap = lyricsTargetsConfig();
  const SOURCES = [["en", "English"], ["de", "German"], ["es", "Spanish"], ["vi", "Vietnamese"], ["default", "Other"]];
  const TARGET_CODES = [["en", "EN"], ["de", "DE"], ["es", "ES"], ["vi", "VI"]];
  for (const [src, srcLabel] of SOURCES) {
    const row = document.createElement("div");
    row.className = "lyr-target-row";
    const label = document.createElement("span");
    label.className = "lyr-target-src";
    label.textContent = srcLabel;
    row.appendChild(label);
    const selected = new Set(tgtMap[src] || []);
    for (const [code, codeLabel] of TARGET_CODES) {
      const lab = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.dataset.t = code;
      box.checked = selected.has(code);
      if (src !== "default" && code === src) box.disabled = true; // can't translate to itself
      box.addEventListener("change", () => {
        const checked = [...row.querySelectorAll("input:checked")].map((b) => b.dataset.t);
        if (checked.length > 2) {
          box.checked = false;
          return;
        }
        tgtMap[src] = checked;
        saveState();
        render();
      });
      lab.append(box, document.createTextNode(codeLabel));
      row.appendChild(lab);
    }
    tgtGrid.appendChild(row);
  }

  const resetRow = document.createElement("div");
  resetRow.className = "item-row";
  resetRow.innerHTML = `<button class="btn ghost" id="lyr-reset-offsets">Reset per-track offsets</button>
    <button class="btn ghost" id="lyr-reset-langs">Reset detected languages</button>
    <button class="btn ghost" id="lyr-clear-tr">Clear translation cache</button>
    <span class="muted">Clear song-specific sync offsets / remembered language choices / cached translations.</span>`;
  panel.appendChild(resetRow);
  resetRow.querySelector("#lyr-reset-offsets").addEventListener("click", () => {
    state.lyricsOffsets = {};
    saveState();
    render();
    renderLyricsSettings();
  });
  resetRow.querySelector("#lyr-reset-langs").addEventListener("click", () => {
    state.lyricsLang = {};
    saveState();
    render();
    renderLyricsSettings();
  });
  resetRow.querySelector("#lyr-clear-tr").addEventListener("click", async () => {
    try {
      await native.lyricsTranslationsClear();
    } catch {
      /* best effort */
    }
    lyricsTranslationCache.clear();
    render();
    renderLyricsSettings();
  });
}

function renderProjectsSettings() {
  const panel = document.getElementById("project-list");
  if (!panel) return;
  const comp = ensureProjectComp();
  const comps = state.compartments.filter((c) => c.kind === "project");

  panel.innerHTML = "";
  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="project-select">
      ${comps
        .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
        .join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const addRoot = document.createElement("div");
  addRoot.className = "item-row";
  addRoot.innerHTML = `
    <label>Repo root</label>
    <input id="project-root" type="text" placeholder="e.g. D:\\dev\\core\\src" />
    <button class="btn ghost" id="project-browse">Browse…</button>
    <button class="btn primary" id="project-add-root">Add</button>`;
  panel.appendChild(addRoot);

  comp.data.roots.forEach((root, ri) => {
    const group = document.createElement("div");
    group.className = "prj-settings-group";
    const items = (root.projects || [])
      .map(
        (pr, i) => `
        <div class="item-row prj-edit-row">
          <input class="pj-folder" data-ri="${ri}" data-i="${i}" type="text" title="Folder path" value="${escapeHtml(pr.folder)}" />
          <input class="pj-solution" data-ri="${ri}" data-i="${i}" type="text" title="Solution path (empty = none)" value="${escapeHtml(pr.solution || "")}" />
          <button class="btn ghost danger icon-btn pj-del" data-ri="${ri}" data-i="${i}">${ICON.remove}</button>
        </div>`
      )
      .join("");
    group.innerHTML = `
      <div class="item-row prj-settings-head">
        <input class="ro-name" data-ri="${ri}" type="text" title="Group title" placeholder="Title" value="${escapeHtml(root.name || "")}" />
        <label>path <span class="ro-path-label">${escapeHtml(root.path)}</span></label>
        <input type="color" class="ro-color" data-ri="${ri}" value="${root.color || "#23232b"}" title="Group color" />
        <button class="btn ghost pj-scan" data-ri="${ri}">Re-scan</button>
        <button class="btn ghost danger pj-rm-root" data-ri="${ri}">Remove root</button>
      </div>
      <div class="prj-settings-items">${items}</div>
      <button class="btn ghost pj-add-row" data-ri="${ri}">+ manual project</button>`;
    panel.appendChild(group);
  });

  panel.querySelector("#project-select").addEventListener("change", (e) => {
    selectedProjectId = e.target.value;
    renderProjectsSettings();
  });
  panel.querySelector("#project-browse").addEventListener("click", async () => {
    const p = await native.pickFolder();
    if (p) panel.querySelector("#project-root").value = p;
  });
  panel.querySelector("#project-add-root").addEventListener("click", async () => {
    const rootPath = panel.querySelector("#project-root").value.trim();
    if (!rootPath) return;
    comp.data.roots.push({ path: rootPath, collapsed: false, projects: [] });
    const root = comp.data.roots[comp.data.roots.length - 1];
    try {
      root.projects = await native.scanProjectRoot(rootPath);
    } catch (e) {
      root.projects = [];
    }
    commitProject(comp);
  });
  panel.querySelectorAll(".pj-folder").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      comp.data.roots[Number(e.target.dataset.ri)].projects[Number(e.currentTarget.dataset.i)].folder = e.target.value;
      commitProject(comp);
    })
  );
  panel.querySelectorAll(".pj-solution").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      comp.data.roots[Number(e.target.dataset.ri)].projects[Number(e.currentTarget.dataset.i)].solution = e.target.value;
      commitProject(comp);
    })
  );
  panel.querySelectorAll(".ro-name").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      comp.data.roots[Number(e.target.dataset.ri)].name = e.target.value;
      commitProject(comp);
    })
  );
  panel.querySelectorAll(".ro-color").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      comp.data.roots[Number(e.target.dataset.ri)].color = e.target.value;
      commitProject(comp);
    })
  );

  // Event delegation on the panel for the project action buttons. Added once so
  // re-renders don't stack duplicate handlers; resolves the current comp fresh.
  if (!panel.dataset.deleg) {
    panel.dataset.deleg = "1";
    panel.addEventListener("click", (e) => {
      const btn = e.target.closest(".pj-rm-root, .pj-scan, .pj-add-row, .pj-del");
      if (!btn) return;
      const comp = findProjectComp();
      if (!comp) return;
      const ri = Number(btn.dataset.ri);
      if (btn.classList.contains("pj-rm-root")) {
        comp.data.roots.splice(ri, 1);
        commitProject(comp);
      } else if (btn.classList.contains("pj-scan")) {
        const root = comp.data.roots[ri];
        (async () => {
          try {
            root.projects = await native.scanProjectRoot(root.path);
          } catch (err) {
            root.projects = [];
          }
          commitProject(comp);
        })();
      } else if (btn.classList.contains("pj-add-row")) {
        comp.data.roots[ri].projects.push({ folder: "", solution: "" });
        commitProject(comp);
      } else if (btn.classList.contains("pj-del")) {
        comp.data.roots[ri].projects.splice(Number(btn.dataset.i), 1);
        commitProject(comp);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Vocab settings editor: flashcard tile selector + rotation, and the drill
// popup config (master switch, cadence, language, quiet hours, vocab-app
// target, snooze state). Popup scheduling itself runs Rust-side via a 30s
// vocab_tick() from the main window; the Preview button opens one on demand
// (also the manual placement/focus test hook).
// ---------------------------------------------------------------------------
let selectedVocabId = null;
// Non-creating lookup for the settings tab — opening Vocab settings must
// never resurrect a deleted tile (same rule as the Projects tab). The drill
// popup config below is global and works with zero tiles.
function findVocabComp() {
  return state.compartments.find((c) => c.id === selectedVocabId && c.kind === "vocab")
    ?? state.compartments.find((c) => c.kind === "vocab")
    ?? null;
}
function renderVocabSettings() {
  const panel = document.getElementById("vocab-list");
  if (!panel) return;
  const comp = findVocabComp();
  const comps = state.compartments.filter((c) => c.kind === "vocab");
  const v = vocabConfig();

  panel.innerHTML = "";
  if (comp) {
    const selectorRow = document.createElement("div");
    selectorRow.className = "item-row";
    selectorRow.innerHTML = `
      <label>Tile</label>
      <select id="vocab-select">
        ${comps
          .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
          .join("")}
      </select>
      <label>Rotate every <input id="vocab-interval" type="number" min="3" max="300" value="${Number(comp.data.intervalSec) || 10}" />s</label>`;
    panel.appendChild(selectorRow);
    appendCollapsibleRow(panel, comp);
    appendAppearanceRow(panel, comp);

    const voices = comp.data.voices || {};
    const voiceRow = document.createElement("div");
    voiceRow.className = "item-row";
    voiceRow.innerHTML = `
      <label>Voice enable <input id="vocab-speak" type="checkbox" class="switch" ${comp.data.speak ? "checked" : ""} title="Speak each card EN, then ES, then DE" /></label>
      <label>English <select id="vocab-voice-en" data-lang="en"><option value="">Default</option></select></label>
      <label>Spanish <select id="vocab-voice-es" data-lang="es"><option value="">Default</option></select></label>
      <label>German <select id="vocab-voice-de" data-lang="de"><option value="">Default</option></select></label>`;
    panel.appendChild(voiceRow);
    const fillVoiceSelects = (list) => {
      if (!voiceRow.isConnected) return;
      for (const slot of ["en", "es", "de"]) {
        fillVocabVoiceSelect(
          voiceRow.querySelector(`#vocab-voice-${slot}`),
          slot,
          list,
          (comp.data.voices || {})[slot] || ""
        );
      }
    };
    getSpeechVoices().then(fillVoiceSelects).catch(() => {});
    if (!("speechSynthesis" in window)) {
      voiceRow.querySelector("#vocab-speak").disabled = true;
      const noTts = document.createElement("div");
      noTts.className = "item-row";
      noTts.innerHTML = `<span class="muted">Speech synthesis is unavailable in this browser.</span>`;
      panel.appendChild(noTts);
    } else {
      const tip = document.createElement("div");
      tip.className = "item-row";
      tip.innerHTML = `<span class="muted">Tip: enable speech on one tile only. New voices appear here after a restart.</span>
        <button class="btn ghost" id="vocab-windows-voices">Windows voice settings…</button>
        <span class="muted">Add Español/Deutsch language packs (with speech) or Narrator natural voices for better quality.</span>`;
      panel.appendChild(tip);
      tip.querySelector("#vocab-windows-voices").addEventListener("click", async () => {
        try {
          await native.openUrl("ms-settings:speech");
        } catch (e) {
          alert(`Couldn't open Windows settings: ${e.message || e}`);
        }
      });
    }
    voiceRow.querySelector("#vocab-speak").addEventListener("change", (e) => {
      comp.data.speak = e.target.checked;
      saveState();
      render();
    });
    for (const slot of ["en", "es", "de"]) {
      voiceRow.querySelector(`#vocab-voice-${slot}`).addEventListener("change", (e) => {
        comp.data.voices = comp.data.voices || {};
        comp.data.voices[slot] = e.target.value;
        saveState();
        render();
      });
    }
  } else {
    const hint = document.createElement("div");
    hint.className = "item-row";
    hint.innerHTML = `<span class="muted">No Vocab tile yet — add one from Grid &gt; Add a tile. The drill popup below works without a tile.</span>`;
    panel.appendChild(hint);
  }

  const head = document.createElement("h3");
  head.textContent = "Drill popup";
  panel.appendChild(head);

  const pop = document.createElement("div");
  pop.className = "item-row";
  pop.innerHTML = `
    <label>Enabled <input id="vocab-enabled" type="checkbox" class="switch" ${v.enabled ? "checked" : ""} /></label>
    <label>Every <input id="vocab-every" type="number" min="1" max="240" value="${Number(v.everyMin) || 30}" />min</label>
    <label>Language
      <select id="vocab-lang">
        <option value="es" ${v.lang === "es" ? "selected" : ""}>Spanish</option>
        <option value="de" ${v.lang === "de" ? "selected" : ""}>German</option>
        <option value="both" ${v.lang === "both" ? "selected" : ""}>Both</option>
      </select>
    </label>`;
  panel.appendChild(pop);

  const quiet = document.createElement("div");
  quiet.className = "item-row";
  quiet.innerHTML = `
    <label>Quiet from <input id="vocab-quiet-start" type="time" value="${escapeHtml(v.quietStart || "")}" /></label>
    <label>to <input id="vocab-quiet-end" type="time" value="${escapeHtml(v.quietEnd || "")}" /></label>`;
  panel.appendChild(quiet);

  const commit = () => { saveState(); render(); };

  const catHead = document.createElement("div");
  catHead.className = "item-row";
  catHead.innerHTML = `<label>Categories</label><span class="muted">popup only — empty = all; Lyrics = random translated lines (not graded, uses Practice size).</span>`;
  panel.appendChild(catHead);
  const catBox = document.createElement("div");
  catBox.className = "vocab-cats";
  catBox.innerHTML = `<span class="muted">loading…</span>`;
  panel.appendChild(catBox);
  Promise.all([
    native.vocabCategories().catch(() => []),
    native.lyricsPhraseCount(v.lang || "es").catch(() => 0),
  ])
    .then(([cats, lyricsCount]) => {
      if (!catBox.isConnected) return;
      const list = Array.isArray(cats) ? cats : [];
      const sel = new Set(v.drillCats || []);
      const lyricsOn = sel.has(LYRICS_CAT);
      const real = list.map(
        (c) =>
          `<label class="vocab-cat"><input type="checkbox" data-cat="${escapeHtml(c.name)}" ${!lyricsOn && sel.has(c.name) ? "checked" : ""} />${escapeHtml(c.name)} <span class="muted">(${c.count})</span></label>`
      );
      catBox.innerHTML =
        `<label class="vocab-cat"><input type="checkbox" data-cat="${LYRICS_CAT}" ${lyricsOn ? "checked" : ""} />Lyrics <span class="muted">(${Number(lyricsCount) || 0})</span></label>` +
        real.join("") +
        (list.length ? "" : `<span class="muted">no word categories found</span>`);
      catBox.querySelectorAll("input[type=checkbox]").forEach((box) =>
        box.addEventListener("change", () => {
          const all = [...catBox.querySelectorAll("input[type=checkbox]")];
          if (box.dataset.cat === LYRICS_CAT) {
            if (box.checked) all.forEach((b) => { if (b !== box) b.checked = false; });
          } else if (box.checked) {
            const lyrics = all.find((b) => b.dataset.cat === LYRICS_CAT);
            if (lyrics) lyrics.checked = false;
          }
          v.drillCats = all.filter((b) => b.checked).map((b) => b.dataset.cat);
          commit();
        })
      );
    })
    .catch(() => {
      if (catBox.isConnected) catBox.innerHTML = `<span class="muted">couldn't load categories</span>`;
    });

  const posHead = document.createElement("div");
  posHead.className = "item-row";
  posHead.innerHTML = `<label>Part of speech</label><span class="muted">popup only — empty = all; ignored for Lyrics</span>`;
  panel.appendChild(posHead);
  const posBox = document.createElement("div");
  posBox.className = "vocab-cats";
  posBox.innerHTML = `<span class="muted">loading…</span>`;
  panel.appendChild(posBox);
  const POS_LABELS = { noun: "Nouns", verb: "Verbs", adjective: "Adjectives", adverb: "Adverbs", phrase: "Phrases", other: "Other" };
  native.vocabPosCounts().then((list) => {
    if (!posBox.isConnected) return;
    if (!list || !list.length) {
      posBox.innerHTML = `<span class="muted">no data</span>`;
      return;
    }
    const sel = new Set(v.drillPos || []);
    posBox.innerHTML = list
      .map((p) => `<label class="vocab-cat"><input type="checkbox" data-pos="${escapeHtml(p.pos)}" ${sel.has(p.pos) ? "checked" : ""} />${escapeHtml(POS_LABELS[p.pos] || p.pos)} <span class="muted">(${p.count})</span></label>`)
      .join("");
    posBox.querySelectorAll("input[type=checkbox]").forEach((box) =>
      box.addEventListener("change", () => {
        v.drillPos = [...posBox.querySelectorAll("input[type=checkbox]:checked")].map((b) => b.dataset.pos);
        commit();
      })
    );
  }).catch(() => {
    if (posBox.isConnected) posBox.innerHTML = `<span class="muted">couldn't load parts of speech</span>`;
  });

  const posRow = document.createElement("div");
  posRow.className = "item-row";
  posRow.innerHTML = `<label>Popup position</label><div class="vocab-pos-grid" role="radiogroup" aria-label="Drill popup position"></div>`;
  panel.appendChild(posRow);
  const posGrid = posRow.querySelector(".vocab-pos-grid");
  const POSITIONS = [
    ["top-left", "top-center", "top-right"],
    ["center-left", "center", "center-right"],
    ["bottom-left", "bottom-center", "bottom-right"],
  ];
  for (const row of POSITIONS) {
    for (const pos of row) {
      const b = document.createElement("button");
      b.className = "btn ghost vocab-pos" + (pos === (v.popupPosition || "bottom-right") ? " active" : "");
      b.title = pos;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", pos === (v.popupPosition || "bottom-right") ? "true" : "false");
      b.addEventListener("click", () => {
        v.popupPosition = pos;
        commit();
        posGrid.querySelectorAll(".vocab-pos").forEach((x) => {
          const on = x.title === pos;
          x.classList.toggle("active", on);
          x.setAttribute("aria-checked", on ? "true" : "false");
        });
      });
      posGrid.appendChild(b);
    }
  }

  const actions = document.createElement("div");
  actions.className = "item-row";
  const snoozed = (v.snoozeUntil || 0) > Date.now() / 1000;
  actions.innerHTML = `
    <button class="btn ghost" id="vocab-preview">Preview popup</button>
    <button class="btn ghost" id="vocab-clear-snooze" ${snoozed ? "" : "disabled"}>Clear snooze</button>
    <span id="vocab-status" class="muted">${snoozed ? "snoozed" : ""}</span>`;
  panel.appendChild(actions);

  const statusEl = actions.querySelector("#vocab-status");

  if (comp) {
    panel.querySelector("#vocab-select").addEventListener("change", (e) => {
      selectedVocabId = e.target.value;
      renderVocabSettings();
    });
    panel.querySelector("#vocab-interval").addEventListener("change", (e) => {
      comp.data.intervalSec = Math.min(300, Math.max(3, Number(e.target.value) || 10));
      commit();
      renderVocabSettings();
    });
  }
  panel.querySelector("#vocab-enabled").addEventListener("change", (e) => {
    v.enabled = e.target.checked;
    commit();
  });
  panel.querySelector("#vocab-every").addEventListener("change", (e) => {
    v.everyMin = Math.min(240, Math.max(1, Number(e.target.value) || 30));
    commit();
  });
  panel.querySelector("#vocab-lang").addEventListener("change", (e) => {
    v.lang = e.target.value;
    commit();
  });
  panel.querySelector("#vocab-quiet-start").addEventListener("change", (e) => {
    v.quietStart = e.target.value;
    commit();
  });
  panel.querySelector("#vocab-quiet-end").addEventListener("change", (e) => {
    v.quietEnd = e.target.value;
    commit();
  });
  actions.querySelector("#vocab-preview").addEventListener("click", async () => {
    statusEl.textContent = "opening…";
    try {
      const res = await native.openVocabPopup(v.lang || "es", v.drillCats || [], v.drillPos || [], v.popupPosition || "bottom-right");
      statusEl.textContent = res === "already-open" ? "already open" : "opened";
    } catch (e) {
      statusEl.textContent = `failed: ${e.message || e}`;
    }
  });
  actions.querySelector("#vocab-clear-snooze").addEventListener("click", async () => {
    try {
      await native.clearVocabSnooze();
      v.snoozeUntil = 0;
      commit();
      renderVocabSettings();
    } catch (e) {
      statusEl.textContent = `failed: ${e.message || e}`;
    }
  });

  // Session size (cap) + struggling priority (B2a) + extra practice (B2b).
  const sessRow = document.createElement("div");
  sessRow.className = "item-row";
  sessRow.innerHTML = `
    <label>Cards per session
      <select id="vocab-session-size">
        ${[[1, "1"], [3, "3"], [5, "5"], [10, "10"], [0, "All due"]]
          .map(([val, label]) => `<option value="${val}" ${Number(v.cardsPerSession) === val ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </label>
    <label>Practice size
      <select id="vocab-practice-size">
        ${[[5, "5"], [10, "10"], [20, "20"], [0, "All"]]
          .map(([val, label]) => `<option value="${val}" ${Number(v.practicePerSession) === val ? "selected" : ""}>${label}</option>`)
          .join("")}
      </select>
    </label>
    <label title="Show high-lapse cards first in the session"><input type="checkbox" class="switch" id="vocab-struggling-first" ${v.strugglingFirst ? "checked" : ""} /> Prioritize hard words</label>
    <button class="btn ghost" id="vocab-practice" title="Extra ungraded reps on words you keep forgetting — doesn't affect mastery">Practice hard words</button>
    <span id="vocab-session-status" class="muted"></span>`;
  panel.appendChild(sessRow);
  const sessStatus = sessRow.querySelector("#vocab-session-status");
  sessRow.querySelector("#vocab-session-size").addEventListener("change", (e) => {
    v.cardsPerSession = Number(e.target.value) || 0;
    commit();
  });
  sessRow.querySelector("#vocab-practice-size").addEventListener("change", (e) => {
    v.practicePerSession = Number(e.target.value) || 0;
    commit();
  });
  sessRow.querySelector("#vocab-struggling-first").addEventListener("change", (e) => {
    v.strugglingFirst = e.target.checked;
    commit();
  });
  sessRow.querySelector("#vocab-practice").addEventListener("click", async () => {
    sessStatus.textContent = "opening…";
    try {
      const res = await native.openVocabPopup(v.lang || "es", v.drillCats || [], v.drillPos || [], v.popupPosition || "bottom-right", true);
      sessStatus.textContent = res === "already-open" ? "already open" : "opened";
    } catch (e) {
      sessStatus.textContent = `failed: ${e.message || e}`;
    }
  });

  // Spaced repetition: schedule reviews instead of random order (SM-2).
  const srsHead = document.createElement("h3");
  srsHead.textContent = "Spaced repetition";
  panel.appendChild(srsHead);
  const srsRow = document.createElement("div");
  srsRow.className = "item-row";
  srsRow.innerHTML = `
    <label>Smart scheduling <input type="checkbox" class="switch" id="vocab-srs" title="Review cards on an expanding schedule (SM-2)" /></label>
    <button class="btn ghost" id="vocab-srs-reset">Reset progress</button>
    <span id="vocab-srs-status" class="muted"></span>`;
  panel.appendChild(srsRow);
  const srsProg = document.createElement("div");
  srsProg.className = "item-row vocab-mastery";
  srsProg.innerHTML = `<div class="vocab-mastery-bar" aria-hidden="true"></div><span class="muted" id="vocab-srs-progress">…</span>`;
  panel.appendChild(srsProg);
  const barEl = srsProg.querySelector(".vocab-mastery-bar");
  const progEl = srsProg.querySelector("#vocab-srs-progress");
  const wordCats = () => (v.drillCats || []).filter((c) => c !== LYRICS_CAT);
  const loadStats = () =>
    native
      .vocabSrsStats(wordCats(), v.drillPos || [])
      .then((s) => {
        if (!s) {
          progEl.textContent = "";
          barEl.innerHTML = "";
          return;
        }
        const tot = s.total || 1;
        const seg = (cls, n) =>
          n > 0 ? `<span class="vocab-mastery-seg ${cls}" style="width:${(n / tot) * 100}%"></span>` : "";
        barEl.innerHTML =
          seg("mature", s.mature) + seg("young", s.young) + seg("learning", s.learning) + seg("new", s.new);
        const pct = s.total ? Math.round((s.mature / s.total) * 100) : 0;
        progEl.textContent =
          `Mastered ${s.mature}/${s.total} (${pct}%) · learning ${s.learning} · young ${s.young} · new ${s.new} · ${s.due} due now` +
          (s.struggling ? ` · ${s.struggling} struggling` : "");
      })
      .catch(() => {
        progEl.textContent = "";
        barEl.innerHTML = "";
      });
  loadStats();

  const masteryHead = document.createElement("h3");
  masteryHead.textContent = "Mastery by category";
  panel.appendChild(masteryHead);
  const catTable = document.createElement("div");
  catTable.className = "vocab-mastery-table";
  catTable.innerHTML = `<span class="muted">loading…</span>`;
  panel.appendChild(catTable);
  native
    .vocabCategoryStats(wordCats(), v.drillPos || [])
    .then((rows) => {
      if (!catTable.isConnected) return;
      if (!rows || !rows.length) {
        catTable.innerHTML = `<span class="muted">no categories found</span>`;
        return;
      }
      catTable.innerHTML =
        `<table><thead><tr><th>Category</th><th>Cards</th><th>Mastered</th><th>Learn</th><th>Young</th><th>New</th><th>Due</th></tr></thead><tbody>` +
        rows
          .map((r) => {
            const pct = r.total ? Math.round((r.mature / r.total) * 100) : 0;
            return `<tr><td>${escapeHtml(r.category)}</td><td>${r.total}</td><td><b>${pct}%</b> <span class="muted">(${r.mature})</span></td><td>${r.learning}</td><td>${r.young}</td><td>${r.new}</td><td>${r.due}</td></tr>`;
          })
          .join("") +
        `</tbody></table>`;
    })
    .catch(() => {
      if (catTable.isConnected) catTable.innerHTML = `<span class="muted">couldn't load stats</span>`;
    });
  const srsChk = srsRow.querySelector("#vocab-srs");
  const srsStatus = srsRow.querySelector("#vocab-srs-status");
  native.vocabSrsEnabled().then((on) => { srsChk.checked = on === true; }).catch(() => {});
  srsChk.addEventListener("change", async (e) => {
    try {
      await native.vocabSetSrs(e.target.checked);
      render();
    } catch (err) {
      srsStatus.textContent = `failed: ${err.message || err}`;
      srsChk.checked = !e.target.checked;
    }
  });
  srsRow.querySelector("#vocab-srs-reset").addEventListener("click", async () => {
    srsStatus.textContent = "resetting…";
    try {
      await native.vocabResetSrs();
      srsStatus.textContent = "progress cleared";
      loadStats();
      render();
    } catch (err) {
      srsStatus.textContent = `failed: ${err.message || err}`;
    }
  });
}

// Drill-popup scheduler: Rust decides (enabled / snooze / quiet-hours /
// cadence / no-stacking) and opens the window itself; the result is only a
// status word, surfaced in the console for diagnostics. Popup-set timing is
// mirrored into memory (no save) so full-state writes never clobber a snooze.
setInterval(async () => {
  try {
    const res = await native.vocabTick();
    if (res && res !== "disabled" && res !== "too-soon") console.debug("[vocab] tick:", res);
    const st = await native.vocabPopupState().catch(() => null);
    if (st) {
      const v = vocabConfig();
      v.snoozeUntil = st.snooze_until || 0;
      v.lastPopupAt = st.last_popup_at || 0;
    }
  } catch (e) {
    console.debug("[vocab] tick failed:", e);
  }
}, 30000);

// ---------------------------------------------------------------------------
// Meme settings editor: per-tile rotation, template list refresh, search
// engine URL, and the shared curated-collection manager (references only).
// ---------------------------------------------------------------------------
let selectedMemeId = null;
function findMemeComp() {
  return state.compartments.find((c) => c.id === selectedMemeId && c.kind === "meme")
    ?? state.compartments.find((c) => c.kind === "meme")
    ?? null;
}
function renderMemeSettings() {
  const panel = document.getElementById("meme-list");
  if (!panel) return;
  const comp = findMemeComp();
  const comps = state.compartments.filter((c) => c.kind === "meme");

  panel.innerHTML = "";
  if (comp) {
    const selectorRow = document.createElement("div");
    selectorRow.className = "item-row";
    selectorRow.innerHTML = `
      <label>Tile</label>
      <select id="meme-select">
        ${comps
          .map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`)
          .join("")}
      </select>
      <label>Rotate every <input id="meme-interval" type="number" min="5" max="600" value="${Number(comp.data.intervalSec) || 30}" />s</label>`;
    panel.appendChild(selectorRow);
    appendCollapsibleRow(panel, comp);
    appendAppearanceRow(panel, comp);
    panel.querySelector("#meme-select").addEventListener("change", (e) => {
      selectedMemeId = e.target.value;
      renderMemeSettings();
    });
    panel.querySelector("#meme-interval").addEventListener("change", (e) => {
      comp.data.intervalSec = Math.min(600, Math.max(5, Number(e.target.value) || 30));
      saveState();
      render();
      renderMemeSettings();
    });
  } else {
    const hint = document.createElement("div");
    hint.className = "item-row";
    hint.innerHTML = `<span class="muted">No meme tile yet — add one from Grid &gt; Add a tile. The collection below is shared and works without a tile.</span>`;
    panel.appendChild(hint);
  }

  const top = memeTop100();
  const topRow = document.createElement("div");
  topRow.className = "item-row";
  topRow.innerHTML = `
    <label>Templates</label>
    <span class="muted">${top.items.length} cached${top.at ? ` (refreshed ${new Date(top.at).toLocaleDateString()})` : ""}</span>
    <button class="btn ghost" id="meme-refresh-top">Refresh templates</button>
    <span id="meme-top-status" class="muted"></span>`;
  panel.appendChild(topRow);
  topRow.querySelector("#meme-refresh-top").addEventListener("click", async () => {
    const st = topRow.querySelector("#meme-top-status");
    st.textContent = "fetching…";
    await refreshMemeTop100(true);
    renderMemeSettings();
  });

  const engRow = document.createElement("div");
  engRow.className = "item-row";
  engRow.innerHTML = `
    <label>Image search <input id="meme-engine" type="text" value="${escapeHtml(memeEngine())}" title="Search URL with {q} for the query" /></label>`;
  panel.appendChild(engRow);
  engRow.querySelector("#meme-engine").addEventListener("change", (e) => {
    state.memeSearchEngine = e.target.value.trim() || MEME_DEFAULT_ENGINE;
    saveState();
  });

  const addRow = document.createElement("div");
  addRow.className = "item-row";
  addRow.innerHTML = `
    <label>Add image URL <input id="meme-url" type="text" placeholder="https://…" /></label>
    <button class="btn primary" id="meme-add-url">Add</button>
    <button class="btn ghost" id="meme-browse">Browse…</button>
    <span id="meme-add-status" class="muted"></span>`;
  panel.appendChild(addRow);
  const addStatus = (t) => {
    addRow.querySelector("#meme-add-status").textContent = t;
  };
  addRow.querySelector("#meme-add-url").addEventListener("click", async () => {
    const url = addRow.querySelector("#meme-url").value.trim();
    if (!url) return;
    addStatus("fetching…");
    try {
      await native.fetchImageCached(url);
      const col = memeCollection();
      if (col.length >= MEME_MAX_ENTRIES) {
        addStatus(`collection full (${MEME_MAX_ENTRIES})`);
        return;
      }
      if (col.some((e) => e.sourceUrl === url)) {
        addStatus("already in collection");
        return;
      }
      let name = url;
      try {
        name = new URL(url).hostname + url.slice(-24);
      } catch { /* keep full url */ }
      const entry = { id: "m" + Date.now(), name, sourceUrl: url, cacheKey: null, ext: memeExtOf(url), addedAt: Date.now() };
      col.push(entry);
      addRow.querySelector("#meme-url").value = "";
      saveState();
      render();
      renderMemeSettings();
    } catch (e) {
      addStatus(`failed: ${e.message || e}`);
    }
  });
  addRow.querySelector("#meme-browse").addEventListener("click", async () => {
    addStatus("choosing file…");
    try {
      const p = await native.pickImage();
      if (!p) {
        addStatus("");
        return;
      }
      const ref = await native.importImageFile(p);
      const col = memeCollection();
      if (col.length >= MEME_MAX_ENTRIES) {
        addStatus(`collection full (${MEME_MAX_ENTRIES})`);
        return;
      }
      if (!ref || !ref.key || col.some((e) => e.cacheKey === ref.key)) {
        addStatus("already in collection");
        return;
      }
      const entry = {
        id: "m" + Date.now(),
        name: p.split(/[\\/]/).pop() || "image",
        sourceUrl: null,
        cacheKey: ref.key,
        ext: memeExtOf(p),
        addedAt: Date.now(),
      };
      col.push(entry);
      memeUriCache.set(entry.id, ref.uri);
      saveState();
      render();
      renderMemeSettings();
    } catch (e) {
      addStatus(`failed: ${e.message || e}`);
    }
  });

  const sizeBytes = JSON.stringify(state).length;
  if (sizeBytes > 1024 * 1024) {
    const warn = document.createElement("div");
    warn.className = "item-row";
    warn.innerHTML = `<span class="warn">State file is ${(sizeBytes / 1048576).toFixed(1)} MB — investigate before it grows (images must stay as references, never bytes).</span>`;
    panel.appendChild(warn);
  }

  const col = memeCollection();
  const listHead = document.createElement("div");
  listHead.className = "item-row";
  listHead.innerHTML = `<label>Collection</label><span class="muted">${col.length} / ${MEME_MAX_ENTRIES} (drops onto a meme tile also add here)</span>`;
  panel.appendChild(listHead);
  const list = document.createElement("div");
  list.className = "meme-settings-list";
  list.innerHTML = col.length
    ? col
        .map(
          (e) => `
        <div class="item-row meme-edit-row" data-id="${escapeHtml(e.id)}">
          <span class="meme-entry-name" title="${escapeHtml(e.sourceUrl || "local file")}">${escapeHtml(e.name || "image")}</span>
          <span class="muted">${e.sourceUrl ? "url" : "file"}</span>
          <button class="btn ghost danger icon-btn meme-entry-del" data-id="${escapeHtml(e.id)}" title="Remove">${ICON.remove}</button>
        </div>`
        )
        .join("")
    : `<div class="muted">Empty — paste a URL, browse a file, or drop images onto a meme tile.</div>`;
  panel.appendChild(list);
  list.querySelectorAll(".meme-entry-del").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.id;
      state.memeCollection = memeCollection().filter((e) => e.id !== id);
      memeUriCache.delete(id);
      saveState();
      render();
      renderMemeSettings();
    })
  );
}

// ---------------------------------------------------------------------------
// Expanded meme view: in-app fullscreen overlay (Settings-shell pattern) for
// browsing the collection, captioning, searching, and PNG export. Helpers are
// structured generically (FOCUS_PANELS) so other tiles can adopt the pattern.
// ---------------------------------------------------------------------------
const FOCUS_PANELS = { meme: "meme-focus" };
let focusCtx = null;
let memeFocusEntry = null;
let memeFocusUri = "";

function openFocus(kind, id) {
  const elId = FOCUS_PANELS[kind];
  if (!elId) return;
  focusCtx = { kind, id };
  Object.values(FOCUS_PANELS).forEach((pid) => document.getElementById(pid)?.classList.add("hidden"));
  document.getElementById(elId)?.classList.remove("hidden");
  if (kind === "meme") renderMemeFocus();
}
function closeFocus() {
  focusCtx = null;
  Object.values(FOCUS_PANELS).forEach((pid) => document.getElementById(pid)?.classList.add("hidden"));
}
function openMemeFocus(compId, currentEntry) {
  if (state.compartments.some((c) => c.id === compId)) selectedMemeId = compId;
  // Open on the meme the tile is currently showing (falls back to random
  // when the tile hasn't resolved one yet).
  memeFocusEntry = currentEntry || null;
  memeFocusUri = "";
  openFocus("meme", compId);
}

async function previewMemeFocus(entry) {
  const img = document.querySelector("#meme-focus .meme-preview-img");
  const nameEl = document.querySelector("#meme-focus .meme-preview-name");
  const statusEl = document.querySelector("#meme-focus .meme-focus-status");
  if (!img) return;
  memeFocusEntry = entry;
  if (nameEl) nameEl.textContent = entry?.name || "";
  if (!entry) {
    img.removeAttribute("src");
    return;
  }
  try {
    const uri = await memeEntryUri(entry);
    if (memeFocusEntry !== entry) return; // superseded while resolving
    memeFocusUri = uri;
    img.src = uri;
    if (statusEl) statusEl.textContent = "";
  } catch (e) {
    if (statusEl) statusEl.textContent = `Couldn't load image: ${e.message || e}`;
  }
}

async function renderMemeFocusGrid() {
  const grid = document.querySelector("#meme-focus .meme-grid");
  if (!grid) return;
  const col = memeCollection();
  grid.innerHTML = col.length
    ? col
        .map(
          (e) => `
        <div class="meme-thumb" data-id="${escapeHtml(e.id)}" title="${escapeHtml(e.name || "image")} — click to preview">
          <img alt="" />
          <button class="btn ghost danger icon-btn meme-thumb-del" data-id="${escapeHtml(e.id)}" title="Remove">×</button>
        </div>`
        )
        .join("")
    : `<div class="muted">Collection is empty.</div>`;
  grid.querySelectorAll(".meme-thumb").forEach((t) =>
    t.addEventListener("click", (ev) => {
      if (ev.target.closest(".meme-thumb-del")) return;
      const entry = memeCollection().find((e) => e.id === t.dataset.id);
      if (entry) previewMemeFocus(entry);
    })
  );
  grid.querySelectorAll(".meme-thumb-del").forEach((b) =>
    b.addEventListener("click", () => {
      state.memeCollection = memeCollection().filter((e) => e.id !== b.dataset.id);
      memeUriCache.delete(b.dataset.id);
      saveState();
      render();
      renderMemeFocusGrid();
      if (document.getElementById("meme-list")) renderMemeSettings();
    })
  );
  // Lazy-fill thumbnails so the grid appears instantly on big collections.
  for (const t of grid.querySelectorAll(".meme-thumb")) {
    const entry = memeCollection().find((e) => e.id === t.dataset.id);
    if (!entry) continue;
    try {
      const uri = await memeEntryUri(entry);
      if (!t.isConnected) return;
      const stillThere = memeCollection().some((e) => e.id === entry.id);
      if (stillThere) t.querySelector("img").src = uri;
    } catch {
      // Dead entry: leave the placeholder box with its title tooltip.
    }
  }
}

function renderMemeFocus() {
  const root = document.getElementById("meme-focus");
  if (!root || !root.querySelector(".meme-preview-img")) return; // shell built once below
  renderMemeFocusGrid();
  if (memeFocusEntry) {
    previewMemeFocus(memeFocusEntry);
    return;
  }
  const pool = memePool();
  previewMemeFocus(pool.length ? pool[Math.floor(Math.random() * pool.length)] : null);
}

function buildMemeFocusShell() {
  if (document.getElementById("meme-focus")) return;
  const sec = document.createElement("section");
  sec.id = "meme-focus";
  sec.className = "settings hidden";
  sec.innerHTML = `
    <div class="settings-panel meme-focus-panel">
      <header>
        <h2>Memes</h2>
        <button id="meme-focus-close" class="btn ghost icon-btn" title="Close">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </header>
      <div class="meme-focus-main">
        <div class="meme-preview">
          <div class="meme-preview-imgwrap">
            <img class="meme-preview-img" alt="" />
            <div class="meme-cap meme-cap-top"></div>
            <div class="meme-cap meme-cap-bottom"></div>
          </div>
          <div class="meme-preview-name muted"></div>
        </div>
        <div class="meme-editor">
          <div class="item-row">
            <label>Output folder <span id="meme-output-path" class="muted"></span></label>
            <button class="btn ghost" id="meme-output-browse">Browse…</button>
            <button class="btn ghost" id="meme-output-open">Open</button>
          </div>
          <div class="item-row">
            <label>Top <input id="meme-cap-top" type="text" placeholder="TOP TEXT" /></label>
            <label>Bottom <input id="meme-cap-bottom" type="text" placeholder="BOTTOM TEXT" /></label>
          </div>
          <div class="item-row">
            <button class="btn primary" id="meme-export">Export</button>
            <span class="meme-focus-status muted"></span>
          </div>
          <div class="item-row">
            <label>Search images <input id="meme-search" type="text" placeholder="disappointing meme" /></label>
            <button class="btn ghost" id="meme-search-go">Go</button>
          </div>
          <div class="item-row">
            <label>Add image URL <input id="meme-focus-url" type="text" placeholder="https://…" /></label>
            <button class="btn ghost" id="meme-focus-add">Add</button>
            <button class="btn ghost" id="meme-focus-browse">Browse…</button>
          </div>
          <div class="meme-drop" title="Drop image files here (or onto a meme tile)">Drop image files here</div>
          <h3>Collection</h3>
          <div class="meme-grid"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(sec);

  sec.querySelector("#meme-focus-close").addEventListener("click", closeFocus);
  const outPath = sec.querySelector("#meme-output-path");
  const syncOutPath = () => {
    outPath.textContent = state.memeOutputDir || "(asks every time)";
    outPath.title = state.memeOutputDir || "";
  };
  syncOutPath();
  sec.querySelector("#meme-output-browse").addEventListener("click", async () => {
    try {
      const p = await native.pickFolder();
      if (!p) return;
      state.memeOutputDir = p;
      saveState();
      syncOutPath();
    } catch (e) {
      sec.querySelector(".meme-focus-status").textContent = `folder failed: ${e.message || e}`;
    }
  });
  sec.querySelector("#meme-output-open").addEventListener("click", async () => {
    if (!state.memeOutputDir) {
      sec.querySelector(".meme-focus-status").textContent = "no output folder set — browse one first";
      return;
    }
    try {
      await native.openFolder(state.memeOutputDir);
    } catch (e) {
      sec.querySelector(".meme-focus-status").textContent = `open failed: ${e.message || e}`;
    }
  });
  const capTop = sec.querySelector("#meme-cap-top");
  const capBottom = sec.querySelector("#meme-cap-bottom");
  const syncCaps = () => {
    sec.querySelector(".meme-cap-top").textContent = capTop.value;
    sec.querySelector(".meme-cap-bottom").textContent = capBottom.value;
  };
  capTop.addEventListener("input", syncCaps);
  capBottom.addEventListener("input", syncCaps);
  sec.querySelector("#meme-export").addEventListener("click", async () => {
    const btn = sec.querySelector("#meme-export");
    if (btn.disabled) return; // export already running (GIF encode can take a while)
    btn.disabled = true;
    const statusEl = sec.querySelector(".meme-focus-status");
    statusEl.textContent = "exporting…";
    try {
    const top = capTop.value.trim();
    const bottom = capBottom.value.trim();
    const entry = memeFocusEntry;
    const urlOf = entry ? entry.sourceUrl || entry.url || "" : "";
    const keyOf = entry ? entry.cacheKey || "" : "";
    // No caption: export the ORIGINAL bytes (a GIF stays an animated GIF,
    // a JPG keeps full quality). A captioned GIF is re-encoded frame by
    // frame (animation kept); anything else captioned renders to static PNG.
    const entryIsGif = entry?.ext === "gif" || /\.gif(\?|#|$)/i.test(urlOf);
    let sourceTried = false;
    if (!top && !bottom && (keyOf || urlOf)) {
      sourceTried = true;
      try {
        const saved = await native.saveMemeSource(
          state.memeOutputDir || "",
          `meme-${Date.now()}`,
          keyOf,
          urlOf
        );
        if (saved) {
          statusEl.textContent = `saved: ${saved.path}${saved.ext === "gif" ? " (animated GIF kept)" : ""}`;
          statusEl.title = saved.path;
          return;
        }
        statusEl.textContent = "save cancelled";
        return;
      } catch (e) {
        // Original unavailable (offline + uncached): fall through to PNG.
      }
    }
    if ((top || bottom) && entryIsGif && (keyOf || urlOf)) {
      try {
        const saved = await native.saveMemeCaptionedGif(
          state.memeOutputDir || "",
          `meme-${Date.now()}`,
          keyOf,
          urlOf,
          capTop.value,
          capBottom.value
        );
        if (saved) {
          statusEl.textContent = `saved: ${saved.path} (animated GIF with caption)`;
          statusEl.title = saved.path;
          return;
        }
        statusEl.textContent = "save cancelled";
        return;
      } catch (e) {
        // Animated export failed (no font, too many frames, …): fall
        // through to the static PNG render below.
      }
    }
    try {
      const pngBase64 = await exportMemePng(memeFocusUri, capTop.value, capBottom.value);
      const filename = `meme-${Date.now()}.png`;
      const dest = await native.saveMemePng(state.memeOutputDir || "", filename, pngBase64);
      const note = top || bottom
        ? entryIsGif ? " (static PNG — animated export failed)" : ""
        : sourceTried
          ? " (original unavailable — static PNG)"
          : "";
      statusEl.textContent = dest ? `saved: ${dest}${note}` : "save cancelled";
      statusEl.title = dest || "";
    } catch (e) {
      statusEl.textContent = `export failed: ${e.message || e}`;
    }
    } finally {
      btn.disabled = false;
    }
  });
  sec.querySelector("#meme-search-go").addEventListener("click", () => {
    const q = sec.querySelector("#meme-search").value.trim();
    if (!q) return;
    native.openUrl(memeEngine().replace("{q}", encodeURIComponent(q)));
  });
  sec.querySelector("#meme-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sec.querySelector("#meme-search-go").click();
  });
  const addUrl = async () => {
    const inp = sec.querySelector("#meme-focus-url");
    const url = inp.value.trim();
    if (!url) return;
    const statusEl = sec.querySelector(".meme-focus-status");
    statusEl.textContent = "fetching…";
    try {
      await native.fetchImageCached(url);
      const col = memeCollection();
      if (col.length >= MEME_MAX_ENTRIES) {
        statusEl.textContent = `collection full (${MEME_MAX_ENTRIES})`;
        return;
      }
      if (col.some((e) => e.sourceUrl === url)) {
        statusEl.textContent = "already in collection";
        return;
      }
      col.push({ id: "m" + Date.now(), name: url.slice(-32), sourceUrl: url, cacheKey: null, ext: memeExtOf(url), addedAt: Date.now() });
      inp.value = "";
      statusEl.textContent = "";
      saveState();
      render();
      renderMemeFocusGrid();
      if (document.getElementById("meme-list")) renderMemeSettings();
    } catch (e) {
      statusEl.textContent = `failed: ${e.message || e}`;
    }
  };
  sec.querySelector("#meme-focus-add").addEventListener("click", addUrl);
  sec.querySelector("#meme-focus-browse").addEventListener("click", async () => {
    const statusEl = sec.querySelector(".meme-focus-status");
    try {
      const p = await native.pickImage();
      if (!p) return;
      const ref = await native.importImageFile(p);
      const col = memeCollection();
      if (col.length >= MEME_MAX_ENTRIES) {
        statusEl.textContent = `collection full (${MEME_MAX_ENTRIES})`;
        return;
      }
      if (!ref || !ref.key || col.some((e) => e.cacheKey === ref.key)) {
        statusEl.textContent = "already in collection";
        return;
      }
      const entry = {
        id: "m" + Date.now(),
        name: p.split(/[\\/]/).pop() || "image",
        sourceUrl: null,
        cacheKey: ref.key,
        ext: memeExtOf(p),
        addedAt: Date.now(),
      };
      col.push(entry);
      memeUriCache.set(entry.id, ref.uri);
      statusEl.textContent = "";
      saveState();
      render();
      renderMemeFocusGrid();
      if (document.getElementById("meme-list")) renderMemeSettings();
    } catch (e) {
      statusEl.textContent = `failed: ${e.message || e}`;
    }
  });
}

async function exportMemePng(imgSrc, top, bottom) {
  if (!imgSrc) throw new Error("no image to export");
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error("image didn't load"));
    img.src = imgSrc;
  });
  const canvas = document.createElement("canvas");
  const w = img.naturalWidth || 800;
  const h = img.naturalHeight || 600;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  const drawCaption = (text, topSide) => {
    const clean = (text || "").trim();
    if (!clean) return;
    const size = Math.max(16, Math.floor(w / 10));
    ctx.font = `bold ${size}px Impact, 'Arial Black', sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(2, Math.round(size / 12));
    ctx.lineJoin = "round";
    // Simple word wrap across the full width.
    const words = clean.toUpperCase().split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > w * 0.94 && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    const step = size * 1.12;
    lines.forEach((ln, i) => {
      const y = topSide ? size * 0.4 + step * (i + 1) : h - size * 0.4 - step * (lines.length - 1 - i);
      ctx.strokeText(ln, w / 2, y);
      ctx.fillText(ln, w / 2, y);
    });
  };
  drawCaption(top, true);
  drawCaption(bottom, false);
  // Return base64 (no data-URI prefix): the Rust save command validates the
  // PNG magic bytes and writes the file, reporting the exact path.
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("canvas export failed");
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ---------------------------------------------------------------------------
// Calendar tile: month grid with the Vietnamese lunar calendar (âm lịch),
// moon phases and public-holiday highlights. Weekday/month labels are shown
// bilingual (ES/DE); holiday names stay native with ES/DE translations in the
// hover tooltip. Lunar maths lives in src/lunar.js; holidays in src/holidays.js.
// ---------------------------------------------------------------------------
const CAL_MONTHS = [
  ["Enero", "Januar"], ["Febrero", "Februar"], ["Marzo", "März"], ["Abril", "April"],
  ["Mayo", "Mai"], ["Junio", "Juni"], ["Julio", "Juli"], ["Agosto", "August"],
  ["Septiembre", "September"], ["Octubre", "Oktober"], ["Noviembre", "November"], ["Diciembre", "Dezember"],
];
const CAL_DAYS_MON = [["Lun", "Mon"], ["Mar", "Die"], ["Mié", "Mit"], ["Jue", "Don"], ["Vie", "Fre"], ["Sáb", "Sam"], ["Dom", "Son"]];
const CAL_DAYS_SUN = [["Dom", "Son"], ["Lun", "Mon"], ["Mar", "Die"], ["Mié", "Mit"], ["Jue", "Don"], ["Vie", "Fre"], ["Sáb", "Sam"]];
const CAL_TZ = 7; // Vietnamese lunar reference (UTC+7)

function calendarOpts(c) {
  const d = c.data || (c.data = {});
  if (!d.weekStart) d.weekStart = "mon";
  if (d.moonPhase === undefined) d.moonPhase = true;
  d.holidays = d.holidays || {};
  for (const k of ["vietnam", "germany", "pakistan"]) {
    if (d.holidays[k] === undefined) d.holidays[k] = false;
  }
  return d;
}

function renderCalendarBody(c, body) {
  if (!window.Lunar || !window.Holidays) {
    body.innerHTML = `<div class="muted">Calendar engine unavailable.</div>`;
    return;
  }
  const opts = calendarOpts(c);
  const dayNames = opts.weekStart === "sun" ? CAL_DAYS_SUN : CAL_DAYS_MON;
  let viewY = new Date().getFullYear();
  let viewM = new Date().getMonth();

  const paint = () => {
    if (!body.isConnected) return;
    const today = new Date(); // recomputed each paint so midnight rollover works
    const first = new Date(viewY, viewM, 1);
    const startIdx = (first.getDay() + (opts.weekStart === "sun" ? 0 : 6)) % 7;
    const gridStart = new Date(viewY, viewM, 1 - startIdx);
    const daysInMonth = new Date(viewY, viewM + 1, 0).getDate();
    const rows = Math.ceil((startIdx + daysInMonth) / 7);
    const total = rows * 7;
    const gridEnd = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + total - 1);
    const hol = window.Holidays.forRange(gridStart, gridEnd, opts.holidays);
    const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

    let cells = "";
    for (let i = 0; i < total; i++) {
      const dt = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      const inMonth = dt.getMonth() === viewM;
      const key = `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
      const [ld, lm, , leap] = window.Lunar.fromDate(dt, CAL_TZ);
      const moon = opts.moonPhase ? window.Lunar.moonPhase(ld) : null;
      const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
      const hs = hol.get(iso) || [];
      const tips = hs.map((h) => {
        const tr = [];
        if (h.es) tr.push(h.es);
        if (h.de && h.de !== h.name) tr.push(h.de);
        return tr.length ? `${h.name} — ${tr.join(" / ")}` : h.name;
      });
      const lunarLabel = ld === 1 ? `${ld}/${lm}${leap ? "n" : ""}` : `${ld}`;
      const cls = `cal-cell${inMonth ? "" : " dim"}${key === todayKey ? " today" : ""}${hs.length ? " holiday" : ""}`;
      cells += `<div class="${cls}"${tips.length ? ` title="${escapeHtml(tips.join(" · "))}"` : ""}>` +
        `<span class="cal-solar">${dt.getDate()}</span>` +
        `<span class="cal-lunar">${lunarLabel}${moon ? ` <span class="cal-moon">${moon.emoji}</span>` : ""}</span></div>`;
    }

    const [tld, tlm] = window.Lunar.fromDate(today, CAL_TZ);
    const tphase = window.Lunar.moonPhase(tld);
    body.innerHTML = `
      <div class="cal-root">
        <div class="cal-head">
          <button class="btn ghost icon-btn cal-prev" title="Previous month">‹</button>
          <span class="cal-title">${CAL_MONTHS[viewM][0]}/${CAL_MONTHS[viewM][1]} ${viewY}</span>
          <button class="btn ghost icon-btn cal-next" title="Next month">›</button>
          <button class="btn ghost cal-today">Hoy/Heute</button>
        </div>
        <div class="cal-today-line">${tphase.emoji} ${tld}/${tlm} · ${escapeHtml(tphase.es)} / ${escapeHtml(tphase.de)}</div>
        <div class="cal-week">${dayNames.map(([es, de]) => `<span class="cal-wd">${es}/${de}</span>`).join("")}</div>
        <div class="cal-grid">${cells}</div>
      </div>
    `;
    body.querySelector(".cal-prev").addEventListener("click", () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } paint(); });
    body.querySelector(".cal-next").addEventListener("click", () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } paint(); });
    body.querySelector(".cal-today").addEventListener("click", () => { const n = new Date(); viewY = n.getFullYear(); viewM = n.getMonth(); paint(); });
  };
  paint();

  // Move the "today" highlight at midnight (once a minute is plenty). Repaint in
  // place — a full render() wouldn't rebuild this tile (its body signature is
  // unchanged when only the date moves).
  let startDay = new Date().toDateString();
  const t = setInterval(() => {
    const k = new Date().toDateString();
    if (k !== startDay) {
      startDay = k;
      paint();
    }
  }, 60000);
  addTimer(body, t);
}

let selectedCalendarId = null;
function findCalendarComp() {
  return state.compartments.find((c) => c.id === selectedCalendarId && c.kind === "calendar")
    ?? state.compartments.find((c) => c.kind === "calendar")
    ?? null;
}
function renderCalendarSettings() {
  const panel = document.getElementById("calendar-list");
  if (!panel) return;
  const comp = findCalendarComp();
  const comps = state.compartments.filter((c) => c.kind === "calendar");

  panel.innerHTML = "";
  if (!comp) {
    const hint = document.createElement("div");
    hint.className = "item-row";
    hint.innerHTML = `<span class="muted">No Calendar tile yet — add one from Grid &gt; Add a tile.</span>`;
    panel.appendChild(hint);
    return;
  }
  const opts = calendarOpts(comp);

  const selectorRow = document.createElement("div");
  selectorRow.className = "item-row";
  selectorRow.innerHTML = `
    <label>Tile</label>
    <select id="calendar-select">
      ${comps.map((c) => `<option value="${c.id}" ${c.id === comp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`).join("")}
    </select>`;
  panel.appendChild(selectorRow);
  appendCollapsibleRow(panel, comp);
  appendAppearanceRow(panel, comp);

  const optRow = document.createElement("div");
  optRow.className = "item-row";
  optRow.innerHTML = `
    <label>Week starts
      <select id="cal-week">
        <option value="mon" ${opts.weekStart === "mon" ? "selected" : ""}>Monday</option>
        <option value="sun" ${opts.weekStart === "sun" ? "selected" : ""}>Sunday</option>
      </select>
    </label>
    <label>Moon phase <input type="checkbox" class="switch" id="cal-moon" ${opts.moonPhase ? "checked" : ""} /></label>`;
  panel.appendChild(optRow);

  const holHead = document.createElement("div");
  holHead.className = "item-row";
  holHead.innerHTML = `<label>Holidays</label><span class="muted">highlight public holidays (hover a day for names)</span>`;
  panel.appendChild(holHead);
  const holRow = document.createElement("div");
  holRow.className = "item-row";
  holRow.innerHTML = `
    <label>Vietnam <input type="checkbox" class="cal-hol" data-c="vietnam" ${opts.holidays.vietnam ? "checked" : ""} /></label>
    <label>Germany (Rheinland-Pfalz) <input type="checkbox" class="cal-hol" data-c="germany" ${opts.holidays.germany ? "checked" : ""} /></label>
    <label>Pakistan <input type="checkbox" class="cal-hol" data-c="pakistan" ${opts.holidays.pakistan ? "checked" : ""} /></label>`;
  panel.appendChild(holRow);

  const commit = () => { saveState(); render(); renderCalendarSettings(); };
  panel.querySelector("#calendar-select").addEventListener("change", (e) => { selectedCalendarId = e.target.value; renderCalendarSettings(); });
  panel.querySelector("#cal-week").addEventListener("change", (e) => { comp.data.weekStart = e.target.value; commit(); });
  panel.querySelector("#cal-moon").addEventListener("change", (e) => { comp.data.moonPhase = e.target.checked; commit(); });
  holRow.querySelectorAll(".cal-hol").forEach((b) =>
    b.addEventListener("change", (e) => { comp.data.holidays[e.target.dataset.c] = e.target.checked; commit(); })
  );
}

// ---------------------------------------------------------------------------
// Design tab: global design tokens layered over the current theme. Every control
// writes to state.design and re-applies the CSS variables live. "Reset" (✕)
// removes a token so it falls back to the theme default; presets set a bundle.
// ---------------------------------------------------------------------------
const DESIGN_FONTS = [
  ["System UI", '"Segoe UI", system-ui, sans-serif'],
  ["Segoe UI", '"Segoe UI", sans-serif'],
  ["Arial", "Arial, Helvetica, sans-serif"],
  ["Verdana", "Verdana, Geneva, sans-serif"],
  ["Tahoma", "Tahoma, sans-serif"],
  ["Trebuchet MS", '"Trebuchet MS", sans-serif'],
  ["Georgia", 'Georgia, "Times New Roman", serif'],
  ["Cambria", "Cambria, Georgia, serif"],
  ["Times New Roman", '"Times New Roman", Times, serif'],
  ["Consolas", 'Consolas, "Courier New", monospace'],
  ["Courier New", '"Courier New", monospace'],
  ["sans-serif", "sans-serif"],
  ["serif", "serif"],
  ["monospace", "monospace"],
];
const DESIGN_SHADOWS = [
  ["None", "none"],
  ["Soft", "0 4px 16px rgba(0,0,0,0.35)"],
  ["Medium", "0 10px 30px rgba(0,0,0,0.5)"],
  ["Hard", "0 14px 40px rgba(0,0,0,0.65)"],
  ["Glow", "0 0 16px var(--accent)"],
];
const DESIGN_PRESETS = {
  Default: null,
  Glass: { panel: "rgba(34,34,46,0.55)", panel2: "rgba(48,48,64,0.5)", borderColor: "rgba(255,255,255,0.14)", tileBg: "rgba(34,34,46,0.45)", tileBorderColor: "rgba(255,255,255,0.16)", radiusTile: 18, radiusButton: 12, tileShadow: "0 8px 30px rgba(0,0,0,0.45)", rowBg: "rgba(255,255,255,0.03)" },
  Neon: { bg: "#06090c", panel: "#0a1014", panel2: "#0e161c", borderColor: "#123a3a", accent: "#00ffc8", tileBorderColor: "#00ffc8", tileBorderWidth: 1, tileShadow: "0 0 14px rgba(0,255,200,0.30)", btnBg: "transparent", radiusButton: 4 },
  Soft: { radiusGlobal: 18, radiusTile: 20, radiusButton: 12, radiusInput: 12, panel: "#22222c", panel2: "#2c2c38", tileShadow: "0 6px 20px rgba(0,0,0,0.35)" },
  Terminal: { bg: "#050505", panel: "#0b0f0b", panel2: "#101510", borderColor: "#1c2a1c", text: "#c6ffc6", muted: "#5f7f5f", accent: "#33ff66", font: 'Consolas, "Courier New", monospace', radiusGlobal: 2, radiusTile: 2, radiusButton: 2, tileBorderColor: "#33ff66" },
};

function renderDesignSettings() {
  const panel = document.getElementById("design-list");
  if (!panel) return;
  state.design = state.design || {};
  panel.innerHTML = "";
  // Live apply on every input, but debounce the (IPC) save so dragging a slider
  // doesn't spam save_state. Discrete changes save immediately.
  let saveT = 0;
  const apply = () => { applyAppearance(); clearTimeout(saveT); saveT = setTimeout(saveState, 300); };
  const applyNow = () => { applyAppearance(); saveState(); };
  const heading = (text) => {
    const h = document.createElement("h3");
    h.textContent = text;
    panel.appendChild(h);
  };
  const colorRow = (label, key, fallback) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<label>${label}</label>
      <input type="color" class="d-input" value="${state.design[key] || fallback}" />
      <button class="btn ghost d-reset" title="Reset">✕</button>`;
    panel.appendChild(row);
    row.querySelector(".d-input").addEventListener("input", (e) => { state.design[key] = e.target.value; apply(); });
    row.querySelector(".d-reset").addEventListener("click", () => { delete state.design[key]; applyNow(); renderDesignSettings(); });
  };
  const numRow = (label, key, min, max, step, unit, fallback) => {
    const cur = state.design[key] != null ? state.design[key] : fallback;
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<label>${label}</label>
      <input type="range" class="d-input" min="${min}" max="${max}" step="${step}" value="${cur}" />
      <span class="d-val">${cur}${unit}</span>
      <button class="btn ghost d-reset" title="Reset">✕</button>`;
    panel.appendChild(row);
    const val = row.querySelector(".d-val");
    row.querySelector(".d-input").addEventListener("input", (e) => { state.design[key] = Number(e.target.value); val.textContent = `${e.target.value}${unit}`; apply(); });
    row.querySelector(".d-reset").addEventListener("click", () => { delete state.design[key]; applyNow(); renderDesignSettings(); });
  };
  const selectRow = (label, key, options, fallback) => {
    const cur = state.design[key] != null ? state.design[key] : fallback;
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `<label>${label}</label>
      <select class="d-input">${options.map(([l, v]) => `<option value="${escapeHtml(v)}" ${v === cur ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>
      <button class="btn ghost d-reset" title="Reset">✕</button>`;
    panel.appendChild(row);
    row.querySelector(".d-input").addEventListener("change", (e) => { state.design[key] = e.target.value; applyNow(); });
    row.querySelector(".d-reset").addEventListener("click", () => { delete state.design[key]; applyNow(); renderDesignSettings(); });
  };

  // Spotify cover colours — dedicated section at the top of the Design tab.
  heading("Spotify cover colors");
  const dynRow = document.createElement("div");
  dynRow.className = "item-row";
  dynRow.innerHTML = `
    <label>Use Spotify cover color <input type="checkbox" class="switch" id="dyn-spotify" ${state.design.dynamicSpotify ? "checked" : ""} /></label>
    <span class="dyn-swatch" id="dyn-swatch" title="Current cover accent"></span>
    <span class="muted" id="dyn-status"></span>`;
  panel.appendChild(dynRow);
  dynRow.querySelector("#dyn-spotify").addEventListener("change", (e) => {
    state.design.dynamicSpotify = e.target.checked;
    applyAppearance();
    saveState();
    void refreshDynamicPalette(true);
    updateDynSwatch();
  });
  numRow("Accent blend", "dynAccentMix", 0, 100, 5, "%", 60);
  numRow("Background blend", "dynBgMix", 0, 100, 5, "%", 35);
  numRow("Surfaces blend", "dynSurfaceMix", 0, 100, 5, "%", 30);
  updateDynSwatch();

  // Presets
  const presetRow = document.createElement("div");
  presetRow.className = "item-row";
  presetRow.innerHTML = `<label>Presets</label>` +
    Object.keys(DESIGN_PRESETS).map((k) => `<button class="btn ghost design-preset" data-p="${k}">${k}</button>`).join("");
  panel.appendChild(presetRow);
  presetRow.querySelectorAll(".design-preset").forEach((b) =>
    b.addEventListener("click", () => {
      const p = DESIGN_PRESETS[b.dataset.p];
      state.design = p ? { ...p } : {};
      applyNow();
      renderDesignSettings();
    })
  );

  heading("Background");
  colorRow("Board color", "bg", "#101014");
  const gradOn = !!(state.design.bgFrom && state.design.bgTo);
  const gradRow = document.createElement("div");
  gradRow.className = "item-row";
  gradRow.innerHTML = `<label>Gradient <input type="checkbox" class="d-input switch" ${gradOn ? "checked" : ""} /></label>`;
  panel.appendChild(gradRow);
  gradRow.querySelector(".d-input").addEventListener("change", (e) => {
    if (e.target.checked) {
      state.design.bgFrom = state.design.bgFrom || "#101014";
      state.design.bgTo = state.design.bgTo || "#2a1a4a";
    } else {
      delete state.design.bgFrom;
      delete state.design.bgTo;
    }
    applyNow();
    renderDesignSettings();
  });
  if (gradOn) {
    colorRow("Gradient from", "bgFrom", "#101014");
    colorRow("Gradient to", "bgTo", "#2a1a4a");
    numRow("Gradient angle", "bgAngle", 0, 360, 5, "°", 135);
  }

  heading("Surfaces & borders");
  colorRow("Panel", "panel", "#1a1a20");
  colorRow("Panel 2", "panel2", "#23232b");
  colorRow("Border color", "borderColor", "#2c2c36");
  colorRow("Tile border", "tileBorderColor", "#2c2c36");
  numRow("Tile border width", "tileBorderWidth", 0, 6, 1, "px", 1);

  heading("Radius");
  numRow("Global", "radiusGlobal", 0, 28, 1, "px", state.cornerRadius != null ? state.cornerRadius : 10);
  numRow("Tile", "radiusTile", 0, 28, 1, "px", 10);
  numRow("Button", "radiusButton", 0, 24, 1, "px", 6);
  numRow("Input", "radiusInput", 0, 24, 1, "px", 8);

  heading("Typography");
  const fontRow = document.createElement("div");
  fontRow.className = "item-row";
  const curFont = state.design.font || DESIGN_FONTS[0][1];
  const known = DESIGN_FONTS.some(([, v]) => v === curFont);
  fontRow.innerHTML = `<label>Font</label>
    <select class="d-font">${DESIGN_FONTS.map(([l, v]) => `<option value="${escapeHtml(v)}" ${v === curFont ? "selected" : ""}>${escapeHtml(l)}</option>`).join("")}<option value="__custom" ${known ? "" : "selected"}>Custom…</option></select>
    <button class="btn ghost d-reset" title="Reset">✕</button>`;
  panel.appendChild(fontRow);
  const customFontRow = document.createElement("div");
  customFontRow.className = "item-row";
  customFontRow.innerHTML = `<label>Custom font</label><input type="text" class="d-custom-font" placeholder='e.g. "Fira Sans", sans-serif' value="${escapeHtml(known ? "" : curFont)}" /></div>`;
  customFontRow.hidden = known;
  panel.appendChild(customFontRow);
  fontRow.querySelector(".d-font").addEventListener("change", (e) => {
    if (e.target.value === "__custom") {
      customFontRow.hidden = false;
      customFontRow.querySelector(".d-custom-font").focus();
      return;
    }
    state.design.font = e.target.value;
    applyNow();
    renderDesignSettings();
  });
  customFontRow.querySelector(".d-custom-font").addEventListener("change", (e) => {
    const val = e.target.value.trim();
    if (val) { state.design.font = val; applyNow(); }
  });
  fontRow.querySelector(".d-reset").addEventListener("click", () => { delete state.design.font; applyNow(); renderDesignSettings(); });
  numRow("Base size", "fontBase", 11, 22, 1, "px", 16);
  numRow("Heading weight", "headingWeight", 400, 800, 50, "", 600);

  heading("Buttons");
  colorRow("Background", "btnBg", "#23232b");
  colorRow("Text", "btnText", "#e6e6ea");
  colorRow("Border", "btnBorder", "#2c2c36");
  colorRow("Hover background", "btnHoverBg", "#2c2c36");

  heading("Rows, inputs & tiles");
  colorRow("Row background", "rowBg", "#1a1a20");
  colorRow("Input background", "inputBg", "#23232b");
  colorRow("Tile background", "tileBg", "#1a1a20");
  selectRow("Tile shadow", "tileShadow", DESIGN_SHADOWS, "none");

  heading("Accents & effects");
  colorRow("Accent", "accent", "#7c3aed");
  colorRow("Scrollbar thumb", "scrollThumb", "#23232b");
  numRow("Transition speed", "transitionMs", 0, 600, 10, "ms", 150);
}

const KIND_DEFAULTS = {
  launcher: { title: "Folders & Files", data: { items: [] } },
  bookmarks: { title: "Bookmarks", data: { urls: [] } },
  azure: { title: "Azure DevOps", data: { org: "", project: "", repos: [] } },
  system: { title: "System", data: { disks: [] } },
  weather: { title: "Weather", data: { location: { name: "", lat: undefined, lon: undefined } } },
  news: { title: "News", data: { feeds: [] } },
  translate: { title: "Translate", data: { langs: ["EN", "DE", "ES"] } },
  frame: { title: "Frame", data: { path: "", fit: "cover" } },
  spotify: { title: "Spotify", data: {} },
  lyrics: { title: "Lyrics", data: { prevLines: 3, nextLines: 3, offsetMs: 0, align: "left", full: false } },
  vocab: { title: "Vocab", data: { intervalSec: 10 } },
  meme: { title: "Memes", data: { intervalSec: 30 } },
  calendar: { title: "Calendar", data: {} },
  caption: { title: "Captions", data: {} },
  project: { title: "Projects", data: { roots: [] } },
};

// Create a tile of the given kind. `title` overrides the default name; used by
// the Settings "Add a tile" control and the grid right-click menu.
function addTile(kind, title) {
  const d = KIND_DEFAULTS[kind] || KIND_DEFAULTS.launcher;
  const y = state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  const comp = {
    id: "c" + Date.now(),
    kind,
    title: (title || "").trim() || d.title,
    x: 0,
    y,
    w: 4,
    h: 3,
    data: JSON.parse(JSON.stringify(d.data)),
  };
  state.compartments.push(comp);
  if (kind === "launcher") selectedLauncherId = comp.id;
  saveState();
  render();
  // New tiles are placed at the bottom of a tall grid; scroll it into view so
  // the user actually sees what they added.
  gridEl.querySelector(`.compartment[data-id="${comp.id}"]`)?.scrollIntoView({ block: "nearest" });
}

document.getElementById("btn-add-compartment").addEventListener("click", () => {
  const kind = document.getElementById("add-kind").value || "launcher";
  const title = document.getElementById("add-title").value;
  document.getElementById("add-title").value = "";
  addTile(kind, title);
});

document.getElementById("set-cols").addEventListener("change", (e) => {
  state.columns = Math.min(24, Math.max(4, Number(e.target.value) || 12));
  saveState();
  render();
});

document.getElementById("set-theme").addEventListener("change", (e) => {
  state.theme = THEMES[e.target.value] ? e.target.value : "dark";
  saveState();
  applyAppearance();
});
document.getElementById("set-radius").addEventListener("change", (e) => {
  state.cornerRadius = Math.min(24, Math.max(0, Number(e.target.value) || 0));
  saveState();
  applyAppearance();
});
document.getElementById("set-wall").addEventListener("change", (e) => {
  state.wall = e.target.checked;
  saveState();
  applyAppearance();
  render();
});

// ---------------------------------------------------------------------------
// Zoom controls (Settings > Grid). Scaling ROW_H scales the whole grid, so zoom out to
// see off-screen tiles (e.g. ones added far down) and remove them.
// ---------------------------------------------------------------------------
function updateZoomUI() {
  const el = document.getElementById("zoom-level");
  if (el && document.activeElement !== el) el.value = Math.round(zoom * 100);
}
function setZoom(z) {
  zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  state.zoom = zoom;
  saveState();
  updateZoomUI();
  render();
}
// Reset button returns the grid to 100%.
function zoomReset() {
  setZoom(1);
}
document.getElementById("zoom-in").addEventListener("click", () => setZoom(zoom * 1.25));
document.getElementById("zoom-out").addEventListener("click", () => setZoom(zoom / 1.25));
document.getElementById("zoom-fit").addEventListener("click", zoomReset);
document.getElementById("zoom-level").addEventListener("change", (e) => {
  const pct = Number(e.target.value);
  if (!Number.isFinite(pct)) {
    updateZoomUI();
    return;
  }
  setZoom(pct / 100); // setZoom clamps to ZOOM_MIN..ZOOM_MAX and refreshes the input
});

// ---------------------------------------------------------------------------
// Drag + resize gestures (fixed-column grid, snap to cells, collision-safe).
// ---------------------------------------------------------------------------
let gesture = null;

dashboard.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // only left button drags/resizes; right = context menu
  const handle = e.target.closest(".resize-handle");
  const header = e.target.closest(".compartment-header");
  // Don't start a drag when pressing any header button (rename, settings,
  // remove) — those need their click to fire instead of being swallowed.
  if (!handle && (!header || e.target.closest(".header-actions button"))) return;
  const comp = e.target.closest(".compartment");
  if (!comp) return;
  const item = state.compartments.find((c) => c.id === comp.dataset.id);
  if (!item) return;
  // Bare (header-hidden) tiles can't be dragged or resized.
  if (item.hideHeader === true && item.collapsed !== true) return;
  e.preventDefault();
  gesture = { mode: handle ? "resize" : "drag", item, comp, startX: e.clientX, startY: e.clientY };
});

// Right-click: tile menu on a tile (or its collapsed overlay), add-tile menu
// on empty grid space. Text fields keep their native (cut/copy/paste) menu.
dashboard.addEventListener("contextmenu", (e) => {
  if (e.target.closest("input, textarea, [contenteditable]")) return;
  const tile = e.target.closest(".compartment, .compartment-overlay");
  e.preventDefault();
  if (tile && tile.dataset.id) {
    openTileMenu(e.clientX, e.clientY, tile.dataset.id);
  } else {
    openGridMenu(e.clientX, e.clientY);
  }
});

dashboard.addEventListener("mousemove", (e) => {
  if (!gesture) return;
  // Pointer deltas are screen px; the grid is CSS-scaled by `zoom`, so convert
  // to unscaled grid px before snapping to cells.
  const dx = (e.clientX - gesture.startX) / zoom;
  const dy = (e.clientY - gesture.startY) / zoom;
  const cw = cellWidth();
  const item = gesture.item;

  if (gesture.mode === "drag") {
    const nx = clamp(Math.round((item.x * cw + dx) / cw), 0, state.columns - item.w);
    const ny = Math.max(0, Math.round((item.y * ROW_H + dy) / ROW_H));
    gesture.comp.style.left = `${GUTTER / 2 + nx * cw}px`;
    gesture.comp.style.top = `${GUTTER / 2 + ny * ROW_H}px`;
    gesture._nx = nx;
    gesture._ny = ny;
    gesture.moved = nx !== item.x || ny !== item.y;
  } else {
    const nw = clamp(item.w + Math.round(dx / cw), 1, state.columns - item.x);
    const nh = Math.max(1, item.h + Math.round(dy / ROW_H));
    gesture.comp.style.width = `${nw * cw - GUTTER}px`;
    gesture.comp.style.height = `${nh * ROW_H - GUTTER}px`;
    gesture._nw = nw;
    gesture._nh = nh;
    gesture.moved = nw !== item.w || nh !== item.h;
  }
});

dashboard.addEventListener("mouseup", () => {
  if (!gesture) return;
  const item = gesture.item;
  if (gesture.mode === "drag") {
    if (gesture.moved) {
      item.x = gesture._nx;
      item.y = gesture._ny;
      resolveCollisions(item);
    }
  } else if (gesture.moved) {
    item.w = gesture._nw;
    item.h = gesture._nh;
    resolveCollisions(item);
  }
  gesture = null;
  saveState();
  render();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
const LOADING_DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
// "Loading news" + three pulsing dots, for tile placeholders.
function loadingHtml(label) {
  return `${escapeHtml(label)}${LOADING_DOTS}`;
}
function hostOf(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h || url;
  } catch {
    return url;
  }
}
// Favicons are fetched and cached to disk by the native cache_favicon command
// (returns a data: URI), then memoized here so re-renders don't re-invoke it.
const faviconCache = new Map();
async function faviconData(url) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return "";
  }
  if (!host) return "";
  if (faviconCache.has(host)) return faviconCache.get(host);
  let data = "";
  try {
    data = (await native.cacheFavicon(host)) || "";
  } catch {
    data = "";
  }
  faviconCache.set(host, data);
  return data;
}
// A favicon <img> (cached data URI) over a letter-avatar fallback. If the image
// fails, the letter shows through (the img hides itself via onerror).
function faviconHtml(src, label) {
  const letter = (label || "?").trim().charAt(0).toUpperCase() || "?";
  return `<span class="favicon"><span class="favicon-letter">${escapeHtml(letter)}</span>${
    src ? `<img class="favicon-img" src="${escapeHtml(src)}" alt="" loading="lazy" onerror="this.remove()" />` : ""
  }</span>`;
}

function fmtUptime(secs) {
  const s = Math.max(0, Number(secs) || 0);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

// Entry. Browser localStorage remains a prototype-mode fallback. In the desktop
// app, load (or migrate to) the native app-data file before keeping it current.
async function initialize() {
  if (window.__TAURI__) {
    try {
      const nativeState = await native.loadState();
      if (nativeState) {
        state = { ...structuredClone(DEFAULT_STATE), ...JSON.parse(nativeState) };
      } else {
        saveState();
      }
    } catch (e) {
      console.error("Failed to load app state", e);
    }
    setupDragDrop();
  }
  buildMemeFocusShell();
  zoom = clamp(state.zoom || 1, ZOOM_MIN, ZOOM_MAX);
  updateZoomUI();
  applyAppearance();
  // Sync the Grid-tab appearance controls with the loaded state.
  document.getElementById("set-theme").value = THEMES[state.theme] ? state.theme : "dark";
  document.getElementById("set-radius").value = state.cornerRadius != null ? state.cornerRadius : 10;
  document.getElementById("set-wall").checked = state.wall === true;
  // Restore background mode + autostart checkbox across restarts. Autostart
  // itself persists OS-side; only the checkbox needs syncing.
  document.getElementById("set-background").checked = state.backgroundMode === true;
  try {
    document.getElementById("set-autostart").checked = await native.autostartEnabled().catch(() => false);
  } catch {
    document.getElementById("set-autostart").checked = false;
  }
  try {
    await applyBackgroundMode(state.backgroundMode === true);
  } catch (e) {
    console.error("Failed to restore background mode", e);
  }
  if (state.previewWidth) {
    previewEl.style.width = `${state.previewWidth}px`;
    previewWidthEl.value = state.previewWidth;
  }
  render();
  // Re-render once the layout has settled: the very first render can measure the
  // dashboard before the window reaches its final size, leaving tiles sized for
  // the wrong width until the next interaction.
  requestAnimationFrame(() => render());
  startBackupScheduler();
  updateBackupTabBadge();
}

// Re-fit the grid whenever the viewport changes (window resize, maximize, etc.).
// Without this, tiles keep the cell width measured at first paint.
let resizeRaf = 0;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => render());
});

// ---------------------------------------------------------------------------
// OS drag-and-drop: dropping a folder or .sln from the OS file explorer onto a
// Folders & Solutions tile adds it to that tile's items (same as Settings).
// ---------------------------------------------------------------------------
async function setupDragDrop() {
  const win = window.__TAURI__.webviewWindow.getCurrentWebviewWindow();
  // scaleFactor() is async and returns a Promise; resolve it once up front so the
  // drop handler can convert physical drop pixels to CSS coordinates correctly.
  const scale = (await window.__TAURI__.window.getCurrentWindow().scaleFactor()) || 1;
  win.onDragDropEvent(async (event) => {
    const { type, paths, position } = event.payload;
    const x = position ? position.x / scale : 0;
    const y = position ? position.y / scale : 0;
    const targetAt = (point) =>
      // Match both normal tiles and collapsed-tile overlays; both carry the
      // compartment id in data-id so a drop on an open overlay targets its tile.
      [...gridEl.querySelectorAll(".compartment, .compartment-overlay")].find((el) => {
        const r = el.getBoundingClientRect();
        return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
      });

    if (type === "over") {
      gridEl.querySelectorAll(".compartment.drag-over").forEach((el) => el.classList.remove("drag-over"));
      const over = targetAt({ x, y });
      const overKind = over ? state.compartments.find((c) => c.id === over.dataset.id)?.kind : null;
      if (over && (overKind === "launcher" || overKind === "meme")) {
        over.classList.add("drag-over");
      }
      return;
    }
    if (type === "leave") {
      gridEl.querySelectorAll(".compartment.drag-over").forEach((el) => el.classList.remove("drag-over"));
      return;
    }
    if (type !== "drop") return;
    gridEl.querySelectorAll(".compartment.drag-over").forEach((el) => el.classList.remove("drag-over"));
    if (!paths || !paths.length) return;

    // Meme drop zone in the expanded view wins over grid tiles while open.
    const dz = document.querySelector("#meme-focus:not(.hidden) .meme-drop");
    if (dz && paths && paths.length) {
      const r = dz.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        await importMemeFiles(paths);
        renderMemeFocusGrid();
        if (document.getElementById("meme-list")) renderMemeSettings();
        return;
      }
    }

    // Find the launcher tile under the drop point.
    const target = targetAt({ x, y });
    if (!target) return;
    const comp = state.compartments.find((c) => c.id === target.dataset.id);
    if (!comp) return;
    if (comp.kind === "meme") {
      await importMemeFiles(paths);
      if (document.getElementById("meme-list")) renderMemeSettings();
      if (focusCtx?.kind === "meme") renderMemeFocusGrid();
      return;
    }
    if (comp.kind !== "launcher") return;

    comp.data = comp.data || {};
    comp.data.items = comp.data.items || [];

    for (const p of paths) {
      const kind = await native.classifyPath(p);
      if (kind === "missing") continue;
      const itemKind = kind === "dir" ? "folder" : kind === "sln" ? "solution" : "file";
      const label = p.split(/[\\/]/).pop() || p;
      if (comp.data.items.some((it) => it.path === p)) continue; // no dupes
      comp.data.items.push({ kind: itemKind, label, path: p });
    }
    comp.data.items.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }));
    saveState();
    render();
  });
}

void initialize();
