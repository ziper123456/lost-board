// Node self-test for quick palette helpers: node scripts/test-palette.cjs
const assert = require("node:assert/strict");
const P = require("../src/palette.js");

assert.equal(P.normalize("  Héllo   Wörld "), "hello world");
assert.equal(P.normalize(null), "");

assert.equal(P.scoreItem({ label: "Settings" }, "set"), 800);
assert.equal(P.scoreItem({ label: "Open Settings" }, "set"), 650);
assert.equal(P.scoreItem({ label: "Azure repo" }, "repo"), 650);
assert.equal(P.scoreItem({ label: "Deploy" }, "plo"), 500);
assert.equal(P.scoreItem({ label: "Deploy", subtitle: "production" }, "prod"), 300);
assert.equal(P.scoreItem({ label: "Deploy", keywords: ["ship"] }, "ship"), 250);
assert.equal(P.scoreItem({ label: "Deploy" }, "zzz"), 0);

const items = [
  { group: "Tiles", label: "Projects", priority: 1 },
  { group: "Places", label: "traffiqx-core", priority: 3 },
  { group: "Commands", label: "Open Settings", priority: 5 },
  { group: "Places", label: "traffiqx-docs", priority: 2 },
];
assert.deepEqual(
  P.rankItems(items, "traffiqx").map((x) => x.label),
  ["traffiqx-core", "traffiqx-docs"],
);
assert.deepEqual(
  P.rankItems(items, "").map((x) => x.label),
  ["Open Settings", "traffiqx-core", "traffiqx-docs", "Projects"],
);
assert.deepEqual(
  P.groupResults(items, "traffiqx", 1).map((g) => [g.group, g.items.length]),
  [["Places", 1]],
);
assert.deepEqual(
  P.groupResults(items, "", 8).map((g) => g.group),
  ["Places", "Tiles", "Commands"],
);
assert.deepEqual(P.rankItems([], "anything"), []);
assert.deepEqual(P.groupResults([], "", 8), []);

console.log("palette tests passed");
