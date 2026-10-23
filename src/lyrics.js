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

  // Plain lyrics → non-empty trimmed lines.
  function parsePlain(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Stable key for a track (used for per-track sync offsets).
  function trackKey(track) {
    if (!track) return "";
    return `${track.title || ""}|${track.artist || ""}|${track.album || ""}|${track.duration_ms || 0}`;
  }

  const api = { activeIndex, focusWindow, positionMs, parsePlain, trackKey };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.LyricsUtil = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
