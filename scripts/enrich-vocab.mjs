#!/usr/bin/env node
/*
 * One-off vocab enrichment batch (dev-only; not shipped in the app).
 *
 * Reads src-tauri/resources/cards.csv, asks an OpenAI-compatible LLM for a
 * usage example + gender/article/plural per card, and writes
 * src-tauri/resources/cards-extra.json (keyed by card id). Resumable: ids
 * already in the output are skipped, so you can stop and restart.
 *
 * Config (env):
 *   LLM_BASE_URL   default https://api.openai.com/v1
 *   LLM_API_KEY    required
 *   LLM_MODEL      default gpt-4o-mini
 *   BATCH_SIZE     default 25
 *   LIMIT          optional cap on cards this run (for a smoke test)
 *
 * Usage:  LLM_API_KEY=sk-... node scripts/enrich-vocab.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "src-tauri", "resources", "cards.csv");
const OUT = path.join(ROOT, "src-tauri", "resources", "cards-extra.json");

const BASE = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
const KEY = process.env.LLM_API_KEY;
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const BATCH = Math.max(1, Number(process.env.BATCH_SIZE) || 25);
const LIMIT = Number(process.env.LIMIT) || Infinity;

if (!KEY) {
  console.error("Set LLM_API_KEY."); process.exit(1);
}

// Minimal RFC4180 CSV parser (categories are quoted and contain commas/quotes).
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

function loadCards() {
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const header = rows.shift();
  const ix = (n) => header.indexOf(n);
  const iId = ix("id"), iEn = ix("en_US"), iEs = ix("es_ES"), iDe = ix("de_DE");
  return rows
    .filter((r) => r.length > iDe && r[iId] && r[iEn] && r[iEs] && r[iDe])
    .map((r) => ({ id: r[iId].trim(), en: r[iEn].trim(), es: r[iEs].trim(), de: r[iDe].trim() }));
}

function prompt(batch) {
  return [
    {
      role: "system",
      content:
        "You enrich a EN→ES/DE vocabulary trainer. Return ONE JSON object {\"items\":[...]}. " +
        "For each input card produce: pos (noun|verb|adjective|adverb|phrase|other); " +
        "for nouns: article={es,de} and plural={es,de}; " +
        "example={en,es,de,hl_es,hl_de}: a short natural sentence in each language showing the word in use; " +
        "hl_es/hl_de = the exact inflected surface form used in that sentence (for highlighting). " +
        "Use correct gender/articles and correct grammar. Keep the same id. Do not invent words.",
    },
    { role: "user", content: JSON.stringify(batch) },
  ];
}

async function callModel(batch) {
  const body = {
    model: MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: prompt(batch),
  };
  const res = await fetch(`${BASE.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const cards = loadCards();
  let out = {};
  if (fs.existsSync(OUT)) {
    try { out = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { out = {}; }
  }
  const todo = cards.filter((c) => !out[c.id]).slice(0, LIMIT);
  console.log(`${cards.length} cards, ${Object.keys(out).length} already enriched, ${todo.length} to do`);

  let done = 0, failed = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    let items = null;
    for (let attempt = 1; attempt <= 3 && !items; attempt++) {
      try {
        items = await callModel(batch.map(({ id, en, es, de }) => ({ id, en, es, de })));
      } catch (e) {
        console.warn(`batch ${i / BATCH + 1} attempt ${attempt} failed: ${e.message}`);
        await sleep(1000 * attempt);
      }
    }
    if (!items) { failed += batch.length; continue; }
    for (const it of items) {
      if (!it || !it.id || !out[it.id] && batch.some((b) => b.id === String(it.id))) {
        out[String(it.id)] = {
          pos: it.pos || "",
          article: it.article || {},
          plural: it.plural || {},
          example: it.example || {},
          note: it.note || "",
        };
      }
    }
    done += batch.length;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
    console.log(`  ${done}/${todo.length} (${failed} failed)`);
  }
  console.log(`done. wrote ${Object.keys(out).length} entries to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
