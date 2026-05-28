// draw.js
// ── Rendering ──────────────────────────────────────────────────────────────
// Pure read — never mutates state or grid data.

import { CELL_PX, PETSCII, GRID_COLOR,
         CURSOR_COLOR,
         EMPTY_COLOR }               from './constants.js';
import { state, cursorVisible,
         selectionRect }             from './state.js';
import { grid }                      from './grid.js';
import { getTile }                   from './tiles.js';
import { spaceIndex }                from './font.js';
import { ref, coverScale }           from './ref.js';

const canvas = document.getElementById('canvas');
const ctx    = canvas.getContext('2d');
const wrap   = document.getElementById('canvas-wrap');

const stZoom   = document.getElementById('st-zoom');
const stPos    = document.getElementById('st-pos');
const stFgName = document.getElementById('st-fg-name');
const stBgName = document.getElementById('st-bg-name');
const stFgSw   = document.getElementById('st-fg-swatch');
const stBgSw   = document.getElementById('st-bg-swatch');
const stGrid   = document.getElementById('st-grid');
const stMode   = document.getElementById('st-mode');


// ── Canvas sizing ──────────────────────────────────────────────────────────

export function resizeCanvas() {
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);


// ── Main draw ──────────────────────────────────────────────────────────────

export function draw() {
  const { zoom, pan } = state;
  const { cols, rows, tile, fg } = grid;
  const cell = CELL_PX * zoom;
  const W    = canvas.width;
  const H    = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = PETSCII[state.bgIndex].hex;
  ctx.fillRect(pan.x, pan.y, cols * cell, rows * cell);

  // ── Reference image (between bg and tiles) ────────────────────────────────
  if (ref.img && ref.visible) {
    const cs      = coverScale();
    const totalS  = cs * ref.scale;
    const imgW    = ref.img.naturalWidth  * totalS;
    const imgH    = ref.img.naturalHeight * totalS;
    const ix = pan.x + ref.x * cell;
    const iy = pan.y + ref.y * cell;
    ctx.save();
    ctx.globalAlpha = ref.opacity;
    ctx.beginPath();
    ctx.rect(pan.x, pan.y, cols * cell, rows * cell);
    ctx.clip();
    ctx.drawImage(ref.img, ix, iy, imgW * zoom, imgH * zoom);
    ctx.restore();

    // Show border and edge handles when editing
    if (ref.editing) {
      const iw = imgW * zoom;
      const ih = imgH * zoom;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);
      // Edge handle highlights
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      const E = 16;
      ctx.fillRect(ix,            iy,            E,  ih);  // left
      ctx.fillRect(ix + iw - E,   iy,            E,  ih);  // right
      ctx.fillRect(ix,            iy,            iw, E);   // top
      ctx.fillRect(ix,            iy + ih - E,   iw, E);   // bottom
      ctx.restore();
    }
  }

  // ── Grid tiles ────────────────────────────────────────────────────────────
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i       = r * cols + c;
      const tileIdx = tile[i];
      if (tileIdx === spaceIndex()) continue;
      const img = getTile(tileIdx, fg[i]);
      if (!img || !img.complete || !img.naturalWidth) continue;
      ctx.drawImage(img, pan.x + c * cell, pan.y + r * cell, cell, cell);
    }
  }

  // ── Grid lines ────────────────────────────────────────────────────────────
  if (state.showGrid) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = 1;
    const startCol = Math.floor(-pan.x / cell);
    const startRow = Math.floor(-pan.y / cell);
    const endCol   = Math.min(cols, startCol + Math.ceil(W / cell) + 1);
    const endRow   = Math.min(rows, startRow + Math.ceil(H / cell) + 1);
    for (let c = Math.max(0, startCol); c <= endCol; c++) {
      const x = pan.x + c * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(x, pan.y); ctx.lineTo(x, pan.y + rows * cell); ctx.stroke();
    }
    for (let r = Math.max(0, startRow); r <= endRow; r++) {
      const y = pan.y + r * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(pan.x, y); ctx.lineTo(pan.x + cols * cell, y); ctx.stroke();
    }
  }

  // ── Floating selection overlay ────────────────────────────────────────────
  if (state.floatSel) {
    const { tiles: fTiles, fg: fFg,
            cols: fCols, rows: fRows,
            col:  fCol,  row:  fRow } = state.floatSel;

    ctx.save();
    ctx.globalAlpha = 0.8;
    for (let r = 0; r < fRows; r++) {
      for (let c = 0; c < fCols; c++) {
        const tileIdx = fTiles[r * fCols + c];
        const fgIdx   = fFg[r * fCols + c];
        if (tileIdx === spaceIndex()) continue;
        const img = getTile(tileIdx, fgIdx);
        if (!img || !img.complete || !img.naturalWidth) continue;
        const px = pan.x + (fCol + c) * cell;
        const py = pan.y + (fRow + r) * cell;
        ctx.drawImage(img, px, py, cell, cell);
      }
    }
    ctx.globalAlpha = 1;

    // Solid border around float
    const fx = pan.x + fCol * cell;
    const fy = pan.y + fRow * cell;
    const fw = fCols * cell;
    const fh = fRows * cell;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    ctx.setLineDash([]);
    ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
    ctx.restore();
  }

  // ── Cursor ────────────────────────────────────────────────────────────────
  if (cursorVisible && !state.floatSel) {
    const { col, row } = state.cursor;
    ctx.strokeStyle = state.mode === 'typing' ? '#ffff00' : CURSOR_COLOR;
    ctx.lineWidth   = state.mode === 'typing' ? 2 : 1;
    ctx.strokeRect(pan.x + col * cell + 0.5, pan.y + row * cell + 0.5, cell - 1, cell - 1);
  }

  // ── Selection rect (dashed) ───────────────────────────────────────────────
  const sel = selectionRect();
  if (sel && !state.floatSel) {
    const sx = pan.x + sel.c0 * cell;
    const sy = pan.y + sel.r0 * cell;
    const sw = (sel.c1 - sel.c0 + 1) * cell;
    const sh = (sel.r1 - sel.r0 + 1) * cell;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    ctx.strokeStyle    = '#000000';
    ctx.lineDashOffset = 3;
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    ctx.restore();
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  const modeLabel  = ref.editing ? 'REF' : state.mode === 'typing' ? 'TYPE' : 'TILE';
  const writeLabel = state.writeMode.toUpperCase();
  const floatLabel = state.floatSel
    ? ` | FLOAT ${state.floatSel.cols}×${state.floatSel.rows} @ ${state.floatSel.col},${state.floatSel.row}`
    : sel ? ` | SEL ${sel.c0},${sel.r0}→${sel.c1},${sel.r1}` : '';
  const refLabel = ref.editing
    ? ` | x:${ref.x.toFixed(1)} y:${ref.y.toFixed(1)} scale:${Math.round(ref.scale*100)}% op:${Math.round(ref.opacity*100)}%`
    : '';
  stZoom.textContent          = `zoom ${zoom}×`;
  stPos.textContent           = `${state.cursor.col},${state.cursor.row}`;
  stGrid.textContent          = `${cols}×${rows}`;
  stMode.textContent          = `${modeLabel} | ${writeLabel}${floatLabel}${refLabel}`;
  stFgSw.style.background     = PETSCII[state.fgIndex].hex;
  stBgSw.style.background     = PETSCII[state.bgIndex].hex;
  stFgName.textContent        = PETSCII[state.fgIndex].name;
  stBgName.textContent        = PETSCII[state.bgIndex].name;
}