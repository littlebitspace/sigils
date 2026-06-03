// compare.js
// ── Tile comparison buffers & transform cache ──────────────────────────────

import { TOTAL_TILES, PALETTE_COLS } from './constants.js';
import { state }                     from './state.js';
import { tileSvgSource }             from './font.js';
import { updatePaletteCursor }       from './palette.js';

export const cmp = {
  size:      128,
  tolerance: 6,
  bufs:      new Array(TOTAL_TILES).fill(null),
  ready:     false,
  building:  false,
};

// Transform cache: Map<"tileIdx:transform", resultIdx>
// Pre-computed for all tiles × all transforms after buildCmpBuffers.
const transformCache = new Map();

const cmpCanvas = document.createElement('canvas');
const cmpCtx    = cmpCanvas.getContext('2d', { willReadFrequently: true });

function setCmpStatus(msg) {
  const el = document.getElementById('cmp-status');
  if (el) el.textContent = msg;
}


// ── Rasterisation ──────────────────────────────────────────────────────────

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
  setCmpStatus('caching transforms…');
  await buildTransformCache();
  const thresh = Math.ceil(cmp.tolerance / 100 * size * size);
  setCmpStatus(`ready (${size}×${size}, tol ${cmp.tolerance}%)`);
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

function transformBuf(buf, S, name) {
  switch (name) {
    case 'R': return bufRotate90CCW(buf, S);
    case 'H': return bufFlipH(buf, S);
    case 'V': return bufFlipV(buf, S);
    case 'I': return bufInvert(buf);
    default:  return buf;
  }
}

// Returns mismatch score (lower = better). Returns Infinity if above threshold.
// Compares ink presence (any pixel > 8 = ink) rather than magnitude,
// making the comparison robust against anti-aliasing artifacts.
function matchScore(a, b, threshold) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    const aInk = a[i] > 8;
    const bInk = b[i] > 8;
    if (aInk !== bInk) {
      if (++diff > threshold) return Infinity;
    }
  }
  return diff;
}


// ── Transform cache builder ────────────────────────────────────────────────

async function buildTransformCache() {
  transformCache.clear();
  const S         = cmp.size;
  const threshold = Math.ceil(cmp.tolerance / 100 * S * S);
  const computed  = new Set();

  // Self-inverse transforms: H, V, I — if X:T→Y then Y:T→X
  for (const t of ['H', 'V', 'I']) {
    for (let x = 0; x < TOTAL_TILES; x++) {
      const key = `${x}:${t}`;
      if (computed.has(key)) continue;
      if (!cmp.bufs[x]) {
        transformCache.set(key, x);
        computed.add(key);
        continue;
      }

      const transformed = transformBuf(cmp.bufs[x], S, t);
      const y           = findBestMatch(transformed, threshold, x);

      transformCache.set(key, y);
      computed.add(key);

      // Record reverse: Y:T→X (self-inverse property)
      const reverseKey = `${y}:${t}`;
      if (!computed.has(reverseKey)) {
        transformCache.set(reverseKey, x);
        computed.add(reverseKey);
      }
    }
    // Yield between transforms to avoid blocking UI
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  // Rotation: order-4 cycle X→Y→Z→W→X
  // Walk chains so each tile is only processed once
  const rotComputed = new Set();
  for (let x = 0; x < TOTAL_TILES; x++) {
    if (rotComputed.has(x)) continue;

    // Walk the rotation chain from x
    const chain = [x];
    let current = x;
    for (let step = 0; step < 3; step++) {
      if (!cmp.bufs[current]) {
        // No buffer — whole chain maps to self
        chain.push(current);
        continue;
      }
      const transformed = transformBuf(cmp.bufs[current], S, 'R');
      const next        = findBestMatch(transformed, threshold, current);
      chain.push(next);
      current = next;
    }

    // chain = [X, Y, Z, W] where R(X)=Y, R(Y)=Z, R(Z)=W, R(W)=X
    for (let i = 0; i < 4; i++) {
      const from = chain[i];
      const to   = chain[(i + 1) % 4];
      const key  = `${from}:R`;
      if (!transformCache.has(key)) {
        transformCache.set(key, to);
      }
      rotComputed.add(from);
    }
  }
  await new Promise(resolve => setTimeout(resolve, 0));
}

// Find best matching tile for a transformed buffer.
// Falls back to fallbackIdx (the source tile) if nothing within threshold.
function findBestMatch(transformed, threshold, fallbackIdx) {
  let bestIdx   = fallbackIdx;
  let bestScore = Infinity;  // Infinity means "no match yet, use fallback"

  for (let z = 0; z < TOTAL_TILES; z++) {
    if (!cmp.bufs[z]) continue;
    const score = matchScore(transformed, cmp.bufs[z], threshold);
    if (score === 0) return z;  // perfect match — stop early
    if (score < bestScore) {
      bestScore = score;
      bestIdx   = z;
    }
  }
  // If bestScore is still Infinity, no tile was within threshold — return fallback
  return bestScore === Infinity ? fallbackIdx : bestIdx;
}


// ── Public API ─────────────────────────────────────────────────────────────

// Returns the tile index that best represents tileIdx after transform.
// O(1) after pre-computation. Falls back to live search if cache not ready.
export function findTransformedTile(tileIdx, transformName) {
  if (!cmp.ready) return tileIdx;

  const key = `${tileIdx}:${transformName}`;
  if (transformCache.has(key)) return transformCache.get(key);

  // Cache miss (shouldn't happen after buildTransformCache, but safe fallback)
  if (!cmp.bufs[tileIdx]) return tileIdx;
  const S           = cmp.size;
  const threshold   = Math.ceil(cmp.tolerance / 100 * S * S);
  const transformed = transformBuf(cmp.bufs[tileIdx], S, transformName);
  const result      = findBestMatch(transformed, threshold, tileIdx);
  transformCache.set(key, result);
  return result;
}

// Move palette cursor to transformed version of currently selected tile
export function applyTransform(name) {
  if (!cmp.ready) return;
  const srcIdx = state.palCursor.row * PALETTE_COLS + state.palCursor.col;
  const newIdx = findTransformedTile(srcIdx, name);
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