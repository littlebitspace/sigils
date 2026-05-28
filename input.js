// input.js
// ── Input handling ─────────────────────────────────────────────────────────

import { CELL_PX, ZOOM_STEPS,
         PALETTE_COLS, PALETTE_ROWS,
         paletteIndex }              from './constants.js';
import { state,
         enterTyping, exitTyping,
         cycleWriteMode }            from './state.js';
import { grid }                      from './grid.js';
import { undo, redo }                from './history.js';
import { saveFile, saveFileAs,
         newFile, openFilePicker }   from './io.js';
import { placeTile, eraseTile,
         backspaceTile,
         extendSelection,
         clearSelection }            from './editor.js';
import { setFg, setBg,
         updatePaletteCursor }       from './palette.js';
import { fontMeta }                  from './font.js';
import { applyTransform }            from './compare.js';
import { draw, resizeCanvas }        from './draw.js';
import { updateModeButtons,
         updateWriteButtons,
         updateGridButton }          from './ui.js';


// ── Zoom ───────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const wrap   = document.getElementById('canvas-wrap');

function setZoom(idx, originX, originY) {
  idx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx));
  if (idx === state.zoomIdx) return;
  const oldZ    = state.zoom;
  const newZ    = ZOOM_STEPS[idx];
  const ox      = originX ?? canvas.width  / 2;
  const oy      = originY ?? canvas.height / 2;
  state.pan.x   = ox - (ox - state.pan.x) * (newZ / oldZ);
  state.pan.y   = oy - (oy - state.pan.y) * (newZ / oldZ);
  state.zoom    = newZ;
  state.zoomIdx = idx;
  draw();
}


// ── Canvas coordinate → grid cell ──────────────────────────────────────────

function canvasToCell(clientX, clientY) {
  const rect  = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx    = (clientX - rect.left) * scaleX;
  const cy    = (clientY - rect.top)  * scaleY;
  const col   = Math.floor((cx - state.pan.x) / (CELL_PX * state.zoom));
  const row   = Math.floor((cy - state.pan.y) / (CELL_PX * state.zoom));
  return { col, row };
}


// ── Mouse drawing ──────────────────────────────────────────────────────────

function initDrawing() {
  let painting  = null;   // 'place' | 'erase' | null

  canvas.addEventListener('mousedown', e => {
    if (e.button === 0 && !e.shiftKey && !e.altKey) {
      painting = 'place';
      const { col, row } = canvasToCell(e.clientX, e.clientY);
      state.cursor.col = col;
      state.cursor.row = row;
      placeTile();
      e.preventDefault();
    } else if (e.button === 2) {
      painting = 'erase';
      const { col, row } = canvasToCell(e.clientX, e.clientY);
      state.cursor.col = col;
      state.cursor.row = row;
      eraseTile();
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', e => {
    if (!painting) return;
    const { col, row } = canvasToCell(e.clientX, e.clientY);
    // Only act if cursor actually moved to a new cell
    if (col === state.cursor.col && row === state.cursor.row) return;
    state.cursor.col = col;
    state.cursor.row = row;
    if (painting === 'place') placeTile();
    else                      eraseTile();
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 0 || e.button === 2) painting = null;
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
}


// ── Pan ────────────────────────────────────────────────────────────────────

function initPan() {
  let panning  = false;
  let panStart = { x: 0, y: 0, panX: 0, panY: 0 };

  wrap.addEventListener('mousedown', e => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      panning  = true;
      panStart = { x: e.clientX, y: e.clientY, panX: state.pan.x, panY: state.pan.y };
      e.preventDefault();
    }
  });
  window.addEventListener('mousemove', e => {
    if (!panning) return;
    state.pan.x = panStart.panX + (e.clientX - panStart.x);
    state.pan.y = panStart.panY + (e.clientY - panStart.y);
    draw();
  });
  window.addEventListener('mouseup', () => { panning = false; });
  wrap.addEventListener('auxclick', e => e.preventDefault());

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = wrap.getBoundingClientRect();
    setZoom(state.zoomIdx + (e.deltaY < 0 ? 1 : -1), e.clientX - rect.left, e.clientY - rect.top);
  }, { passive: false });
}


// ── Keyboard ───────────────────────────────────────────────────────────────

