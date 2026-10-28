#!/usr/bin/env node
// One-off migration: turns the launcher's hard-coded orange accent colours into hsl() colours driven by one
// CSS variable (--accent-h), keeping each colour's saturation, lightness, alpha and its hue offset from the
// original orange. Semantic colours (errors, warnings, success) and neutrals are left alone.
// Usage: node scripts/accentify-css.js src/styles.css
const fs = require('node:fs');

const file = process.argv[2];
const BASE_HUE = 18; // the original ember orange (#ff6a2a)
// Reds, yellows and near-whites that carry meaning (error, offline, danger, warning) or are just text colour.
const KEEP = new Set([
  '#2a1d1d', '#5b3732', '#ffb3a8', '#7a3a30', '#f28b76', '#ed7a62', '#e56e53', '#f19a86', '#ed9379',
  '#a33545', '#2d1f20', '#f2c46d', '#7a5a2a', '#f5f3f0', '#f4f0ed'
]);

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const re = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;
let converted = 0;
const out = fs.readFileSync(file, 'utf8').replace(re, (match, hex, R, G, B, A) => {
  let r, g, b, a = 1;
  if (hex) {
    let h = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    if (h.length === 8) a = parseInt(h.slice(6, 8), 16) / 255;
  } else { r = +R; g = +G; b = +B; if (A !== undefined) a = +A; }
  const key = hex ? `#${hex.toLowerCase().slice(0, 6)}` : null;
  if (key && KEEP.has(key)) return match;
  const [h, s, l] = hsl(r, g, b);
  if (h < 5 || h > 45 || s < 0.12) return match; // neutrals, greens, blues, purples
  converted++;
  const offset = Math.round(h - BASE_HUE);
  const hue = offset === 0 ? 'var(--accent-h)' : `calc(var(--accent-h) ${offset < 0 ? '-' : '+'} ${Math.abs(offset)})`;
  const alpha = a < 1 ? ` / ${+a.toFixed(3)}` : '';
  return `hsl(${hue} ${Math.round(s * 100)}% ${Math.round(l * 100)}%${alpha})`;
});
fs.writeFileSync(file, out);
console.log(`converted ${converted} colour uses in ${file}`);
