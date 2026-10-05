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

// ---------------------------------------------------------------------------
// State (persisted to localStorage). Each compartment has a `kind` and `data`.
// ---------------------------------------------------------------------------
const DEFAULT_STATE = {
  columns: 12,
  zoom: 1,
  previewWidth: 320,
  compartments: [
    { id: "sys", kind: "system", title: "System", x: 0, y: 0, w: 3, h: 2 },
    { id: "wea", kind: "weather", title: "Weather", x: 3, y: 0, w: 3, h: 2, data: { location: "" } },
    { id: "bmk", kind: "bookmarks", title: "Bookmarks", x: 6, y: 0, w: 6, h: 2, data: { urls: [] } },
    { id: "lch", kind: "launcher", title: "Folders & Solutions", x: 0, y: 2, w: 6, h: 3, data: { items: [] } },
  ],
};

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
    return path.endsWith(".sln") ? "sln" : "dir";
  },
  async fetchRss(url) {
    if (window.__TAURI__) return invoke("fetch_rss", { url });
    return { feed_title: "", items: [] };
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
};

// ---------------------------------------------------------------------------
// Grid rendering (simple absolute-positioned grid for the scaffold).
// ---------------------------------------------------------------------------
const dashboard = document.getElementById("dashboard");

// Registry of interval timers owned by compartment bodies, keyed by the body
// element they render into. Tracked at module scope so they are cleared even
// for compartments that have been removed from `state`. Keying by body lets us
// clear a single body's timers (e.g. the preview panel) without nuking others.
const compartmentTimers = new Map();

function addTimer(body, t) {
  if (!compartmentTimers.has(body)) compartmentTimers.set(body, []);
  compartmentTimers.get(body).push(t);
}
function clearCompartmentTimers() {
  compartmentTimers.forEach((arr) => arr.forEach(clearInterval));
  compartmentTimers.clear();
}
function clearBodyTimers(body) {
  const arr = compartmentTimers.get(body);
  if (arr) {
    arr.forEach(clearInterval);
    compartmentTimers.delete(body);
  }
}

const ROW_H_BASE = 44;
const GUTTER = 8;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3;

// Current zoom (1 = 100%). ROW_H scales with zoom so the whole grid (tile
// positions, heights, gestures, overlays) scales proportionally.
let zoom = 1;
function ROW_H() {
  return ROW_H_BASE * zoom;
}

