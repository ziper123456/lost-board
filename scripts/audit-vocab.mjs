/*
 * Vocabulary audit pipeline.
 *
 *   node scripts/audit-vocab.mjs --check
 *   node scripts/audit-vocab.mjs --llm [--limit 50]
 *   node scripts/audit-vocab.mjs --apply
 *
 * The LLM pass is resumable in .vocab-audit/. It never writes the bundled data
 * unless --apply is passed.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSV = path.join(ROOT, "src-tauri", "resources", "cards.csv");
const EXTRA = path.join(ROOT, "src-tauri", "resources", "cards-extra.json");
const WORK = path.join(ROOT, ".vocab-audit");
const RESULTS = path.join(WORK, "results.json");
const REPORT = path.join(WORK, "report.json");

const BACKEND = (process.env.AUDIT_BACKEND || process.env.ENRICH_BACKEND || "opencode").toLowerCase();
const MODEL = process.env.OPENCODE_MODEL || "opencode-go/deepseek-v4.1-flash";
const AGENT = process.env.OPENCODE_AGENT || "plan";
const BATCH = Math.max(1, Number(process.env.BATCH_SIZE) || 20);
const LIMIT = Number(process.env.LIMIT) || Infinity;
const TIMEOUT = Number(process.env.RUN_TIMEOUT_MS) || 240000;
const RETRIES = 3;
const APPLY_CONFIDENCE = Number(process.env.APPLY_CONFIDENCE) || 0.85;
const POS = new Set(["noun", "verb", "adjective", "adverb", "phrase", "other"]);
const SHARD = (() => {
  const raw = process.env.SHARD || process.argv.find((a) => a.startsWith("--shard="))?.slice(8) || "0/1";
  const [index, count] = raw.split("/").map(Number);
  return { index: Number.isFinite(index) ? index : 0, count: Number.isFinite(count) && count > 0 ? count : 1 };
})();
const RESULT_PATH = SHARD.count > 1 ? path.join(WORK, `results-${SHARD.index}.json`) : RESULTS;
const STATE_PATH = SHARD.count > 1 ? path.join(WORK, `state-${SHARD.index}.json`) : path.join(WORK, "state.json");
const LOG_PATH = SHARD.count > 1 ? path.join(WORK, `audit-${SHARD.index}.log`) : path.join(WORK, "audit.log");

const INSTRUCTION =
  "You are auditing an EN->ES/DE vocabulary deck. The user message contains a JSON array of cards " +
  "with {id,en,es,de,cats,extra}. Return ONLY JSON: " +
  '{"items":[{"id":"...","verdict":"ok|fix|uncertain","confidence":0.0,"reason":"...",' +
  '"suggested":{"en":"...","es":"...","de":"...","pos":"noun|verb|adjective|adverb|phrase|other",' +
  '"article":{"es":"...","de":"..."},"plural":{"es":"...","de":"..."},' +
  '"example":{"en":"...","es":"...","de":"...","hl_es":"...","hl_de":"..."},"note":"..."}}]}. ' +
  "Check translation sense, naturalness, POS, noun article/plural, and the example. " +
  "Examples must be natural and contain the exact highlighted form; use '...' only for a " +
  "discontinuous separable form (e.g. 'weicht ... aus'). Add a note for regional usage, " +
  "false friends, ambiguous English words, or common-gender nouns. Do not change ids or categories. " +
  "Use verdict 'uncertain' rather than guessing. If nothing is wrong, omit suggested.";

function opencodeBin() {
  if (process.env.OPENCODE_BIN) return process.env.OPENCODE_BIN;
  const local = path.join(path.dirname(process.execPath), "node_modules", "opencode-ai", "bin", "opencode.exe");
  return fs.existsSync(local) ? local : "opencode";
}

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

function loadCards() {
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));
  const header = rows.shift();
  const ix = (n) => header.indexOf(n);
  const iId = ix("id");
  const iEn = ix("en_US");
  const iEs = ix("es_ES");
  const iDe = ix("de_DE");
  const iCat = ix("categories");
  return {
    header,
    rows,
    cards: rows
      .filter((r) => r.length > iDe && r[iId] && r[iEn] && r[iEs] && r[iDe])
      .map((r) => ({
        id: r[iId].trim(),
        en: r[iEn].trim(),
        es: r[iEs].trim(),
        de: r[iDe].trim(),
        cats: r[iCat] || "[]",
      })),
    ix: { iId, iEn, iEs, iDe, iCat },
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}
function log(line) {
  fs.mkdirSync(WORK, { recursive: true });
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`, "utf8");
}

function exactOrDiscontinuous(text, highlight) {
  const src = String(text || "").toLowerCase();
  const parts = String(highlight || "").split(/\.\.\.|…/).map((s) => s.trim()).filter(Boolean);
  return Boolean(parts.length) && parts.every((p) => src.includes(p.toLowerCase()));
}

function structuralAudit(cards, extra) {
  const ids = new Set(cards.map((c) => c.id));
  const extraIds = new Set(Object.keys(extra));
  const out = {
    cards: cards.length,
    enriched: extraIds.size,
    missingExtra: [...ids].filter((id) => !extraIds.has(id)),
    orphanExtra: [...extraIds].filter((id) => !ids.has(id)),
    emptyTranslations: [],
    ambiguousArticle: [],
    badHighlights: [],
    duplicateTriples: [],
    duplicateExamples: [],
    emptyPlural: [],
    notes: 0,
  };
  const triples = new Map();
  const examples = new Map();
  for (const c of cards) {
    const d = extra[c.id];
    if (!d) continue;
    if (!c.en || !c.es || !c.de) out.emptyTranslations.push(c.id);
    if (/^el\/la\s/.test(c.es) && d.article?.es !== "el/la") out.ambiguousArticle.push(c.id);
    const ex = d.example || {};
    if (ex.hl_es && ex.es && !exactOrDiscontinuous(ex.es, ex.hl_es)) {
      out.badHighlights.push({ id: c.id, lang: "es", text: ex.es, hl: ex.hl_es });
    }
    if (ex.hl_de && ex.de && !exactOrDiscontinuous(ex.de, ex.hl_de)) {
      out.badHighlights.push({ id: c.id, lang: "de", text: ex.de, hl: ex.hl_de });
    }
    if (d.pos === "noun" && (!d.plural?.es || d.plural.es === "-")) out.emptyPlural.push(c.id);
    if (d.note) out.notes++;
    const key = `${c.en}\u0000${c.es}\u0000${c.de}`;
    if (triples.has(key)) out.duplicateTriples.push([triples.get(key), c.id]);
    else triples.set(key, c.id);
    for (const lang of ["es", "de"]) {
      const text = String(ex[lang] || "").trim();
      if (!text) continue;
      const key2 = `${lang}\u0000${text}`;
      if (examples.has(key2)) examples.get(key2).push(c.id);
      else examples.set(key2, [c.id]);
    }
  }
  out.duplicateExamples = [...examples.entries()]
    .filter(([, ids2]) => ids2.length > 1)
    .map(([key, ids2]) => ({ key, ids: ids2 }));
  out.counts = {
    missingExtra: out.missingExtra.length,
    orphanExtra: out.orphanExtra.length,
    emptyTranslations: out.emptyTranslations.length,
    ambiguousArticle: out.ambiguousArticle.length,
    badHighlights: out.badHighlights.length,
    duplicateTriples: out.duplicateTriples.length,
    duplicateExampleGroups: out.duplicateExamples.length,
    emptyPlural: out.emptyPlural.length,
    notes: out.notes,
  };
  return out;
}

function extractJson(text) {
  const s = String(text).replace(/```json/gi, "```");
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("model output had no JSON object");
  return JSON.parse(s.slice(a, b + 1));
}

function parseOpencode(stdout) {
  const texts = [];
  for (const line of String(stdout).split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    let obj;
    try {
      obj = JSON.parse(t);
    } catch {
      continue;
    }
    if (obj?.type === "text" && obj.part && typeof obj.part.text === "string") texts.push(obj.part.text);
    else if (obj?.type === "text" && typeof obj.text === "string") texts.push(obj.text);
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
      temperature: 0.2,
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

function cleanAudit(raw, ids) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!ids.has(id)) return null;
  const verdict = ["ok", "fix", "uncertain"].includes(raw.verdict) ? raw.verdict : "uncertain";
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  const out = { id, verdict, confidence, reason: String(raw.reason || "").trim() };
  if (raw.suggested && typeof raw.suggested === "object") {
    const s = raw.suggested;
    const str = (v) => (v == null ? "" : String(v).trim());
    const ex = s.example && typeof s.example === "object" ? s.example : null;
    out.suggested = {
      en: str(s.en),
      es: str(s.es),
      de: str(s.de),
      pos: POS.has(s.pos) ? s.pos : "",
      article: { es: str(s.article?.es), de: str(s.article?.de) },
      plural: { es: str(s.plural?.es), de: str(s.plural?.de) },
      example: ex
        ? {
            en: str(ex.en),
            es: str(ex.es),
            de: str(ex.de),
            hl_es: str(ex.hl_es),
            hl_de: str(ex.hl_de),
          }
        : null,
      note: str(s.note),
    };
  }
  return out;
}

function usableSuggestion(a, card, existing) {
  if (a.verdict !== "fix" || a.confidence < APPLY_CONFIDENCE || !a.suggested) return false;
  const s = a.suggested;
  const ex = s.example || existing.example;
  if (!ex?.es || !ex?.de || !ex?.en) return false;
  if (ex.hl_es && !exactOrDiscontinuous(ex.es, ex.hl_es)) return false;
  if (ex.hl_de && !exactOrDiscontinuous(ex.de, ex.hl_de)) return false;
  const pos = s.pos || existing.pos;
  if (pos === "noun" && (!s.article?.es && !existing.article?.es)) return false;
  if (s.en && !s.es && !s.de && card) return false;
  return true;
}

function translationOk(value, original, example) {
  if (!value) return false;
  if (example && value === example) return false;
  return !(/[.!?]$/.test(value) && !/[.!?]$/.test(original || ""));
}

function applyAudit(cards, extra, results) {
  const { rows, ix, header } = cards;
  const byId = new Map(rows.map((r) => [r[ix.iId], r]));
  let applied = 0;
  for (const a of Object.values(results)) {
    const row = byId.get(a.id);
    const d = extra[a.id];
    if (!row || !d || !a.suggested) continue;
    if (!usableSuggestion(a, null, d)) continue;
    const s = a.suggested;
    const ex = s.example || d.example || {};
    if (translationOk(s.en, row[ix.iEn], ex.en)) row[ix.iEn] = s.en;
    if (translationOk(s.es, row[ix.iEs], ex.es)) row[ix.iEs] = s.es;
    if (translationOk(s.de, row[ix.iDe], ex.de)) row[ix.iDe] = s.de;
    if (s.pos) d.pos = s.pos;
    if (s.article?.es || s.article?.de) d.article = { ...d.article, ...s.article };
    if (s.plural?.es || s.plural?.de) d.plural = { ...d.plural, ...s.plural };
    if (s.example) d.example = { ...d.example, ...s.example };
    if (s.note) d.note = s.note;
    applied++;
  }
  const body = rows.map((r) => r.map((v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","));
  fs.writeFileSync(CSV, [header.join(","), ...body].join("\n") + "\n", "utf8");
  writeJsonAtomic(EXTRA, extra);
  return applied;
}

async function llmAudit(cards, extra, limit) {
  fs.mkdirSync(WORK, { recursive: true });
  const base = readJson(RESULTS, {});
  const existing = { ...base, ...readJson(RESULT_PATH, {}) };
  const todo = cards.cards
    .filter((c, index) => index % SHARD.count === SHARD.index && !existing[c.id])
    .slice(0, limit);
  const initialBatches = Math.ceil(todo.length / BATCH) || 1;
  const retries = new Map();
  log(`START shard=${SHARD.index}/${SHARD.count} backend=${BACKEND} batch=${BATCH} todo=${todo.length} already=${Object.keys(existing).length}`);
  let batchNo = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    batchNo++;
    const batch = todo.slice(i, i + BATCH);
    const ids = new Set(batch.map((c) => c.id));
    let items = null;
    for (let attempt = 1; attempt <= RETRIES && !items; attempt++) {
      try {
        const payload = batch.map((c) => ({ id: c.id, en: c.en, es: c.es, de: c.de, cats: c.cats, extra: extra[c.id] || {} }));
        const text = BACKEND === "openai" ? await callOpenai(payload) : callOpencode(payload);
        const parsed = extractJson(text);
        items = Array.isArray(parsed.items) ? parsed.items : [];
      } catch (e) {
        log(`batch ${batchNo} attempt ${attempt} failed: ${e.message}`);
        items = null;
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
    if (items) {
      for (const raw of items) {
        const clean = cleanAudit(raw, ids);
        if (clean) existing[clean.id] = clean;
      }
    }
    writeJsonAtomic(RESULT_PATH, existing);
    writeJsonAtomic(STATE_PATH, {
      shard: SHARD.index,
      shards: SHARD.count,
      total: cards.cards.length,
      done: Object.keys(existing).length,
      remaining: cards.cards.length - Object.keys(existing).length,
      batch: batchNo,
      batches: initialBatches,
      updatedAt: Date.now(),
    });
    const missing = batch.filter((c) => !existing[c.id]);
    for (const card of missing) {
      const n = retries.get(card.id) || 0;
      if (n < 2) {
        retries.set(card.id, n + 1);
        todo.push(card);
      } else {
        log(`giving up on id=${card.id} after ${n} retries`);
      }
    }
    log(`batch ${batchNo}/${initialBatches} done=${Object.keys(existing).length} missing=${missing.length}`);
    console.log(`[shard ${SHARD.index}] batch ${batchNo}/${initialBatches} · ${Object.keys(existing).length}/${cards.cards.length} audited · missing ${missing.length}`);
  }
  return existing;
}

function readAllResults() {
  const merged = readJson(RESULTS, {});
  if (fs.existsSync(WORK)) {
    for (const name of fs.readdirSync(WORK)) {
      if (!/^results-\d+\.json$/.test(name)) continue;
      Object.assign(merged, readJson(path.join(WORK, name), {}));
    }
  }
  return merged;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const cards = loadCards();
  const extra = readJson(EXTRA, {});
  if (args.has("--check")) {
    const report = structuralAudit(cards.cards, extra);
    writeJsonAtomic(REPORT, report);
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(
      path.join(WORK, "report.md"),
      `# Vocabulary audit\n\n\`\`\`json\n${JSON.stringify(report.counts, null, 2)}\n\`\`\`\n`,
      "utf8",
    );
    console.log(JSON.stringify(report.counts, null, 2));
    return;
  }
  if (args.has("--llm")) {
    const results = await llmAudit(cards, extra, LIMIT);
    console.log(`audit results: ${Object.keys(results).length}`);
    return;
  }
  if (args.has("--apply")) {
    const results = readAllResults();
    const n = applyAudit(cards, extra, results);
    console.log(`applied ${n} high-confidence fixes`);
    return;
  }
  console.log("use --check, --llm, or --apply");
}

main().catch((e) => {
  console.error(e);
  log(`FATAL ${e.stack || e.message}`);
  process.exit(1);
});
