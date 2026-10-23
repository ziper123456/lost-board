/*
 * Small colour utilities for the "Spotify cover colours" feature.
 * Loaded in index.html (window.Colors) and require()-able from node for tests.
 */
(function (global) {
  "use strict";

  function hexToRgb(hex) {
    let h = String(hex || "").trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    const c = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }

  // t = 0 → a, t = 1 → b
  function mixHex(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    const k = Math.max(0, Math.min(1, Number(t) || 0));
    return rgbToHex(A.r + (B.r - A.r) * k, A.g + (B.g - A.g) * k, A.b + (B.b - A.b) * k);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max - min < 1e-6) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h / 6, s, l };
  }

  function hslToRgb(h, s, l) {
    if (s === 0) { const v = l * 255; return { r: v, g: v, b: v }; }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return { r: hue2rgb(p, q, h + 1 / 3) * 255, g: hue2rgb(p, q, h) * 255, b: hue2rgb(p, q, h - 1 / 3) * 255 };
  }

  // Keep an accent usable regardless of how dark/light the cover colour is.
  function clampLightness(hex, min, max) {
    const { r, g, b } = hexToRgb(hex);
    const hsl = rgbToHsl(r, g, b);
    const l = Math.max(min, Math.min(max, hsl.l));
    const out = hslToRgb(hsl.h, hsl.s, l);
    return rgbToHex(out.r, out.g, out.b);
  }

  // WCAG relative luminance (0..1).
  function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }

  // Readable text colour on top of `hex`.
  function contrastOn(hex) {
    return luminance(hex) > 0.5 ? "#000000" : "#ffffff";
  }

  const api = { hexToRgb, rgbToHex, mixHex, rgbToHsl, hslToRgb, clampLightness, luminance, contrastOn };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.Colors = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
