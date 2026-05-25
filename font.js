// font.js
// ── Font loading & metadata ────────────────────────────────────────────────

import { TOTAL_TILES }               from './constants.js';
import { state }                     from './state.js';
import { rasteriseTile, clearCache } from './tiles.js';
import { drawPalette }               from './draw.js';
import { draw }                      from './draw.js';
import { buildCmpBuffers }           from './compare.js';


export let fontMeta    = { name: '', charmap: { ' ': 0 } };
export let currentFont = '';

export function spaceIndex() {
  return fontMeta.charmap[' '] ?? 0;
}


// ── Tileset source ─────────────────────────────────────────────────────────
// Populated by loadTileset; consumed read-only by tiles.js.

export const tileSvgSource = new Array(TOTAL_TILES).fill(null);


// ── Tileset loader ─────────────────────────────────────────────────────────

export async function loadTileset(fontName) {
  currentFont = fontName;
  tileSvgSource.fill(null);
  clearCache();

  fontMeta = { name: fontName, charmap: { ' ': 0 } };
  try {
    const r = await fetch(`fonts/${fontName}/font.json`);
    if (r.ok) fontMeta = await r.json();
  } catch {}

  const promises = [];
  for (let i = 0; i < TOTAL_TILES; i++) {
    promises.push(
      fetch(`fonts/${fontName}/${i}.svg`)
        .then(r => r.ok ? r.text() : null)
        .then(svgText => { if (svgText) tileSvgSource[i] = svgText; })
        .catch(() => {})
    );
  }
  await Promise.all(promises);

  for (let i = 0; i < TOTAL_TILES; i++) {
    if (tileSvgSource[i]) rasteriseTile(i, state.fgIndex);
  }
  drawPalette();
  draw();
  buildCmpBuffers();
}


// ── Font discovery ─────────────────────────────────────────────────────────

export async function detectFonts() {
  try {
    const r = await fetch('fonts/manifest.json');
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {}
  return [];
}


// ── Font selector UI ───────────────────────────────────────────────────────

export async function initFontSelector() {
  const sel   = document.getElementById('font-select');
  const fonts = await detectFonts();
  sel.innerHTML = '';
  for (const f of fonts) {
    const opt       = document.createElement('option');
    opt.value       = f;
    opt.textContent = f;
    sel.appendChild(opt);
  }
  sel.value = fontMeta.name || fonts[0];
  sel.addEventListener('change', () => loadTileset(sel.value));
}
