#!/usr/bin/env node
/*
 * Vocab enrichment batch (dev-only; not shipped in the app).
 *
 * Reads src-tauri/resources/cards.csv and asks a model for usage examples +
 * gender/article/plural per card, writing src-tauri/resources/cards-extra.json
 * (keyed by card id). Conjugation is NOT generated here — the app computes it at
 * runtime.
 *
 * Two backends:
 *   - opencode (default): invokes the opencode CLI (`opencode run --format json`),
 *     using your existing opencode auth/model. No extra API key.
 *   - openai: OpenAI-compatible API (needs LLM_API_KEY).
 *
 * Resumable + crash-safe: results are written after every batch (atomic rename),
 * already-done ids are skipped, and a state/log file tracks progress so an
 * interrupted run continues where it left off.
 *
 * Env:
 *   ENRICH_BACKEND   opencode | openai           (default opencode)
 *   OPENCODE_MODEL   opencode-go/deepseek-v4.1-flash
 *   OPENCODE_AGENT   plan                         (read-only: cannot edit files)
 *   OPENCODE_BIN     path to opencode.exe         (auto-detected)
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL        (openai backend)
 *   BATCH_SIZE       default 25
 *   LIMIT            optional cap on cards this run (smoke test)
 *   ONLY_FAILED      1 = retry only ids in .enrich/failed.json
 *   RUN_TIMEOUT_MS   per-batch timeout (default 240000)
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "src-tauri", "resources", "cards.csv");
const RESOURCE = path.join(ROOT, "src-tauri", "resources", "cards-extra.json");
const WORK = path.join(ROOT, ".enrich");
const OUT = path.join(WORK, "out.json");
const STATE = path.join(WORK, "state.json");
const LOG = path.join(WORK, "enrich.log");
const FAILED = path.join(WORK, "failed.json");

const BACKEND = (process.env.ENRICH_BACKEND || "opencode").toLowerCase();
const MODEL = process.env.OPENCODE_MODEL || "opencode-go/deepseek-v4.1-flash";
const AGENT = process.env.OPENCODE_AGENT || "plan";
const BATCH = Math.max(1, Number(process.env.BATCH_SIZE) || 25);
const LIMIT = Number(process.env.LIMIT) || Infinity;
const ONLY_FAILED = process.env.ONLY_FAILED === "1";
const TIMEOUT = Number(process.env.RUN_TIMEOUT_MS) || 240000;
const RETRIES = 3;

// opencode.exe (the .ps1/.cmd shims are awkward to spawn from node on Windows).
function opencodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const local = path.join(path.dirname(process.execPath), "node_modules", "opencode-ai", "bin", "opencode.exe");
  return fs.existsSync(local) ? local : "opencode";
}

const INSTRUCTION =
  "You are enriching an EN→ES/DE vocabulary deck. The user message contains a JSON array of cards " +
  "with {id, en, es, de}. Return ONLY a JSON object of this exact shape, nothing else (no markdown, " +
  "no prose, no tool calls):\n" +
  '{"items":[{"id":"<same id>","pos":"noun|verb|adjective|adverb|phrase|other",' +
  '"article":{"es":"el|la","de":"der|die|das"},"plural":{"es":"...","de":"..."},' +
  '"example":{"en":"...","es":"...","de":"...","hl_es":"...","hl_de":"..."}}]}\n' +
  "Rules: id must equal the input id; article/plural only for nouns; example = one short, natural " +
  "sentence per language showing the word in use; hl_es/hl_de = the exact inflected word/phrase as " +
  "it appears in the es/de sentence (for highlighting). Use correct gender/articles and grammar. " +
  "For phrases/sentences set pos \"phrase\" and still give examples. Output JSON only.";

// ---------------------------------------------------------------- CSV parsing
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
  const iId = ix("id"), iEn = ix("en_US"), iEs = ix("es_ES"), iDe = ix("de_DE"), iCat = ix("categories");
  return rows
    .filter((r) => r.length > iDe && r[iId] && r[iEn] && r[iEs] && r[iDe])
    .map((r) => ({
      id: r[iId].trim(),
      en: r[iEn].trim(),
      es: r[iEs].trim(),
      de: r[iDe].trim(),
      cats: r[iCat] ? r[iCat].toLowerCase() : "",
    }));
}

// ---------------------------------------------------------------- backends
function parseOpencode(stdout) {
  const texts = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let obj;
    try { obj = JSON.parse(t); } catch { continue; }
    if (obj && obj.type === "text" && obj.part && typeof obj.part.text === "string") texts.push(obj.part.text);
    else if (obj && obj.type === "text" && typeof obj.text === "string") texts.push(obj.text);
  }
  return texts.join("");
}

function callOpencode(batch) {
  const args = ["run", "--agent", AGENT, "--format", "json", "-m", MODEL, INSTRUCTION + "\n\nCARDS JSON:\n" + JSON.stringify(batch)];
  const r = spawnSync(opencodeBin(), args, {
    cwd: ROOT,
    encoding: "utf8",
    timeout: TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.error) throw new Error(`opencode spawn: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`opencode exit ${r.status}: ${(r.stderr || "").slice(-400)}`);
  return parseOpencode(r.stdout);
}

async function callOpenai(batch) {
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("Set LLM_API_KEY (openai backend).");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.LLM_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: INSTRUCTION },
        { role: "user", content: JSON.stringify(batch) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

function askModel(batch) {
  return BACKEND === "openai" ? callOpenai(batch) : Promise.resolve(callOpencode(batch));
}

// ---------------------------------------------------------------- validation
const POS = new Set(["noun", "verb", "adjective", "adverb", "phrase", "other"]);
function extractJson(text) {
  const s = String(text).replace(/```json/gi, "```");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("model output had no JSON object");
  return JSON.parse(s.slice(a, b + 1));
}
function cleanItem(raw, ids) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!ids.has(id)) return null;
  const pos = POS.has(raw.pos) ? raw.pos : "other";
  const ex = raw.example || {};
  const en = String(ex.en || "").trim();
  const es = String(ex.es || "").trim();
  const de = String(ex.de || "").trim();
  if (!en || !es || !de) return null;
  const str = (v) => (v == null ? "" : String(v).trim());
  return {
    pos,
    article: { es: str(raw.article && raw.article.es), de: str(raw.article && raw.article.de) },
    plural: { es: str(raw.plural && raw.plural.es), de: str(raw.plural && raw.plural.de) },
    example: { en, es, de, hl_es: str(ex.hl_es), hl_de: str(ex.hl_de) },
    note: str(raw.note),
  };
}

// ---------------------------------------------------------------- io helpers
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJsonAtomic(file, data) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}
function log(line) {
  const stamp = new Date().toISOString();
  fs.appendFileSync(LOG, `${stamp} ${line}\n`);
}
const now = () => Date.now();

// ---------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(WORK, { recursive: true });
  const cards = loadCards();
  const byId = new Map(cards.map((c) => [c.id, c]));

  // Seeds (shipped resource) + prior progress.
  const seed = readJson(RESOURCE, {});
  const out = { ...(seed && typeof seed === "object" ? seed : {}), ...readJson(OUT, {}) };

  let todo;
  if (ONLY_FAILED) {
    const failed = readJson(FAILED, []);
    todo = failed.map((id) => byId.get(String(id))).filter(Boolean);
  } else {
    todo = cards.filter((c) => !out[c.id]);
  }
  // Prioritise verbs + beginner/intermediate so a partial run is useful.
  const prio = (c) => (/verbs/.test(c.cats) ? 2 : /beginner|intermediate/.test(c.cats) ? 1 : 0);
  todo.sort((a, b) => prio(b) - prio(a));
  if (Number.isFinite(LIMIT)) todo = todo.slice(0, LIMIT);

  const startedAt = now();
  const failedIds = new Set();
  let done = 0, okCount = 0, invalidCount = 0, batchNo = 0;
  const totalBatches = Math.ceil(todo.length / BATCH) || 1;

  const saveState = (etaSeconds) => {
    writeJsonAtomic(STATE, {
      backend: BACKEND,
      model: BACKEND === "openai" ? process.env.LLM_MODEL || "gpt-4o-mini" : MODEL,
      batchSize: BATCH,
      total: cards.length,
      enriched: Object.keys(out).length,
      remaining: todo.length - done,
      todoThisRun: todo.length,
      batchesDone: batchNo,
      batchesTotal: totalBatches,
      failedIds: [...failedIds],
      startedAt,
      updatedAt: now(),
      etaSeconds,
    });
  };
  saveState(null);
  log(`START backend=${BACKEND} model=${BACKEND === "openai" ? process.env.LLM_MODEL : MODEL} batch=${BATCH} todo=${todo.length} already=${Object.keys(out).length}`);

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const ids = new Set(batch.map((c) => c.id));
    let items = null;
    for (let attempt = 1; attempt <= RETRIES && !items; attempt++) {
      const t0 = now();
      try {
        const text = await askModel(batch.map(({ id, en, es, de }) => ({ id, en, es, de })));
        const parsed = extractJson(text);
        items = Array.isArray(parsed.items) ? parsed.items : [];
        log(`batch=${batchNo + 1}/${totalBatches} ids=${batch[0].id}..${batch[batch.length - 1].id} attempt=${attempt} ms=${now() - t0}`);
      } catch (e) {
        log(`batch=${batchNo + 1} attempt=${attempt} FAILED: ${e.message}`);
        items = null;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    if (!items) {
      for (const c of batch) failedIds.add(c.id);
      batchNo += 1;
      saveState(null);
      continue;
    }
    for (const raw of items) {
      const item = cleanItem(raw, ids);
      if (item) out[String(raw.id)] = item;
    }
    // Any card in the batch not returned/valid stays todo; record for a retry.
    for (const c of batch) if (!out[c.id]) failedIds.add(c.id);
    okCount += batch.filter((c) => out[c.id]).length;
    invalidCount += batch.filter((c) => !out[c.id]).length;
    writeJsonAtomic(OUT, out);
    batchNo += 1;
    done += batch.length;
    // Merge + atomic-write the shipped resource as we go, so even a crash leaves
    // the app with everything enriched so far.
    writeJsonAtomic(RESOURCE, out);
    writeJsonAtomic(FAILED, [...failedIds]);
    const elapsed = (now() - startedAt) / 1000;
    const perBatch = elapsed / batchNo;
    const eta = Math.round(perBatch * (totalBatches - batchNo));
    saveState(eta);
    if (batchNo % 5 === 0 || batchNo === totalBatches) {
      const pct = ((Object.keys(out).length / cards.length) * 100).toFixed(1);
      console.log(`[${batchNo}/${totalBatches}] enriched=${Object.keys(out).length}/${cards.length} (${pct}%) invalid=${invalidCount} eta=${Math.round(eta / 60)}m`);
    }
  }

  writeJsonAtomic(OUT, out);
  writeJsonAtomic(RESOURCE, out);
  writeJsonAtomic(FAILED, [...failedIds]);
  saveState(0);
  log(`DONE enriched=${Object.keys(out).length}/${cards.length} failed=${failedIds.size}`);
  console.log(`\nDone. enriched ${Object.keys(out).length}/${cards.length} · failed ${failedIds.size}.`);
  if (failedIds.size) console.log(`Retry: ONLY_FAILED=1 npm run enrich`);
}

main().catch((e) => { console.error(e); log(`FATAL ${e.stack || e.message}`); process.exit(1); });
