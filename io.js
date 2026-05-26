// io.js
// ── File I/O ───────────────────────────────────────────────────────────────
// new, save, save as, load — using File System Access API where available.
// export PNG — fresh SVG rasterisation at target tile size.

import { PETSCII, TOTAL_TILES }       from './constants.js';
import { doc, state,
         markDirty, markClean,
         updateTitleBar }             from './state.js';
import { grid, initGrid }             from './grid.js';
import { undoStack, redoStack }       from './history.js';
import { loadTileset, currentFont,
         tileSvgSource }              from './font.js';
import { updateCanvasSizeInputs }     from './ui.js';
import { refreshSwatchMarkers,
         initPaletteGrid,
         refreshPalette }             from './palette.js';
import { draw }                       from './draw.js';
import { scheduleAutosave,
         clearAutosave }              from './autosave.js';

// File System Access API handle — reused by Save
let currentFileHandle = null;

const FILE_OPTS = {
  types: [{
    description: 'LBE file',
    accept: { 'application/json': ['.lbe'] },
  }],
};


// ── Build save data ────────────────────────────────────────────────────────

export function buildSaveData() {
  const cells = [];
  for (let i = 0; i < grid.cols * grid.rows; i++) {
    cells.push([grid.tile[i], grid.fg[i]]);
  }
  return {
    version:    doc.version,
    title:      doc.title,
    artist:     doc.artist,
    group:      doc.group,
    font:       doc.font,
    colours:    PETSCII.map(c => c.hex),
    background: state.bgIndex,
    size:       [grid.cols, grid.rows],
    delay:      doc.delay,
    frames:     [cells],
  };
}


// ── New ────────────────────────────────────────────────────────────────────

export async function newFile() {
  if (doc.dirty) {
    const ok = confirm('You have unsaved changes. Start a new file anyway?');
    if (!ok) return;
  }

  // Reset grid
  initGrid(64, 32);

  // Reset doc — keep artist and group
  doc.title   = 'Untitled';
  doc.font    = currentFont;
  doc.delay   = 500;
  doc.version = 1;

  // Reset colours
  state.bgIndex = 0;
  state.fgIndex = 1;

  // Reset cursor and selection
  state.cursor    = { col: 0, row: 0 };
  state.selection = null;

  // Clear undo/redo
  undoStack.length = 0;
  redoStack.length = 0;

  // Clear file handle so Save acts as Save As
  currentFileHandle = null;

  // Update UI
  document.getElementById('meta-title').value = doc.title;
  updateCanvasSizeInputs();
  refreshSwatchMarkers();
  initPaletteGrid();
  refreshPalette();
  draw();

  clearAutosave();
  markClean();
}


// ── Save ───────────────────────────────────────────────────────────────────

export async function saveFile() {
  if (currentFileHandle) {
    await _writeToHandle(currentFileHandle);
  } else {
    await saveFileAs();
  }
}

export async function saveFileAs() {
  if (!window.showSaveFilePicker) {
    // Fallback: download
    _downloadJson(buildSaveData(), (doc.title || 'untitled') + '.lbe');
    markClean();
    clearAutosave();
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      ...FILE_OPTS,
      suggestedName: (doc.title || 'untitled') + '.lbe',
    });
    currentFileHandle = handle;
    await _writeToHandle(handle);
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Save failed:', e);
  }
}

async function _writeToHandle(handle) {
  try {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(buildSaveData(), null, 2));
    await writable.close();
    markClean();
    clearAutosave();
  } catch (e) {
    console.error('Write failed:', e);
  }
}

function _downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


// ── Load ───────────────────────────────────────────────────────────────────

export async function loadFile(fileOrHandle) {
  let file;
  if (fileOrHandle instanceof File) {
    file = fileOrHandle;
    currentFileHandle = null;
  } else {
    // FileSystemFileHandle
    currentFileHandle = fileOrHandle;
    file = await fileOrHandle.getFile();
  }

  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { alert('Invalid file.'); return; }
  await applyFileData(data);
  markClean();
  clearAutosave();
}