// Pixel geometry for a compartment given the current column count and the
// dashboard's live width. Positions are cell-based: x/w in columns, y/h in rows.
function cellWidth() {
  return (dashboard.clientWidth - GUTTER) / state.columns;
}
function applyBox(el, c) {
  const cw = cellWidth();
  el.style.left = `${GUTTER / 2 + c.x * cw}px`;
  el.style.top = `${GUTTER / 2 + c.y * ROW_H()}px`;
  el.style.width = `${c.w * cw - GUTTER}px`;
  el.style.height = `${c.h * ROW_H() - GUTTER}px`;
}
function gridHeight() {
  const rows = state.compartments.reduce((m, c) => Math.max(m, c.y + tileRows(c)), 0);
  return GUTTER / 2 + rows * ROW_H();
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

function render() {
  clearCompartmentTimers();
  dashboard.innerHTML = "";
  dashboard.style.height = `${gridHeight()}px`;

  for (const c of state.compartments) {
    const collapsed = c.collapsed === true;
    const collapsible = c.collapsible !== false;
    const el = document.createElement("div");
    el.className = "compartment" + (collapsed ? " collapsed" : "");
    el.dataset.id = c.id;
    el.style.position = "absolute";
    applyBox(el, c);
    if (collapsed) el.style.height = `${ROW_H() - GUTTER}px`;

    const toggle = collapsed ? "▸" : "▾";
    el.innerHTML = `
      <div class="compartment-header">
        <span class="comp-title">${escapeHtml(c.title)}</span>
        <div class="header-actions">
          ${collapsible ? `<button class="btn ghost collapse" data-id="${c.id}" title="${collapsed ? "Open" : "Collapse"}">${toggle}</button>` : ""}
          <button class="btn ghost preview-tile" data-id="${c.id}" title="Preview">👁</button>
          <button class="btn ghost settings-tile" data-id="${c.id}" title="Settings">⚙</button>
          <button class="btn ghost rename" data-id="${c.id}" title="Rename">✎</button>
          <button class="btn ghost remove" data-id="${c.id}">✕</button>
        </div>
      </div>
      ${collapsed ? "" : `<div class="compartment-body" data-id="${c.id}"></div>`}
      <div class="resize-handle" title="Resize"></div>
    `;

    el.querySelector(".collapse")?.addEventListener("click", (e) => {
      e.stopPropagation();
      // Toggle collapse; when collapsed the button also opens (and stays
      // open) the floating body overlay for this tile only.
      if (!collapsed) {
        c.collapsed = true;
        openTiles.delete(c.id);
        saveState();
        render();
      } else {
        if (openTiles.has(c.id)) openTiles.delete(c.id);
        else openTiles.add(c.id);
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

      const commit = () => {
        const val = input.value.trim();
        if (val && val !== c.title) {
          c.title = val;
          saveState();
          render();
        } else {
          render();
        }
      };
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commit();
        if (ev.key === "Escape") render();
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

    dashboard.appendChild(el);
    if (collapsed) {
      if (openTiles.has(c.id)) renderCollapsedOverlay(c);
    } else {
      renderCompartmentBody(c);
    }
  }
}

// Render a collapsed tile's body as a floating overlay that can overlap other
// tiles (the header stays anchored and non-overlapping in the grid).
function renderCollapsedOverlay(c) {
  const cw = cellWidth();
  const overlay = document.createElement("div");
  overlay.className = "compartment-overlay";
  overlay.dataset.id = c.id;
  overlay.style.left = `${GUTTER / 2 + c.x * cw}px`;
  overlay.style.top = `${GUTTER / 2 + c.y * ROW_H() + ROW_H()}px`; // below the header
  overlay.style.width = `${c.w * cw - GUTTER}px`;
  overlay.style.height = `${(c.h - 1) * ROW_H() - GUTTER}px`;
  overlay.innerHTML = `<div class="compartment-body" data-id="${c.id}"></div>`;
  dashboard.appendChild(overlay);
  renderCompartmentBody(c);
}

async function renderCompartmentBody(c, body) {
  if (!body) {
    body = dashboard.querySelector(`.compartment-body[data-id="${c.id}"]`);
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
      body.innerHTML = `<div class="muted">No folders or solutions yet — add some in Settings.</div>`;
      return;
    }
    body.innerHTML = items
      .map(
        (it, i) => `
        <div class="launcher-tile ${it.kind}">
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
          else await native.openSolution(it.path);
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
    body.innerHTML = urls
      .map(
        (u) =>
          `<button class="bmk-tile" data-url="${escapeHtml(u.url)}">
             <span class="bmk-name">${escapeHtml(u.title || u.url)}</span>
             <span class="bmk-host">${escapeHtml(hostOf(u.url))}</span>
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
    body.innerHTML = repos
      .map((r) => {
        const base = `https://dev.azure.com/${encOrg}/${encProj}/_git/${encodeURIComponent(r.repo)}`;
        const name = r.label || r.repo;
        return `
          <div class="azure-repo">
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
  } else {
    body.innerHTML = `<div class="muted">${escapeHtml(c.kind)} compartment (scaffold).</div>`;
  }
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
  document.getElementById("preview-title").textContent = comp.title;
  previewEl.classList.remove("hidden");
  renderPreview();
}
function closePreview() {
  previewTileId = null;
  previewEl.classList.add("hidden");
  previewBody.innerHTML = "";
  // Only clear timers bound to the preview body — not the dashboard's live
  // tiles (System stats, Weather clock), which must keep updating.
  clearBodyTimers(previewBody);
}
function togglePreview() {
  if (previewEl.classList.contains("hidden")) openPreview(previewTileId || state.compartments[0]?.id);
  else closePreview();
}
function renderPreview() {
  if (!previewTileId) return;
  const comp = state.compartments.find((c) => c.id === previewTileId);
  if (!comp) return;
  document.getElementById("preview-title").textContent = comp.title;
  // Clear any timers still bound to the preview body (e.g. a previous tile's
  // system-stats interval) so they don't keep overwriting the new content.
  clearBodyTimers(previewBody);
  renderCompartmentBody(comp, previewBody);
}

document.getElementById("btn-preview").addEventListener("click", togglePreview);
document.getElementById("preview-close").addEventListener("click", closePreview);

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
}

// Map a compartment kind to its dedicated Settings tab (used by the per-tile
// settings button so it lands on the right panel and preselects the tile).
const KIND_TAB = {
  launcher: "folders",
  bookmarks: "bookmarks",
  azure: "azure",
  system: "grid",
  weather: "weather",
  news: "news",
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

function renderTabPanel(comp) {
  if (comp.kind === "launcher") renderFoldersSettings();
  if (comp.kind === "bookmarks") renderBookmarksSettings();
  if (comp.kind === "azure") renderAzureSettings();
  if (comp.kind === "weather") renderWeatherSettings();
  if (comp.kind === "news") renderNewsSettings();
}

function ensureLauncher() {
  const launchers = state.compartments.filter((c) => c.kind === "launcher");
  if (launchers.length === 0) {
    const launcher = {
      id: "launcher" + Date.now(),
      kind: "launcher",
      title: "Folders & Solutions",
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
      <button class="btn ghost danger it-remove" data-i="${i}">✕</button>`;
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

  urls.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input class="bmk-title" data-i="${i}" type="text" placeholder="Label" value="${escapeHtml(u.title || "")}" />
      <input class="bmk-url" data-i="${i}" type="text" placeholder="https://…" value="${escapeHtml(u.url || "")}" />
      <button class="btn ghost danger bmk-remove" data-i="${i}">✕</button>`;
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
      <button class="btn ghost danger az-remove" data-i="${i}">✕</button>`;
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

  feeds.forEach((f, i) => {
    const row = document.createElement("div");
    row.className = "item-row";
    row.innerHTML = `
      <input class="news-label" data-i="${i}" type="text" placeholder="Label (optional)" value="${escapeHtml(f.label || "")}" />
      <input class="news-url" data-i="${i}" type="text" placeholder="https://…/feed.xml" value="${escapeHtml(f.url || "")}" />
      <button class="btn ghost danger news-remove" data-i="${i}">✕</button>`;
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

const KIND_DEFAULTS = {
  launcher: { title: "Folders & Solutions", data: { items: [] } },
  bookmarks: { title: "Bookmarks", data: { urls: [] } },
  azure: { title: "Azure DevOps", data: { org: "", project: "", repos: [] } },
  system: { title: "System", data: {} },
  weather: { title: "Weather", data: { location: { name: "", lat: undefined, lon: undefined } } },
  news: { title: "News", data: { feeds: [] } },
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
  dashboard.querySelector(`.compartment[data-id="${comp.id}"]`)?.scrollIntoView({ block: "nearest" });
});

document.getElementById("set-cols").addEventListener("change", (e) => {
  state.columns = Math.min(24, Math.max(4, Number(e.target.value) || 12));
  saveState();
  render();
});

// ---------------------------------------------------------------------------
// Zoom controls (topbar). Scaling ROW_H scales the whole grid, so zoom out to
// see off-screen tiles (e.g. ones added far down) and remove them.
// ---------------------------------------------------------------------------
function updateZoomUI() {
  const el = document.getElementById("zoom-level");
  if (el) el.textContent = `${Math.round(zoom * 100)}%`;
}
function setZoom(z) {
  zoom = clamp(z, ZOOM_MIN, ZOOM_MAX);
  state.zoom = zoom;
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
  const dx = e.clientX - gesture.startX;
  const dy = e.clientY - gesture.startY;
  const cw = cellWidth();
  const item = gesture.item;

  if (gesture.mode === "drag") {
    const nx = clamp(Math.round((item.x * cw + dx) / cw), 0, state.columns - item.w);
    const ny = Math.max(0, Math.round((item.y * ROW_H() + dy) / ROW_H()));
    gesture.comp.style.left = `${GUTTER / 2 + nx * cw}px`;
    gesture.comp.style.top = `${GUTTER / 2 + ny * ROW_H()}px`;
    gesture._nx = nx;
    gesture._ny = ny;
    gesture.moved = nx !== item.x || ny !== item.y;
  } else {
    const nw = clamp(item.w + Math.round(dx / cw), 1, state.columns - item.x);
    const nh = Math.max(1, item.h + Math.round(dy / ROW_H()));
    gesture.comp.style.width = `${nw * cw - GUTTER}px`;
    gesture.comp.style.height = `${nh * ROW_H() - GUTTER}px`;
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
  if (state.previewWidth) {
    previewEl.style.width = `${state.previewWidth}px`;
    previewWidthEl.value = state.previewWidth;
  }
  render();
}

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
      [...dashboard.querySelectorAll(".compartment, .compartment-overlay")].find((el) => {
        const r = el.getBoundingClientRect();
        return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
      });

    if (type === "over") {
      dashboard.querySelectorAll(".compartment.drag-over").forEach((el) => el.classList.remove("drag-over"));
      const over = targetAt({ x, y });
      if (over && state.compartments.find((c) => c.id === over.dataset.id)?.kind === "launcher") {
        over.classList.add("drag-over");
      }
      return;
    }
    if (type === "leave") {
      dashboard.querySelectorAll(".compartment.drag-over").forEach((el) => el.classList.remove("drag-over"));
      return;
    }
    if (type !== "drop") return;
    dashboard.querySelectorAll(".compartment.drag-over").forEach((el) => el.classList.remove("drag-over"));
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
      if (kind !== "dir" && kind !== "sln") continue;
      const label = p.split(/[\\/]/).pop() || p;
      if (comp.data.items.some((it) => it.path === p)) continue; // no dupes
      comp.data.items.push({ kind: kind === "dir" ? "folder" : "solution", label, path: p });
    }
    saveState();
    render();
  });
}

void initialize();
