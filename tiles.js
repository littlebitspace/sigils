// tiles.js
// ── Tile rasterisation & cache ─────────────────────────────────────────────
// Rasterised images are used by the main canvas only.
// The palette panel uses SVGs directly via palette.js.

import { PETSCII, FONT_SIZE } from './constants.js';
import { tileSvgSource }      from './font.js';
import { draw }               from './draw.js';

export const tileCache = new Map();

function cacheKey(tileIdx, colIdx) { return `${tileIdx}:${colIdx}`; }

export function clearCache() {
  tileCache.clear();
}

export function rasteriseTile(tileIdx, colIdx) {
  const key = cacheKey(tileIdx, colIdx);
  if (tileCache.has(key)) return tileCache.get(key);
  const src = tileSvgSource[tileIdx];
  if (!src) return null;
  const coloured = src.replace(/FGCOLOR/g, PETSCII[colIdx].hex);
  const blob     = new Blob([coloured], { type: 'image/svg+xml' });
  const blobUrl  = URL.createObjectURL(blob);
  const img      = new Image(FONT_SIZE, FONT_SIZE);
  tileCache.set(key, img);
  img.onload  = () => { URL.revokeObjectURL(blobUrl); draw(); };
  img.onerror = () => URL.revokeObjectURL(blobUrl);
  img.src = blobUrl;
  return img;
}

export function getTile(tileIdx, colIdx) {
  if (!tileSvgSource[tileIdx]) return null;
  return rasteriseTile(tileIdx, colIdx);
}
