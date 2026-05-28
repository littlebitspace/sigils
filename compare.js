// compare.js
// ── Tile comparison buffers ────────────────────────────────────────────────

import { TOTAL_TILES, PALETTE_COLS } from './constants.js';
import { state }                     from './state.js';
import { tileSvgSource }             from './font.js';
import { updatePaletteCursor }       from './palette.js';

export const cmp = {
  size:      32,
  tolerance: 10,
  bufs:      new Array(TOTAL_TILES).fill(null),
  ready:     false,
  building:  false,
};

const cmpCanvas = document.createElement('canvas');
const cmpCtx    = cmpCanvas.getContext('2d', { willReadFrequently: true });

function setCmpStatus(msg) {
  const el = document.getElementById('cmp-status');
  if (el) el.textContent = msg;
}

async function rasteriseToCmpBuf(tileIdx, size) {
  const src = tileSvgSource[tileIdx];
  if (!src) return null;
  return new Promise(resolve => {
    const coloured = src.replace(/FGCOLOR/g, '#ffffff');
    const blob     = new Blob([coloured], { type: 'image/svg+xml' });
    const url      = URL.createObjectURL(blob);
    const img      = new Image(size, size);
    img.onload = () => {
      URL.revokeObjectURL(url);
      cmpCanvas.width  = size;
      cmpCanvas.height = size;
      cmpCtx.clearRect(0, 0, size, size);
      cmpCtx.drawImage(img, 0, 0, size, size);
      const data = cmpCtx.getImageData(0, 0, size, size).data;
      const buf  = new Uint8Array(size * size);
      for (let i = 0; i < buf.length; i++) buf[i] = data[i * 4];
      resolve(buf);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export async function buildCmpBuffers() {
  if (cmp.building) return;
  cmp.building = true;
  cmp.ready    = false;
  setCmpStatus('building…');
  const size = cmp.size;
  cmp.bufs.fill(null);
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (tileSvgSource[i]) cmp.bufs[i] = await rasteriseToCmpBuf(i, size);
  }
  cmp.ready    = true;
  cmp.building = false;
  const thresh = Math.ceil(cmp.tolerance / 100 * size * size);
  setCmpStatus(`ready (${size}×${size}, <${thresh}px)`);
}


// ── Buffer transforms ──────────────────────────────────────────────────────

function bufRotate90CCW(buf, S) {
  const out = new Uint8Array(S * S);
  for (let r = 0; r < S; r++)
    for (let c = 0; c < S; c++)
      out[(S - 1 - c) * S + r] = buf[r * S + c];
  return out;
}

function bufFlipH(buf, S) {
  const out = new Uint8Array(S * S);
  for (let r = 0; r < S; r++)
    for (let c = 0; c < S; c++)
      out[r * S + (S - 1 - c)] = buf[r * S + c];
  return out;
}

function bufFlipV(buf, S) {
  const out = new Uint8Array(S * S);
  for (let r = 0; r < S; r++)
    out.set(buf.subarray(r * S, r * S + S), (S - 1 - r) * S);
  return out;
}

function bufInvert(buf) {
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = 255 - buf[i];
  return out;
}

function bufsMatch(a, b, threshold) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 32) diff++;
    if (diff > threshold) return false;
  }
  return true;
}

// Find the tile index whose compare buffer best matches the transformed buf.
// Returns the original tileIdx if no match found.
export function findTransformedTile(tileIdx, transformName) {
  if (!cmp.ready) return tileIdx;
  const srcBuf = cmp.bufs[tileIdx];
  if (!srcBuf) return tileIdx;
  const S = cmp.size;
  let transformed;
  switch (transformName) {
    case 'R': transformed = bufRotate90CCW(srcBuf, S); break;
    case 'H': transformed = bufFlipH(srcBuf, S);       break;
    case 'V': transformed = bufFlipV(srcBuf, S);       break;
    case 'I': transformed = bufInvert(srcBuf);         break;
    default: return tileIdx;
  }
  const threshold = Math.ceil(cmp.tolerance / 100 * S * S);
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (!cmp.bufs[i]) continue;
    if (bufsMatch(transformed, cmp.bufs[i], threshold)) return i;
  }
  return tileIdx;  // no match — keep original
}

// Move palette cursor to transformed version of currently selected tile
export function applyTransform(name) {
  if (!cmp.ready) return;
  const srcIdx  = state.palCursor.row * PALETTE_COLS + state.palCursor.col;
  const newIdx  = findTransformedTile(srcIdx, name);
  state.palCursor.col = newIdx % PALETTE_COLS;
  state.palCursor.row = Math.floor(newIdx / PALETTE_COLS);
  updatePaletteCursor();
}


// ── Controls ───────────────────────────────────────────────────────────────

export function initCompare() {
  const sizeInput  = document.getElementById('cmp-size');
  const tolInput   = document.getElementById('cmp-tol');
  const rebuildBtn = document.getElementById('cmp-rebuild');

  rebuildBtn.addEventListener('click', async () => {
    const size = Math.max(8,  Math.min(128, parseInt(sizeInput.value) || 32));
    const tol  = Math.max(1,  Math.min(50,  parseInt(tolInput.value)  || 10));
    sizeInput.value     = size;
    tolInput.value      = tol;
    cmp.size            = size;
    cmp.tolerance       = tol;
    rebuildBtn.disabled = true;
    await buildCmpBuffers();
    rebuildBtn.disabled = false;
  });
}