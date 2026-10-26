// Node self-test for lyrics helpers: node scripts/test-lyrics.cjs
const assert = require("node:assert/strict");
const L = require("../src/lyrics.js");

const lines = [{ t_ms: 1000 }, { t_ms: 5000 }, { t_ms: 9000 }];
assert.equal(L.activeIndex(lines, 0), -1);
assert.equal(L.activeIndex(lines, 999), -1);
assert.equal(L.activeIndex(lines, 1000), 0);
assert.equal(L.activeIndex(lines, 4999), 0);
assert.equal(L.activeIndex(lines, 5000), 1);
assert.equal(L.activeIndex(lines, 999999), 2);
assert.equal(L.activeIndex([], 100), -1);

assert.deepEqual(L.focusWindow(10, 5, 2, 3), { start: 3, end: 9 });
assert.deepEqual(L.focusWindow(10, 0, 3, 3), { start: 0, end: 4 });
assert.deepEqual(L.focusWindow(10, 9, 3, 3), { start: 6, end: 10 });
assert.deepEqual(L.focusWindow(0, 0, 3, 3), { start: 0, end: 0 });
assert.deepEqual(L.focusWindow(5, 2, 0, 0), { start: 2, end: 3 });

// positionMs: playing interpolates; paused does not; duration clamps; offset adds.
assert.equal(L.positionMs({ progress_ms: 1000, playing: true, duration_ms: 10000 }, 100, 600, 0), 1500);
assert.equal(L.positionMs({ progress_ms: 1000, playing: false, duration_ms: 10000 }, 100, 600, 0), 1000);
assert.equal(L.positionMs({ progress_ms: 9900, playing: true, duration_ms: 10000 }, 0, 500, 0), 10000);
assert.equal(L.positionMs({ progress_ms: 1000, playing: false, duration_ms: 10000 }, 0, 0, 250), 1250);
assert.equal(L.positionMs(null, 0, 0, 0), 0);

assert.deepEqual(L.parsePlain("a\n  b \n\nc\r\n"), ["a", "b", "c"]);
assert.deepEqual(L.parsePlain("Hola mundo^Hello world\nOtra linea^Another line"), ["Hola mundo", "Otra linea"]);

assert.equal(L.trackKey({ title: "T", artist: "A", album: "Al", duration_ms: 123 }), "T|A|Al|123");
assert.equal(L.trackKey(null), "");
assert.equal(L.trackKey({ title: "T" }), "T|||0");

const targetMap = { en: ["de", "es"], de: ["en", "es"], es: ["en", "de"], vi: ["de", "es"], default: ["en"] };
assert.deepEqual(L.targetsFor(targetMap, "en"), ["de", "es"]);
assert.deepEqual(L.targetsFor(targetMap, "fra"), ["en"]); // Other → English
assert.deepEqual(L.targetsFor(targetMap, "EN"), ["de", "es"]); // case-insensitive
// never translate to the source, cap at 2, and empty list = no targets
assert.deepEqual(L.targetsFor({ en: ["en", "de", "es"] }, "en"), ["de", "es"]);
assert.deepEqual(L.targetsFor({ fr: [] }, "fr"), []);
assert.deepEqual(L.targetsFor(null, "ja"), ["en"]);

assert.ok(L.flagSvg("de").includes("<svg"));
assert.ok(L.flagSvg("ES").includes("<svg"));
assert.equal(L.flagSvg("fr"), "");

console.log("lyrics: all assertions passed");
