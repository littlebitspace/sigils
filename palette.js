// palette.js
// ── Colour palette & swatches ──────────────────────────────────────────────

import { PETSCII, PALETTE_COLS,
         PALETTE_ROWS, PALETTE_CELL,
         paletteIndex }              from './constants.js';
import { state }                     from './state.js';
import { draw, drawPalette }         from './draw.js';

export function initPaletteCanvas() {
  const palCanvas  = document.getElementById('palette-canvas');
  palCanvas.width  = PALETTE_COLS * PALETTE_CELL + 1;
  palCanvas.height = PALETTE_ROWS * PALETTE_CELL + 1;
}

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
  const col = palIdx % 4;
  state.fgColRow[col] = Math.floor(palIdx / 4);
  refreshSwatchMarkers();
  drawPalette();
}

export function setBg(palIdx) {
  state.bgIndex = palIdx;
  const col = palIdx % 4;
  state.bgColRow[col] = Math.floor(palIdx / 4);
  refreshSwatchMarkers();
  drawPalette();
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
