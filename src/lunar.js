// Vietnamese lunar calendar (Âm lịch) + moon phase.
//
// Port of the well-known algorithm by Hồ Ngọc Đức (Leipzig University), based on
// Jean Meeus' Astronomical Algorithms, computed for a configurable time zone
// (default UTC+7 — the reference for the Vietnamese lunar calendar). Handles
// leap months (tháng nhuận). Accurate for roughly 1800–2100.
//
// Exposed as `window.Lunar`. No dependencies; pure math; works offline.
(function () {
  const PI = Math.PI;
  const INT = Math.floor;

  // Julian day number from a (proleptic) Gregorian date.
  function jdFromDate(dd, mm, yy) {
    const a = INT((14 - mm) / 12);
    const y = yy + 4800 - a;
    const m = mm + 12 * a - 3;
    let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
    if (jd < 2299161) {
      jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
    }
    return jd;
  }

  function jdToDate(jd) {
    let a, b, c, d, e, m;
    if (jd > 2299160) {
      a = jd + 32044;
      b = INT((4 * a + 3) / 146097);
      c = a - INT((b * 146097) / 4);
    } else {
      b = 0;
      c = jd + 32082;
    }
    d = INT((4 * c + 3) / 1461);
    e = c - INT((1461 * d) / 4);
    m = INT((5 * e + 2) / 153);
    const day = e - INT((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * INT(m / 10);
    const year = b * 100 + d - 4800 + INT(m / 10);
    return [day, month, year];
  }

  // Time of the k-th new moon (Julian day).
  function newMoon(k) {
    const T = k / 1236.85;
    const T2 = T * T;
    const T3 = T2 * T;
    const dr = PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 += 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    let deltat;
    if (T < -11) {
      deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
    } else {
      deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
    }
    return Jd1 + C1 - deltat;
  }

  // Sun's ecliptic longitude (radians).
  function sunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525;
    const T2 = T * T;
    const dr = PI / 180;
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    let L = (L0 + DL) * dr;
    L -= PI * 2 * INT(L / (PI * 2));
    return L;
  }

  // 0..11 — the 12 major solar terms (each 30° of ecliptic longitude).
  function sunTerm(dayNumber, timeZone) {
    return INT((sunLongitude(dayNumber - 0.5 - timeZone / 24) / PI) * 6);
  }

  function newMoonDay(k, timeZone) {
    return INT(newMoon(k) + 0.5 + timeZone / 24);
  }

  // Start (Julian day) of the lunar month 11 of year yy.
  function lunarMonth11(yy, timeZone) {
    const off = jdFromDate(31, 12, yy) - 2415021;
    const k = INT(off / 29.530588853);
    let nm = newMoonDay(k, timeZone);
    if (sunTerm(nm, timeZone) >= 9) nm = newMoonDay(k - 1, timeZone);
    return nm;
  }

  function leapMonthOffset(a11, timeZone) {
    const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last = 0;
    let i = 1;
    let arc = sunTerm(newMoonDay(k + i, timeZone), timeZone);
    do {
      last = arc;
      i++;
      arc = sunTerm(newMoonDay(k + i, timeZone), timeZone);
    } while (arc !== last && i < 14);
    return i - 1;
  }

  // Solar (dd, mm, yy) -> [lunarDay, lunarMonth, lunarYear, lunarLeap(0|1)].
  function solarToLunar(dd, mm, yy, timeZone) {
    const tz = timeZone == null ? 7 : timeZone;
    const dayNumber = jdFromDate(dd, mm, yy);
    const k = INT((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = newMoonDay(k + 1, tz);
    if (monthStart > dayNumber) monthStart = newMoonDay(k, tz);
    let a11 = lunarMonth11(yy, tz);
    let b11 = a11;
    let lunarYear;
    if (a11 >= monthStart) {
      lunarYear = yy;
      a11 = lunarMonth11(yy - 1, tz);
    } else {
      lunarYear = yy + 1;
      b11 = lunarMonth11(yy + 1, tz);
    }
    const lunarDay = dayNumber - monthStart + 1;
    const diff = INT((monthStart - a11) / 29);
    let lunarLeap = 0;
    let lunarMonth = diff + 11;
    if (b11 - a11 > 365) {
      const leapOff = leapMonthOffset(a11, tz);
      if (diff >= leapOff) {
        lunarMonth = diff + 10;
        if (diff === leapOff) lunarLeap = 1;
      }
    }
    if (lunarMonth > 12) lunarMonth -= 12;
    if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
    return [lunarDay, lunarMonth, lunarYear, lunarLeap];
  }

  // Number of days (29 or 30) in a lunar month.
  function lunarMonthDays(lunarMonth, lunarYear, timeZone) {
    const tz = timeZone == null ? 7 : timeZone;
    // Month 11 of the given lunar year; find its start, then the next start.
    const a11 = lunarMonth11(lunarYear, tz);
    const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    // Reconstruct start of the requested lunar month within the year.
    // Simpler: count from a known reference — use the month-start offsets.
    const startThis = lunarMonthStartJd(lunarMonth, lunarYear, tz);
    const next = lunarMonthStartNextJd(lunarMonth, lunarYear, tz, k, a11);
    return next - startThis;
  }

  function lunarMonthStartJd(lunarMonth, lunarYear, timeZone) {
    // Find the Julian day of the 1st of the given lunar month/year.
    const a11 = lunarMonth11(lunarYear, timeZone);
    const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    // lunarMonth 11 is the "a11" month; map month -> offset in new moons.
    for (let i = 0; i < 14; i++) {
      const jd = newMoonDay(k + i, timeZone);
      const [ld, lm, ly] = solarToLunar(...jdToDate(jd), timeZone);
      if (lm === lunarMonth && ly === lunarYear && ld === 1) return jd;
    }
    return a11;
  }

  function lunarMonthStartNextJd(lunarMonth, lunarYear, timeZone, k, a11) {
    const start = lunarMonthStartJd(lunarMonth, lunarYear, timeZone);
    const kk = INT((start - 2415021.076998695) / 29.530588853 + 0.5);
    return newMoonDay(kk + 1, timeZone);
  }

  const MOON_EMOJI = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const MOON_NAMES = [
    { es: "Luna nueva", de: "Neumond" },
    { es: "Luna creciente", de: "Zunehmende Sichel" },
    { es: "Cuarto creciente", de: "Erstes Viertel" },
    { es: "Gibosa creciente", de: "Zunehmender Mond" },
    { es: "Luna llena", de: "Vollmond" },
    { es: "Gibosa menguante", de: "Abnehmender Mond" },
    { es: "Cuarto menguante", de: "Letztes Viertel" },
    { es: "Luna menguante", de: "Abnehmende Sichel" },
  ];

  // Moon phase from the lunar day (1 ≈ new, ~15 ≈ full).
  function moonPhase(lunarDay) {
    const frac = ((lunarDay - 1) % 29.530588853) / 29.530588853;
    const idx = Math.round(frac * 8) % 8;
    return { index: idx, emoji: MOON_EMOJI[idx], es: MOON_NAMES[idx].es, de: MOON_NAMES[idx].de };
  }

  function fromDate(date, timeZone) {
    return solarToLunar(date.getDate(), date.getMonth() + 1, date.getFullYear(), timeZone);
  }

  window.Lunar = { solarToLunar, fromDate, moonPhase, lunarMonthDays, MOON_EMOJI };
})();
