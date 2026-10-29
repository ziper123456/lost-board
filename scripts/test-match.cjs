// Node self-test for article-aware matching: node scripts/test-match.cjs
const assert = require("node:assert/strict");
const { norm, splitArticle, expectedNoun, evalOne } = require("../src/vocab-match.js");

// normalization: German ß is accepted as s, Spanish ¿ ¡ ? ! are ignored
assert.equal(norm("groß"), "gros");
assert.equal(norm("die Straße"), "die strase");
assert.equal(norm("¡Hola!"), "hola");
assert.equal(norm("¿Qué tal?"), "que tal");

// splitArticle: definite stripped, indefinite treated as no-article
assert.deepEqual(splitArticle("el piano"), { article: "el", noun: "piano" });
assert.deepEqual(splitArticle("La Cuerda"), { article: "la", noun: "cuerda" });
assert.deepEqual(splitArticle("piano"), { article: null, noun: "piano" });
assert.deepEqual(splitArticle("un juguete"), { article: null, noun: "juguete" });
assert.deepEqual(splitArticle("ein Spielzeug"), { article: null, noun: "spielzeug" });

// expectedNoun: article from canonical or enrichment fallback
assert.deepEqual(expectedNoun("el piano", "el"), { article: "el", noun: "piano" });
assert.deepEqual(expectedNoun("Schublade", "die"), { article: "die", noun: "schublade" });
assert.deepEqual(expectedNoun("el cajón", ""), { article: "el", noun: "cajon" });

const esPiano = { article: "el", noun: "piano" };
assert.equal(evalOne("piano", "el piano", esPiano).status, "ok");
assert.equal(evalOne("el piano", "el piano", esPiano).status, "ok");
assert.equal(evalOne("un piano", "el piano", esPiano).status, "ok"); // indefinite ignored
const wrong = evalOne("la piano", "el piano", esPiano);
assert.equal(wrong.status, "article-wrong");
assert.equal(wrong.expectedArticle, "el");
assert.equal(wrong.inputArticle, "la");
assert.equal(evalOne("piano rojo", "el piano", esPiano).status, "wrong");

const deDrawer = { article: "die", noun: "schublade" };
assert.equal(evalOne("Schublade", "die Schublade", deDrawer).status, "ok");
assert.equal(evalOne("eine Schublade", "die Schublade", deDrawer).status, "ok");
assert.equal(evalOne("der Schublade", "die Schublade", deDrawer).status, "article-wrong");

// non-nouns: plain normalized comparison
assert.equal(evalOne("hola", "hola", null).status, "ok");
assert.equal(evalOne("HOLA", "hola", null).status, "ok");
assert.equal(evalOne("adios", "hola", null).status, "wrong");

// ß can be typed as s, with or without an article
assert.equal(evalOne("gros", "groß", null).status, "ok");
assert.equal(evalOne("GROS", "groß", null).status, "ok");
assert.equal(evalOne("die strase", "die Straße", { article: "die", noun: "strase" }).status, "ok");

// Spanish punctuation does not need to be typed (either side)
assert.equal(evalOne("como estas", "¿Cómo estás?", null).status, "ok");
assert.equal(evalOne("hola", "¡Hola!", null).status, "ok");
assert.equal(evalOne("que tal", "¿Qué tal?", null).status, "ok");
assert.equal(evalOne("¿cómo estás?", "como estas", null).status, "ok");

console.log("match: all assertions passed");
