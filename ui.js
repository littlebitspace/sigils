// ui.js
// ── DOM helpers, panel resize, and UI button wiring ────────────────────────

import { grid, initGrid }       from './grid.js';
import { doc, state,
         enterTyping, exitTyping,
         cycleWriteMode,
         updateTitleBar,
         markDirty }            from './state.js';
import { resizeCanvas }         from './draw.js';
import { refreshPalette }       from './palette.js';
import { draw }                 from './draw.js';
import { snapshotForUndo }      from './history.js';
import { spaceIndex }           from './font.js';

const PANEL_MIN     = 250;
const PANEL_MAX     = 520;
const PANEL_STORAGE = 'lbe_panel_width';
const PADDING       = 12;


// ── Canvas size inputs ─────────────────────────────────────────────────────

export function updateCanvasSizeInputs() {
  document.getElementById('canvas-w').value = grid.cols;
  document.getElementById('canvas-h').value = grid.rows;
}


// ── Meta inputs ────────────────────────────────────────────────────────────

export function initMetaInputs() {
  document.getElementById('meta-title').addEventListener('input', e => {
    doc.title = e.target.value;
    updateTitleBar();
  });
  document.getElementById('meta-artist').addEventListener('input', e => doc.artist = e.target.value);
  document.getElementById('meta-group').addEventListener('input',  e => doc.group  = e.target.value);
}


// ── Palette cell size ──────────────────────────────────────────────────────

export function updatePaletteSize(panelWidth) {
  const cell = Math.max(8, Math.floor((panelWidth - PADDING * 2) / 16));
  document.documentElement.style.setProperty('--palette-cell', cell + 'px');
  const paletteGrid = document.getElementById('palette-grid');
  if (paletteGrid) {
    paletteGrid.style.gridTemplateColumns = `repeat(16, ${cell}px)`;
    paletteGrid.style.gridTemplateRows    = `repeat(16, ${cell}px)`;
    document.querySelectorAll('#palette-grid img').forEach(img => {
      img.style.width  = cell + 'px';
      img.style.height = cell + 'px';
    });
  }
}


// ── Mode button group ──────────────────────────────────────────────────────

export function updateModeButtons() {
  document.getElementById('btn-mode-tile').classList.toggle('active', state.mode === 'tile');
  document.getElementById('btn-mode-type').classList.toggle('active', state.mode === 'typing');
}

export function initModeButtons() {
  document.getElementById('btn-mode-tile').addEventListener('click', () => {
    if (state.mode !== 'tile') exitTyping(draw);
    updateModeButtons();
  });
  document.getElementById('btn-mode-type').addEventListener('click', () => {
    if (state.mode !== 'typing') enterTyping(draw);
    updateModeButtons();
  });
}


// ── Write mode button group ────────────────────────────────────────────────

export function updateWriteButtons() {
  document.getElementById('btn-write-both').classList.toggle('active',   state.writeMode === 'both');
  document.getElementById('btn-write-char').classList.toggle('active',   state.writeMode === 'char');
  document.getElementById('btn-write-colour').classList.toggle('active', state.writeMode === 'colour');
}

export function initWriteButtons() {
  const modes = ['both', 'char', 'colour'];
  modes.forEach(m => {
    document.getElementById(`btn-write-${m}`).addEventListener('click', () => {
      state.writeMode = m;
      updateWriteButtons();
      draw();
    });
  });
}


// ── Grid toggle button ─────────────────────────────────────────────────────

export function updateGridButton() {
  document.getElementById('btn-toggle-grid').classList.toggle('active', state.showGrid);
}

export function initGridButton() {
  document.getElementById('btn-toggle-grid').addEventListener('click', () => {
    state.showGrid = !state.showGrid;
    updateGridButton();
    draw();
  });
}


// ── Add row/col buttons ────────────────────────────────────────────────────

function insertRow(before) {
  const { cols, rows, tile, fg } = grid;
  const at      = state.cursor.row + (before ? 0 : 1);
  const newTile = new Uint8Array(cols * (rows + 1));
  const newFg   = new Uint8Array(cols * (rows + 1));
  const space   = spaceIndex();
  // copy rows before insertion point
  for (let r = 0; r < at; r++) {
    newTile.set(tile.subarray(r * cols, (r + 1) * cols), r * cols);
    newFg.set(fg.subarray(r * cols, (r + 1) * cols), r * cols);
  }
  // fill new row with space
  newTile.fill(space, at * cols, (at + 1) * cols);
  // copy rows after insertion point
  for (let r = at; r < rows; r++) {
    newTile.set(tile.subarray(r * cols, (r + 1) * cols), (r + 1) * cols);
    newFg.set(fg.subarray(r * cols, (r + 1) * cols), (r + 1) * cols);
  }
  grid.rows++;
  grid.tile = newTile;
  grid.fg   = newFg;
}

function insertCol(before) {
  const { cols, rows, tile, fg } = grid;
  const at      = state.cursor.col + (before ? 0 : 1);
  const space   = spaceIndex();
  const newTile = new Uint8Array((cols + 1) * rows);
  const newFg   = new Uint8Array((cols + 1) * rows);
  for (let r = 0; r < rows; r++) {
    let dst = 0;
    for (let c = 0; c <= cols; c++) {
      if (c === at) {
        newTile[r * (cols + 1) + dst] = space;  // new col = space
        dst++; continue;
      }
      const src = c < at ? c : c - 1;
      newTile[r * (cols + 1) + dst] = tile[r * cols + src];
      newFg[r   * (cols + 1) + dst] = fg[r   * cols + src];
      dst++;
    }
  }
  grid.cols++;
  grid.tile = newTile;
  grid.fg   = newFg;
}

export function initGridEditButtons() {
  document.getElementById('canvas-add-row-before').addEventListener('click', () => {
    snapshotForUndo(); insertRow(true);  updateCanvasSizeInputs(); markDirty(); draw();
  });
  document.getElementById('canvas-add-row-after').addEventListener('click', () => {
    snapshotForUndo(); insertRow(false); updateCanvasSizeInputs(); markDirty(); draw();
  });
  document.getElementById('canvas-add-col-before').addEventListener('click', () => {
    snapshotForUndo(); insertCol(true);  updateCanvasSizeInputs(); markDirty(); draw();
  });
  document.getElementById('canvas-add-col-after').addEventListener('click', () => {
    snapshotForUndo(); insertCol(false); updateCanvasSizeInputs(); markDirty(); draw();
  });
}


// ── Panel resize ───────────────────────────────────────────────────────────

export function initPanelResize() {
  const panel  = document.getElementById('panel');
  const handle = document.getElementById('panel-resize');
  const status = document.getElementById('status');

  const saved = parseInt(localStorage.getItem(PANEL_STORAGE));
  if (saved && saved >= PANEL_MIN && saved <= PANEL_MAX) {
    applyPanelWidth(saved);
  } else {
    applyPanelWidth(parseInt(getComputedStyle(panel).width) || 260);
  }

  let dragging = false;
  let startX   = 0;
  let startW   = 0;

  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX   = e.clientX;
    startW   = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(PANEL_MAX, Math.max(PANEL_MIN, startW + (e.clientX - startX)));
    applyPanelWidth(newW);
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
    localStorage.setItem(PANEL_STORAGE, panel.offsetWidth);
  });

  function applyPanelWidth(w) {
    panel.style.width = w + 'px';
    document.documentElement.style.setProperty('--panel-width', w + 'px');
    if (status) status.style.left = w + 'px';
    updatePaletteSize(w);
    resizeCanvas();
    refreshPalette();
  }
}