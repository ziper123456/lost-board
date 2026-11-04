/*
 * Context helpers for the vocab drill. Loaded in drill.html before main.js and
 * require()-able from node for tests (scripts/test-context.cjs).
 */
(function (global) {
  "use strict";

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Replace every highlighted segment with a blank. Returns null when a segment
  // cannot be found, so callers can avoid showing an unmasked target sentence.
  function maskHighlight(text, highlight) {
    const src = String(text || "");
    const raw = String(highlight || "").trim();
    if (!src || !raw) return null;
    const parts = raw.split(/\.\.\.|…/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    let out = src;
    for (const part of parts) {
      const re = new RegExp(escapeRegExp(part), "i");
      const match = re.exec(out);
      if (!match) return null;
      out = out.slice(0, match.index) + "____" + out.slice(match.index + match[0].length);
    }
    return out;
  }

  const api = { maskHighlight };
  global.VocabContext = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
