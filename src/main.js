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
  compartments: [
    { id: "sys", kind: "system", title: "System", x: 0, y: 0, w: 3, h: 2 },
    { id: "wea", kind: "weather", title: "Weather", x: 3, y: 0, w: 3, h: 2, data: { location: "" } },
    { id: "bmk", kind: "bookmarks", title: "Bookmarks", x: 6, y: 0, w: 6, h: 2, data: { urls: [] } },
  ],
};

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
  async systemStats() {
    if (window.__TAURI__) return invoke("get_system_stats");
    return { cpu_percent: 0, ram_used_bytes: 0, ram_total_bytes: 1, ram_percent: 0 };
  },
};

// ---------------------------------------------------------------------------
// Grid rendering (simple absolute-positioned grid for the scaffold).
// ---------------------------------------------------------------------------
const dashboard = document.getElementById("dashboard");

function render() {
  dashboard.innerHTML = "";
  const cols = state.columns;
  const cellW = 100 / cols;

  for (const c of state.compartments) {
    const el = document.createElement("div");
    el.className = "compartment";
    el.style.position = "absolute";
    el.style.width = `calc(${cellW * c.w}% - 8px)`;
    el.style.left = `calc(${cellW * c.x}% + 4px)`;
    el.style.top = `${c.y * 140 + 8}px`;
    el.style.height = `${c.h * 130}px`;

    el.innerHTML = `
      <div class="compartment-header">
        <span>${escapeHtml(c.title)}</span>
        <button class="btn ghost remove" data-id="${c.id}">✕</button>
      </div>
      <div class="compartment-body" data-id="${c.id}"></div>
    `;

    el.querySelector(".remove").addEventListener("click", (e) => {
      e.stopPropagation();
      state.compartments = state.compartments.filter((x) => x.id !== c.id);
      saveState();
      render();
    });

    dashboard.appendChild(el);
    renderCompartmentBody(c);
  }
}

async function renderCompartmentBody(c) {
  const body = dashboard.querySelector(`.compartment-body[data-id="${c.id}"]`);
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
    c._timers = c._timers || [];
    c._timers.push(t);
  } else if (c.kind === "weather") {
    body.innerHTML = `<div class="muted">Weather — configure a location in Settings.</div>`;
  } else if (c.kind === "bookmarks") {
    const urls = c.data?.urls || [];
    if (!urls.length) {
      body.innerHTML = `<div class="muted">No bookmarks yet.</div>`;
      return;
    }
    body.innerHTML = urls
      .map(
        (u) =>
          `<button class="btn ghost bmk" data-url="${escapeHtml(u.url)}">${escapeHtml(u.title || u.url)}</button>`
      )
      .join(" ");
    body.querySelectorAll(".bmk").forEach((b) =>
      b.addEventListener("click", () => native.openUrl(b.dataset.url))
    );
  } else {
    body.innerHTML = `<div class="muted">${escapeHtml(c.kind)} compartment (scaffold).</div>`;
  }
}

// ---------------------------------------------------------------------------
// Settings overlay wiring.
// ---------------------------------------------------------------------------
const settingsEl = document.getElementById("settings");

document.getElementById("btn-settings").addEventListener("click", () => settingsEl.classList.remove("hidden"));
document.getElementById("btn-settings-close").addEventListener("click", () => settingsEl.classList.add("hidden"));

document.querySelectorAll(".settings-tabs .tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".settings-tabs .tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`).classList.add("active");
  });
});

document.getElementById("btn-add-compartment").addEventListener("click", () => {
  state.compartments.push({
    id: "c" + Date.now(),
    kind: "placeholder",
    title: "New compartment",
    x: 0,
    y: state.compartments.length,
    w: 4,
    h: 2,
    data: {},
  });
  saveState();
  render();
});

document.getElementById("set-cols").addEventListener("change", (e) => {
  state.columns = Math.min(24, Math.max(4, Number(e.target.value) || 12));
  saveState();
  render();
});

// ---------------------------------------------------------------------------
// Drag to reorder (scaffold-level: simple drag on header). Resize via TODO.
// ---------------------------------------------------------------------------
let drag = null;
dashboard.addEventListener("mousedown", (e) => {
  const header = e.target.closest(".compartment-header");
  if (!header || e.target.closest(".remove")) return;
  const comp = header.closest(".compartment");
  drag = { comp, startX: e.clientX, startY: e.clientY, origX: comp.offsetLeft, origY: comp.offsetTop, moved: false };
});

dashboard.addEventListener("mousemove", (e) => {
  if (!drag) return;
  drag.comp.style.left = `${drag.origX + e.clientX - drag.startX}px`;
  drag.comp.style.top = `${drag.origY + e.clientY - drag.startY}px`;
  drag.moved = true;
});

dashboard.addEventListener("mouseup", () => {
  if (!drag) return;
  const comp = drag.comp;
  const id = comp.querySelector(".compartment-body").dataset.id;
  const cell = Math.round(comp.offsetLeft / (dashboard.clientWidth / state.columns));
  const row = Math.max(0, Math.round(comp.offsetTop / 140));
  const item = state.compartments.find((c) => c.id === id);
  if (item && drag.moved) {
    item.x = Math.min(state.columns - item.w, cell);
    item.y = row;
    saveState();
  }
  drag = null;
  render();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

// Entry.
render();
saveState();