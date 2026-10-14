// Public holidays for the calendar tile.
//
// Offline, table-driven. Vietnamese lunar holidays use window.Lunar; German
// movable feasts use the Gregorian Easter computus. Fixed-date only for
// Pakistan (Eid/Ashura need a Hijri conversion — intentionally deferred).
//
// Exposed as `window.Holidays`.
(function () {
  function ymd(dt) {
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  }
  const dayNum = (dt) => Math.round(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) / 86400000);

  // Gregorian Easter Sunday (anonymous / Meeus-Jones-Butcher algorithm).
  function easter(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  // name = native (shown first); es/de = translations shown on hover when present.
  const VN_SOLAR = [
    { m: 1, d: 1, name: "Tết Dương lịch", es: "Año Nuevo", de: "Neujahr" },
    { m: 4, d: 30, name: "Ngày Giải phóng miền Nam", es: "Día de la Reunificación", de: "Tag der Wiedervereinigung" },
    { m: 5, d: 1, name: "Ngày Quốc tế Lao động", es: "Día del Trabajo", de: "Tag der Arbeit" },
    { m: 9, d: 2, name: "Quốc khánh", es: "Día Nacional", de: "Nationalfeiertag" },
  ];
  const VN_LUNAR = [
    { lm: 1, ld: 1, span: 4, name: "Tết Nguyên Đán", es: "Año Nuevo Lunar", de: "Mondneujahr" },
    { lm: 3, ld: 10, name: "Giỗ Tổ Hùng Vương", es: "Día de los Reyes Hùng", de: "Gedenktag der Hùng-Könige" },
  ];
  const DE_SOLAR = [
    { m: 1, d: 1, name: "Neujahr", es: "Año Nuevo" },
    { m: 5, d: 1, name: "Tag der Arbeit", es: "Día del Trabajo" },
    { m: 10, d: 3, name: "Tag der Deutschen Einheit", es: "Día de la Unidad Alemana" },
    { m: 11, d: 1, name: "Allerheiligen", es: "Todos los Santos" }, // Rheinland-Pfalz (Grünstadt)
    { m: 12, d: 25, name: "1. Weihnachtstag", es: "Navidad" },
    { m: 12, d: 26, name: "2. Weihnachtstag", es: "Segundo día de Navidad" },
  ];
  const DE_MOVABLE = [
    { off: -2, name: "Karfreitag", es: "Viernes Santo" },
    { off: 1, name: "Ostermontag", es: "Lunes de Pascua" },
    { off: 39, name: "Christi Himmelfahrt", es: "Ascensión" },
    { off: 50, name: "Pfingstmontag", es: "Lunes de Pentecostés" },
    { off: 60, name: "Fronleichnam", es: "Corpus Christi" }, // Rheinland-Pfalz
  ];
  const PK_SOLAR = [
    { m: 2, d: 5, name: "Kashmir Day", es: "Día de Cachemira", de: "Kaschmir-Tag" },
    { m: 3, d: 23, name: "Pakistan Day", es: "Día de Pakistán", de: "Pakistan-Tag" },
    { m: 5, d: 1, name: "Labour Day", es: "Día del Trabajo", de: "Tag der Arbeit" },
    { m: 8, d: 14, name: "Independence Day", es: "Día de la Independencia", de: "Unabhängigkeitstag" },
    { m: 11, d: 9, name: "Iqbal Day", es: "Día de Iqbal", de: "Iqbal-Tag" },
    { m: 12, d: 25, name: "Quaid-e-Azam Day", es: "Día de Quaid-e-Azam", de: "Quaid-e-Azam-Tag" },
  ];

  const TZ = 7; // Vietnamese lunar reference (UTC+7)

  // Returns a Map keyed by "YYYY-MM-DD" -> array of holiday objects
  // { name, es?, de? } for the inclusive [start, end] range, using the
  // per-country toggles in `opts` ({ vietnam, germany, pakistan }).
  function forRange(start, end, opts) {
    const o = opts || {};
    const map = new Map();
    const push = (dt, h) => {
      const key = ymd(dt);
      if (!map.has(key)) map.set(key, []);
      if (!map.get(key).some((x) => x.name === h.name)) map.get(key).push(h);
    };
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
      const m = cur.getMonth() + 1;
      const d = cur.getDate();
      if (o.vietnam) {
        for (const h of VN_SOLAR) if (h.m === m && h.d === d) push(cur, h);
        const [ld, lm] = window.Lunar.fromDate(cur, TZ);
        for (const h of VN_LUNAR) {
          const span = h.span || 1;
          if (lm === h.lm && ld >= h.ld && ld < h.ld + span) push(cur, h);
        }
      }
      if (o.germany) {
        for (const h of DE_SOLAR) if (h.m === m && h.d === d) push(cur, h);
        const e = easter(cur.getFullYear());
        const off = dayNum(cur) - dayNum(e);
        for (const h of DE_MOVABLE) if (h.off === off) push(cur, h);
      }
      if (o.pakistan) {
        for (const h of PK_SOLAR) if (h.m === m && h.d === d) push(cur, h);
      }
      cur.setDate(cur.getDate() + 1);
    }
    return map;
  }

  window.Holidays = { forRange };
})();
