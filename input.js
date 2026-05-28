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
         clearSelection,
         deleteSelection,
         copySelection,
         cutSelection,
         moveFloat,
         stampFloat,
         discardFloat,
         eraseUnderFloat,
         transformFloat }            from './editor.js';
import { setFg, setBg,
         updatePaletteCursor }       from './palette.js';
import { fontMeta }                  from './font.js';
import { applyTransform }            from './compare.js';
import { draw, resizeCanvas }        from './draw.js';
import { updateModeButtons,
         updateWriteButtons,
         updateGridButton }          from './ui.js';
import { ref, moveRef, changeOpacity,
         scaleRef, toggleRefVisible,
         toggleRefEditing,
         updateRefUI,
         refHitTest,
         startRefDrag }             from './ref.js';
import { toggleHelp, closeHelp,
         isHelpOpen }               from './help.js';


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
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  const cx     = (clientX - rect.left) * scaleX;
  const cy     = (clientY - rect.top)  * scaleY;
  const col    = Math.floor((cx - state.pan.x) / (CELL_PX * state.zoom));
  const row    = Math.floor((cy - state.pan.y) / (CELL_PX * state.zoom));
  return { col, row };
}


// ── Mouse drawing ──────────────────────────────────────────────────────────

function initDrawing() {
  let painting      = null;   // 'place' | 'erase' | null
  let refDragFn     = null;   // active ref drag move handler
  let floatDragging = false;
  let floatDragStart = { mx: 0, my: 0, col: 0, row: 0 };

  canvas.addEventListener('mousedown', e => {
    // ── Ref edit mode mouse ──────────────────────────────────────────────
    if (ref.editing && ref.img) {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const sx = (e.clientX - rect.left) * scaleX;
      const sy = (e.clientY - rect.top)  * scaleY;
      const hit = refHitTest(sx, sy);
      if (hit) {
        refDragFn = startRefDrag(sx, sy, draw);
        e.preventDefault();
        return;
      }
    }

    // ── Float mouse ───────────────────────────────────────────────────────
    if (state.floatSel) {
      if (e.button === 0) {
        // Start dragging the float
        floatDragging  = true;
        const { col, row } = canvasToCell(e.clientX, e.clientY);
        floatDragStart = { col, row,
                           fc: state.floatSel.col,
                           fr: state.floatSel.row };
        e.preventDefault();
      } else if (e.button === 2) {
        discardFloat();
        e.preventDefault();
      }
      return;
    }

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
    if (refDragFn) {
      const rect   = canvas.getBoundingClientRect();
      const scaleX = canvas.width  / rect.width;
      const scaleY = canvas.height / rect.height;
      const sx = (e.clientX - rect.left) * scaleX;
      const sy = (e.clientY - rect.top)  * scaleY;
      refDragFn(sx, sy);
      return;
    }
    if (floatDragging && state.floatSel) {
      const { col, row } = canvasToCell(e.clientX, e.clientY);
      state.floatSel.col = floatDragStart.fc + (col - floatDragStart.col);
      state.floatSel.row = floatDragStart.fr + (row - floatDragStart.row);
      draw();
      return;
    }
    if (!painting) return;
    const { col, row } = canvasToCell(e.clientX, e.clientY);
    if (col === state.cursor.col && row === state.cursor.row) return;
    state.cursor.col = col;
    state.cursor.row = row;
    if (painting === 'place') placeTile();
    else                      eraseTile();
  });

  window.addEventListener('mouseup', e => {
    if (refDragFn)     { refDragFn = null; return; }
    if (floatDragging) { floatDragging = false; return; }
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

    // ── Help overlay ───────────────────────────────────────────────────────
    if (e.key === '?') { toggleHelp(); return; }
    if (e.key === 'Escape' && isHelpOpen()) { closeHelp(); return; }

    const { cursor, palCursor } = state;

    // ── Ctrl shortcuts ─────────────────────────────────────────────────────
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

    // ── Escape ─────────────────────────────────────────────────────────────
    if (e.key === 'Escape') {
      if (ref.editing)     { toggleRefEditing(); draw(); return; }
      if (state.floatSel)  { discardFloat(); return; }
      if (state.selection) { clearSelection(); return; }
      if (state.mode === 'typing') { exitTyping(draw); updateModeButtons(); return; }
      return;
    }

    // ── Global B/P shortcuts (skip in typing mode) ─────────────────────────
    if (state.mode !== 'typing') {
      if (e.key === 'b' || e.key === 'B') { toggleRefVisible(); draw(); return; }
      if (e.key === 'p' || e.key === 'P') { toggleRefEditing(); draw(); return; }
    }

    // ── Ref edit mode ──────────────────────────────────────────────────────
    if (ref.editing) {
      switch (e.key) {
        case 'w': case 'W': e.preventDefault(); moveRef( 0, -1); draw(); return;
        case 's': case 'S': e.preventDefault(); moveRef( 0,  1); draw(); return;
        case 'a': case 'A': e.preventDefault(); moveRef(-1,  0); draw(); return;
        case 'd': case 'D': e.preventDefault(); moveRef( 1,  0); draw(); return;
        case 'ArrowUp':     e.preventDefault(); moveRef( 0, -1); draw(); return;
        case 'ArrowDown':   e.preventDefault(); moveRef( 0,  1); draw(); return;
        case 'ArrowLeft':   e.preventDefault(); moveRef(-1,  0); draw(); return;
        case 'ArrowRight':  e.preventDefault(); moveRef( 1,  0); draw(); return;
        case 'i': case 'I': changeOpacity( 0.05); draw(); return;
        case 'k': case 'K': changeOpacity(-0.05); draw(); return;
        case 'j': case 'J': scaleRef(-0.05); draw(); return;
        case 'l': case 'L': scaleRef( 0.05); draw(); return;
      }
      return;
    }

    // ── Float mode ─────────────────────────────────────────────────────────
    if (state.floatSel) {
      switch (e.key) {
        case 'a': case 'A': e.preventDefault(); moveFloat(-1,  0); return;
        case 'd': case 'D': e.preventDefault(); moveFloat( 1,  0); return;
        case 'w': case 'W': e.preventDefault(); moveFloat( 0, -1); return;
        case 's': case 'S': e.preventDefault(); moveFloat( 0,  1); return;
        case 'ArrowLeft':   e.preventDefault(); moveFloat(-1,  0); return;
        case 'ArrowRight':  e.preventDefault(); moveFloat( 1,  0); return;
        case 'ArrowUp':     e.preventDefault(); moveFloat( 0, -1); return;
        case 'ArrowDown':   e.preventDefault(); moveFloat( 0,  1); return;
        case 'e': case 'E': stampFloat(); return;
        case 'q': case 'Q': eraseUnderFloat(); return;
        case 'r': case 'R': transformFloat('R'); return;
        case 'h': case 'H': transformFloat('H'); return;
        case 'v': case 'V': transformFloat('V'); return;
        case 'i': case 'I': transformFloat('I'); return;
        case 'f': case 'F': transformFloat('I'); return;
        case 'm': case 'M': cycleWriteMode(draw); updateWriteButtons(); return;
      }
      // Don't swallow unhandled keys — fall through to allow other shortcuts
    }

    // ── Selecting mode (shift+arrows active) ───────────────────────────────
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      switch (e.key) {
        case 'ArrowLeft':  e.preventDefault(); extendSelection(-1,  0); return;
        case 'ArrowRight': e.preventDefault(); extendSelection( 1,  0); return;
        case 'ArrowUp':    e.preventDefault(); extendSelection( 0, -1); return;
        case 'ArrowDown':  e.preventDefault(); extendSelection( 0,  1); return;
      }
    }

    // ── Selection actions ──────────────────────────────────────────────────
    if (state.selection) {
      switch (e.key) {
        case 'q': case 'Q': deleteSelection(); return;
        case 'c': case 'C': if (!e.ctrlKey) { copySelection(); return; } break;
        case 'x': case 'X': if (!e.ctrlKey) { cutSelection();  return; } break;
      }
    }

    // ── Number keys 1-4: fg / bg colour ───────────────────────────────────
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

    // ── Typing mode ────────────────────────────────────────────────────────
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

    // ── Tile mode shortcuts ────────────────────────────────────────────────
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