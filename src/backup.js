/*
 * Pure helpers for scheduled backups. Loaded in index.html before main.js and
 * require()-able from node for tests (scripts/test-backup.cjs).
 *
 * Schedules:
 *   4h      - every four hours since the last export
 *   daily   - every day at `time` (HH:MM, local time)
 *   weekly  - every Monday at `time`
 *   monthly - the 1st of every month at `time`
 */
(function (global) {
  "use strict";

  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

  function parseHM(time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || ""));
    if (!m) return { h: 3, m: 0 };
    return {
      h: Math.min(23, Math.max(0, Number(m[1]))),
      m: Math.min(59, Math.max(0, Number(m[2]))),
    };
  }

  function atTime(date, h, m) {
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  }

  // Most recent scheduled moment at or before now (null for interval schedules).
  function lastScheduledAt(nowMs, schedule, time) {
    const { h, m } = parseHM(time);
    const now = new Date(nowMs);
    if (schedule === "daily") {
      const today = atTime(now, h, m);
      if (today <= nowMs) return today;
      const yesterday = new Date(nowMs);
      yesterday.setDate(yesterday.getDate() - 1);
      return atTime(yesterday, h, m);
    }
    if (schedule === "weekly") {
      const d = new Date(nowMs);
      d.setHours(h, m, 0, 0);
      // Monday = 1; days elapsed since Monday (Sunday counts as 6).
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      if (d.getTime() > nowMs) d.setDate(d.getDate() - 7);
      return d.getTime();
    }
    if (schedule === "monthly") {
      const d = new Date(nowMs);
      d.setHours(h, m, 0, 0);
      d.setDate(1);
      if (d.getTime() > nowMs) d.setMonth(d.getMonth() - 1);
      return d.getTime();
    }
    return null;
  }

  // Next scheduled moment strictly after now (null for interval schedules).
  function nextScheduledAt(nowMs, schedule, time) {
    const { h, m } = parseHM(time);
    const now = new Date(nowMs);
    if (schedule === "daily") {
      const today = atTime(now, h, m);
      if (today > nowMs) return today;
      const tomorrow = new Date(nowMs);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return atTime(tomorrow, h, m);
    }
    if (schedule === "weekly") {
      const d = new Date(nowMs);
      d.setHours(h, m, 0, 0);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      if (d.getTime() <= nowMs) d.setDate(d.getDate() + 7);
      return d.getTime();
    }
    if (schedule === "monthly") {
      const d = new Date(nowMs);
      d.setHours(h, m, 0, 0);
      d.setDate(1);
      if (d.getTime() <= nowMs) {
        d.setMonth(d.getMonth() + 1);
        d.setDate(1);
      }
      return d.getTime();
    }
    return null;
  }

  function backupDue(lastExportAt, schedule, time, nowMs) {
    const last = Number(lastExportAt) || 0;
    if (schedule === "4h") return nowMs - last >= FOUR_HOURS_MS;
    const scheduled = lastScheduledAt(nowMs, schedule, time);
    return scheduled != null && last < scheduled;
  }

  // When the next automatic export is expected; nowMs when one is already due.
  function nextBackupAt(lastExportAt, schedule, time, nowMs) {
    const last = Number(lastExportAt) || 0;
    if (schedule === "4h") {
      if (!last) return nowMs;
      const due = last + FOUR_HOURS_MS;
      return due > nowMs ? due : nowMs;
    }
    return nextScheduledAt(nowMs, schedule, time);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function backupFilename(date) {
    const d = date || new Date();
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const clock = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
    return `lost-board-backup-${day}_${clock}.json`;
  }

  const api = {
    FOUR_HOURS_MS,
    parseHM,
    lastScheduledAt,
    nextScheduledAt,
    backupDue,
    nextBackupAt,
    backupFilename,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.BackupUtil = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
