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
  const VOLUME = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9a4 4 0 0 1 0 6"/></svg>`;
  const EXTERNAL = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="m21 3-9 9"/><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>`;
  const REFRESH = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>`;
  const GEAR = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4"/></svg>`;

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
    container.innerHTML = `
      <div class="sp-app">
        <section class="sp-hero">
          <div class="sp-stage" aria-hidden="true">
            <div class="sp-sleeve"><img class="sp-sleeve-art" alt="" /></div>
            <div class="sp-disc">
              <div class="sp-disc-label"><img class="sp-label-art" alt="" /></div>
              <span class="sp-disc-hole"></span>
            </div>
            <div class="sp-tonearm"><span class="sp-tonearm-base"></span><span class="sp-tonearm-arm"></span></div>
          </div>
          <div class="sp-meta">
            <div class="sp-kicker">
              <span class="sp-context-type"></span>
              <button class="sp-link-btn sp-open-context" title="Open current playlist/album in Spotify" hidden>${EXTERNAL}</button>
            </div>
            <div class="sp-title-row">
              <h1 class="sp-title">Nothing playing</h1>
              <button class="sp-link-btn sp-open-track" title="Open current track in Spotify" hidden>${EXTERNAL}</button>
            </div>
            <div class="sp-artist-line"></div>
            <div class="sp-album"></div>
          </div>
          <div class="sp-device-row">
            <span class="sp-device-label">Playing on</span>
            <select class="sp-device" aria-label="Playback device"></select>
            <button class="sp-link-btn sp-device-refresh" title="Refresh devices">${REFRESH}</button>
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
            <div class="sp-volume">${VOLUME}<input class="sp-vol" type="range" min="0" max="100" value="50" aria-label="Volume" /></div>
          </div>
          <div class="sp-status" role="status"></div>
          <div class="sp-artist-card" hidden>
            <img class="sp-artist-img" alt="" />
            <div class="sp-artist-info">
              <a class="sp-artist-link" href="#" target="_blank" rel="noreferrer"></a>
              <div class="sp-artist-genres"></div>
              <div class="sp-artist-followers"></div>
            </div>
          </div>
        </section>
        <aside class="sp-side">
          <section class="sp-queue-panel">
            <header class="sp-panel-head"><h2>Up next</h2><span class="sp-queue-count"></span></header>
            <div class="sp-queue-list"></div>
          </section>
          <section class="sp-lyrics-panel">
            <header class="sp-panel-head"><h2>Lyrics</h2><button class="sp-link-btn sp-lyrics-settings" title="Spotify app lyrics settings">${GEAR}</button></header>
            <div class="sp-lyrics-host"></div>
          </section>
        </aside>
      </div>`;

    const root = container.querySelector(".sp-app");
    const sleeveArt = container.querySelector(".sp-sleeve-art");
    const labelArt = container.querySelector(".sp-label-art");
    const titleEl = container.querySelector(".sp-title");
    const artistEl = container.querySelector(".sp-artist-line");
    const albumEl = container.querySelector(".sp-album");
    const contextEl = container.querySelector(".sp-context-type");
    const openContextBtn = container.querySelector(".sp-open-context");
    const openTrackBtn = container.querySelector(".sp-open-track");
    const playBtn = container.querySelector(".sp-play");
    const shuffleBtn = container.querySelector(".sp-shuffle");
    const repeatBtn = container.querySelector(".sp-repeat");
    const deviceSelect = container.querySelector(".sp-device");
    const statusEl = container.querySelector(".sp-status");
    const curEl = container.querySelector(".sp-cur");
    const durEl = container.querySelector(".sp-dur");
    const progressEl = container.querySelector(".sp-progress");
    const fillEl = container.querySelector(".sp-progress-fill");
    const queueList = container.querySelector(".sp-queue-list");
    const queueCount = container.querySelector(".sp-queue-count");
    const artistCard = container.querySelector(".sp-artist-card");
    const artistImg = container.querySelector(".sp-artist-img");
    const artistLink = container.querySelector(".sp-artist-link");
    const artistGenres = container.querySelector(".sp-artist-genres");
    const artistFollowers = container.querySelector(".sp-artist-followers");
    const volEl = container.querySelector(".sp-vol");
    const lyricsHost = container.querySelector(".sp-lyrics-host");

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
        contextEl.textContent = "";
        openContextBtn.hidden = true;
        openTrackBtn.hidden = true;
        paintArt("");
        playing = false;
        durationMs = 0;
        anchorProgress = 0;
        root.classList.remove("is-playing");
        playBtn.innerHTML = PLAY;
        artistCard.hidden = true;
        lastArtistId = "";
        lastQueueKey = "";
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
      contextEl.textContent = track.context_type ? track.context_type.toUpperCase() : "";
      openContextBtn.hidden = !track.context_uri;
      openTrackBtn.hidden = !track.uri;
      paintArt(track.art);
      playBtn.innerHTML = playing ? PAUSE : PLAY;
      shuffleBtn.classList.toggle("is-on", !!track.shuffle);
      shuffleBtn.title = track.smart_shuffle ? "Smart Shuffle is on" : "Shuffle";
      repeatBtn.classList.toggle("is-on", track.repeat && track.repeat !== "off");
      repeatBtn.title = `Repeat: ${track.repeat || "off"}`;
      updateProgress();

      if (track.artist_id && track.artist_id !== lastArtistId) {
        lastArtistId = track.artist_id;
        void loadArtist(track.artist_id);
      } else if (!track.artist_id) {
        lastArtistId = "";
        artistCard.hidden = true;
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

    async function loadDevices() {
      let devices = [];
      try {
        devices = (await ctx.native.spotifyDevices()) || [];
      } catch (e) {
        if (alive()) showStatus(`Devices: ${e.message || e}`);
      }
      if (!alive()) return;
      deviceSelect.innerHTML = "";
      if (!devices.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No active device";
        deviceSelect.appendChild(opt);
        deviceSelect.disabled = true;
        return;
      }
      deviceSelect.disabled = false;
      for (const device of devices) {
        const opt = document.createElement("option");
        opt.value = device.id || "";
        opt.textContent = `${device.name || device.device_type || "Device"}${device.device_type ? ` · ${device.device_type}` : ""}`;
        if (device.active) opt.selected = true;
        deviceSelect.appendChild(opt);
        if (device.active && device.volume_percent != null) {
          volEl.value = String(device.volume_percent);
        }
      }
    }

    async function loadQueue() {
      let queue = [];
      try {
        queue = (await ctx.native.spotifyQueue()) || [];
      } catch (e) {
        if (alive()) {
          queueList.innerHTML = `<div class="sp-empty-row">Queue unavailable.</div>`;
          showStatus(`Queue: ${e.message || e}`);
        }
        return;
      }
      if (!alive()) return;
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
        row.addEventListener("click", async () => {
          try {
            if (current && current.context_uri && item.uri) {
              await ctx.native.spotifyJump(current.context_uri, item.uri);
            } else {
              await ctx.native.spotifySkip(true);
            }
            await refreshNow();
            void loadQueue();
          } catch {
            try {
              await ctx.native.spotifySkip(true);
              await refreshNow();
            } catch (e) {
              showStatus(`Playback: ${e.message || e}`);
            }
          }
        });
        queueList.appendChild(row);
      }
    }

    function applyArtist(artist) {
      if (!artist) {
        artistCard.hidden = true;
        return;
      }
      artistCard.hidden = false;
      if (artist.image) {
        artistImg.src = artist.image;
        artistImg.hidden = false;
      } else {
        artistImg.removeAttribute("src");
        artistImg.hidden = true;
      }
      artistLink.textContent = `${artist.name || "Artist"} ↗`;
      artistLink.href = artist.id ? `https://open.spotify.com/artist/${artist.id}` : "#";
      artistLink.onclick = (e) => {
        e.preventDefault();
        openSpotify(artist.id ? `spotify:artist:${artist.id}` : "");
      };
      artistGenres.textContent = (artist.genres || []).slice(0, 3).join(" · ");
      artistFollowers.textContent = artist.followers ? `${fmtNumber(artist.followers)} followers` : "";
    }

    async function loadArtist(id) {
      if (!id) {
        applyArtist(null);
        return;
      }
      const cache = appState(ctx).artistCache || (appState(ctx).artistCache = {});
      const hit = cache[id];
      if (hit && Date.now() - Number(hit.at || 0) < 86_400_000) {
        applyArtist(hit);
        return;
      }
      artistCard.hidden = true;
      const artist = await ctx.native.spotifyArtist(id).catch(() => null);
      if (!alive() || lastArtistId !== id) return;
      if (!artist) {
        // Keep the link usable even when metadata fails.
        artistCard.hidden = false;
        artistImg.hidden = true;
        artistImg.removeAttribute("src");
        artistLink.textContent = `${(current && current.artist) || "Artist"} ↗`;
        artistLink.href = `https://open.spotify.com/artist/${id}`;
        artistLink.onclick = (e) => {
          e.preventDefault();
          openSpotify(`spotify:artist:${id}`);
        };
        artistGenres.textContent = "";
        artistFollowers.textContent = "";
        return;
      }
      const entry = { ...artist, at: Date.now() };
      cache[id] = entry;
      const keys = Object.keys(cache);
      if (keys.length > 30) {
        keys.sort((a, b) => Number(cache[a].at || 0) - Number(cache[b].at || 0));
        for (const key of keys.slice(0, keys.length - 30)) delete cache[key];
      }
      ctx.saveState();
      applyArtist(entry);
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
    volEl.addEventListener("change", async () => {
      try {
        await ctx.native.spotifyVolume(Number(volEl.value));
      } catch (e) {
        showStatus(`Volume: ${e.message || e}`);
      }
    });
    deviceSelect.addEventListener("change", async () => {
      if (!deviceSelect.value) return;
      try {
        await ctx.native.spotifyTransfer(deviceSelect.value, true);
        await new Promise((resolve) => setTimeout(resolve, 350));
        await loadDevices();
        await refreshNow();
      } catch (e) {
        showStatus(`Device: ${e.message || e}`);
      }
    });
    container.querySelector(".sp-device-refresh").addEventListener("click", () => {
      void loadDevices();
      void refreshNow();
    });
    container.querySelector(".sp-lyrics-settings").addEventListener("click", () => ctx.openSettings("lyrics"));
    openContextBtn.addEventListener("click", () => openSpotify(current && current.context_uri));
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

    ctx.subscribePlayback(container, (track) => {
      if (alive()) applyTrack(track);
    }, { fast: true });
    ctx.addTimer(container, setInterval(() => {
      if (alive()) updateProgress();
    }, 250));
    ctx.addTimer(container, () => clearTimeout(statusTimer));

    void loadDevices();
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