export async function openFilePicker() {
  if (!window.showOpenFilePicker) {
    document.getElementById('file-input').click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker(FILE_OPTS);
    await loadFile(handle);
  } catch (e) {
    if (e.name !== 'AbortError') console.error('Open failed:', e);
  }
}

export async function applyFileData(data) {
  const [w, h] = data.size;
  initGrid(w, h);
  const cells = data.frames[0];
  for (let i = 0; i < cells.length && i < w * h; i++) {
    grid.tile[i] = cells[i][0];
    grid.fg[i]   = cells[i][1];
  }

  doc.title   = data.title   ?? 'Untitled';
  doc.artist  = data.artist  ?? '';
  doc.group   = data.group   ?? '';
  doc.font    = data.font    ?? 'petscii';
  doc.delay   = data.delay   ?? 500;

  state.bgIndex = data.background ?? 0;

  const fontSel = document.getElementById('font-select');
  if (fontSel) fontSel.value = doc.font;

  document.getElementById('meta-title').value  = doc.title;
  document.getElementById('meta-artist').value = doc.artist;
  document.getElementById('meta-group').value  = doc.group;

  updateCanvasSizeInputs();
  refreshSwatchMarkers();

  undoStack.length = 0;
  redoStack.length = 0;

  updateTitleBar();

  if (doc.font !== currentFont) {
    await loadTileset(doc.font);
  } else {
    initPaletteGrid();
    refreshPalette();
    draw();
  }
}


// ── Export PNG ─────────────────────────────────────────────────────────────
// Rasterises fresh SVGs at the target tile size onto an offscreen canvas.

export async function exportPng(tileSize) {
  const { cols, rows, tile, fg } = grid;
  const W = cols * tileSize;
  const H = rows * tileSize;

  const offscreen = document.createElement('canvas');
  offscreen.width  = W;
  offscreen.height = H;
  const octx = offscreen.getContext('2d');

  // Fill background
  octx.fillStyle = PETSCII[state.bgIndex].hex;
  octx.fillRect(0, 0, W, H);

  // Render each tile at full resolution
  const promises = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i       = r * cols + c;
      const tileIdx = tile[i];
      const fgIdx   = fg[i];
      const src     = tileSvgSource[tileIdx];
      if (!src) continue;

      const coloured = src
        .replace(/FGCOLOR/g, PETSCII[fgIdx].hex)
        .replace(/<svg([^>]*)>/, `<svg$1><rect width="100%" height="100%" fill="${PETSCII[state.bgIndex].hex}"/>`);

      const blob    = new Blob([coloured], { type: 'image/svg+xml' });
      const url     = URL.createObjectURL(blob);
      const x       = c * tileSize;
      const y       = r * tileSize;

      promises.push(new Promise(resolve => {
        const img = new Image(tileSize, tileSize);
        img.onload = () => {
          octx.drawImage(img, x, y, tileSize, tileSize);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        img.src = url;
      }));
    }
  }

  await Promise.all(promises);

  // Export
  offscreen.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = (doc.title || 'untitled') + `_${tileSize}px.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}


// ── Button wiring ──────────────────────────────────────────────────────────

export function initIO() {
  document.getElementById('btn-new').addEventListener('click', newFile);
  document.getElementById('btn-save').addEventListener('click', saveFile);
  document.getElementById('btn-save-as').addEventListener('click', saveFileAs);
  document.getElementById('btn-load').addEventListener('click', openFilePicker);

  // Fallback file input for browsers without File System Access API
  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    e.target.value = '';
  });

  // Export PNG
  document.getElementById('btn-export-png').addEventListener('click', () => {
    const tileSize = Math.max(1, Math.min(256,
      parseInt(document.getElementById('export-tile-size').value) || 16
    ));
    exportPng(tileSize);
  });

  // Image size preview
  const tileSizeInput = document.getElementById('export-tile-size');
  function updateExportSize() {
    const ts = parseInt(tileSizeInput.value) || 16;
    const w  = grid.cols * ts;
    const h  = grid.rows * ts;
    document.getElementById('export-size-label').textContent = `${w} × ${h} px`;
  }
  tileSizeInput.addEventListener('input', updateExportSize);
  updateExportSize();
}
