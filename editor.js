// editor.js
// ── Editor actions ─────────────────────────────────────────────────────────
// Sits between input events and raw grid data.
// Every action that mutates the grid lives here.

import { PALETTE_COLS }    from './constants.js';
import { state }           from './state.js';
import { grid }            from './grid.js';
import { snapshotForUndo } from './history.js';
import { spaceIndex }      from './font.js';
import { draw }            from './draw.js';


// ── Coordinate helpers ─────────────────────────────────────────────────────

export function cellIndex(col, row) {
  return row * grid.cols + col;
}

export function inBounds(col, row) {
  return col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;
}

export function selectedTileIndex() {
  return state.palCursor.row * PALETTE_COLS + state.palCursor.col;
}


// ── Place & erase ──────────────────────────────────────────────────────────
// Both operate on state.cursor, respecting writeMode.
// An explicit tileIdx can be passed (e.g. from charmap lookup in typing mode).

export function placeTile(tileIdx) {
  const { col, row } = state.cursor;
  if (!inBounds(col, row)) return;
  const i = cellIndex(col, row);
  snapshotForUndo();
  if (state.writeMode === 'both' || state.writeMode === 'char') {
    grid.tile[i] = tileIdx ?? selectedTileIndex();
  }
  if (state.writeMode === 'both' || state.writeMode === 'colour') {
    grid.fg[i] = state.fgIndex;
  }
  draw();
}

export function eraseTile() {
  const { col, row } = state.cursor;
  if (!inBounds(col, row)) return;
  const i = cellIndex(col, row);
  snapshotForUndo();
  grid.tile[i] = spaceIndex();
  grid.fg[i]   = 0;
  draw();
}


// ── Typing mode backspace ──────────────────────────────────────────────────

export function backspaceTile() {
  const { cursor } = state;
  if (cursor.col > 0) {
    cursor.col--;
  } else if (cursor.row > 0) {
    cursor.row--;
    cursor.col = grid.cols - 1;
  }
  const i = cellIndex(cursor.col, cursor.row);
  snapshotForUndo();
  grid.tile[i] = spaceIndex();
  grid.fg[i]   = 0;
  draw();
}


// ── Selection ──────────────────────────────────────────────────────────────

export function extendSelection(dc, dr) {
  if (!state.selection) {
    state.selection = {
      anchorCol: state.cursor.col,
      anchorRow: state.cursor.row,
      cursorCol: state.cursor.col,
      cursorRow: state.cursor.row,
    };
  }
  state.selection.cursorCol = Math.max(0, Math.min(grid.cols - 1, state.selection.cursorCol + dc));
  state.selection.cursorRow = Math.max(0, Math.min(grid.rows - 1, state.selection.cursorRow + dr));
  state.cursor.col = state.selection.cursorCol;
  state.cursor.row = state.selection.cursorRow;
  draw();
}

export function clearSelection() {
  state.selection = null;
  draw();
}
