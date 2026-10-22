# Plan — Vocab card details: usage examples, conjugation, gender/article

Status: ✅ built — full 10,262-card enrichment generated via the opencode batch. Builds on `vocab-srs.md` + `vocab-sessions.md`.
Spec: `spec.md` §2.13 (FR-VOC-017..019), §2.17? no — §2.13 details.

## Goal

Turn the drill from "translate the word" into "know how the word is used": after a card is
answered or revealed, show a **Learn strip** (example sentence + key forms), with an **Enlarge**
button opening the full detail (all examples, full conjugation, gender/article, POS).

## Locked decisions

1. **Hybrid data**: conjugation computed at runtime; example sentences come from a one-off
   batch enrichment (LLM) bundled as `resources/cards-extra.json`.
2. **Coverage**: all ~10,262 cards, **both ES and DE**. The batch is the mechanism; a seed set
   ships in-repo so the feature works before the full batch is run.
3. **All tenses** (see list below).
4. **Nouns**: show gender/article. Accept input **with or without** the article. A **wrong
   article/gender** is **not** a fail — the noun is graded correct and the card advances
   normally; the UI **highlights** the article mistake and shows the correct one.
5. **Resize**: the drill window grows in place (default → enlarged), not a separate window.
6. Size up to ~30 MB acceptable for the bundled enrichment.

## Verified data facts (why the design looks like this)

- `cards.csv` is **valid UTF-8**; Rust `read_to_string` handles it (the earlier mojibake was
  only the PowerShell console).
- **Spanish nouns are stored *with* articles** (`el piano`, `la cuerda`); **German nouns are
  usually stored *without*** (`Spielzeug`, `Seil`). So we split the Spanish article and take the
  German article from enrichment.
- Many entries are **phrases/sentences** (`How do you spell your name?`). `pos` comes from
  enrichment; conjugation applies only to single infinitives.

## Data model

`cards.csv` stays the single source for the word triple. Enrichment is additive and optional:

`src-tauri/resources/cards-extra.json` (keyed by card `id`):

```jsonc
{
  "1":  { "pos": "verb",
          "example": { "en": "She competes in marathons.", "es": "Ella compite en maratones.",
                       "de": "Sie nimmt an Marathons teil.", "hl_es": "compite", "hl_de": "nimmt … teil" } },
  "41": { "pos": "noun",
          "article": { "es": "el", "de": "das" },
          "plural":  { "es": "juguetes", "de": "Spielzeuge" },
          "example": { "en": "The child plays with a toy.", "es": "El niño juega con un juguete.",
                       "de": "Das Kind spielt mit einem Spielzeug.", "hl_es": "juguete", "hl_de": "Spielzeug" } }
}
```

- `hl_es`/`hl_de`: the exact inflected surface form used in the sentence → bolding.
- Unknown ids → no detail → current behavior (plain word drill).

## Matching (article-aware)

Applies only when `pos == "noun"` (and detail exists):

- Expected `(article, noun)`:
  - **ES**: split `^(el|la|los|las)\s+` from the CSV answer; fallback to `detail.article.es`.
  - **DE**: split `^(der|die|das)\s+` if present; else `detail.article.de`.
- Normalize: lowercase + NFD strip diacritics + trim (same as today).
- Accepted:
  - noun only → **correct**
  - correct article + noun → **correct**
  - **wrong article + correct noun → correct**, emit an *article slip* (highlight)
- Wrong noun → normal incorrect attempt.
- `both` mode: evaluate each input independently; collect slips per language.

Pure helper `parseNounAnswer(input, {article, noun}) -> "ok" | "article-wrong" | "wrong"` +
`evaluateAnswer(...)`; covered by node tests.

## Conjugation (runtime)

`src/conjugate.js` exposes `VocabConjugate.conjugate(verb, lang)` (loaded by `drill.html`):

- **ES**: presente, pretérito, imperfecto, futuro, condicional, subjuntivo presente, imperativo,
  gerundio, participio. Regular -ar/-er/-ir rules + irregular present/preterite/participle/gerund
  tables + stem-changing verbs (e→ie, o→ue, e→i).
