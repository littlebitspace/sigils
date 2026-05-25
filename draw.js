// draw.js
// ── Rendering ──────────────────────────────────────────────────────────────
// Pure read — never mutates state or grid data.
// Palette rendering has moved to palette.js (SVG-based DOM grid).

import { CELL_PX, PETSCII, GRID_COLOR,
         CURSOR_COLOR,
         EMPTY_COLOR }               from './constants.js';
import { state, cursorVisible,
         selectionRect }             from './state.js';
import { grid }                      from './grid.js';
import { getTile }                   from './tiles.js';
import { spaceIndex }                from './font.js';

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

  if (cursorVisible) {
    const { col, row } = state.cursor;
    ctx.strokeStyle = state.mode === 'typing' ? '#ffff00' : CURSOR_COLOR;
    ctx.lineWidth   = state.mode === 'typing' ? 2 : 1;
    ctx.strokeRect(pan.x + col * cell + 0.5, pan.y + row * cell + 0.5, cell - 1, cell - 1);
  }

  const sel = selectionRect();
  if (sel) {
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

  const modeLabel  = state.mode === 'typing' ? 'TYPE' : 'TILE';
  const writeLabel = state.writeMode.toUpperCase();
  const selLabel   = sel ? ` | SEL ${sel.c0},${sel.r0}→${sel.c1},${sel.r1}` : '';
  stZoom.textContent          = `zoom ${zoom}×`;
  stPos.textContent           = `${state.cursor.col},${state.cursor.row}`;
  stGrid.textContent          = `${cols}×${rows}`;
  stMode.textContent          = `${modeLabel} | ${writeLabel}${selLabel}`;
  stFgSw.style.background     = PETSCII[state.fgIndex].hex;
  stBgSw.style.background     = PETSCII[state.bgIndex].hex;
  stFgName.textContent        = PETSCII[state.fgIndex].name;
  stBgName.textContent        = PETSCII[state.bgIndex].name;
}