function initKeyboard() {
  window.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const { cursor, palCursor } = state;

    // ── Ctrl shortcuts — always active ────────────────────────────────────
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'y') { e.preventDefault(); redo(); return; }
      if (e.key === 'n') { e.preventDefault(); newFile(); return; }
      if (e.key === 'o') { e.preventDefault(); openFilePicker(); return; }
      if (e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) saveFileAs(); else saveFile();
        return;
      }
    }

    // ── Escape ────────────────────────────────────────────────────────────
    if (e.key === 'Escape') {
      if (state.selection) { clearSelection(); return; }
      if (state.mode === 'typing') { exitTyping(draw); updateModeButtons(); return; }
      return;
    }

    // ── Shift+Arrows — extend selection ───────────────────────────────────
    if (e.shiftKey) {
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); extendSelection(-1,  0); return;
        case 'ArrowRight': e.preventDefault(); extendSelection( 1,  0); return;
        case 'ArrowUp':    e.preventDefault(); extendSelection( 0, -1); return;
        case 'ArrowDown':  e.preventDefault(); extendSelection( 0,  1); return;
      }
    }

    // ── Number keys 1-4: fg / bg colour (tile mode only) ──────────────────
    if (state.mode !== 'typing') {
      const codeMatch = e.code.match(/^Digit([1-4])$/);
      if (codeMatch) {
        const col = Number(codeMatch[1]) - 1;
        if (e.shiftKey) {
          const currentRow = Math.floor(state.bgIndex / 4);
          const currentCol = state.bgIndex % 4;
          setBg(paletteIndex(col, (currentCol === col) ? (currentRow + 1) % 4 : 0));
        } else {
          const currentRow = Math.floor(state.fgIndex / 4);
          const currentCol = state.fgIndex % 4;
          setFg(paletteIndex(col, (currentCol === col) ? (currentRow + 1) % 4 : 0));
        }
        return;
      }
    }

    // ── Typing mode ───────────────────────────────────────────────────────
    if (state.mode === 'typing') {
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          cursor.col = Math.max(0, cursor.col - 1);
          state.typing.startCol = cursor.col;
          draw(); return;
        case 'ArrowRight':
          e.preventDefault();
          cursor.col = Math.min(grid.cols - 1, cursor.col + 1);
          state.typing.startCol = cursor.col;
          draw(); return;
        case 'ArrowUp':
          e.preventDefault();
          cursor.row = Math.max(0, cursor.row - 1);
          state.typing.startCol = cursor.col;
          draw(); return;
        case 'ArrowDown':
          e.preventDefault();
          cursor.row = Math.min(grid.rows - 1, cursor.row + 1);
          state.typing.startCol = cursor.col;
          draw(); return;
        case 'Enter':
          cursor.row = Math.min(grid.rows - 1, cursor.row + 1);
          cursor.col = state.typing.startCol;
          draw(); return;
        case 'Backspace':
          e.preventDefault();
          backspaceTile(); return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        const tileIdx = fontMeta.charmap?.[e.key];
        if (tileIdx !== undefined) placeTile(tileIdx);
        if (cursor.col < grid.cols - 1) {
          cursor.col++;
        } else {
          cursor.col = 0;
          cursor.row = Math.min(grid.rows - 1, cursor.row + 1);
        }
        draw(); return;
      }
    }

    // ── Tile mode shortcuts ───────────────────────────────────────────────
    const PAN_STEP = Math.round(CELL_PX * state.zoom * 4);

    switch (e.key) {
      case 'a': case 'A':
        if (e.shiftKey) { state.pan.x -= PAN_STEP; draw(); }
        else { cursor.col = Math.max(0, cursor.col - 1); draw(); }
        break;
      case 'd': case 'D':
        if (e.shiftKey) { state.pan.x += PAN_STEP; draw(); }
        else { cursor.col = Math.min(grid.cols - 1, cursor.col + 1); draw(); }
        break;
      case 'w': case 'W':
        if (e.shiftKey) { state.pan.y -= PAN_STEP; draw(); }
        else { cursor.row = Math.max(0, cursor.row - 1); draw(); }
        break;
      case 's': case 'S':
        if (e.shiftKey) { state.pan.y += PAN_STEP; draw(); }
        else { cursor.row = Math.min(grid.rows - 1, cursor.row + 1); draw(); }
        break;

      case 'j': case 'J':
      case 'ArrowLeft':
        e.preventDefault();
        palCursor.col = Math.max(0, palCursor.col - 1);
        updatePaletteCursor(); break;
      case 'l': case 'L':
      case 'ArrowRight':
        e.preventDefault();
        palCursor.col = Math.min(PALETTE_COLS - 1, palCursor.col + 1);
        updatePaletteCursor(); break;
      case 'i': case 'I':
      case 'ArrowUp':
        e.preventDefault();
        palCursor.row = Math.max(0, palCursor.row - 1);
        updatePaletteCursor(); break;
      case 'k': case 'K':
      case 'ArrowDown':
        e.preventDefault();
        palCursor.row = Math.min(PALETTE_ROWS - 1, palCursor.row + 1);
        updatePaletteCursor(); break;

      case 'e': case 'E': placeTile(); break;
      case 'q': case 'Q': eraseTile(); break;

      case 'r': case 'R': applyTransform('R'); break;
      case 'h': case 'H': applyTransform('H'); break;
      case 'v': case 'V': applyTransform('V'); break;
      case 'f': case 'F': applyTransform('I'); break;

      case 't': case 'T': enterTyping(draw); updateModeButtons(); break;
      case 'm': case 'M': cycleWriteMode(draw); updateWriteButtons(); break;

      case 'g': case 'G':
        state.showGrid = !state.showGrid; updateGridButton(); draw(); break;
      case '§':
        state.showPanel = !state.showPanel;
        document.getElementById('panel').style.display = state.showPanel ? '' : 'none';
        document.getElementById('status').style.left   = state.showPanel ? 'var(--panel-width)' : '0';
        resizeCanvas();
        break;

      case '+': case '=': setZoom(state.zoomIdx + 1); break;
      case '-':           setZoom(state.zoomIdx - 1); break;
    }
  });
}


// ── Init ───────────────────────────────────────────────────────────────────

export function initInput() {
  initDrawing();
  initPan();
  initKeyboard();
}