- **DE**: Präsens, Präteritum, Perfekt, Futur I, Konjunktiv II, Imperativ, Partizip II.
  Regular (weak) rules + strong-verb table (Präteritum stem + Partizip) + separable prefixes.
- Only for a single infinitive (`-ar/-er/-ir`; `-en/-n`). Phrases → no conjugation.
- **Honest limitation:** hand-run rules can't be perfect for every irregular. Unknown verbs fall
  back to regular forms flagged as such; the enlarged view shows a note. The batch can optionally
  emit authoritative forms later without changing callers (`conjugate()` prefers bundled data if present).

## UI

- Default drill window: **~420×320** (was 360×240) to fit the Learn strip.
- After **correct or reveal**: Learn strip — ES + DE example (target bolded), English gloss,
  and for verbs a present-tense mini-line; for nouns article + plural.
- **⤢ Enlarge** → window resizes to **~680×600** with a scrollable full pane (all examples, full
  conjugation tables, gender/plural, POS, notes), toggling back.
- Never shown before grading (no answer leak).

## Batch enrichment

`scripts/enrich-vocab.mjs` (dev-only, not shipped):
- OpenAI-compatible endpoint via env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
- Reads `cards.csv`; batches ~25 cards/request; strict JSON; validates the target word appears;
  retries; **resumes from `cards-extra.json`** (skip already-done ids).
- Writes `src-tauri/resources/cards-extra.json`.

## Implementation order

1. `plans/vocab-details.md` (this file).
2. Rust: `CardDetail`, lazy `CARD_DETAILS`, `vocab_card_detail(id)`, `vocab_set_popup_expanded(bool)`,
   register both, add the resource to `tauri.conf.json`.
3. `src/conjugate.js` + node self-test.
4. `drill.html`: Learn strip, Enlarge pane, article-aware matching.
5. Seed `cards-extra.json` (representative cards) + `scripts/enrich-vocab.mjs`.
6. `spec.md` FR-VOC/AC.
7. Verify: `cargo test --lib`, `cargo check`, `node --check` (drill + conjugate), smoke run.

## Corrections log

- Built as planned; no API drift. Notes from implementation:
  - `conjugate()` is a plain `src/conjugate.js` loaded by `drill.html` and also
    `require()`-able for `scripts/test-conjugate.cjs` (`npm run test:conjugate`).
  - German present must special-case `sein`/`haben`/`werden`/`wissen`/`tun` + the modals
    (`presFull`); separable motion verbs take `sein` in the Perfekt (`aufstehen → ist
    aufgestanden`).
  - Correct answers no longer auto-advance: the Learn strip needs time to read, so the
    card waits for **Next / Enter** (reveal still requires retyping first, as before).
  - The batch tool (`npm run enrich`) is provider-agnostic (OpenAI-compatible) and resumable;
    the in-repo `cards-extra.json` is a representative seed until the full run.
  - Follow-up fix: expanding now resizes then **clamps the window inside the current monitor**
    (the old bottom-right anchor pushed a bottom-left popup off-screen), and the Learn strip is a
    flex column (scrollable body + fixed action row) so Enlarge/Next never scroll out of view.
  - Follow-up fix 2: placement and resize use the Windows **work area** (excludes the taskbar,
    via `SystemParametersInfoW(SPI_GETWORKAREA)`), so a bottom-anchored popup no longer puts
    Dismiss/Snooze under the taskbar. Non-Windows falls back to the monitor rect.
  - Follow-up fix 3 (root cause of the off-screen window): `drill_position` hardcoded the popup
    as **360×240** while the window is **420×360**, so a bottom anchor placed it 240px from the
    bottom and the 360px window hung ~104px **below the screen**. Sizes are now shared constants
    (`DRILL_W/H`, expanded variants) used by both placement and creation, plus a post-create
    work-area clamp as a safety net.
  - **Enrichment complete:** all **10,262** cards generated via `opencode run` (deepseek-v4.1-flash,
    batches of 25, resumable with `.enrich/` checkpoints). Validation: 0 missing, 0 unknown ids,
    0 empty examples, 0 nouns without articles; ~4 MB resource. 26 entries have a highlight string
    that doesn't exactly appear in the sentence (bold omitted there — cosmetic).
