// main.js
// ── Boot ───────────────────────────────────────────────────────────────────

import { CELL_PX }                from './constants.js';
import { state, doc }             from './state.js';
import { grid, initGrid,
         resizeGrid, deleteRow,
         deleteCol }              from './grid.js';
import { snapshotForUndo }        from './history.js';
import { draw, drawPalette,
         resizeCanvas }           from './draw.js';
import { initPaletteCanvas,
         buildSwatches }          from './palette.js';
import { initFontSelector,
         loadTileset }            from './font.js';
import { initIO }                 from './io.js';
import { initInput }              from './input.js';
import { initCompare }            from './compare.js';
import { updateCanvasSizeInputs,
         initMetaInputs }         from './ui.js';


// ── Canvas size controls ───────────────────────────────────────────────────

document.getElementById('canvas-apply').addEventListener('click', () => {
  const w = Math.max(1, Math.min(256, parseInt(document.getElementById('canvas-w').value) || grid.cols));
  const h = Math.max(1, Math.min(256, parseInt(document.getElementById('canvas-h').value) || grid.rows));
  if (w === grid.cols && h === grid.rows) return;
  snapshotForUndo();
  resizeGrid(w, h);
  updateCanvasSizeInputs();
  draw();
});

document.getElementById('canvas-del-row').addEventListener('click', () => {
  if (grid.rows <= 1) return;
  snapshotForUndo();
  deleteRow(state.cursor.row);
  updateCanvasSizeInputs();
  draw();
});

document.getElementById('canvas-del-col').addEventListener('click', () => {
  if (grid.cols <= 1) return;
  snapshotForUndo();
  deleteCol(state.cursor.col);
  updateCanvasSizeInputs();
  draw();
});


// ── Grid centering ─────────────────────────────────────────────────────────

function centreGrid() {
  const cell  = CELL_PX * state.zoom;
  state.pan.x = Math.round((canvas.width  - grid.cols * cell) / 2);
  state.pan.y = Math.round((canvas.height - grid.rows * cell) / 2);
}


// ── Boot sequence ──────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');

initGrid(grid.cols, grid.rows);
initPaletteCanvas();
buildSwatches();
updateCanvasSizeInputs();
initMetaInputs();
resizeCanvas();
centreGrid();
draw();
drawPalette();
initIO();
initCompare();
initInput();
initFontSelector().then(() => loadTileset(doc.font));
