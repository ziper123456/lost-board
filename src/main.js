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
  compartments: [
    { id: "sys", kind: "system", title: "System", x: 0, y: 0, w: 3, h: 2 },
    { id: "wea", kind: "weather", title: "Weather", x: 3, y: 0, w: 3, h: 2, data: { location: "" } },
    { id: "bmk", kind: "bookmarks", title: "Bookmarks", x: 6, y: 0, w: 6, h: 2, data: { urls: [] } },
    { id: "lch", kind: "launcher", title: "Folders & Files", x: 0, y: 2, w: 6, h: 3, data: { items: [] } },
  ],
};

// Built-in themes: CSS variable palettes applied to :root.
const THEMES = {
  dark: { bg: "#101014", panel: "#1a1a20", panel2: "#23232b", border: "#2c2c36", text: "#e6e6ea", muted: "#9a9aa6", accent: "#7c3aed" },
  light: { bg: "#f4f4f7", panel: "#ffffff", panel2: "#eceef2", border: "#d7d9e0", text: "#1c1c22", muted: "#6b6b76", accent: "#7c3aed" },
  midnight: { bg: "#0a0e14", panel: "#111722", panel2: "#18202e", border: "#243044", text: "#dbe4f0", muted: "#7d8ca3", accent: "#38bdf8" },
  emerald: { bg: "#0b1512", panel: "#0f1c18", panel2: "#15251f", border: "#1f3a30", text: "#e0f0e8", muted: "#7fa593", accent: "#10b981" },
  amber: { bg: "#16120a", panel: "#1f180d", panel2: "#2a2113", border: "#3a2f1c", text: "#f2ead9", muted: "#a89570", accent: "#f59e0b" },
};

// Apply theme palette, corner radius and wall pattern to the document.
function applyAppearance() {
  const t = THEMES[state.theme] || THEMES.dark;
  const root = document.documentElement.style;
  root.setProperty("--bg", t.bg);
  root.setProperty("--panel", t.panel);
  root.setProperty("--panel-2", t.panel2);
  root.setProperty("--border", t.border);
  root.setProperty("--text", t.text);
  root.setProperty("--muted", t.muted);
  root.setProperty("--accent", t.accent);
  root.setProperty("--radius", `${state.cornerRadius != null ? state.cornerRadius : 10}px`);
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
  async setAutostart(enabled) {
    if (window.__TAURI__) return invoke("set_autostart", { enabled });
  },
  async autostartEnabled() {
    if (window.__TAURI__) return invoke("autostart_enabled");
    return false;
  },
  async readVocabCards(count) {
    if (window.__TAURI__) return invoke("read_vocab_cards", { count });
    return [];
  },
  async openVocabPopup(lang) {
    if (window.__TAURI__) return invoke("open_vocab_popup", { lang });
    return "disabled";
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

function addTimer(body, t) {
  if (!compartmentTimers.has(body)) compartmentTimers.set(body, []);
  compartmentTimers.get(body).push(t);
}
function clearBodyTimers(body) {
  const arr = compartmentTimers.get(body);
  if (arr) {
    arr.forEach(clearInterval);
    compartmentTimers.delete(body);
  }
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
    icon: c.icon ? `${c.icon.type}:${c.icon.value}` : "",
    ic: c.iconColor || "",
    hc: c.headerColor || "",
    cc: c.contentColor || "",
  });
}
function tileBodySig(c) {
  return JSON.stringify({ k: c.kind, d: c.data || {} });
}
function buildHeaderHtml(c) {
  const collapsed = c.collapsed === true;
  const collapsible = c.collapsible !== false;
  const icon = c.icon
    ? c.icon.type === "file" && c.icon.value
      ? c.iconColor
        ? `<span class="tile-icon"><span class="tile-icon-mask" style="background-color:${escapeHtml(c.iconColor)};-webkit-mask-image:url('${escapeHtml(c.icon.value)}');mask-image:url('${escapeHtml(c.icon.value)}')"></span></span>`
        : `<span class="tile-icon"><img src="${escapeHtml(c.icon.value)}" alt="" /></span>`
      : c.icon.type === "text" && c.icon.value
        ? `<span class="tile-icon">${escapeHtml(c.icon.value)}</span>`
        : ""
    : "";
  return `
    <div class="compartment-header">
      <span class="comp-title-wrap">${icon}<span class="comp-title">${escapeHtml(c.title)}</span></span>
      <div class="header-actions">
        ${collapsible ? `<button class="btn ghost icon-btn collapse" data-id="${c.id}" title="${collapsed ? "Open" : "Collapse"}">${ICON.collapse(collapsed)}</button>` : ""}
        <button class="btn ghost icon-btn preview-tile" data-id="${c.id}" title="Preview">${ICON.preview}</button>
        <button class="btn ghost icon-btn settings-tile" data-id="${c.id}" title="Settings">${ICON.settings}</button>
        <button class="btn ghost icon-btn rename" data-id="${c.id}" title="Rename">${ICON.rename}</button>
        <button class="btn ghost icon-btn remove" data-id="${c.id}" title="Remove">${ICON.remove}</button>
      </div>
    </div>
    <div class="compartment-body" data-id="${c.id}"></div>
    <div class="resize-handle" title="Resize"></div>
  `;
}
function wireHeader(rec, c) {
  const el = rec.el;
  el.querySelector(".collapse")?.addEventListener("click", (e) => {
    e.stopPropagation();
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
  });
  el.querySelector(".preview-tile").addEventListener("click", (e) => {
    e.stopPropagation();
    openPreview(c.id);
  });
  el.querySelector(".settings-tile").addEventListener("click", (e) => {
    e.stopPropagation();
    openTileSettings(c.id);
  });
  el.querySelector(".rename").addEventListener("click", (e) => {
    e.stopPropagation();
    const span = el.querySelector(".comp-title");
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
  });
  el.querySelector(".remove").addEventListener("click", (e) => {
    e.stopPropagation();
    state.compartments = state.compartments.filter((x) => x.id !== c.id);
    openTiles.delete(c.id);
    saveState();
    render();
  });
}

