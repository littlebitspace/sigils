// io.js
// ── File I/O ───────────────────────────────────────────────────────────────
// Currently: save/load native .lbe format.
// Future: export to PNG, ANSI, SVG, etc.; import from other formats.

import { PETSCII }                from './constants.js';
import { doc, state }             from './state.js';
import { grid, initGrid }         from './grid.js';
import { undoStack, redoStack }   from './history.js';
import { loadTileset, currentFont } from './font.js';
import { updateCanvasSizeInputs } from './ui.js';
import { refreshSwatchMarkers }   from './palette.js';
import { draw }                   from './draw.js';


// ── .lbe format ────────────────────────────────────────────────────────────

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

export function saveFile() {
  const data = buildSaveData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = (doc.title || 'untitled') + '.lbe';
  a.click();
  URL.revokeObjectURL(url);
}

export async function loadFile(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { alert('Invalid file.'); return; }

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

  if (doc.font !== currentFont) {
    await loadTileset(doc.font);
  } else {
    draw();
  }
}


// ── Button wiring ──────────────────────────────────────────────────────────

export function initIO() {
  document.getElementById('btn-save').addEventListener('click', saveFile);

  document.getElementById('btn-load').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadFile(file);
    e.target.value = '';
  });
}
