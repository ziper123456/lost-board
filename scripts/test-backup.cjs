// Node self-test for backup scheduling helpers: node scripts/test-backup.cjs
const assert = require("node:assert/strict");
const B = require("../src/backup.js");

const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo, d, h, mi, 0, 0).getTime();

assert.deepEqual(B.parseHM("03:30"), { h: 3, m: 30 });
assert.deepEqual(B.parseHM("bad"), { h: 3, m: 0 });
assert.deepEqual(B.parseHM("25:99"), { h: 23, m: 59 });

// Daily at 03:00.
const nowDaily = at(2026, 9, 26, 12, 0); // Mon 26 Oct 2026 12:00 local
assert.equal(B.lastScheduledAt(nowDaily, "daily", "03:00"), at(2026, 9, 26, 3, 0));
assert.equal(B.nextScheduledAt(nowDaily, "daily", "03:00"), at(2026, 9, 27, 3, 0));
assert.equal(B.backupDue(0, "daily", "03:00", nowDaily), true);
assert.equal(B.backupDue(at(2026, 9, 26, 4, 0), "daily", "03:00", nowDaily), false);
assert.equal(B.backupDue(at(2026, 9, 25, 23, 0), "daily", "03:00", nowDaily), true);

// Weekly on Monday 09:00.
assert.equal(B.lastScheduledAt(nowDaily, "weekly", "09:00"), at(2026, 9, 26, 9, 0));
assert.equal(B.nextScheduledAt(nowDaily, "weekly", "09:00"), at(2026, 10, 2, 9, 0));
const beforeMonday = at(2026, 9, 26, 8, 0);
assert.equal(B.lastScheduledAt(beforeMonday, "weekly", "09:00"), at(2026, 9, 19, 9, 0));
assert.equal(B.nextScheduledAt(beforeMonday, "weekly", "09:00"), at(2026, 9, 26, 9, 0));

// Monthly on the 1st at 03:00.
assert.equal(B.lastScheduledAt(nowDaily, "monthly", "03:00"), at(2026, 9, 1, 3, 0));
assert.equal(B.nextScheduledAt(nowDaily, "monthly", "03:00"), at(2026, 10, 1, 3, 0));
const earlyOnFirst = at(2026, 9, 1, 2, 0);
assert.equal(B.lastScheduledAt(earlyOnFirst, "monthly", "03:00"), at(2026, 8, 1, 3, 0));
assert.equal(B.nextScheduledAt(earlyOnFirst, "monthly", "03:00"), at(2026, 9, 1, 3, 0));

// Every 4 hours since the last export.
const now4h = at(2026, 9, 26, 12, 0);
assert.equal(B.backupDue(now4h - 3 * 3600e3, "4h", "", now4h), false);
assert.equal(B.backupDue(now4h - 4 * 3600e3, "4h", "", now4h), true);
assert.equal(B.backupDue(0, "4h", "", now4h), true);
assert.equal(B.nextBackupAt(now4h - 3 * 3600e3, "4h", "", now4h), now4h + 3600e3);
assert.equal(B.nextBackupAt(0, "4h", "", now4h), now4h);
assert.equal(B.nextBackupAt(now4h - 5 * 3600e3, "4h", "", now4h), now4h);

// Filename is timestamped and filesystem-safe.
assert.equal(
  B.backupFilename(new Date(2026, 0, 2, 3, 4, 5)),
  "lost-board-backup-2026-01-02_03-04-05.json"
);

console.log("backup helpers: all assertions passed");