// Live tile elements by compartment id, so re-renders reuse them instead of
// rebuilding the whole board.
const tileEls = new Map();
const overlayEls = new Map();

function render() {
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
    if (collapsed) rec.el.style.height = `${ROW_H - GUTTER}px`;
    // Per-tile colors (CSS variables consumed by the header/body).
    rec.el.style.setProperty("--tile-header", c.headerColor || "transparent");
    rec.el.style.setProperty("--tile-content", c.contentColor || "transparent");

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
    const renderStats = async () => {
      const s = await native.systemStats();
      body.innerHTML = `
        <div class="meter"><span>CPU</span><div class="bar"><div class="fill" style="width:${s.cpu_percent}%"></div></div><span>${s.cpu_percent.toFixed(0)}%</span></div>
        <div class="meter"><span>RAM</span><div class="bar"><div class="fill" style="width:${s.ram_percent}%"></div></div><span>${s.ram_percent.toFixed(0)}%</span></div>
        <div class="muted">${fmtBytes(s.ram_used_bytes)} / ${fmtBytes(s.ram_total_bytes)}</div>`;
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
    body.innerHTML = `<div class="muted">Loading news…</div>`;
    renderNewsFeeds(c, body, feeds);
  } else if (c.kind === "translate") {
    renderTranslateBody(c, body);
  } else if (c.kind === "frame") {
    renderFrameBody(c, body);
  } else if (c.kind === "spotify") {
    renderSpotifyBody(c, body);
  } else if (c.kind === "project") {
    renderProjectsBody(c, body);
  } else if (c.kind === "vocab") {
    renderVocabBody(c, body);
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
      vals[Number(e.target.dataset.i)] = e.target.value;
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
  if (!v.vocabAppUrl) v.vocabAppUrl = "http://localhost:5173";
  return v;
}

async function renderVocabBody(c, body) {
  const intervalSec = Math.max(3, Number(c.data?.intervalSec) || 10);
  let cards = [];
  try {
    cards = await native.readVocabCards(20);
  } catch {
    cards = [];
  }
  if (!body.isConnected) return;
  if (!cards.length) {
    body.innerHTML = `<div class="muted">No vocabulary cards — check Settings > Vocab.</div>`;
    return;
  }
  body.innerHTML = `
    <div class="vocab-card">
      <div class="vocab-en"></div>
      <div class="vocab-other"></div>
    </div>
    <button class="btn ghost vocab-open" title="Open the full vocab-app">Open vocab-app</button>
  `;
  const enEl = body.querySelector(".vocab-en");
  const otherEl = body.querySelector(".vocab-other");
  let i = 0;
  const show = () => {
    if (!body.isConnected) return;
    const card = cards[i % cards.length];
    enEl.textContent = card.en;
    otherEl.textContent = `${card.es} • ${card.de}`;
    i += 1;
    if (i % cards.length === 0) {
      // Refresh the batch every full cycle so rotation never goes stale.
      native.readVocabCards(20).then((fresh) => { if (fresh.length) cards = fresh; }).catch(() => {});
    }
  };
  show();
  const t = setInterval(show, intervalSec * 1000);
  addTimer(body, t);
  body.querySelector(".vocab-open").addEventListener("click", () => {
    native.openUrl(vocabConfig().vocabAppUrl);
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
          <div class="spot-title"></div>
          <div class="spot-artist"></div>
          <div class="spot-album"></div>
          <div class="spot-progress"><div class="spot-fill" style="width:0%"></div></div>
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
  let playing = false;
  let shuffleOn = false;
  let repeatMode = "off";
  let lastTitle = null;
  const refresh = async (forceQueue) => {
    let track = null;
    try {
      track = await native.spotifyNowPlaying();
    } catch (e) {
      track = null;
    }
    if (!body.isConnected) return;
    if (!track || !track.title) {
      titleEl.textContent = "Nothing playing";
      body.querySelector(".spot-artist").textContent = "";
      body.querySelector(".spot-album").textContent = "";
      return;
    }
    bgEl.style.backgroundImage = track.art ? `url("${track.art}")` : "";
    titleEl.textContent = track.title;
    body.querySelector(".spot-artist").textContent = track.artist;
    body.querySelector(".spot-album").textContent = track.album;
    body.querySelector(".spot-fill").style.width = track.duration_ms ? `${(track.progress_ms / track.duration_ms) * 100}%` : "0%";
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

  await refresh(true);
  const t = setInterval(() => refresh(false), 3000);
  addTimer(body, t);
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
      });
    body.innerHTML = `
      <div class="wea-head">
        <span class="wea-name">${escapeHtml(loc.name || "Weather")}</span>
        <span class="wea-clock" data-clock>${clock()}</span>
      </div>
      <div class="wea-temp">${Math.round(w.temp)}°</div>
      <div class="wea-desc">${wmoLabel(w.code)} · wind ${Math.round(w.wind)} km/h</div>
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

  body.innerHTML = `<div class="muted">Loading weather…</div>`;
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
  if (tabName === "projects") renderProjectsSettings();
  if (tabName === "config") renderConfigSettings();
  if (tabName === "vocab") renderVocabSettings();
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
  project: "projects",
  vocab: "vocab",
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
  if (comp.kind === "project") selectedProjectId = id;
  if (comp.kind === "vocab") selectedVocabId = id;
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
      <input type="checkbox" class="collapsible" ${comp.collapsible !== false ? "checked" : ""} />
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
      items[Number(e.target.dataset.i)].kind = e.target.value;
      commitLauncher(launcher);
    })
  );
  panel.querySelectorAll(".it-label").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      items[Number(e.target.dataset.i)].label = e.target.value;
      commitLauncher(launcher);
    })
  );
  panel.querySelectorAll(".it-browse").forEach((btn) =>
    btn.addEventListener("click", async (e) => {
      const i = Number(e.target.dataset.i);
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
      items.splice(Number(e.target.dataset.i), 1);
      commitLauncher(launcher);
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
      urls[Number(e.target.dataset.i)].title = e.target.value;
      commitBookmarks(comp);
    })
  );
  panel.querySelectorAll(".bmk-url").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      urls[Number(e.target.dataset.i)].url = e.target.value;
      commitBookmarks(comp);
    })
  );
  panel.querySelectorAll(".bmk-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      urls.splice(Number(e.target.dataset.i), 1);
      commitBookmarks(comp);
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
      d.repos[Number(e.target.dataset.i)].label = e.target.value;
      commitAzure(comp);
    })
  );
  panel.querySelectorAll(".az-repo").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      d.repos[Number(e.target.dataset.i)].repo = e.target.value;
      commitAzure(comp);
    })
  );
  panel.querySelectorAll(".az-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      d.repos.splice(Number(e.target.dataset.i), 1);
      commitAzure(comp);
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
      feeds[Number(e.target.dataset.i)].label = e.target.value;
      commitNews(comp);
    })
  );
  panel.querySelectorAll(".news-url").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      feeds[Number(e.target.dataset.i)].url = e.target.value;
      commitNews(comp);
    })
  );
  panel.querySelectorAll(".news-remove").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      feeds.splice(Number(e.target.dataset.i), 1);
      commitNews(comp);
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
      comp.data.langs[Number(e.target.dataset.i)] = e.target.value;
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
      comp.data.roots[Number(e.target.dataset.ri)].projects[Number(e.target.dataset.i)].folder = e.target.value;
      commitProject(comp);
    })
  );
  panel.querySelectorAll(".pj-solution").forEach((inp) =>
    inp.addEventListener("change", (e) => {
      comp.data.roots[Number(e.target.dataset.ri)].projects[Number(e.target.dataset.i)].solution = e.target.value;
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
    <label>Enabled <input id="vocab-enabled" type="checkbox" ${v.enabled ? "checked" : ""} /></label>
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
    <label>to <input id="vocab-quiet-end" type="time" value="${escapeHtml(v.quietEnd || "")}" /></label>
    <label>vocab-app <input id="vocab-app-url" type="text" placeholder="http://localhost:5173" value="${escapeHtml(v.vocabAppUrl || "")}" /></label>`;
  panel.appendChild(quiet);

  const actions = document.createElement("div");
  actions.className = "item-row";
  const snoozed = (v.snoozeUntil || 0) > Date.now() / 1000;
  actions.innerHTML = `
    <button class="btn ghost" id="vocab-preview">Preview popup</button>
    <button class="btn ghost" id="vocab-clear-snooze" ${snoozed ? "" : "disabled"}>Clear snooze</button>
    <span id="vocab-status" class="muted">${snoozed ? "snoozed" : ""}</span>`;
  panel.appendChild(actions);

  const statusEl = actions.querySelector("#vocab-status");
  const commit = () => { saveState(); render(); };

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
  panel.querySelector("#vocab-app-url").addEventListener("change", (e) => {
    v.vocabAppUrl = e.target.value.trim() || "http://localhost:5173";
    commit();
  });
  actions.querySelector("#vocab-preview").addEventListener("click", async () => {
    statusEl.textContent = "opening…";
    try {
      const res = await native.openVocabPopup(v.lang || "es");
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

const KIND_DEFAULTS = {
  launcher: { title: "Folders & Files", data: { items: [] } },
  bookmarks: { title: "Bookmarks", data: { urls: [] } },
  azure: { title: "Azure DevOps", data: { org: "", project: "", repos: [] } },
  system: { title: "System", data: {} },
  weather: { title: "Weather", data: { location: { name: "", lat: undefined, lon: undefined } } },
  news: { title: "News", data: { feeds: [] } },
  translate: { title: "Translate", data: { langs: ["EN", "DE", "ES"] } },
  frame: { title: "Frame", data: { path: "", fit: "cover" } },
  spotify: { title: "Spotify", data: {} },
  vocab: { title: "Vocab", data: { intervalSec: 10 } },
  project: { title: "Projects", data: { roots: [] } },
};

document.getElementById("btn-add-compartment").addEventListener("click", () => {
  const kind = document.getElementById("add-kind").value || "launcher";
  const d = KIND_DEFAULTS[kind] || KIND_DEFAULTS.launcher;
  const y = state.compartments.reduce((m, c) => Math.max(m, c.y + c.h), 0);
  const comp = {
    id: "c" + Date.now(),
    kind,
    title: (document.getElementById("add-title").value || "").trim() || d.title,
    x: 0,
    y,
    w: 4,
    h: 3,
    data: JSON.parse(JSON.stringify(d.data)),
  };
  state.compartments.push(comp);
  if (kind === "launcher") selectedLauncherId = comp.id;
  document.getElementById("add-title").value = "";
  saveState();
  render();
  // New tiles are placed at the bottom of a tall grid; scroll it into view so
  // the user actually sees what they added.
  gridEl.querySelector(`.compartment[data-id="${comp.id}"]`)?.scrollIntoView({ block: "nearest" });
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
  const handle = e.target.closest(".resize-handle");
  const header = e.target.closest(".compartment-header");
  // Don't start a drag when pressing any header button (rename, settings,
  // remove) — those need their click to fire instead of being swallowed.
  if (!handle && (!header || e.target.closest(".header-actions button"))) return;
  const comp = e.target.closest(".compartment");
  if (!comp) return;
  const item = state.compartments.find((c) => c.id === comp.dataset.id);
  if (!item) return;
  e.preventDefault();
  gesture = { mode: handle ? "resize" : "drag", item, comp, startX: e.clientX, startY: e.clientY };
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
      if (over && state.compartments.find((c) => c.id === over.dataset.id)?.kind === "launcher") {
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

    // Find the launcher tile under the drop point.
    const target = targetAt({ x, y });
    if (!target) return;
    const comp = state.compartments.find((c) => c.id === target.dataset.id);
    if (!comp || comp.kind !== "launcher") return;

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
