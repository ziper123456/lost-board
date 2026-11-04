/*
 * One-off, deterministic repairs for the bundled vocabulary deck.
 * Run with: node scripts/repair-vocab.mjs
 *
 * This intentionally covers only the issues found by the 2026-11-04 audit.
 * A separate audit pipeline handles the full LLM review.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "src-tauri", "resources", "cards.csv");
const EXTRA = path.join(ROOT, "src-tauri", "resources", "cards-extra.json");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
const header = rows.shift();
const ix = (name) => header.indexOf(name);
const iId = ix("id");
const iEn = ix("en_US");
const iEs = ix("es_ES");
const iDe = ix("de_DE");
const iCat = ix("categories");
const extra = JSON.parse(fs.readFileSync(EXTRA, "utf8"));
const byId = new Map(rows.map((r) => [r[iId], r]));

// 1. Common-gender Spanish nouns: make the detail article match the canonical
// el/la / los/las form.
for (const row of rows) {
  const card = extra[row[iId]];
  if (!card) continue;
  const es = String(row[iEs] || "");
  if (/^el\/la\s/.test(es)) {
    card.article = card.article || { es: "", de: "" };
    card.article.es = "el/la";
    if (/^(los|las)\s/.test(card.plural?.es || "")) {
      card.plural.es = card.plural.es.replace(/^(los|las)\s/, "los/las ");
    }
  }
}

// 2. Known highlight/example repairs. These are exact, reviewed fixes.
const fixes = {
  "6075": {
    example: { es: "Vamos a compartir la cuenta.", hl_es: "compartir" },
  },
  "2940": { example: { hl_de: "Terrasse" } },
  "2967": { example: { hl_de: "die Küche ... putzen" } },
  "3198": { example: { hl_de: "Jahreszeit" } },
  "3406": { example: { hl_de: "ziehen ... an" } },
  "5307": { example: { hl_de: "habe ... vergessen" } },
  "5413": { example: { hl_de: "gehe ... ins Bett" } },
  "5417": { example: { hl_de: "mache ... Abendessen" } },
  "5692": { example: { hl_de: "aufschreiben" } },
  "6421": { example: { hl_de: "Was gibt es heute Abend zu essen" } },
  "6874": { example: { hl_de: "setzt ... durch" } },
  "7832": { example: { hl_de: "ließen ... scheiden" } },
  "9656": { example: { hl_de: "Persönliche Beziehungen" } },
  "13063": {
    example: {
      de: "Der Flughafen liegt im Südosten der Stadt.",
      hl_de: "Südosten",
    },
  },
  "13505": { example: { hl_de: "rollte sich ... zusammen" } },
  "14845": { example: { hl_de: "ist ... schlecht" } },
};
for (const [id, patch] of Object.entries(fixes)) {
  const card = extra[id];
  if (!card) continue;
  card.example = card.example || {};
  Object.assign(card.example, patch.example);
}

// 3. Handball is the sport in this Sports card, not the football offence.
if (byId.has("11815")) {
  const row = byId.get("11815");
  row[iEs] = "el balonmano";
  row[iDe] = "Handball";
  const card = extra["11815"];
  if (card) {
    card.example = {
      en: "Handball is popular in Europe.",
      es: "El balonmano es popular en Europa.",
      de: "Handball ist in Europa beliebt.",
      hl_es: "balonmano",
      hl_de: "Handball",
    };
    card.note = "Sport. In football, a handball offence is 'mano' / 'Handspiel'.";
    card.article = { es: "el", de: card.article?.de || "der" };
    card.plural = { es: "", de: card.plural?.de || "" };
  }
}

// 4. Merge exact duplicate word triples. Keep the row with the richest category
// set, union all categories, and drop the extra duplicate rows.
const groups = new Map();
for (const row of rows) {
  const key = [row[iEn], row[iEs], row[iDe]].join("\u0000");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
const removed = new Set();
for (const group of groups.values()) {
  if (group.length < 2) continue;
  const score = (row) => {
    try {
      return JSON.parse(row[iCat] || "[]").length;
    } catch {
      return 0;
    }
  };
  const keep = group.slice().sort((a, b) => score(b) - score(a))[0];
  const cats = new Set();
  for (const row of group) {
    try {
      for (const cat of JSON.parse(row[iCat] || "[]")) cats.add(cat);
    } catch {}
  }
  keep[iCat] = JSON.stringify([...cats].sort((a, b) => a.localeCompare(b)));
  for (const row of group) {
    if (row === keep) continue;
    removed.add(row[iId]);
    delete extra[row[iId]];
  }
}

const outRows = [header, ...rows.filter((row) => !removed.has(row[iId]))];
fs.writeFileSync(
  CSV,
  outRows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n",
  "utf8",
);
fs.writeFileSync(EXTRA, JSON.stringify(extra, null, 2) + "\n", "utf8");

console.log(`repaired vocabulary: ${removed.size} duplicate rows removed`);
