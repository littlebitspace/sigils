// editor.js
// ── Editor actions ─────────────────────────────────────────────────────────

import { PALETTE_COLS }            from './constants.js';
import { state, markDirty,
         selectionRect }           from './state.js';
import { grid }                    from './grid.js';
import { snapshotForUndo }         from './history.js';
import { spaceIndex }              from './font.js';
import { draw }                    from './draw.js';
import { scheduleAutosave }        from './autosave.js';
import { buildSaveData }           from './io.js';
import { findTransformedTile }     from './compare.js';

function mutated() {
  markDirty();
  scheduleAutosave(buildSaveData);
}


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
  mutated();
  draw();
}

export function eraseTile() {
  const { col, row } = state.cursor;
  if (!inBounds(col, row)) return;
  const i = cellIndex(col, row);
  snapshotForUndo();
  grid.tile[i] = spaceIndex();
  grid.fg[i]   = 0;
  mutated();
  draw();
}

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
  mutated();
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

// Erase all cells in current selection
export function deleteSelection() {
  const sel = selectionRect();
  if (!sel) return;
  snapshotForUndo();
  const space = spaceIndex();
  for (let r = sel.r0; r <= sel.r1; r++) {
    for (let c = sel.c0; c <= sel.c1; c++) {
      const i = cellIndex(c, r);
      grid.tile[i] = space;
      grid.fg[i]   = 0;
    }
  }
  state.selection = null;
  mutated();
  draw();
}


// ── Float selection ────────────────────────────────────────────────────────

// Copy selection into float (keep originals)
export function copySelection() {
  const sel = selectionRect();
  if (!sel) return;
  const cols  = sel.c1 - sel.c0 + 1;
  const rows  = sel.r1 - sel.r0 + 1;
  const tiles = new Uint8Array(cols * rows);
  const fg    = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const src = cellIndex(sel.c0 + c, sel.r0 + r);
      tiles[r * cols + c] = grid.tile[src];
      fg[r    * cols + c] = grid.fg[src];
    }
  }
  state.floatSel = {
    tiles, fg, cols, rows,
    col: sel.c0,
    row: sel.r0,
  };
  state.selection = null;
  draw();
}

// Cut: copy then erase
export function cutSelection() {
  const sel = selectionRect();
  if (!sel) return;
  copySelection();
  // erase the source cells
  snapshotForUndo();
  const space = spaceIndex();
  for (let r = sel.r0; r <= sel.r1; r++) {
    for (let c = sel.c0; c <= sel.c1; c++) {
      const i = cellIndex(c, r);
      grid.tile[i] = space;
      grid.fg[i]   = 0;
    }
  }
  mutated();
  draw();
}

// Move floating selection
export function moveFloat(dc, dr) {
  if (!state.floatSel) return;
  state.floatSel.col += dc;
  state.floatSel.row += dr;
  draw();
}

// Stamp float onto grid, respecting writeMode, clipping to canvas bounds
export function stampFloat() {
  if (!state.floatSel) return;
  const { tiles, fg, cols, rows, col: fc, row: fr } = state.floatSel;
  snapshotForUndo();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gc = fc + c;
      const gr = fr + r;
      if (!inBounds(gc, gr)) continue;
      const dst = cellIndex(gc, gr);
      const src = r * cols + c;
      if (state.writeMode === 'both' || state.writeMode === 'char') {
        grid.tile[dst] = tiles[src];
      }
      if (state.writeMode === 'both' || state.writeMode === 'colour') {
        grid.fg[dst] = fg[src];
      }
    }
  }
  state.floatSel = null;
  mutated();
  draw();
}

// Discard float without stamping
export function discardFloat() {
  state.floatSel = null;
  draw();
}

// Transform the floating selection — rearranges cells AND transforms each tile
export function transformFloat(name) {
  if (!state.floatSel) return;
  const { tiles, fg, cols, rows } = state.floatSel;

  let newCols, newRows, newTiles, newFg;

  if (name === 'R') {
    // 90° CCW: (c, r) → (r, cols-1-c), new dims: rows×cols
    newCols  = rows;
    newRows  = cols;
    newTiles = new Uint8Array(newCols * newRows);
    newFg    = new Uint8Array(newCols * newRows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const src  = r * cols + c;
        const dstC = r;
        const dstR = cols - 1 - c;
        const dst  = dstR * newCols + dstC;
        newTiles[dst] = findTransformedTile(tiles[src], 'R');
        newFg[dst]    = fg[src];
      }
    }
  } else if (name === 'H') {
    // Flip horizontal: (c, r) → (cols-1-c, r)
    newCols  = cols;
    newRows  = rows;
    newTiles = new Uint8Array(cols * rows);
    newFg    = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const src = r * cols + c;
        const dst = r * cols + (cols - 1 - c);
        newTiles[dst] = findTransformedTile(tiles[src], 'H');
        newFg[dst]    = fg[src];
      }
    }
  } else if (name === 'V') {
    // Flip vertical: (c, r) → (c, rows-1-r)
    newCols  = cols;
    newRows  = rows;
    newTiles = new Uint8Array(cols * rows);
    newFg    = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const src = r * cols + c;
        const dst = (rows - 1 - r) * cols + c;
        newTiles[dst] = findTransformedTile(tiles[src], 'V');
        newFg[dst]    = fg[src];
      }
    }
  } else if (name === 'I') {
    // Invert: no rearrangement, just transform each tile
    newCols  = cols;
    newRows  = rows;
    newTiles = new Uint8Array(cols * rows);
    newFg    = new Uint8Array(cols * rows);
    for (let i = 0; i < tiles.length; i++) {
      newTiles[i] = findTransformedTile(tiles[i], 'I');
      newFg[i]    = fg[i];
    }
  } else {
    return;
  }

  state.floatSel.tiles = newTiles;
  state.floatSel.fg    = newFg;
  state.floatSel.cols  = newCols;
  state.floatSel.rows  = newRows;
  draw();
}