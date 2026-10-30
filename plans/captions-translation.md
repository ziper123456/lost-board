# Plan - Captions translation (split view, local LibreTranslate)

Status: **Planned** (2026-10-30). Not started. Follow-up to PR #58.
Spec: `spec.md` FR-CAP-007..010 (to add).

## Goal

Split the Captions tile into two panes while translating:

- **Top:** the existing timestamped timeline and live partial.
- **Bottom:** English translation for every finalized line, aligned by timestamp.
- **Translation stays local** by default, using LibreTranslate (Argos) in an app-managed
  Docker container.
- Optional per-line **opencode** cleanup for garbled ASR lines; explicit cloud action only.

## Locked decisions

| Decision | Value |
|---|---|
| Translation engine | **LibreTranslate** (Argos), app-managed Docker |
| Target | **English** (source = caption model language) |
| Trigger | Only while split view is on; every finalized line auto-translates |
| Backfill | On split open, translate existing untranslated lines newest-first |
| Local failure | Show error; **no silent cloud call** |
| Cloud fallback | Opt-in setting, **off by default** |
| LLM cleanup | Manual per-line "Fix" via existing opencode; marked cloud |
| Line identity | Stable `seq` per line, scoped by session |
| English source | Translation pane disabled (nothing to translate) |

## Architecture

### Line identity

- Add `seq: u64` to `CaptionLine`; engine keeps a session counter.
- Reset on a new session, preserve across device-change restarts.
- Frontend cache key: `session:seq`.
- Drop translations when their line falls out of the 500-line window/session.

### Backend

New commands:

- `caption_translate_batch(lines: [{seq,text}], source, target, provider, endpoint)`
  returns `{provider, translations: [{seq,text,error}]}`.
- `caption_translate_health()` for Settings/Docker status.
- `caption_polish_line(seq, source, draft, context, provider)` for the opencode Fix action.

LibreTranslate:

- `POST /translate`, `q` as an array, `source` = caption language, `target = en`, `format = text`.
- Batch 10–20 lines; one in-flight batch; timeout ~15 s.
- In-memory cache keyed by `(provider, source, target, text)`, capped.
- Provider badge on translated lines (`local`, `deepl`, `opencode`).
- Cloud fallback order only when enabled: local → DeepL (if key) → opencode (if available).

### Docker manager

- Detect `docker` CLI and daemon; Docker Desktop is installed but the daemon was not running
  on 2026-10-30, so this state must be handled explicitly.
- Image: `libretranslate/libretranslate:latest`.
- Container name: `lost-board-libretranslate`.
- Publish on loopback with an ephemeral host port (`-p 127.0.0.1::5000`) and inspect the mapped
  port, avoiding conflicts.
- Env: `LT_LOAD_ONLY=en,de,es`; volume: `lost-board-lt-models:/home/libretranslate/.local`.
- Health check: `GET /health`; states: `offline`, `starting`, `pulling`, `ready`, `error`.
- Pull image if missing; show status. First run also downloads Argos models.
- Stop on app exit by default; setting to keep it running.
- Failure handling: Docker not running, pull failure, container exit, health timeout,
  stale container name, model download failure.
- **License:** LibreTranslate is AGPL-3.0; relevant if the app is distributed.

### Tile UI

- **Split translation** toggle in the Captions controls.
- `caption-root.split` uses two 50/50 scroll panes.
- Top pane unchanged: timeline + live partial.
- Bottom pane: timestamp + English, finalized lines only.
- Pending/error/retry states; no layout jump.
- Auto-scroll each pane independently when near the bottom.
- Split off: no new requests; keep cached translations.
- Split on: backfill newest-first, then auto-translate new finals.
- First local request may be slow (Argos warm-up); show "Starting translator…".

### Settings

Under Settings → Captions → Translation:

- Target: English.
- Provider: LibreTranslate.
- Local service status + Test.
- Keep translator running after exit.
- Allow cloud fallback (off).
- Use opencode to fix lines (off; per-line action only).
- Persist as `state.captions.translation = { target, provider, libreUrl, allowCloudFallback, keepRunning, cleanup }`.
- Per-tile split flag: `comp.data.split`.

## Phases

### Phase A — split view + local client

- [ ] Add `seq` to `CaptionLine` and session counter.
- [ ] Add split layout + toggle + per-tile persistence.
- [ ] Add translation queue, batching, cache, backfill, pending/error states.
- [ ] Add LibreTranslate client + health + provider badge.
- [ ] Add Settings translation section.
- [ ] Unit tests with mock HTTP; no Docker required.

### Phase B — Docker-managed LibreTranslate

- [ ] Docker CLI/daemon detection + user-facing status.
- [ ] Pull image, create/start container, ephemeral port, model volume.
- [ ] Health polling + warm-up + first-run model download status.
- [ ] Stop-on-exit setting and cleanup.
- [ ] Failure recovery + logs/status in Settings.
- [ ] Manual test with real DE/ES audio.

### Phase C — opencode cleanup + opt-in fallback

- [ ] Per-line Fix button using opencode (source + draft + surrounding context).
- [ ] Cloud/privacy warning and provider badge.
- [ ] Opt-in cloud fallback when local is offline.
- [ ] Reuse `llm_translate_lines`/session cleanup patterns.

## Acceptance criteria (draft)

- Split view shows original on top and English on the bottom, aligned by line.
- Only finalized lines are translated; partials are never sent.
- With split off, no translation requests occur.
- With split on, every new finalized line translates automatically.
- Reopening split translates lines finalized while it was off (newest-first).
- Translation never blocks captions or audio.
- Local failure shows a clear error and retries without losing lines.
- Cloud fallback is never used unless explicitly enabled.
- Fix action is explicit and clearly labelled as cloud.
- English source hides the translation pane.
- Docker stopped/missing produces actionable guidance, not a raw error.

## Complexity

| Part | Estimate |
|---|---|
| Split UI + seq + queue/cache | ~2–3 days |
| LibreTranslate client + settings + tests | ~1–2 days |
| Docker manager + failure handling | ~2–4 days |
| opencode cleanup + opt-in fallback | ~1–2 days |
| **Total** | **~6–10 focused days** |

## Risks

- Docker Desktop may be stopped; app startup must not depend on it.
- First run: image pull + Argos model download can take minutes.
- Small local MT models are weaker on names/domain terms; opencode Fix is the escape hatch.
- MT cannot recover ASR errors; it will translate garbage faithfully.
- Cloud fallback/cleanup send transcript text off-device.
- AGPL-3.0 if LibreTranslate is bundled or distributed with the app.

## Files

- `src-tauri/src/captions.rs` — `seq`, translation commands, cache, provider calls.
- `src-tauri/src/lib.rs` — register commands; Docker manager registration.
- `src-tauri/src/captions_docker.rs` (new, if split out) — Docker lifecycle.
- `src/main.js` — split pane, queue, cache, settings, wrappers.
- `src/index.html` — captions settings/host markup.
- `src/styles.css` — split layout/translation rows/pending/error.
- `spec.md` — FR-CAP-007..010 + AC entries.
- `README.md` — local translation setup/notes.
- `plans/README.md` — index row.

## Open questions

- Whether the translation target should remain English-only or be selectable per tile.
- Whether to add a bilingual Markdown export in v1 or a follow-up.

## Corrections log

- Not started.
