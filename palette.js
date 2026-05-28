// palette.js
// ── Colour palette & swatches ──────────────────────────────────────────────
// The glyph palette is a DOM grid of <img> elements fed inline SVG blobs.
// No rasterisation needed here — the browser renders SVGs natively.

import { PETSCII, PALETTE_COLS,
         TOTAL_TILES, paletteIndex } from './constants.js';
import { state }                     from './state.js';
import { tileSvgSource }             from './font.js';
import { draw }                      from './draw.js';

let palImgs = [];   // 256 <img> elements, index = tile index


// ── Build the palette DOM grid ─────────────────────────────────────────────

export function initPaletteGrid() {
  const grid     = document.getElementById('palette-grid');
  grid.innerHTML = '';
  palImgs        = [];

  for (let i = 0; i < TOTAL_TILES; i++) {
    const img       = document.createElement('img');
    img.dataset.idx = i;
    img.addEventListener('click', () => {
      state.palCursor.col = i % PALETTE_COLS;
      state.palCursor.row = Math.floor(i / PALETTE_COLS);
      updatePaletteCursor();
      document.getElementById('st-tile').textContent =
        `tile ${i.toString(16).padStart(2, '0')}`;
    });
    grid.appendChild(img);
    palImgs.push(img);
  }

  updatePaletteCursor();
}


// ── Redraw all tiles in current fg + bg colour ─────────────────────────────

export function refreshPalette() {
  updatePaletteColour(state.fgIndex);
}

export function updatePaletteColour(fgIndex) {
  const bgHex = PETSCII[state.bgIndex].hex;
  const fgHex = PETSCII[fgIndex].hex;

  for (let i = 0; i < TOTAL_TILES; i++) {
    const img = palImgs[i];
    if (!img) continue;
    const src = tileSvgSource[i];

    if (!src) {
      // Empty tile — show bg colour as a flat square
      const empty = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
        <rect width="16" height="16" fill="${bgHex}"/>
      </svg>`;
      const blob = new Blob([empty], { type: 'image/svg+xml' });
      _setImgBlob(img, blob);
      continue;
    }

    // Inject bg rect and replace FGCOLOR
    const coloured = src
      .replace(/FGCOLOR/g, fgHex)
      .replace(/<svg([^>]*)>/, `<svg$1><rect width="100%" height="100%" fill="${bgHex}"/>`);

    const blob = new Blob([coloured], { type: 'image/svg+xml' });
    _setImgBlob(img, blob);
  }

  updatePaletteCursor();
}

function _setImgBlob(img, blob) {
  const old = img.src;
  img.src   = URL.createObjectURL(blob);
  if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
}


// ── Cursor highlight ───────────────────────────────────────────────────────

export function updatePaletteCursor() {
  const active = state.palCursor.row * PALETTE_COLS + state.palCursor.col;
  palImgs.forEach((img, i) => img.classList.toggle('pal-active', i === active));
}


// ── Colour swatches ────────────────────────────────────────────────────────

export function refreshSwatchMarkers() {
  document.querySelectorAll('#colour-grid .swatch').forEach(el => {
    el.classList.remove('active-fg', 'active-bg');
    const idx = Number(el.dataset.palIdx);
    if (idx === state.fgIndex) el.classList.add('active-fg');
    if (idx === state.bgIndex) el.classList.add('active-bg');
  });
}

export function setFg(palIdx) {
  state.fgIndex = palIdx;
  state.fgColRow[palIdx % 4] = Math.floor(palIdx / 4);
  refreshSwatchMarkers();
  updatePaletteColour(palIdx);
}

export function setBg(palIdx) {
  state.bgIndex = palIdx;
  state.bgColRow[palIdx % 4] = Math.floor(palIdx / 4);
  refreshSwatchMarkers();
  refreshPalette();   // bg change affects palette appearance too
  draw();
}

export function buildSwatches() {
  const container = document.getElementById('colour-grid');
  for (let row = 0; row < 4; row++) {
    const rowEl     = document.createElement('div');
    rowEl.className = 'swatch-row';
    for (let col = 0; col < 4; col++) {
      const palIdx        = paletteIndex(col, row);
      const el            = document.createElement('div');
      el.className        = 'swatch';
      el.style.background = PETSCII[palIdx].hex;
      el.dataset.palIdx   = palIdx;
      el.title            = PETSCII[palIdx].name;
      el.addEventListener('click',       ()  => setFg(palIdx));
      el.addEventListener('contextmenu', e   => { e.preventDefault(); setBg(palIdx); });
      rowEl.appendChild(el);
    }
    container.appendChild(rowEl);
  }
  refreshSwatchMarkers();
}