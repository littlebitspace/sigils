// history.js
// ── Undo / redo ────────────────────────────────────────────────────────────

import { MAX_UNDO }               from './constants.js';
import { state }                  from './state.js';
import { grid }                   from './grid.js';
import { draw }                   from './draw.js';
import { refreshSwatchMarkers }   from './palette.js';
import { updateCanvasSizeInputs } from './ui.js';

export const undoStack = [];
export const redoStack = [];

export function snapshotForUndo() {
  undoStack.push({
    tile: grid.tile.slice(),
    fg:   grid.fg.slice(),
    cols: grid.cols,
    rows: grid.rows,
    bg:   state.bgIndex,
  });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function applySnapshot(snap) {
  grid.cols        = snap.cols;
  grid.rows        = snap.rows;
  grid.tile        = snap.tile.slice();
  grid.fg          = snap.fg.slice();
  state.bgIndex    = snap.bg;
  state.cursor.col = Math.min(state.cursor.col, grid.cols - 1);
  state.cursor.row = Math.min(state.cursor.row, grid.rows - 1);
  updateCanvasSizeInputs();
  refreshSwatchMarkers();
  draw();
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push({
    tile: grid.tile.slice(), fg: grid.fg.slice(),
    cols: grid.cols, rows: grid.rows, bg: state.bgIndex,
  });
  applySnapshot(undoStack.pop());
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push({
    tile: grid.tile.slice(), fg: grid.fg.slice(),
    cols: grid.cols, rows: grid.rows, bg: state.bgIndex,
  });
  applySnapshot(redoStack.pop());
}