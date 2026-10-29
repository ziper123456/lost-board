/*
 * Article-aware answer matching for the vocab drill (nouns).
 *
 * Loaded as a plain <script> in drill.html (exposes window.VocabMatch) and
 * require()-able from node for tests.
 *
 * Rules:
 *  - A noun may be typed with or without a DEFINITE article (el/la/los/las,
 *    der/die/das). A wrong definite article is reported as an "article-wrong"
 *    slip (still counts as the right noun).
 *  - INDEFINITE articles (un/una/..., ein/eine/...) are stripped and treated as
 *    "no article": they don't encode a checkable gender here, so they never
 *    cause a slip.
 *  - Answer matching is case- and diacritic-insensitive. German ß is accepted as
 *    a single s ("groß" can be typed "gros"), and Spanish ¿ ¡ ? ! punctuation is
 *    ignored ("¿Cómo estás?" can be typed "como estas").
 */
(function (global) {
  "use strict";

  const norm = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[ßẞ]/g, "s")
      .replace(/[¿¡?!]/g, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  const DEFINITE = ["el", "la", "los", "las", "der", "die", "das"];
  const INDEFINITE = ["un", "una", "unos", "unas", "ein", "eine", "einen", "einem", "einer", "eines"];

  function matchArticle(n, list) {
    for (const a of list) {
      if (n === a) return { hit: true, article: a, noun: "" };
      if (n.startsWith(a + " ")) return { hit: true, article: a, noun: n.slice(a.length + 1).trim() };
    }
    return null;
  }

  // -> { article: string|null, noun: string }
  function splitArticle(s) {
    const n = norm(s);
    const def = matchArticle(n, DEFINITE);
    if (def) return { article: def.article, noun: def.noun };
    const indef = matchArticle(n, INDEFINITE);
    if (indef) return { article: null, noun: indef.noun };
    return { article: null, noun: n };
  }

  function expectedNoun(canonical, detailArticle) {
    const parsed = splitArticle(canonical);
    const art = parsed.article || norm(detailArticle || "");
    return { article: art, noun: parsed.noun };
  }

  // -> { status: "ok" | "article-wrong" | "wrong", expectedArticle?, inputArticle? }
  function evalOne(raw, canonical, noun) {
    if (!noun) {
      return norm(raw) === norm(canonical) ? { status: "ok" } : { status: "wrong" };
    }
    const got = splitArticle(raw);
    if (!got.noun || got.noun !== noun.noun) return { status: "wrong" };
    if (!got.article || !noun.article) return { status: "ok" };
    if (got.article === noun.article) return { status: "ok" };
    return { status: "article-wrong", expectedArticle: noun.article, inputArticle: got.article };
  }

  const api = { norm, splitArticle, expectedNoun, evalOne };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.VocabMatch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
