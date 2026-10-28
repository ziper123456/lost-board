// Node self-test for colour helpers: node scripts/test-colors.cjs
const assert = require("node:assert/strict");
const C = require("../src/colors.js");

assert.deepEqual(C.hexToRgb("#ff8000"), { r: 255, g: 128, b: 0 });
assert.deepEqual(C.hexToRgb("#fff"), { r: 255, g: 255, b: 255 });
assert.deepEqual(C.hexToRgb("rgb(34, 34, 46)"), { r: 34, g: 34, b: 46 });
assert.deepEqual(C.hexToRgb("rgba(255, 128, 0, 0.55)"), { r: 255, g: 128, b: 0 });
assert.equal(C.rgbToHex(255, 128, 0), "#ff8000");

assert.equal(C.mixHex("#000000", "#ffffff", 0.5), "#808080");
assert.equal(C.mixHex("rgba(0, 0, 0, 0.5)", "#ffffff", 0.5), "#808080");
assert.equal(C.mixHex("#ff0000", "#0000ff", 0), "#ff0000");
assert.equal(C.mixHex("#ff0000", "#0000ff", 1), "#0000ff");

assert.ok(Math.abs(C.luminance("#ffffff") - 1) < 1e-6);
assert.ok(C.luminance("#000000") < 1e-6);
assert.equal(C.contrastOn("#ffffff"), "#000000");
assert.equal(C.contrastOn("#000000"), "#ffffff");

// clampLightness raises a near-black accent to the minimum lightness
const raised = C.clampLightness("#000000", 0.4, 0.8);
assert.equal(raised, "#666666");
// ...and leaves an in-range accent unchanged
assert.equal(C.clampLightness("#808080", 0.4, 0.8), "#808080");

console.log("colors: all assertions passed");
