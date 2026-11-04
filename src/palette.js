/*
 * Pure search helpers for the quick palette. Loaded before main.js and
 * require()-able from node for tests (scripts/test-palette.cjs).
 */
(function (global) {
  "use strict";

  const GROUP_ORDER = ["Places", "Tiles", "Commands"];

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function scoreItem(item, query) {
    const q = normalize(query);
    if (!q) return 1;
    const label = normalize(item.label);
    const subtitle = normalize(item.subtitle);
    const keywords = (item.keywords || []).map(normalize).join(" ");
    let score = 0;
    if (label === q) score = 1000;
    else if (label.startsWith(q)) score = 800;
    else if (new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(label)) score = 650;
    else if (label.includes(q)) score = 500;
    if (subtitle.includes(q)) score = Math.max(score, 300);
    if (keywords.includes(q)) score = Math.max(score, 250);
    return score;
  }

  function rankItems(items, query) {
    const q = normalize(query);
    const scored = (items || [])
      .map((item, index) => ({ item, index, score: scoreItem(item, q) }))
      .filter((row) => row.score > 0);
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ap = Number(a.item.priority) || 0;
      const bp = Number(b.item.priority) || 0;
      if (bp !== ap) return bp - ap;
      return a.index - b.index;
    });
    return scored.map((row) => row.item);
  }

  function groupResults(items, query, perGroup) {
    const limit = Math.max(1, Number(perGroup) || 8);
    const ranked = rankItems(items, query);
    const groups = [];
    for (const name of GROUP_ORDER) {
      const rows = ranked.filter((item) => item.group === name).slice(0, limit);
      if (rows.length) groups.push({ group: name, items: rows });
    }
    const known = new Set(GROUP_ORDER);
    const other = ranked.filter((item) => !known.has(item.group)).slice(0, limit);
    if (other.length) groups.push({ group: "Other", items: other });
    return groups;
  }

  const api = { normalize, scoreItem, rankItems, groupResults, GROUP_ORDER };
  global.PaletteUtil = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
