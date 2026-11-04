/*
 * Undo audit suggestions that accidentally put example sentences into the
 * translation columns. Run after restoring the pre-dedupe audit snapshot and
 * before dedupe-vocab.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

const current = parseCsv(fs.readFileSync(CSV, "utf8"));
const original = parseCsv(execFileSync("git", ["show", "HEAD:src-tauri/resources/cards.csv"], { cwd: ROOT, encoding: "utf8" }));
const extra = JSON.parse(fs.readFileSync(EXTRA, "utf8"));
const header = current[0];
original.shift();
current.shift();
const ix = (name) => header.indexOf(name);
const iId = ix("id"), iEn = ix("en_US"), iEs = ix("es_ES"), iDe = ix("de_DE");
const orig = new Map(original.map((r) => [r[iId], r]));
const fields = { en: iEn, es: iEs, de: iDe };
let restored = 0;
for (const row of current) {
  const before = orig.get(row[iId]);
  if (!before) continue;
  const ex = extra[row[iId]]?.example || {};
  for (const lang of Object.keys(fields)) {
    const idx = fields[lang];
    const value = row[idx];
    if (value === before[idx]) continue;
    const looksLikeExample = value && value === ex[lang];
    const sentenceIntroduced = /[.!?]$/.test(value) && !/[.!?]$/.test(before[idx]);
    if (looksLikeExample || sentenceIntroduced) {
      row[idx] = before[idx];
      restored++;
    }
  }
}
fs.writeFileSync(CSV, [header.map(cell).join(","), ...current.map((r) => r.map(cell).join(","))].join("\n") + "\n", "utf8");
console.log(`restored ${restored} translation fields`);
