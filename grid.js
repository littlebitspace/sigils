// grid.js
// ── Grid data ──────────────────────────────────────────────────────────────
// Owns the raw grid arrays and all structural mutations.
// Primitives cols/rows live on the `grid` object so that ES module importers
// always see the current value after mutations.

import { state } from './state.js';

export const grid = {
  cols: 64,
  rows: 32,
  tile: null,   // Uint8Array — tile index per cell
  fg:   null,   // Uint8Array — fg palette index per cell
};

export function initGrid(cols, rows) {
  grid.cols = cols;
  grid.rows = rows;
  grid.tile = new Uint8Array(cols * rows);
  grid.fg   = new Uint8Array(cols * rows);
}

export function resizeGrid(newCols, newRows, spaceIdx = 0) {
  const { tile: oldTile, fg: oldFg, cols: oldCols, rows: oldRows } = grid;
  const newTile = new Uint8Array(newCols * newRows);
  const newFg   = new Uint8Array(newCols * newRows);
  // Fill new tile array with space first, then copy existing content over
  newTile.fill(spaceIdx);
  const copyC   = Math.min(oldCols, newCols);
  const copyR   = Math.min(oldRows, newRows);
  for (let r = 0; r < copyR; r++) {
    for (let c = 0; c < copyC; c++) {
      newTile[r * newCols + c] = oldTile[r * oldCols + c];
      newFg[r   * newCols + c] = oldFg[r   * oldCols + c];
    }
  }
  grid.cols = newCols;
  grid.rows = newRows;
  grid.tile = newTile;
  grid.fg   = newFg;
  state.cursor.col = Math.min(state.cursor.col, grid.cols - 1);
  state.cursor.row = Math.min(state.cursor.row, grid.rows - 1);
}

export function deleteRow(r) {
  const { cols, rows, tile, fg } = grid;
  const newTile = new Uint8Array(cols * (rows - 1));
  const newFg   = new Uint8Array(cols * (rows - 1));
  let dst = 0;
  for (let row = 0; row < rows; row++) {
    if (row === r) continue;
    for (let c = 0; c < cols; c++) {
      newTile[dst * cols + c] = tile[row * cols + c];
      newFg[dst   * cols + c] = fg[row   * cols + c];
    }
    dst++;
  }
  grid.rows--;
  grid.tile = newTile;
  grid.fg   = newFg;
  state.cursor.row = Math.min(state.cursor.row, grid.rows - 1);
}

export function deleteCol(c) {
  const { cols, rows, tile, fg } = grid;
  const newTile = new Uint8Array((cols - 1) * rows);
  const newFg   = new Uint8Array((cols - 1) * rows);
  for (let r = 0; r < rows; r++) {
    let dst = 0;
    for (let col = 0; col < cols; col++) {
      if (col === c) continue;
      newTile[r * (cols - 1) + dst] = tile[r * cols + col];
      newFg[r   * (cols - 1) + dst] = fg[r   * cols + col];
      dst++;
    }
  }
  grid.cols--;
  grid.tile = newTile;
  grid.fg   = newFg;
  state.cursor.col = Math.min(state.cursor.col, grid.cols - 1);
}