// main.js
// ── Boot ───────────────────────────────────────────────────────────────────

import { CELL_PX }                    from './constants.js';
import { state, doc,
         updateTitleBar, markDirty }  from './state.js';
import { grid, initGrid,
         resizeGrid, deleteRow,
         deleteCol }                  from './grid.js';
import { snapshotForUndo }            from './history.js';
import { draw, resizeCanvas }         from './draw.js';
import { initPaletteGrid,
         refreshPalette,
         buildSwatches }              from './palette.js';
import { initFontSelector,
         loadTileset, spaceIndex }    from './font.js';
import { initIO, buildSaveData,
         applyFileData, clearCanvas } from './io.js';
import { initInput }                  from './input.js';
import { initCompare }                from './compare.js';
import { updateCanvasSizeInputs,
         initMetaInputs,
         initPanelResize,
         initModeButtons,
         updateModeButtons,
         initWriteButtons,
         updateWriteButtons,
         initGridButton,
         updateGridButton,
         initGridEditButtons }        from './ui.js';
import { checkAutosave }              from './autosave.js';
import { initRef }                    from './ref.js';
import { draw as drawFn }             from './draw.js';
import { initHelp }                   from './help.js';


document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('Clear the canvas?')) return;
  clearCanvas();
});

// ── Canvas apply/delete wiring ─────────────────────────────────────────────

document.getElementById('canvas-apply').addEventListener('click', () => {
  const w = Math.max(1, Math.min(256, parseInt(document.getElementById('canvas-w').value) || grid.cols));
  const h = Math.max(1, Math.min(256, parseInt(document.getElementById('canvas-h').value) || grid.rows));
  if (w === grid.cols && h === grid.rows) return;
  snapshotForUndo();
  resizeGrid(w, h, spaceIndex());
  updateCanvasSizeInputs();
  markDirty();
  draw();
  document.getElementById('export-tile-size').dispatchEvent(new Event('input'));
});

document.getElementById('canvas-del-row').addEventListener('click', () => {
  if (grid.rows <= 1) return;
  snapshotForUndo();
  deleteRow(state.cursor.row);
  updateCanvasSizeInputs();
  markDirty();
  draw();
  document.getElementById('export-tile-size').dispatchEvent(new Event('input'));
});

document.getElementById('canvas-del-col').addEventListener('click', () => {
  if (grid.cols <= 1) return;
  snapshotForUndo();
  deleteCol(state.cursor.col);
  updateCanvasSizeInputs();
  markDirty();
  draw();
  document.getElementById('export-tile-size').dispatchEvent(new Event('input'));
});


// ── Grid centering ─────────────────────────────────────────────────────────

function centreGrid() {
  const canvas = document.getElementById('canvas');
  const cell   = CELL_PX * state.zoom;
  state.pan.x  = Math.round((canvas.width  - grid.cols * cell) / 2);
  state.pan.y  = Math.round((canvas.height - grid.rows * cell) / 2);
}


// ── Boot sequence ──────────────────────────────────────────────────────────

initGrid(grid.cols, grid.rows);
initPaletteGrid();
buildSwatches();
updateCanvasSizeInputs();
initMetaInputs();
initModeButtons();
initWriteButtons();
initGridButton();
initGridEditButtons();
resizeCanvas();
centreGrid();
draw();
initIO();
initCompare();
initRef(drawFn);
initHelp();
initInput();
initPanelResize();
updateTitleBar();

initFontSelector().then(async () => {
  await loadTileset(doc.font);
  grid.tile.fill(spaceIndex());  // fill with correct space tile now that font is known
  draw();
  await checkAutosave(applyFileData);
});