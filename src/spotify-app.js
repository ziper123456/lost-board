/**
 * Full-screen Spotify app tab.
 *
 * Registers itself on window.LostBoardApps before main.js loads. The shell
 * provides all helpers through ctx (native calls, state, timers, the existing
 * lyrics renderer), so this file owns only the Spotify screen.
 */
(function () {
  const APPS = (window.LostBoardApps = window.LostBoardApps || {});

  const PLAY = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
  const PAUSE = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
  const PREV = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 6h2.2v12H6zm3 6 9 6V6z"/></svg>`;
  const NEXT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.8 6H18v12h-2.2zM15 12 6 6v12z"/></svg>`;
  const SHUFFLE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="m4 4 5 5"/></svg>`;
  const REPEAT = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;
  const REPEAT_ONE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="12" y="15.2" font-family="sans-serif" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">1</text></svg>`;
  const VOLUME = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>`;
  const EXTERNAL = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="m21 3-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>`;
  const GEAR = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>`;
  const CLOSE = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
  const SEARCH = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
  const EXPAND = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg>`;
  const COLLAPSE = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></svg>`;
  const PLUS = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
  const CHECK = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>`;

  function fmtTime(ms) {
    const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  function fmtNumber(n) {
    const x = Number(n) || 0;
    if (x >= 1_000_000) return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (x >= 1_000) return `${(x / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(x);
  }
  function webUrl(uri) {
    const match = /^spotify:([a-z]+):(.+)$/.exec(uri || "");
    return match ? `https://open.spotify.com/${match[1]}/${match[2]}` : "";
  }
  function appState(ctx) {
    const state = ctx.state;
    if (!state.apps || typeof state.apps !== "object") state.apps = {};
    if (!state.apps.spotify || typeof state.apps.spotify !== "object") state.apps.spotify = {};
    return state.apps.spotify;
  }

  function renderConnect(container, ctx) {
    container.innerHTML = `
      <div class="sp-app sp-empty">
        <div class="sp-empty-card">
          <div class="sp-empty-disc" aria-hidden="true"></div>
          <h1>Connect Spotify</h1>
          <p>Add your Spotify client id and connect in Settings → Spotify.</p>
          <button class="btn primary sp-connect">Open Spotify settings</button>
        </div>
      </div>`;
    container.querySelector(".sp-connect").addEventListener("click", () => ctx.openSettings("spotify"));
  }

  function renderApp(container, ctx) {
    const appSettings = ctx.spotifyAppSettings();
    container.style.setProperty("--sp-font-size", `${appSettings.fontBase}px`);
    container.style.setProperty("--sp-vinyl-w", `${appSettings.vinyl}px`);
    container.style.setProperty("--sp-lyrics-font", `${appSettings.lyricsFont}px`);
    container.style.setProperty("--sp-lyrics-h", `${appSettings.lyricsHeight}px`);
    container.style.setProperty("--sp-split", String(appSettings.split));
    container.innerHTML = `
      <div class="sp-app">
        <button class="sp-focus-toggle" title="Focus mode (F)" aria-label="Toggle focus mode" aria-pressed="false">${EXPAND}</button>
        <section class="sp-hero">
          <div class="sp-stage" aria-hidden="true">
            <div class="sp-sleeve"><img class="sp-sleeve-art" alt="" /></div>
            <div class="sp-disc">
              <div class="sp-disc-label"><img class="sp-label-art" alt="" /></div>
              <span class="sp-disc-hole"></span>
            </div>
            <div class="sp-tonearm"><span class="sp-tonearm-base"></span><span class="sp-tonearm-arm"></span></div>
          </div>
          <div class="sp-head">
            <div class="sp-head-main">
              <div class="sp-meta">
                <div class="sp-title-row">
                  <h1 class="sp-title">Nothing playing</h1>
                  <button class="sp-link-btn sp-open-track" title="Open current track in Spotify" hidden>${EXTERNAL}</button>
                </div>
                <div class="sp-artist-line"></div>
                <div class="sp-album"></div>
              </div>
              <div class="sp-volume-row">
                <span class="sp-volume-icon" aria-hidden="true">${VOLUME}</span>
                <input class="sp-vol" type="range" min="0" max="100" value="50" aria-label="Volume" />
                <span class="sp-vol-value">50%</span>
              </div>
            </div>
            <div class="sp-cover-rack" aria-label="Current playlist and next tracks" hidden></div>
          </div>
          <div class="sp-progress-wrap">
            <span class="sp-time sp-cur">0:00</span>
            <div class="sp-progress" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0"><div class="sp-progress-fill"></div></div>
            <span class="sp-time sp-dur">0:00</span>
          </div>
          <div class="sp-controls">
            <button class="sp-ctl sp-shuffle" title="Shuffle">${SHUFFLE}</button>
            <button class="sp-ctl sp-prev" title="Previous">${PREV}</button>
            <button class="sp-ctl sp-play sp-play-main" title="Play/Pause">${PLAY}</button>
            <button class="sp-ctl sp-next" title="Next">${NEXT}</button>
            <button class="sp-ctl sp-repeat" title="Repeat">${REPEAT}</button>
          </div>
          <div class="sp-status" role="status"></div>
          <div class="sp-focus-lyrics" hidden></div>
          <section class="sp-queue-panel">
            <header class="sp-panel-head"><h2>Up next</h2><span class="sp-queue-count"></span></header>
            <div class="sp-queue-list"></div>
          </section>
        </section>
        <div class="sp-splitter" role="separator" aria-orientation="vertical" tabindex="0" title="Drag to resize columns">
          <span class="sp-splitter-grip" aria-hidden="true"></span>
        </div>
        <aside class="sp-side">
          <section class="sp-about-panel" hidden>
            <div class="sp-about-media">
              <img class="sp-artist-img" alt="" />
              <span class="sp-artist-fallback" hidden></span>
            </div>
            <div class="sp-about-body">
              <header class="sp-about-head">
                <div class="sp-about-id">
                  <a class="sp-artist-link" href="#" target="_blank" rel="noreferrer"></a>
                  <div class="sp-about-stats"></div>
                  <div class="sp-artist-genres"></div>
                </div>
              </header>
              <div class="sp-about-scroll">
                <p class="sp-about-bio" hidden></p>
                <div class="sp-about-links"></div>
                <section class="sp-top-tracks">
                  <header class="sp-about-heading">Top tracks</header>
                  <div class="sp-top-list"></div>
                </section>
              </div>
            </div>
          </section>
          <section class="sp-lyrics-panel">
            <header class="sp-panel-head"><h2>Lyrics</h2><button class="sp-link-btn sp-lyrics-settings" title="Spotify app lyrics settings">${GEAR}</button></header>
            <div class="sp-lyrics-host"></div>
          </section>
        </aside>
        <div class="sp-search" hidden>
          <div class="sp-search-backdrop" data-close="search"></div>
          <section class="sp-search-panel" role="dialog" aria-modal="true" aria-label="Search Spotify">
            <header class="sp-search-head">
              <span class="sp-search-icon" aria-hidden="true">${SEARCH}</span>
              <input class="sp-search-input" type="search" placeholder="Search tracks, artists, albums, playlists" autocomplete="off" spellcheck="false" />
              <button class="sp-link-btn sp-search-close" title="Close search">${CLOSE}</button>
            </header>
            <div class="sp-search-status" role="status"></div>
            <div class="sp-search-results" role="listbox" aria-label="Search results"></div>
          </section>
        </div>
        <button class="sp-playlist-hotspot" title="Playlists" aria-label="Show playlists"><span aria-hidden="true"></span></button>
        <section class="sp-playlist-drawer" aria-label="Playlists" aria-hidden="true">
          <header class="sp-panel-head">
            <h2>Playlists</h2>
            <span class="sp-playlist-status"></span>
            <button class="sp-link-btn sp-playlist-close" title="Close playlists">${CLOSE}</button>
          </header>
          <div class="sp-playlist-body">
            <div class="sp-playlist-grid"></div>
            <div class="sp-playlist-empty" hidden></div>
          </div>
        </section>
      </div>`;

    const root = container.querySelector(".sp-app");
    const sleeveArt = container.querySelector(".sp-sleeve-art");
    const labelArt = container.querySelector(".sp-label-art");
    const titleEl = container.querySelector(".sp-title");
    const artistEl = container.querySelector(".sp-artist-line");
    const albumEl = container.querySelector(".sp-album");
    const openTrackBtn = container.querySelector(".sp-open-track");
    const playBtn = container.querySelector(".sp-play");
    const shuffleBtn = container.querySelector(".sp-shuffle");
    const repeatBtn = container.querySelector(".sp-repeat");
    const statusEl = container.querySelector(".sp-status");
    const curEl = container.querySelector(".sp-cur");
    const durEl = container.querySelector(".sp-dur");
    const progressEl = container.querySelector(".sp-progress");
    const fillEl = container.querySelector(".sp-progress-fill");
    const queueList = container.querySelector(".sp-queue-list");
    const queueCount = container.querySelector(".sp-queue-count");
    const coverRack = container.querySelector(".sp-cover-rack");
    const aboutPanel = container.querySelector(".sp-about-panel");
    const splitter = container.querySelector(".sp-splitter");
    const topTracksPanel = container.querySelector(".sp-top-tracks");
    const topTracksList = container.querySelector(".sp-top-list");
    const artistImg = container.querySelector(".sp-artist-img");
    const artistLink = container.querySelector(".sp-artist-link");
    const artistGenres = container.querySelector(".sp-artist-genres");
    const aboutStats = container.querySelector(".sp-about-stats");
    const aboutBio = container.querySelector(".sp-about-bio");
    const aboutLinks = container.querySelector(".sp-about-links");
    const volEl = container.querySelector(".sp-vol");
    const volValue = container.querySelector(".sp-vol-value");
    const lyricsHost = container.querySelector(".sp-lyrics-host");
    const lyricsPanel = container.querySelector(".sp-lyrics-panel");
    const focusToggle = container.querySelector(".sp-focus-toggle");
    const focusLyrics = container.querySelector(".sp-focus-lyrics");
    const artistFallback = container.querySelector(".sp-artist-fallback");
    const searchOverlay = container.querySelector(".sp-search");
    const searchInput = container.querySelector(".sp-search-input");
    const searchResults = container.querySelector(".sp-search-results");
    const searchStatusEl = container.querySelector(".sp-search-status");
    const searchClose = container.querySelector(".sp-search-close");
    const searchBackdrop = container.querySelector(".sp-search-backdrop");
    const playlistHotspot = container.querySelector(".sp-playlist-hotspot");
    const playlistDrawer = container.querySelector(".sp-playlist-drawer");
    const playlistGrid = container.querySelector(".sp-playlist-grid");
    const playlistEmpty = container.querySelector(".sp-playlist-empty");
    const playlistStatus = container.querySelector(".sp-playlist-status");
    const playlistClose = container.querySelector(".sp-playlist-close");

    const run = String(Date.now()) + Math.random();
    container.dataset.spRun = run;
    const alive = () => container.dataset.spRun === run;
    let current = null;
    let anchorProgress = 0;
    let anchorAt = performance.now();
    let durationMs = 0;
    let playing = false;
    let lastQueueKey = "";
    let lastArtistId = "";
    let statusTimer = 0;
    let playlists = null;
    let playlistsLoading = false;
    let drawerHideTimer = 0;
    let rackCollapseTimer = 0;
    let queueItems = [];
    let contextKey = "";
    let contextInfo = null;
    const contextCache = new Map();
    let focusOn = false;
    let autoFocus = false;
    let idleTimer = 0;
    let lastActivityAt = 0;
    let paletteKey = "";
    const paletteCache = new Map();
    let searchItems = [];
    let searchActive = -1;
    let searchToken = 0;
    let searchTimer = 0;
    let searchQuery = "";

    function showStatus(message) {
      statusEl.textContent = message || "";
      statusEl.classList.toggle("is-error", !!message);
      clearTimeout(statusTimer);
      if (message) {
        statusTimer = setTimeout(() => {
          if (!alive()) return;
          statusEl.textContent = "";
          statusEl.classList.remove("is-error");
        }, 5000);
      }
    }

    // ---- cover palette ------------------------------------------------------
    function clearArtPalette() {
      if (!paletteKey && !root.classList.contains("has-art-palette")) return;
      paletteKey = "";
      root.classList.remove("has-art-palette");
      for (const key of [
        "--sp-art-accent",
        "--sp-art-secondary",
        "--sp-art-glow",
        "--sp-hero-bg",
        "--sp-art-on-accent",
      ]) {
        root.style.removeProperty(key);
      }
    }

    function paintArtPalette(palette) {
      const accent = palette && palette.accent ? palette.accent : "";
      if (!accent) {
        clearArtPalette();
        return;
      }
      const secondary = palette.secondary || accent;
      const light = ctx.Colors ? ctx.Colors.luminance(accent) : 0.2;
      root.style.setProperty("--sp-art-accent", accent);
      root.style.setProperty("--sp-art-secondary", secondary);
      root.style.setProperty("--sp-art-glow", `color-mix(in srgb, ${accent} 22%, transparent)`);
      root.style.setProperty(
        "--sp-hero-bg",
        `linear-gradient(160deg, color-mix(in srgb, ${accent} 14%, var(--panel)), color-mix(in srgb, ${secondary} 8%, var(--panel)) 72%, var(--panel))`
      );
      root.style.setProperty("--sp-art-on-accent", light > 0.55 ? "#1c1712" : "#fff");
      root.classList.add("has-art-palette");
    }

    async function applyArtPalette(url) {
      if (!appSettings.adaptiveColors || !url) {
        clearArtPalette();
        return;
      }
      if (paletteKey === url) return;
      paletteKey = url;
      if (paletteCache.has(url)) {
        paintArtPalette(paletteCache.get(url));
        return;
      }
      try {
        const palette = await ctx.native.spotifyCoverPalette(url);
        if (!alive() || paletteKey !== url || !palette) return;
        paletteCache.set(url, palette);
        paintArtPalette(palette);
      } catch {
        // Keep the theme accent when the cover has no usable palette.
      }
    }

    // ---- focus mode ---------------------------------------------------------
    function setFocus(next, persist = true, auto = false) {
      const on = !!next;
      autoFocus = auto && on;
      if (on === focusOn) return;
      focusOn = on;
      root.classList.toggle("is-focus", on);
      focusToggle.innerHTML = on ? COLLAPSE : EXPAND;
      focusToggle.title = on ? "Exit focus (Esc)" : "Focus mode (F)";
      focusToggle.setAttribute("aria-pressed", String(on));
      if (on) {
        focusLyrics.hidden = false;
        focusLyrics.appendChild(lyricsHost);
      } else {
        lyricsPanel.appendChild(lyricsHost);
        focusLyrics.hidden = true;
      }
      if (persist) {
        appSettings.focus = on;
        ctx.saveState();
      }
    }

    // ---- idle auto-focus ----------------------------------------------------
    const activityEvents = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];
    const IDLE_FOCUS_MS = 60_000;

    // Do not steal the view while the user is already in focus, searching, or
    // using a global overlay.
    function idleBlocked() {
      if (!alive() || focusOn) return true;
      if (!searchOverlay.hidden) return true;
      const settings = document.getElementById("settings");
      if (settings && !settings.classList.contains("hidden")) return true;
      const palette = document.getElementById("quick-palette");
      if (palette && !palette.classList.contains("hidden")) return true;
      return false;
    }

    function scheduleIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (idleBlocked()) return;
        setFocus(true, false, true);
      }, IDLE_FOCUS_MS);
    }

    function onActivity(e) {
      if (!alive()) return;
      const now = Date.now();
      if (now - lastActivityAt < 400) return;
      lastActivityAt = now;
      const key = e.type === "keydown" ? e.key : "";
      const onFocusToggle = !!(e.target && e.target.closest && e.target.closest(".sp-focus-toggle"));
      // Let the focus controls (button / F / Esc) handle their own toggle.
      if (onFocusToggle || key === "f" || key === "F" || key === "Escape") {
        scheduleIdle();
        return;
      }
      if (autoFocus && focusOn) setFocus(false, false);
      scheduleIdle();
    }

    // ---- search -------------------------------------------------------------
    function setSearchStatus(message, isError) {
      searchStatusEl.textContent = message || "";
      searchStatusEl.classList.toggle("is-error", !!isError);
    }

    function updateSearchActive() {
      const rows = [...searchResults.querySelectorAll(".sp-search-row")];
      rows.forEach((row, i) => row.classList.toggle("active", i === searchActive));
      const active = rows[searchActive];
      if (active) active.scrollIntoView({ block: "nearest" });
    }

    function openSearch() {
      if (!searchOverlay.hidden) {
        searchInput.focus();
        return;
      }
      searchOverlay.hidden = false;
      searchInput.value = "";
      searchItems = [];
      searchActive = -1;
      searchQuery = "";
      searchResults.innerHTML = "";
      setSearchStatus("Type at least 2 characters to search");
      requestAnimationFrame(() => {
        if (alive()) searchInput.focus();
      });
    }

    function closeSearch() {
      searchOverlay.hidden = true;
      clearTimeout(searchTimer);
      searchToken += 1;
      if (document.activeElement === searchInput) searchInput.blur();
    }

    function renderSearchResults() {
      searchResults.innerHTML = "";
      if (!searchItems.length) {
        setSearchStatus(searchQuery ? `No results for “${searchQuery}”` : "");
        return;
      }
      const groupNames = { track: "Tracks", artist: "Artists", album: "Albums", playlist: "Playlists" };
      let lastKind = "";
      searchItems.forEach((item, index) => {
        if (item.kind !== lastKind) {
          lastKind = item.kind;
          const heading = document.createElement("div");
          heading.className = "sp-search-group";
          heading.textContent = groupNames[item.kind] || item.kind;
          searchResults.appendChild(heading);
        }
        const row = document.createElement("div");
        row.className = "sp-search-row";
        row.dataset.index = String(index);
        row.setAttribute("role", "option");
        if (item.image) {
          const img = document.createElement("img");
          img.src = item.image;
          img.alt = "";
          img.loading = "lazy";
          row.appendChild(img);
        } else {
          const kind = document.createElement("span");
          kind.className = "sp-search-kind";
          kind.textContent = (groupNames[item.kind] || "?")[0];
          row.appendChild(kind);
        }
        const meta = document.createElement("span");
        meta.className = "sp-search-meta";
        const name = document.createElement("span");
        name.className = "sp-search-name";
        name.textContent = item.name || "Untitled";
        const sub = document.createElement("span");
        sub.className = "sp-search-sub";
        sub.textContent = item.subtitle || groupNames[item.kind] || "";
        meta.append(name, sub);
        row.appendChild(meta);
        if (item.duration_ms) {
          const dur = document.createElement("span");
          dur.className = "sp-search-dur";
          dur.textContent = fmtTime(item.duration_ms);
          row.appendChild(dur);
        }
        if (item.kind === "track") {
          const add = document.createElement("button");
          add.type = "button";
          add.className = "sp-search-add";
          add.title = `Add ${item.name || "track"} to queue`;
          add.innerHTML = PLUS;
          add.addEventListener("click", (e) => {
            e.stopPropagation();
            searchInput.focus();
            void addSearchItemToQueue(item, add);
          });
          row.appendChild(add);
        }
        row.addEventListener("click", () => {
          if (alive()) void activateSearchItem(index);
        });
        searchResults.appendChild(row);
      });
      setSearchStatus(`${searchItems.length} result${searchItems.length === 1 ? "" : "s"}`);
      updateSearchActive();
    }

    async function activateSearchItem(index) {
      const item = searchItems[index];
      if (!item) return;
      try {
        if (item.kind === "track") await ctx.native.spotifyPlayUri(item.uri);
        else await ctx.native.spotifyPlayContext(item.uri);
        closeSearch();
        await refreshNow();
        void loadQueue();
      } catch (e) {
        if (alive()) setSearchStatus(`Playback: ${e.message || e}`, true);
      }
    }

    async function addSearchItemToQueue(item, button) {
      try {
        await ctx.native.spotifyAddToQueue(item.uri);
        if (!alive()) return;
        button.classList.add("is-added");
        button.innerHTML = CHECK;
        setSearchStatus(`Added “${item.name || "track"}” to queue`);
        setTimeout(() => {
          if (!alive()) return;
          button.classList.remove("is-added");
          button.innerHTML = PLUS;
        }, 1400);
      } catch (e) {
        if (alive()) setSearchStatus(`Queue: ${e.message || e}`, true);
      }
    }

    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim();
      clearTimeout(searchTimer);
      searchToken += 1;
      const token = searchToken;
      searchQuery = q;
      if (q.length < 2) {
        searchItems = [];
        searchActive = -1;
        searchResults.innerHTML = "";
        setSearchStatus("Type at least 2 characters to search");
        return;
      }
      searchItems = [];
      searchActive = -1;
      searchResults.innerHTML = "";
      setSearchStatus("Searching…");
      searchTimer = setTimeout(async () => {
        let items = [];
        try {
          items = (await ctx.native.spotifySearch(q)) || [];
        } catch (e) {
          if (!alive() || token !== searchToken) return;
          searchItems = [];
          searchResults.innerHTML = "";
          setSearchStatus(`Search: ${e.message || e}`, true);
          return;
        }
        if (!alive() || token !== searchToken || searchOverlay.hidden) return;
        searchItems = Array.isArray(items) ? items : [];
        searchActive = searchItems.length ? 0 : -1;
        renderSearchResults();
      }, 280);
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (searchItems.length) {
          searchActive = (searchActive + 1) % searchItems.length;
          updateSearchActive();
        }
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (searchItems.length) {
          searchActive = (searchActive - 1 + searchItems.length) % searchItems.length;
          updateSearchActive();
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (searchActive >= 0) void activateSearchItem(searchActive);
      }
    });
    searchClose.addEventListener("click", closeSearch);
    searchBackdrop.addEventListener("click", closeSearch);
    focusToggle.addEventListener("click", () => setFocus(!focusOn));

    function onAppKey(e) {
      if (!alive()) return;
      const target = e.target;
      const typing = !!(target && target.matches && target.matches("input, textarea, select, [contenteditable='true']"));
      const settingsOpen = !document.getElementById("settings")?.classList.contains("hidden");
      const paletteOpen = !document.getElementById("quick-palette")?.classList.contains("hidden");
      if (settingsOpen || paletteOpen) return;
      const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
      if (cmd && (e.code === "KeyK" || e.code === "KeyS")) {
        e.preventDefault();
        if (searchOverlay.hidden) openSearch();
        else searchInput.focus();
        return;
      }
      if (!typing && e.key === "/" && searchOverlay.hidden) {
        e.preventDefault();
        openSearch();
        return;
      }
      if (!typing && (e.key === "f" || e.key === "F") && searchOverlay.hidden) {
        e.preventDefault();
        setFocus(!focusOn);
        return;
      }
      if (e.key === "Escape") {
        if (!searchOverlay.hidden) {
          e.preventDefault();
          closeSearch();
        } else if (focusOn) {
          e.preventDefault();
          setFocus(false);
        }
      }
    }
    document.addEventListener("keydown", onAppKey);
    ctx.addTimer(container, () => document.removeEventListener("keydown", onAppKey));
    for (const type of activityEvents) {
      document.addEventListener(type, onActivity, type === "keydown" ? undefined : { passive: true });
    }
    ctx.addTimer(container, () => {
      clearTimeout(idleTimer);
      for (const type of activityEvents) document.removeEventListener(type, onActivity);
    });
    scheduleIdle();

    async function openSpotify(uri) {
      if (!uri) return;
      const web = webUrl(uri);
      try {
        await ctx.native.openUrl(uri);
      } catch {
        if (web) await ctx.native.openUrl(web).catch(() => {});
      }
    }

    function paintArt(url) {
      if (url) {
        sleeveArt.src = url;
        labelArt.src = url;
        sleeveArt.hidden = false;
        labelArt.hidden = false;
      } else {
        sleeveArt.removeAttribute("src");
        labelArt.removeAttribute("src");
        sleeveArt.hidden = true;
        labelArt.hidden = true;
      }
    }

    function updateProgress() {
      const now = performance.now();
      const cur = Math.min(durationMs, playing ? anchorProgress + (now - anchorAt) : anchorProgress);
      const pct = durationMs > 0 ? Math.min(100, (cur / durationMs) * 100) : 0;
      fillEl.style.width = `${pct}%`;
      curEl.textContent = fmtTime(cur);
      durEl.textContent = fmtTime(durationMs);
      progressEl.setAttribute("aria-valuemax", String(Math.round(durationMs)));
      progressEl.setAttribute("aria-valuenow", String(Math.round(cur)));
    }

    function applyTrack(track) {
      const previous = current;
      current = track || null;
      if (!track || !track.title) {
        titleEl.textContent = "Nothing playing";
        artistEl.textContent = "";
        albumEl.textContent = "";
        openTrackBtn.hidden = true;
        paintArt("");
        clearArtPalette();
        playing = false;
        durationMs = 0;
        anchorProgress = 0;
        root.classList.remove("is-playing");
        playBtn.innerHTML = PLAY;
        aboutPanel.hidden = true;
        lastArtistId = "";
        lastQueueKey = "";
        queueItems = [];
        contextKey = "";
        contextInfo = null;
        renderCoverRack();
        queueList.innerHTML = `<div class="sp-empty-row">Queue is unavailable while nothing is playing.</div>`;
        queueCount.textContent = "";
        updateProgress();
        return;
      }

      const changed = (previous && previous.uri) !== track.uri;
      root.classList.toggle("is-playing", !!track.playing);
      playing = !!track.playing;
      anchorProgress = Number(track.progress_ms) || 0;
      anchorAt = performance.now();
      durationMs = Number(track.duration_ms) || 0;
      titleEl.textContent = track.title || "Nothing playing";
      artistEl.textContent = track.artist || "";
      albumEl.textContent = track.album || "";
      openTrackBtn.hidden = !track.uri;
      paintArt(track.art);
      void applyArtPalette(track.art);
      playBtn.innerHTML = playing ? PAUSE : PLAY;
      shuffleBtn.classList.toggle("is-on", !!track.shuffle);
      shuffleBtn.title = track.smart_shuffle ? "Smart Shuffle is on" : "Shuffle";
      repeatBtn.innerHTML = track.repeat === "track" ? REPEAT_ONE : REPEAT;
      repeatBtn.classList.toggle("is-on", track.repeat && track.repeat !== "off");
      repeatBtn.title = track.repeat === "track" ? "Repeat one" : `Repeat: ${track.repeat || "off"}`;
      updateProgress();

      if (track.context_uri && track.context_uri !== contextKey) {
        contextKey = track.context_uri;
        contextInfo = contextCache.get(contextKey) || null;
        if (changed) queueItems = [];
        renderCoverRack();
        void loadContext(contextKey);
      } else if (!track.context_uri) {
        contextKey = "";
        contextInfo = null;
        if (changed) queueItems = [];
        renderCoverRack();
      } else if (changed) {
        queueItems = [];
        renderCoverRack();
      }

      if (track.artist_id && track.artist_id !== lastArtistId) {
        lastArtistId = track.artist_id;
        void loadArtist(track.artist_id);
      } else if (!track.artist_id) {
        lastArtistId = "";
        aboutPanel.hidden = true;
      }

      const queueKey = track.uri || `${track.title}|${track.artist}`;
      if (changed || queueKey !== lastQueueKey) {
        lastQueueKey = queueKey;
        void loadQueue();
      }
    }

    async function refreshNow() {
      const track = await ctx.native.spotifyNowPlaying().catch(() => null);
      if (alive()) applyTrack(track);
    }

    async function syncVolume() {
      try {
        const devices = (await ctx.native.spotifyDevices()) || [];
        const active = devices.find((device) => device.active) || devices[0];
        if (active && active.volume_percent != null) {
          volEl.value = String(active.volume_percent);
          if (volValue) volValue.textContent = `${active.volume_percent}%`;
        }
      } catch {
        // Volume still works through the slider; no need to surface device errors.
      }
    }

    async function jumpQueueItem(item) {
      if (!item || !item.uri) return;
      try {
        // A queue can contain autoplay/radio tracks that are not part of the
        // current context, so a context jump may be refused. Fall back to
        // playing the clicked URI directly instead of skipping once (which
        // would advance to the next track rather than the chosen one).
        if (current && current.context_uri) {
          try {
            await ctx.native.spotifyJump(current.context_uri, item.uri);
          } catch {
            await ctx.native.spotifyPlayUri(item.uri);
          }
        } else {
          await ctx.native.spotifyPlayUri(item.uri);
        }
        await refreshNow();
        void loadQueue();
      } catch (e) {
        showStatus(`Playback: ${e.message || e}`);
      }
    }

    async function loadQueue() {
      let queue = [];
      try {
        queue = (await ctx.native.spotifyQueue()) || [];
      } catch (e) {
        if (alive()) {
          queueItems = [];
          renderCoverRack();
          queueList.innerHTML = `<div class="sp-empty-row">Queue unavailable.</div>`;
          showStatus(`Queue: ${e.message || e}`);
        }
        return;
      }
      if (!alive()) return;
      queueItems = queue;
      renderCoverRack();
      queueCount.textContent = queue.length ? String(queue.length) : "";
      if (!queue.length) {
        queueList.innerHTML = `<div class="sp-empty-row">Nothing queued.</div>`;
        return;
      }
      queueList.innerHTML = "";
      for (const item of queue) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "sp-queue-item";
        row.title = `Play ${item.title} next`;
        const name = document.createElement("span");
        name.className = "sp-queue-name";
        name.textContent = item.title || "";
        const artist = document.createElement("span");
        artist.className = "sp-queue-artist";
        artist.textContent = item.artist || "";
        row.append(name, artist);
        row.addEventListener("click", () => void jumpQueueItem(item));
        queueList.appendChild(row);
      }
    }

    async function loadContext(uri) {
      if (!uri) {
        contextInfo = null;
        renderCoverRack();
        return;
      }
      if (contextCache.has(uri)) {
        contextInfo = contextCache.get(uri);
        renderCoverRack();
        return;
      }
      const info = await ctx.native.spotifyContext(uri).catch(() => null);
      if (!alive() || contextKey !== uri) return;
      contextInfo = info || null;
      contextCache.set(uri, contextInfo);
      renderCoverRack();
    }

    function coverButton({ image, title, className, onClick }) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sp-cover ${className}`;
      button.title = title;
      if (image) {
        const img = document.createElement("img");
        img.src = image;
        img.alt = "";
        button.appendChild(img);
      } else {
        const fallback = document.createElement("span");
        fallback.className = "sp-cover-fallback";
        fallback.textContent = (title || "?").slice(0, 1).toUpperCase();
        button.appendChild(fallback);
      }
      button.addEventListener("click", onClick);
      return button;
    }

    function renderCoverRack() {
      if (!coverRack) return;
      coverRack.innerHTML = "";
      const upcoming = queueItems.slice(0, 5);
      // Right-to-left order: the playlist cover sits at the far right, then the
      // immediate next song, then the 2nd next, and so on. Appending in reverse
      // gives that layout with a normal left-to-right flex row, while the
      // z-index still keeps the next song above the later ones.
      for (let index = upcoming.length - 1; index >= 0; index -= 1) {
        const item = upcoming[index];
        const cover = coverButton({
          image: item.art || "",
          title: `Play ${item.title || "next track"}`,
          className: `sp-cover-next sp-cover-rank-${index + 1}${index === 0 ? " sp-cover-next-first" : ""}`,
          onClick: () => void jumpQueueItem(item),
        });
        cover.style.setProperty("--sp-cover-z", String(6 - index));
        coverRack.appendChild(cover);
      }
      if (contextKey) {
        const contextName = (contextInfo && contextInfo.name) || (current && current.context_type ? `${current.context_type} context` : "Current playlist");
        coverRack.appendChild(
          coverButton({
            image: (contextInfo && contextInfo.image) || "",
            title: `Open ${contextName}`,
            className: "sp-cover-current",
            onClick: () => openSpotify(contextKey),
          })
        );
      }
      coverRack.hidden = !coverRack.children.length;
      if (coverRack.hidden) coverRack.classList.remove("is-expanded");
    }

    function expandCoverRack() {
      clearTimeout(rackCollapseTimer);
      coverRack.classList.add("is-expanded");
    }
    function scheduleCollapseCoverRack() {
      clearTimeout(rackCollapseTimer);
      rackCollapseTimer = setTimeout(() => {
        if (coverRack.matches(":hover") || coverRack.contains(document.activeElement)) return;
        coverRack.classList.remove("is-expanded");
      }, 160);
    }
    coverRack.addEventListener("mouseover", (e) => {
      if (e.target.closest(".sp-cover-current")) expandCoverRack();
    });
    coverRack.addEventListener("mouseleave", scheduleCollapseCoverRack);
    coverRack.addEventListener("focusin", (e) => {
      if (e.target.closest(".sp-cover-current")) expandCoverRack();
    });
    coverRack.addEventListener("focusout", scheduleCollapseCoverRack);

    function linkPill(label, url, onClick) {
      const link = document.createElement("a");
      link.className = "sp-link-pill";
      link.textContent = label;
      link.href = url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
      return link;
    }

    function renderTopTracks(tracks) {
      topTracksList.innerHTML = "";
      if (!tracks || !tracks.length) {
        topTracksPanel.hidden = true;
        return;
      }
      topTracksPanel.hidden = false;
      tracks.forEach((track, index) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "sp-top-track";
        row.title = `Play ${track.name || "track"}`;
        const num = document.createElement("span");
        num.className = "sp-top-index";
        num.textContent = String(index + 1);
        row.appendChild(num);
        if (track.art) {
          const img = document.createElement("img");
          img.className = "sp-top-art";
          img.src = track.art;
          img.alt = "";
          row.appendChild(img);
        }
        const meta = document.createElement("span");
        meta.className = "sp-top-meta";
        const name = document.createElement("span");
        name.className = "sp-top-name";
        name.textContent = track.name || "";
        const artist = document.createElement("span");
        artist.className = "sp-top-artist";
        artist.textContent = track.artists || track.album || "";
        meta.append(name, artist);
        row.appendChild(meta);
        const dur = document.createElement("span");
        dur.className = "sp-top-dur";
        dur.textContent = fmtTime(track.duration_ms);
        row.appendChild(dur);
        row.addEventListener("click", async () => {
          if (!track.uri) return;
          try {
            await ctx.native.spotifyPlayUri(track.uri);
            await new Promise((resolve) => setTimeout(resolve, 450));
            await refreshNow();
            void loadQueue();
          } catch (e) {
            showStatus(`Top tracks: ${e.message || e}`);
          }
        });
        topTracksList.appendChild(row);
      });
    }

    function renderPlaylistEmpty(message, reconnect) {
      playlistGrid.innerHTML = "";
      playlistEmpty.hidden = false;
      playlistEmpty.innerHTML = "";
      const text = document.createElement("div");
      text.className = "sp-playlist-empty-msg";
      text.textContent = message;
      playlistEmpty.appendChild(text);
      if (reconnect) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn primary";
        button.textContent = "Open Spotify settings";
        button.addEventListener("click", () => {
          closePlaylistDrawer();
          ctx.openSettings("spotify");
        });
        playlistEmpty.appendChild(button);
      }
    }

    function renderPlaylists() {
      playlistGrid.innerHTML = "";
      playlistEmpty.hidden = true;
      if (!playlists || !playlists.length) {
        playlistStatus.textContent = "";
        renderPlaylistEmpty("No playlists found.", false);
        return;
      }
      playlistStatus.textContent = `${playlists.length} playlists`;
      for (const pl of playlists) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "sp-pl-disc";
        button.title = `Play ${pl.name || "playlist"}`;
        const vinyl = document.createElement("span");
        vinyl.className = "sp-pl-vinyl";
        const label = document.createElement("span");
        label.className = "sp-pl-label";
        if (pl.image) {
          const img = document.createElement("img");
          img.src = pl.image;
          img.alt = "";
          img.loading = "lazy";
          label.appendChild(img);
        } else {
          label.textContent = (pl.name || "?").slice(0, 1).toUpperCase();
        }
        const hole = document.createElement("span");
        hole.className = "sp-pl-hole";
        vinyl.append(label, hole);
        const name = document.createElement("span");
        name.className = "sp-pl-name";
        name.textContent = pl.name || "Untitled playlist";
        const meta = document.createElement("span");
        meta.className = "sp-pl-meta";
        meta.textContent = `${pl.tracks || 0} tracks${pl.owner ? ` · ${pl.owner}` : ""}`;
        button.append(vinyl, name, meta);
        button.addEventListener("click", () => void playPlaylist(pl));
        playlistGrid.appendChild(button);
      }
    }

    async function playPlaylist(pl) {
      if (!pl || !pl.uri) return;
      playlistStatus.textContent = "starting…";
      try {
        await ctx.native.spotifyPlayContext(pl.uri);
        closePlaylistDrawer();
        await refreshNow();
        void loadQueue();
      } catch (e) {
        playlistStatus.textContent = "playback error";
        showStatus(`Playlist: ${e.message || e}`);
      }
    }

    async function loadPlaylists(force) {
      if (playlistsLoading) return;
      if (playlists && !force) {
        renderPlaylists();
        return;
      }
      playlistsLoading = true;
      playlistStatus.textContent = "loading…";
      playlistGrid.innerHTML = "";
      playlistEmpty.hidden = true;
      try {
        const list = await ctx.native.spotifyPlaylists();
        if (!alive()) return;
        playlists = Array.isArray(list) ? list : [];
        renderPlaylists();
      } catch (e) {
        if (!alive()) return;
        playlists = null;
        const message = String(e && e.message ? e.message : e);
        if (message.includes("403")) {
          playlistStatus.textContent = "reconnect";
          renderPlaylistEmpty("Reconnect Spotify to load your playlists.", true);
        } else {
          playlistStatus.textContent = "error";
          renderPlaylistEmpty("Could not load playlists.", false);
        }
      } finally {
        playlistsLoading = false;
      }
    }

    function openPlaylistDrawer() {
      clearTimeout(drawerHideTimer);
      playlistDrawer.classList.add("open");
      playlistDrawer.setAttribute("aria-hidden", "false");
      void loadPlaylists();
    }
    function closePlaylistDrawer() {
      clearTimeout(drawerHideTimer);
      playlistDrawer.classList.remove("open");
      playlistDrawer.setAttribute("aria-hidden", "true");
    }
    function scheduleClosePlaylistDrawer() {
      clearTimeout(drawerHideTimer);
      drawerHideTimer = setTimeout(() => {
        if (playlistDrawer.matches(":hover") || playlistDrawer.contains(document.activeElement)) return;
        closePlaylistDrawer();
      }, 220);
    }
    playlistHotspot.addEventListener("mouseenter", openPlaylistDrawer);
    playlistHotspot.addEventListener("focus", openPlaylistDrawer);
    playlistHotspot.addEventListener("click", openPlaylistDrawer);
    playlistDrawer.addEventListener("mouseenter", () => clearTimeout(drawerHideTimer));
    playlistDrawer.addEventListener("mouseleave", scheduleClosePlaylistDrawer);
    playlistDrawer.addEventListener("focusin", () => clearTimeout(drawerHideTimer));
    playlistDrawer.addEventListener("focusout", scheduleClosePlaylistDrawer);
    playlistDrawer.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePlaylistDrawer();
    });
    playlistClose.addEventListener("click", closePlaylistDrawer);

    function applyArtist(entry) {
      if (!entry || !entry.id) {
        aboutPanel.hidden = true;
        return;
      }
      aboutPanel.hidden = false;
      if (entry.image) {
        artistImg.src = entry.image;
        artistImg.hidden = false;
        artistFallback.hidden = true;
      } else {
        artistImg.removeAttribute("src");
        artistImg.hidden = true;
        artistFallback.hidden = false;
        artistFallback.textContent = (entry.name || "?").slice(0, 1).toUpperCase();
      }
      artistLink.textContent = `${entry.name || "Artist"} ↗`;
      artistLink.href = `https://open.spotify.com/artist/${entry.id}`;
      artistLink.onclick = (e) => {
        e.preventDefault();
        openSpotify(`spotify:artist:${entry.id}`);
      };

      const stats = [];
      if (entry.followers) stats.push(`${fmtNumber(entry.followers)} followers`);
      if (entry.popularity) stats.push(`${entry.popularity}/100 popularity`);
      aboutStats.textContent = stats.join(" · ");

      const genres = Array.isArray(entry.genres) ? entry.genres.filter(Boolean).slice(0, 4) : [];
      artistGenres.textContent = genres.join(" · ");
      artistGenres.hidden = !genres.length;

      const summary = entry.web && entry.web.summary ? String(entry.web.summary).trim() : "";
      aboutBio.textContent = summary;
      aboutBio.hidden = !summary;

      aboutLinks.innerHTML = "";
      aboutLinks.appendChild(
        linkPill("Spotify", `https://open.spotify.com/artist/${entry.id}`, () =>
          openSpotify(`spotify:artist:${entry.id}`)
        )
      );
      for (const link of (entry.web && entry.web.links) || []) {
        if (!link || !link.url || !link.label) continue;
        aboutLinks.appendChild(linkPill(link.label, link.url, () => openSpotifyRaw(link.url)));
      }
      aboutLinks.hidden = false;

      renderTopTracks(entry.topTracks || []);
    }

    async function openSpotifyRaw(url) {
      if (!url) return;
      try {
        await ctx.native.openUrl(url);
      } catch {
        // External links have no protocol fallback; the click failing is quiet.
      }
    }

    async function loadArtist(id) {
      if (!id) {
        applyArtist(null);
        return;
      }
      const cache = appState(ctx).artistCache || (appState(ctx).artistCache = {});
      const hit = cache[id];
      if (hit && hit.v === 2 && Date.now() - Number(hit.at || 0) < 86_400_000) {
        applyArtist(hit);
        return;
      }
      aboutPanel.hidden = true;
      const [artist, topTracks] = await Promise.all([
        ctx.native.spotifyArtist(id).catch(() => null),
        ctx.native.spotifyArtistTopTracks(id).catch(() => null),
      ]);
      if (!alive() || lastArtistId !== id) return;
      const topTracksFailed = topTracks === null;
      const entry = {
        id,
        name: (artist && artist.name) || (current && current.artist) || "Artist",
        image: (artist && artist.image) || "",
        genres: (artist && artist.genres) || [],
        followers: (artist && artist.followers) || 0,
        popularity: (artist && artist.popularity) || 0,
        topTracks: Array.isArray(topTracks) ? topTracks : [],
        web: null,
        v: 2,
        at: Date.now(),
      };
      applyArtist(entry);

      // Enrich with Wikipedia/social links without delaying the basic card.
      let web = null;
      let webFailed = false;
      try {
        web = await ctx.native.artistWebInfo(id);
      } catch {
        webFailed = true;
      }
      if (!alive() || lastArtistId !== id) return;
      entry.web = web || null;
      entry.at = Date.now();
      applyArtist(entry);

      // Do not cache transient failures for 24h; refetch on the next track.
      if (artist && !topTracksFailed && !webFailed) {
        cache[id] = entry;
        const keys = Object.keys(cache);
        if (keys.length > 30) {
          keys.sort((a, b) => Number(cache[a].at || 0) - Number(cache[b].at || 0));
          for (const key of keys.slice(0, keys.length - 30)) delete cache[key];
        }
        ctx.saveState();
      }
    }

    playBtn.addEventListener("click", async () => {
      try {
        await ctx.native.spotifyPlay(!playing);
        await refreshNow();
      } catch (e) {
        showStatus(`Playback: ${e.message || e}`);
      }
    });
    container.querySelector(".sp-next").addEventListener("click", async () => {
      try {
        await ctx.native.spotifySkip(true);
        await refreshNow();
      } catch (e) {
        showStatus(`Playback: ${e.message || e}`);
      }
    });
    container.querySelector(".sp-prev").addEventListener("click", async () => {
      try {
        await ctx.native.spotifySkip(false);
        await refreshNow();
      } catch (e) {
        showStatus(`Playback: ${e.message || e}`);
      }
    });
    shuffleBtn.addEventListener("click", async () => {
      try {
        await ctx.native.spotifyShuffle(!(current && current.shuffle));
        await refreshNow();
      } catch (e) {
        showStatus(`Shuffle: ${e.message || e}`);
      }
    });
    repeatBtn.addEventListener("click", async () => {
      const cur = (current && current.repeat) || "off";
      const next = cur === "off" ? "context" : cur === "context" ? "track" : "off";
      try {
        await ctx.native.spotifyRepeat(next);
        await refreshNow();
      } catch (e) {
        showStatus(`Repeat: ${e.message || e}`);
      }
    });
    volEl.addEventListener("input", () => {
      if (volValue) volValue.textContent = `${volEl.value}%`;
    });
    volEl.addEventListener("change", async () => {
      try {
        await ctx.native.spotifyVolume(Number(volEl.value));
      } catch (e) {
        showStatus(`Volume: ${e.message || e}`);
      }
    });
    container.querySelector(".sp-lyrics-settings").addEventListener("click", () => ctx.openSettings("lyrics"));

    const clampSplit = (value) => Math.max(35, Math.min(75, Number(value) || 58));
    const applySplit = (value) => {
      const pct = clampSplit(value);
      container.style.setProperty("--sp-split", pct.toFixed(1));
      splitter.setAttribute("aria-valuenow", String(Math.round(pct)));
      return pct;
    };
    applySplit(appSettings.split);
    let splitDrag = false;
    splitter.addEventListener("pointerdown", (e) => {
      if (window.matchMedia("(max-width: 1050px)").matches) return;
      splitDrag = true;
      splitter.classList.add("is-dragging");
      splitter.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    splitter.addEventListener("pointermove", (e) => {
      if (!splitDrag) return;
      const rect = root.getBoundingClientRect();
      applySplit(((e.clientX - rect.left) / Math.max(1, rect.width)) * 100);
    });
    const endSplitDrag = (e) => {
      if (!splitDrag) return;
      splitDrag = false;
      splitter.classList.remove("is-dragging");
      const rect = root.getBoundingClientRect();
      appSettings.split = Math.round(applySplit(((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
      ctx.saveState();
    };
    splitter.addEventListener("pointerup", endSplitDrag);
    splitter.addEventListener("pointercancel", () => {
      if (!splitDrag) return;
      splitDrag = false;
      splitter.classList.remove("is-dragging");
      applySplit(appSettings.split);
    });
    splitter.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const delta = e.key === "ArrowLeft" ? -2 : 2;
      appSettings.split = Math.round(applySplit(Number(appSettings.split) + delta));
      ctx.saveState();
    });

    openTrackBtn.addEventListener("click", () => openSpotify(current && current.uri));

    function seekFromPointer(e) {
      if (!durationMs) return;
      const rect = progressEl.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const ms = Math.round(ratio * durationMs);
      anchorProgress = ms;
      anchorAt = performance.now();
      updateProgress();
      ctx.native.spotifySeek(ms).catch((err) => showStatus(`Seek: ${err.message || err}`));
    }
    progressEl.addEventListener("pointerdown", (e) => {
      progressEl.setPointerCapture(e.pointerId);
      seekFromPointer(e);
    });
    progressEl.addEventListener("pointermove", (e) => {
      if (progressEl.hasPointerCapture(e.pointerId)) seekFromPointer(e);
    });
    progressEl.addEventListener("keydown", (e) => {
      if (!durationMs) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -5000 : 5000;
        const ms = Math.min(durationMs, Math.max(0, anchorProgress + delta));
        anchorProgress = ms;
        anchorAt = performance.now();
        updateProgress();
        ctx.native.spotifySeek(ms).catch((err) => showStatus(`Seek: ${err.message || err}`));
      }
    });

    // Lyrics share the existing renderer and its Focus/Full/translation logic.
    ctx.renderLyrics(lyricsHost, ctx.spotifyLyricsComp());
    if (appSettings.focus) setFocus(true, false);

    ctx.subscribePlayback(container, (track) => {
      if (alive()) applyTrack(track);
    }, { fast: true });
    ctx.addTimer(container, setInterval(() => {
      if (alive()) updateProgress();
    }, 250));
    ctx.addTimer(container, () => clearTimeout(statusTimer));
    ctx.addTimer(container, () => clearTimeout(drawerHideTimer));
    ctx.addTimer(container, () => clearTimeout(rackCollapseTimer));

    void syncVolume();
    void refreshNow();
  }

  APPS.spotify = {
    label: "Spotify",
    mount(container, ctx) {
      container.innerHTML = `<div class="sp-app sp-loading"><div class="sp-loading-disc" aria-hidden="true"></div><div>Loading Spotify…</div></div>`;
      const run = `check-${Date.now()}-${Math.random()}`;
      container.dataset.spRun = run;
      (async () => {
        const connected = await ctx.native.spotifyConnected().catch(() => false);
        if (container.dataset.spRun !== run) return;
        if (!connected) {
          renderConnect(container, ctx);
          return;
        }
        renderApp(container, ctx);
      })();
    },
    unmount(container, ctx) {
      container.dataset.spRun = `off-${Date.now()}`;
      const lyricsHost = container.querySelector?.(".sp-lyrics-host");
      if (lyricsHost && ctx?.clearBodyTimers) ctx.clearBodyTimers(lyricsHost);
      container.innerHTML = "";
    },
  };
})();
