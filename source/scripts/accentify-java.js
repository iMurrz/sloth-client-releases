#!/usr/bin/env node
// One-off migration: wraps the Sloth Client's orange-family colour literals in Ui.warm(...) / Ui.warmRgb(...) so
// the in-game menus follow the launcher's accent. Same colour rules as scripts/accentify-css.js; semantic reds,
// greens and greys are left alone. Usage: node scripts/accentify-java.js client-mod/src/main/java
const fs = require('node:fs');
const path = require('node:path');

const root = process.argv[2];
const KEEP = new Set(['ED7A62', 'F19A86']); // Ui.BAD and danger text
const SKIP_FILES = new Set(['Ui.java']);

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
const warm = rgbHex => {
  if (KEEP.has(rgbHex.toUpperCase())) return false;
  const [h, s] = hsl(parseInt(rgbHex.slice(0, 2), 16), parseInt(rgbHex.slice(2, 4), 16), parseInt(rgbHex.slice(4, 6), 16));
  return h >= 5 && h <= 45 && s >= 0.12;
};

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.java') && !SKIP_FILES.has(e.name)) files.push(p);
  }
})(root);

let total = 0;
for (const file of files) {
  let src = fs.readFileSync(file, 'utf8');
  let count = 0;
  // 8-digit ARGB literals, not already wrapped.
  src = src.replace(/(?<![\w.(])0x([0-9A-Fa-f]{2})([0-9A-Fa-f]{6})\b/g, (m, a, rgb, offset, whole) => {
    if (whole.slice(Math.max(0, offset - 8), offset) === 'Ui.warm(') return m;
    if (!warm(rgb)) return m;
    count++;
    return `Ui.warm(${m})`;
  });
  // 6-digit RGB literals used with a computed alpha ("a << 24 | 0xFF6A2A").
  src = src.replace(/(\|\s*)0x([0-9A-Fa-f]{6})\b(?![0-9A-Fa-f])/g, (m, bar, rgb) => {
    if (!warm(rgb)) return m;
    count++;
    return `${bar}Ui.warmRgb(0x${rgb})`;
  });
  if (!count) continue;
  const pkg = src.match(/^package ([\w.]+);/m)[1];
  if (pkg !== 'com.sloth.client.screen' && !/^import com\.sloth\.client\.screen\.Ui;/m.test(src)) {
    src = src.replace(/^(package [\w.]+;\r?\n)/m, '$1\nimport com.sloth.client.screen.Ui;\n');
  }
  fs.writeFileSync(file, src);
  total += count;
  console.log(`${String(count).padStart(3)}  ${path.relative(root, file)}`);
}
console.log(`wrapped ${total} colour literals`);
