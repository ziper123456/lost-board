# Implementation Plan — Calendar tile (Vietnamese lunar calendar + moon phase + holidays)

> ✅ **Status: built 2026-10-14 (branch feat/calendar-tile).** Frontend-only.

## 1. Goal

A Calendar tile showing a Monday-first month grid overlaid with the **Vietnamese lunar
calendar (âm lịch)**, an optional **moon phase** per day, and per-country **public-holiday**
highlights. Spec: `spec.md` §2.15, AC-035..037.

## 2. Key design decisions

- **Two new script files** (no bundler, loaded via `<script>` before `main.js`):
  - `src/lunar.js` — Hồ Ngọc Đức lunisolar conversion (Meeus-based), UTC+7 reference, leap
    months, moon phase. Exposed as `window.Lunar`.
  - `src/holidays.js` — holiday tables + Gregorian Easter computus; `window.Holidays.forRange()`.
- **Labels bilingual ES/DE** (weekdays + month names). Holiday names stay **native** with ES/DE
  translations shown in the hover tooltip.
- **Holidays:** Vietnam (solar + lunar), Germany (national + **Rheinland-Pfalz**, since the
  Grünstadt weather tile is in RLP), Pakistan **fixed-date only** (Islamic holidays deferred —
  they need a Hijri conversion).
- Tile options live on the tile's `data` (`weekStart`, `moonPhase`, `holidays.{vietnam,germany,pakistan}`).
- Month view resets to the current month on render; day-highlight refresh ticks at midnight.

## 3. Corrections log

- 2026-10-14: Pakistan holidays limited to fixed dates (Islamic Eid/Ashura/Milad need a Hijri
  conversion — deferred by design).
- 2026-10-14: German holidays hardcode **Rheinland-Pfalz** (Fronleichnam, Allerheiligen) rather
  than a Bundesland picker.
- 2026-10-14: lunar algorithm verified against known values (2025 leap month 18/6, Tết 2025/2026,
  Hung Kings 2026) via a scratch Node run; Easter computus verified for 2026.
