/*
 * Dedupe exact EN/ES/DE triples after the LLM audit. Merges categories into the
 * richest row and removes duplicate rows/details. Run after audit apply.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "src-tauri", "resources", "cards.csv");
const EXTRA = path.join(ROOT, "src-tauri", "resources", "cards-extra.json");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function cell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const all = parseCsv(fs.readFileSync(CSV, "utf8"));
const header = all.shift();
const ix = (name) => header.indexOf(name);
const iId = ix("id"), iEn = ix("en_US"), iEs = ix("es_ES"), iDe = ix("de_DE"), iCat = ix("categories");
const extra = JSON.parse(fs.readFileSync(EXTRA, "utf8"));
const groups = new Map();
for (const row of all) {
  const key = [row[iEn], row[iEs], row[iDe]].join("\u0000");
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}
let removed = 0;
for (const group of groups.values()) {
  if (group.length < 2) continue;
  const score = (row) => {
    try { return JSON.parse(row[iCat] || "[]").length; } catch { return 0; }
  };
  group.sort((a, b) => score(b) - score(a));
  const keep = group[0];
  const cats = new Set();
  for (const row of group) {
    try { for (const c of JSON.parse(row[iCat] || "[]")) cats.add(c); } catch {}
  }
  keep[iCat] = JSON.stringify([...cats].sort((a, b) => a.localeCompare(b)));
  for (const row of group.slice(1)) {
    delete extra[row[iId]];
    row[iId] = "";
    removed++;
  }
}
const out = all.filter((row) => row[iId]);
fs.writeFileSync(CSV, [header.map(cell).join(","), ...out.map((r) => r.map(cell).join(","))].join("\n") + "\n", "utf8");
fs.writeFileSync(EXTRA, JSON.stringify(extra, null, 2) + "\n", "utf8");
console.log(`deduped ${removed} rows; ${out.length} cards remain`);
