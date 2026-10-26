/*
 * Pure helpers for the Lyrics tile. Loaded in index.html before main.js and
 * require()-able from node for tests (scripts/test-lyrics.cjs).
 */
(function (global) {
  "use strict";

  // Index of the last line whose timestamp is <= ms (binary search). -1 before
  // the first line.
  function activeIndex(lines, ms) {
    if (!Array.isArray(lines) || !lines.length) return -1;
    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].t_ms <= ms) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  // Window [start, end) around idx, including `prev` before and `next` after.
  function focusWindow(len, idx, prev, next) {
    if (!len || len <= 0) return { start: 0, end: 0 };
    const i = Math.max(0, Math.min(len - 1, idx));
    const p = Math.max(0, Math.trunc(Number(prev)) || 0);
    const n = Math.max(0, Math.trunc(Number(next)) || 0);
    return { start: Math.max(0, i - p), end: Math.min(len, i + n + 1) };
  }

  // Playback position (ms) from a sample taken at `at` (performance.now),
  // evaluated at `now`, plus a sync offset. Clamped to [0, duration].
  function positionMs(track, at, now, offset) {
    if (!track) return 0;
    let p = Number(track.progress_ms) || 0;
    if (track.playing) p += Math.max(0, Number(now) - Number(at));
    const dur = Number(track.duration_ms) || 0;
    if (dur > 0) p = Math.min(p, dur);
    return Math.max(0, p + (Number(offset) || 0));
  }

  // Plain lyrics → non-empty trimmed lines. Providers sometimes store bilingual
  // lines as `original^translation`; keep the original (our translator handles
  // the rest).
  function parsePlain(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((s) => s.split("^")[0].trim())
      .filter(Boolean);
  }

  // Stable key for a track (used for per-track sync offsets).
  function trackKey(track) {
    if (!track) return "";
    return `${track.title || ""}|${track.artist || ""}|${track.album || ""}|${track.duration_ms || 0}`;
  }

  // Resolve target languages for a source from a `{lang: [targets], default: []}`
  // map: use the source's list (or `default`), never itself, max 2.
  function targetsFor(map, source) {
    const key = String(source || "").toLowerCase();
    const list = (map && (map[key] || map.default)) || ["en"];
    return list.filter((t) => t !== key).slice(0, 2);
  }

  // Small inline SVG flags (Windows doesn't render flag emoji). Only the four
  // supported target languages; unknown → no icon.
  const FLAG_SVGS = {
    en: `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#012169"/><path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" stroke-width="4"/><path d="M0,0 L30,20 M30,0 L0,20" stroke="#C8102E" stroke-width="2"/><rect x="12" width="6" height="20" fill="#fff"/><rect y="7" width="30" height="6" fill="#fff"/><rect x="13.5" width="3" height="20" fill="#C8102E"/><rect y="8.5" width="30" height="3" fill="#C8102E"/></svg>`,
    de: `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="6.67" fill="#000"/><rect y="6.67" width="30" height="6.67" fill="#DD0000"/><rect y="13.33" width="30" height="6.67" fill="#FFCE00"/></svg>`,
    es: `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/></svg>`,
    vi: `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg"><rect width="30" height="20" fill="#DA251D"/><polygon fill="#FF0" points="15,4 16.41,8.06 20.71,8.15 17.28,10.74 18.53,14.85 15,12.4 11.47,14.85 12.72,10.74 9.29,8.15 13.59,8.06"/></svg>`,
  };

  function flagSvg(lang) {
    return FLAG_SVGS[String(lang || "").toLowerCase()] || "";
  }

  const api = { activeIndex, focusWindow, positionMs, parsePlain, trackKey, targetsFor, flagSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LyricsUtil = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
