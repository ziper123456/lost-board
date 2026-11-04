// Node self-test for drill context masking: node scripts/test-context.cjs
const assert = require("node:assert/strict");
const { maskHighlight } = require("../src/vocab-context.js");

assert.equal(maskHighlight("Ella compite en maratones.", "compite"), "Ella ____ en maratones.");
assert.equal(maskHighlight("Ella COMPITE en maratones.", "compite"), "Ella ____ en maratones.");
assert.equal(
  maskHighlight("Er weicht allen Fragen aus.", "weicht ... aus"),
  "Er ____ allen Fragen ____.",
);
assert.equal(
  maskHighlight("Die Katze rollte sich am Feuer zusammen.", "rollte sich ... zusammen"),
  "Die Katze ____ am Feuer ____.",
);
assert.equal(maskHighlight("No highlight", ""), null);
assert.equal(maskHighlight("No highlight", "missing"), null);
assert.equal(maskHighlight("", "word"), null);

console.log("context: all assertions passed");
