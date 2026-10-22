// Node self-test for the runtime conjugator (no deps): node scripts/test-conjugate.cjs
const assert = require("node:assert/strict");
const { conjugate } = require("../src/conjugate.js");

const es = (v) => conjugate(v, "es");
const de = (v) => conjugate(v, "de");
const t = (c, name) => c.tenses.find((x) => x.name === name).forms;

assert.deepEqual(t(es("hablar"), "Presente"), ["hablo", "hablas", "habla", "hablamos", "habláis", "hablan"]);
assert.deepEqual(t(es("hablar"), "Pretérito"), ["hablé", "hablaste", "habló", "hablamos", "hablasteis", "hablaron"]);
assert.deepEqual(t(es("tener"), "Presente"), ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"]);
assert.deepEqual(t(es("ser"), "Pretérito"), ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"]);
assert.deepEqual(t(es("pensar"), "Subjuntivo"), ["piense", "pienses", "piense", "pensemos", "penséis", "piensen"]);
assert.equal(t(es("pedir"), "Pretérito")[2], "pidió");
assert.equal(es("hablar").nonFinite.find((n) => n.name === "Participio").form, "hablado");
assert.equal(es("hablar").imperative.tu, "habla");

assert.deepEqual(t(de("machen"), "Präsens"), ["mache", "machst", "macht", "machen", "macht", "machen"]);
assert.deepEqual(t(de("gehen"), "Präteritum"), ["ging", "gingst", "ging", "gingen", "gingt", "gingen"]);
assert.equal(t(de("gehen"), "Perfekt")[0], "bin gegangen");
assert.deepEqual(t(de("sein"), "Präsens"), ["bin", "bist", "ist", "sind", "seid", "sind"]);
assert.deepEqual(t(de("können"), "Präsens"), ["kann", "kannst", "kann", "können", "könnt", "können"]);
assert.equal(t(de("sprechen"), "Präsens")[1], "sprichst");
assert.equal(t(de("aufstehen"), "Perfekt")[0], "bin aufgestanden");
assert.equal(t(de("aufstehen"), "Präteritum")[0], "aufstand");
assert.equal(t(de("heißen"), "Präsens")[1], "heißt");

// Phrases / non-infinitives are not conjugated.
assert.equal(es("jugar al baloncesto"), null);
assert.equal(de("xyz"), null);

console.log("conjugate: all assertions passed");
