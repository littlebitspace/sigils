// ── Constants ──────────────────────────────────────────────────────────────

const CELL_PX       = 16;
const ZOOM_STEPS    = [0.5, 1, 2, 3, 4];
const ZOOM_DEFAULT  = 1;
const PALETTE_COLS  = 16;
const PALETTE_ROWS  = 16;
const PALETTE_CELL  = 11;
const FONT_SIZE     = 16;
const TOTAL_TILES   = 256;
const MAX_UNDO      = 100;

// ── Font metadata ──────────────────────────────────────────────────────────
// Loaded from fonts/<name>/font.json alongside the SVGs.
// charmap: { "character": tileIndex, ... }
// spaceIndex: tile index for " " — used as the erase/empty tile.

let fontMeta = { name: 'test', charmap: { ' ': 0 } };

function spaceIndex() {
  return fontMeta.charmap[' '] ?? 0;
}

const GRID_COLOR       = '#2a2a2a';
const CURSOR_COLOR     = '#ffffff';
const PAL_CURSOR_COLOR = '#ffffff';
const EMPTY_COLOR      = '#2a2a2a';


// ── PETSCII palette ────────────────────────────────────────────────────────
// 4 rows × 4 columns. Keys 1-4 cycle rows within column.
//  col:  0       1      2      3
// row 0: black   white  red    cyan
// row 1: purple  green  blue   yellow
// row 2: orange  brown  lred   dgray
// row 3: mgray   lgreen lblue  lgray

const PETSCII = [
  { hex: '#000000', name: 'black'    },
  { hex: '#ffffff', name: 'white'    },
  { hex: '#883232', name: 'red'      },
  { hex: '#67b6bd', name: 'cyan'     },
  { hex: '#8b3f96', name: 'purple'   },
  { hex: '#55a049', name: 'green'    },
  { hex: '#40318d', name: 'blue'     },
  { hex: '#bfce72', name: 'yellow'   },
  { hex: '#8b5429', name: 'orange'   },
  { hex: '#574200', name: 'brown'    },
  { hex: '#b86962', name: 'lt.red'   },
  { hex: '#505050', name: 'dk.gray'  },
  { hex: '#787878', name: 'md.gray'  },
  { hex: '#94e089', name: 'lt.green' },
  { hex: '#7869c4', name: 'lt.blue'  },
  { hex: '#9f9f9f', name: 'lt.gray'  },
];

function paletteIndex(col, row) { return row * 4 + col; }


// ── Document metadata ──────────────────────────────────────────────────────

const doc = {
  version:  1,
  title:    'Untitled',
  artist:   '',
  group:    '',
  font:     'test',
  colours:  PETSCII.map(c => c.hex),
  delay:    500,
};


// ── Grid state ─────────────────────────────────────────────────────────────

let GRID_COLS = 64;
let GRID_ROWS = 32;

let gridTile = null;   // Uint8Array — tile index per cell
let gridFg   = null;   // Uint8Array — fg palette index per cell

function initGrid(cols, rows) {
  GRID_COLS = cols;
  GRID_ROWS = rows;
  gridTile  = new Uint8Array(cols * rows);
  gridFg    = new Uint8Array(cols * rows);
}

function resizeGrid(newCols, newRows) {
  const oldTile = gridTile;
  const oldFg   = gridFg;
  const oldCols = GRID_COLS;
  const oldRows = GRID_ROWS;
  const newTile = new Uint8Array(newCols * newRows);
  const newFg   = new Uint8Array(newCols * newRows);
  const copyC   = Math.min(oldCols, newCols);
  const copyR   = Math.min(oldRows, newRows);
  for (let r = 0; r < copyR; r++) {
    for (let c = 0; c < copyC; c++) {
      newTile[r * newCols + c] = oldTile[r * oldCols + c];
      newFg[r   * newCols + c] = oldFg[r   * oldCols + c];
    }
  }
  GRID_COLS = newCols;
  GRID_ROWS = newRows;
  gridTile  = newTile;
  gridFg    = newFg;
  state.cursor.col = Math.min(state.cursor.col, GRID_COLS - 1);
  state.cursor.row = Math.min(state.cursor.row, GRID_ROWS - 1);
}

function deleteRow(r) {
  const newTile = new Uint8Array(GRID_COLS * (GRID_ROWS - 1));
  const newFg   = new Uint8Array(GRID_COLS * (GRID_ROWS - 1));
  let dst = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    if (row === r) continue;
    for (let c = 0; c < GRID_COLS; c++) {
      newTile[dst * GRID_COLS + c] = gridTile[row * GRID_COLS + c];
      newFg[dst   * GRID_COLS + c] = gridFg[row   * GRID_COLS + c];
    }
    dst++;
  }
  GRID_ROWS--;
  gridTile = newTile;
  gridFg   = newFg;
  state.cursor.row = Math.min(state.cursor.row, GRID_ROWS - 1);
}

function deleteCol(c) {
  const newTile = new Uint8Array((GRID_COLS - 1) * GRID_ROWS);
  const newFg   = new Uint8Array((GRID_COLS - 1) * GRID_ROWS);
  for (let r = 0; r < GRID_ROWS; r++) {
    let dst = 0;
    for (let col = 0; col < GRID_COLS; col++) {
      if (col === c) continue;
      newTile[r * (GRID_COLS - 1) + dst] = gridTile[r * GRID_COLS + col];
      newFg[r   * (GRID_COLS - 1) + dst] = gridFg[r   * GRID_COLS + col];
      dst++;
    }
  }
  GRID_COLS--;
  gridTile = newTile;
  gridFg   = newFg;
  state.cursor.col = Math.min(state.cursor.col, GRID_COLS - 1);
}


// ── Undo / redo ────────────────────────────────────────────────────────────

const undoStack = [];
const redoStack = [];

function snapshotForUndo() {
  undoStack.push({
    tile: gridTile.slice(),
    fg:   gridFg.slice(),
    cols: GRID_COLS,
    rows: GRID_ROWS,
    bg:   state.bgIndex,
  });
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push({ tile: gridTile.slice(), fg: gridFg.slice(), cols: GRID_COLS, rows: GRID_ROWS, bg: state.bgIndex });
  applySnapshot(undoStack.pop());
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push({ tile: gridTile.slice(), fg: gridFg.slice(), cols: GRID_COLS, rows: GRID_ROWS, bg: state.bgIndex });
  applySnapshot(redoStack.pop());
}

function applySnapshot(snap) {
  GRID_COLS    = snap.cols;
  GRID_ROWS    = snap.rows;
  gridTile     = snap.tile.slice();
  gridFg       = snap.fg.slice();
  state.bgIndex = snap.bg;
  state.cursor.col = Math.min(state.cursor.col, GRID_COLS - 1);
  state.cursor.row = Math.min(state.cursor.row, GRID_ROWS - 1);
  updateCanvasSizeInputs();
  refreshSwatchMarkers();
  draw();
}


// ── App state ──────────────────────────────────────────────────────────────

const WRITE_MODES = ['both', 'char', 'colour'];

const state = {
  zoom:      ZOOM_STEPS[ZOOM_DEFAULT],
  zoomIdx:   ZOOM_DEFAULT,
  pan:       { x: 0, y: 0 },
  cursor:    { col: 0, row: 0 },
  palCursor: { col: 0, row: 0 },
  fgIndex:   1,
  bgIndex:   0,
  showGrid:  true,
  showPanel: true,
  fgColRow:  new Uint8Array(4),
  bgColRow:  new Uint8Array(4),

  // Interaction mode: 'tile' | 'typing'
  mode:      'tile',

  // Write mode: 'both' | 'char' | 'colour'
  writeMode: 'both',

  // Typing mode state
  typing: {
    startCol: 0,   // column where typing session began
  },

  // Selection overlay (null = no active selection)
  // anchor: where selection started, cursor: current extent
  selection: null,  // { anchorCol, anchorRow, cursorCol, cursorRow }
};


// ── Cursor blink ───────────────────────────────────────────────────────────

let cursorVisible  = true;
let blinkInterval  = null;

function startBlink() {
  cursorVisible = true;
  if (blinkInterval) return;
  blinkInterval = setInterval(() => {
    cursorVisible = !cursorVisible;
    draw();
  }, 500);
}

function stopBlink() {
  clearInterval(blinkInterval);
  blinkInterval  = null;
  cursorVisible  = true;
}


// ── Mode helpers ───────────────────────────────────────────────────────────

function enterTyping() {
  state.mode = 'typing';
  state.typing.startCol = state.cursor.col;
  startBlink();
  draw();
}

function exitTyping() {
  state.mode = 'tile';
  stopBlink();
  draw();
}

function cycleWriteMode() {
  const idx = WRITE_MODES.indexOf(state.writeMode);
  state.writeMode = WRITE_MODES[(idx + 1) % WRITE_MODES.length];
  draw();
}


// ── Selection helpers ──────────────────────────────────────────────────────

function selectionRect() {
  if (!state.selection) return null;
  const { anchorCol, anchorRow, cursorCol, cursorRow } = state.selection;
  return {
    c0: Math.min(anchorCol, cursorCol),
    r0: Math.min(anchorRow, cursorRow),
    c1: Math.max(anchorCol, cursorCol),
    r1: Math.max(anchorRow, cursorRow),
  };
}

function extendSelection(dc, dr) {
  if (!state.selection) {
    // Anchor at current cursor position before the move
    state.selection = {
      anchorCol: state.cursor.col,
      anchorRow: state.cursor.row,
      cursorCol: state.cursor.col,
      cursorRow: state.cursor.row,
    };
  }
  state.selection.cursorCol = Math.max(0, Math.min(GRID_COLS - 1, state.selection.cursorCol + dc));
  state.selection.cursorRow = Math.max(0, Math.min(GRID_ROWS - 1, state.selection.cursorRow + dr));
  // Move the canvas cursor to track the selection edge
  state.cursor.col = state.selection.cursorCol;
  state.cursor.row = state.selection.cursorRow;
  draw();
}

function clearSelection() {
  state.selection = null;
  draw();
}

const tileSvgSource = new Array(TOTAL_TILES).fill(null);
const tileCache     = new Map();

function cacheKey(tileIdx, colIdx) { return `${tileIdx}:${colIdx}`; }

function rasteriseTile(tileIdx, colIdx) {
  const key = cacheKey(tileIdx, colIdx);
  if (tileCache.has(key)) return tileCache.get(key);
  const src = tileSvgSource[tileIdx];
  if (!src) return null;
  const coloured = src.replace(/FGCOLOR/g, PETSCII[colIdx].hex);
  const blob     = new Blob([coloured], { type: 'image/svg+xml' });
  const blobUrl  = URL.createObjectURL(blob);
  const img      = new Image(FONT_SIZE, FONT_SIZE);
  tileCache.set(key, img);
  img.onload  = () => { URL.revokeObjectURL(blobUrl); draw(); drawPalette(); };
  img.onerror = () => URL.revokeObjectURL(blobUrl);
  img.src = blobUrl;
  return img;
}

function getTile(tileIdx, colIdx) {
  if (!tileSvgSource[tileIdx]) return null;
  return rasteriseTile(tileIdx, colIdx);
}


// ── Comparison buffers ─────────────────────────────────────────────────────

const cmp = {
  size: 32, tolerance: 10,
  bufs: new Array(TOTAL_TILES).fill(null),
  ready: false, building: false,
};

const cmpCanvas = document.createElement('canvas');
const cmpCtx    = cmpCanvas.getContext('2d', { willReadFrequently: true });

function rasteriseToCmpBuf(tileIdx, size) {
  const src = tileSvgSource[tileIdx];
  if (!src) return null;
  return new Promise(resolve => {
    const coloured = src.replace(/FGCOLOR/g, '#ffffff');
    const blob     = new Blob([coloured], { type: 'image/svg+xml' });
    const url      = URL.createObjectURL(blob);
    const img      = new Image(size, size);
    img.onload = () => {
      URL.revokeObjectURL(url);
      cmpCanvas.width  = size;
      cmpCanvas.height = size;
      cmpCtx.clearRect(0, 0, size, size);
      cmpCtx.drawImage(img, 0, 0, size, size);
      const data = cmpCtx.getImageData(0, 0, size, size).data;
      const buf  = new Uint8Array(size * size);
      for (let i = 0; i < buf.length; i++) buf[i] = data[i * 4];
      resolve(buf);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

async function buildCmpBuffers() {
  if (cmp.building) return;
  cmp.building = true;
  cmp.ready    = false;
  setCmpStatus('building…');
  const size = cmp.size;
  cmp.bufs.fill(null);
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (tileSvgSource[i]) cmp.bufs[i] = await rasteriseToCmpBuf(i, size);
  }
  cmp.ready    = true;
  cmp.building = false;
  const thresh = Math.ceil(cmp.tolerance / 100 * size * size);
  setCmpStatus(`ready (${size}×${size}, <${thresh}px)`);
}


// ── Pixel buffer transforms ────────────────────────────────────────────────

function bufRotate90CCW(buf, S) {
  const out = new Uint8Array(S * S);
  for (let r = 0; r < S; r++)
    for (let c = 0; c < S; c++)
      out[(S - 1 - c) * S + r] = buf[r * S + c];
  return out;
}
function bufFlipH(buf, S) {
  const out = new Uint8Array(S * S);
  for (let r = 0; r < S; r++)
    for (let c = 0; c < S; c++)
      out[r * S + (S - 1 - c)] = buf[r * S + c];
  return out;
}
function bufFlipV(buf, S) {
  const out = new Uint8Array(S * S);
  for (let r = 0; r < S; r++)
    out.set(buf.subarray(r * S, r * S + S), (S - 1 - r) * S);
  return out;
}
function bufInvert(buf) {
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = 255 - buf[i];
  return out;
}
function bufsMatch(a, b, threshold) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 32) diff++;
    if (diff > threshold) return false;
  }
  return true;
}

function applyTransform(name) {
  if (!cmp.ready) return;
  const srcIdx = state.palCursor.row * PALETTE_COLS + state.palCursor.col;
  const srcBuf = cmp.bufs[srcIdx];
  if (!srcBuf) return;
  const S = cmp.size;
  let transformed;
  switch (name) {
    case 'R': transformed = bufRotate90CCW(srcBuf, S); break;
    case 'H': transformed = bufFlipH(srcBuf, S);       break;
    case 'V': transformed = bufFlipV(srcBuf, S);       break;
    case 'I': transformed = bufInvert(srcBuf);         break;
    default: return;
  }
  const threshold = Math.ceil(cmp.tolerance / 100 * S * S);
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (!cmp.bufs[i]) continue;
    if (bufsMatch(transformed, cmp.bufs[i], threshold)) {
      state.palCursor.col = i % PALETTE_COLS;
      state.palCursor.row = Math.floor(i / PALETTE_COLS);
      drawPalette();
      return;
    }
  }
}


// ── Tileset loader ─────────────────────────────────────────────────────────

let tilesReady  = false;
let currentFont = 'test';

async function loadTileset(fontName) {
  tilesReady = false;
  currentFont = fontName;
  tileSvgSource.fill(null);
  tileCache.clear();

  // Load font metadata (optional — fall back to space=0 if absent)
  fontMeta = { name: fontName, charmap: { ' ': 0 } };
  try {
    const r = await fetch(`fonts/${fontName}/font.json`);
    if (r.ok) fontMeta = await r.json();
  } catch {}

  const promises = [];
  for (let i = 0; i < TOTAL_TILES; i++) {
    const url = `fonts/${fontName}/${i}.svg`;
    promises.push(
      fetch(url)
        .then(r => r.ok ? r.text() : null)
        .then(svgText => { if (svgText) tileSvgSource[i] = svgText; })
        .catch(() => {})
    );
  }
  await Promise.all(promises);
  tilesReady = true;
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (tileSvgSource[i]) rasteriseTile(i, state.fgIndex);
  }
  drawPalette();
  draw();
  buildCmpBuffers();
}

// Load font list from manifest.json
const KNOWN_FONTS = ['test', 'petscii'];

async function detectFonts() {
  try {
    const r = await fetch('fonts/manifest.json');
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length) return list;
    }
  } catch {}
  // Fallback to hardcoded list
  return KNOWN_FONTS;
}

async function initFontSelector() {
  const sel  = document.getElementById('font-select');
  const fonts = await detectFonts();
  sel.innerHTML = '';
  for (const f of fonts) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  }
  sel.value = doc.font;
  sel.addEventListener('change', () => {
    doc.font = sel.value;
    loadTileset(sel.value);
  });
}


// ── DOM refs ───────────────────────────────────────────────────────────────

const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const wrap      = document.getElementById('canvas-wrap');
const palCanvas = document.getElementById('palette-canvas');
const palCtx    = palCanvas.getContext('2d');

const stZoom   = document.getElementById('st-zoom');
const stPos    = document.getElementById('st-pos');
const stTile   = document.getElementById('st-tile');
const stFgName = document.getElementById('st-fg-name');
const stBgName = document.getElementById('st-bg-name');
const stFgSw   = document.getElementById('st-fg-swatch');
const stBgSw   = document.getElementById('st-bg-swatch');
const stGrid   = document.getElementById('st-grid');
const stMode   = document.getElementById('st-mode');

const cmpSizeInput  = document.getElementById('cmp-size');
const cmpTolInput   = document.getElementById('cmp-tol');
const cmpRebuildBtn = document.getElementById('cmp-rebuild');
const cmpStatusEl   = document.getElementById('cmp-status');

function setCmpStatus(msg) { if (cmpStatusEl) cmpStatusEl.textContent = msg; }

cmpRebuildBtn.addEventListener('click', async () => {
  const size = Math.max(8,  Math.min(128, parseInt(cmpSizeInput.value) || 32));
  const tol  = Math.max(1,  Math.min(50,  parseInt(cmpTolInput.value)  || 10));
  cmpSizeInput.value = size;
  cmpTolInput.value  = tol;
  cmp.size      = size;
  cmp.tolerance = tol;
  cmpRebuildBtn.disabled = true;
  await buildCmpBuffers();
  cmpRebuildBtn.disabled = false;
});


// ── Canvas size controls ───────────────────────────────────────────────────

function updateCanvasSizeInputs() {
  document.getElementById('canvas-w').value = GRID_COLS;
  document.getElementById('canvas-h').value = GRID_ROWS;
}

document.getElementById('canvas-apply').addEventListener('click', () => {
  const w = Math.max(1, Math.min(256, parseInt(document.getElementById('canvas-w').value) || GRID_COLS));
  const h = Math.max(1, Math.min(256, parseInt(document.getElementById('canvas-h').value) || GRID_ROWS));
  if (w === GRID_COLS && h === GRID_ROWS) return;
  snapshotForUndo();
  resizeGrid(w, h);
  updateCanvasSizeInputs();
  draw();
});

document.getElementById('canvas-del-row').addEventListener('click', () => {
  if (GRID_ROWS <= 1) return;
  snapshotForUndo();
  deleteRow(state.cursor.row);
  updateCanvasSizeInputs();
  draw();
});

document.getElementById('canvas-del-col').addEventListener('click', () => {
  if (GRID_COLS <= 1) return;
  snapshotForUndo();
  deleteCol(state.cursor.col);
  updateCanvasSizeInputs();
  draw();
});


// ── Colour swatches ────────────────────────────────────────────────────────

function buildSwatches() {
  const container = document.getElementById('colour-grid');
  for (let row = 0; row < 4; row++) {
    const rowEl = document.createElement('div');
    rowEl.className = 'swatch-row';
    for (let col = 0; col < 4; col++) {
      const palIdx = paletteIndex(col, row);
      const el     = document.createElement('div');
      el.className        = 'swatch';
      el.style.background = PETSCII[palIdx].hex;
      el.dataset.palIdx   = palIdx;
      el.title            = PETSCII[palIdx].name;
      el.addEventListener('click',       ()  => setFg(palIdx));
      el.addEventListener('contextmenu', e   => { e.preventDefault(); setBg(palIdx); });
      rowEl.appendChild(el);
    }
    container.appendChild(rowEl);
  }
  refreshSwatchMarkers();
}

function refreshSwatchMarkers() {
  document.querySelectorAll('#colour-grid .swatch').forEach(el => {
    el.classList.remove('active-fg', 'active-bg');
    const idx = Number(el.dataset.palIdx);
    if (idx === state.fgIndex) el.classList.add('active-fg');
    if (idx === state.bgIndex) el.classList.add('active-bg');
  });
  stFgSw.style.background = PETSCII[state.fgIndex].hex;
  stBgSw.style.background = PETSCII[state.bgIndex].hex;
  stFgName.textContent    = PETSCII[state.fgIndex].name;
  stBgName.textContent    = PETSCII[state.bgIndex].name;
}

function setFg(palIdx) {
  state.fgIndex = palIdx;
  const col = palIdx % 4;
  state.fgColRow[col] = Math.floor(palIdx / 4);
  refreshSwatchMarkers();
  drawPalette();
}

function setBg(palIdx) {
  state.bgIndex = palIdx;
  const col = palIdx % 4;
  state.bgColRow[col] = Math.floor(palIdx / 4);
  refreshSwatchMarkers();
  drawPalette();
  draw();
}


// ── Palette canvas ─────────────────────────────────────────────────────────

function initPaletteCanvas() {
  palCanvas.width  = PALETTE_COLS * PALETTE_CELL + 1;
  palCanvas.height = PALETTE_ROWS * PALETTE_CELL + 1;
}

function drawPalette() {
  const W = palCanvas.width;
  const H = palCanvas.height;
  palCtx.clearRect(0, 0, W, H);
  palCtx.fillStyle = '#0d0d0d';
  palCtx.fillRect(0, 0, W, H);

  for (let i = 0; i < TOTAL_TILES; i++) {
    const col = i % PALETTE_COLS;
    const row = Math.floor(i / PALETTE_COLS);
    const x   = col * PALETTE_CELL;
    const y   = row * PALETTE_CELL;
    palCtx.fillStyle = PETSCII[state.bgIndex].hex;
    palCtx.fillRect(x, y, PALETTE_CELL, PALETTE_CELL);
    const img = getTile(i, state.fgIndex);
    if (img && img.complete && img.naturalWidth) {
      palCtx.drawImage(img, x, y, PALETTE_CELL, PALETTE_CELL);
    } else if (!tileSvgSource[i]) {
      palCtx.fillStyle = EMPTY_COLOR;
      palCtx.fillRect(x + PALETTE_CELL / 2 - 0.5, y + PALETTE_CELL / 2 - 0.5, 1, 1);
    }
  }

  palCtx.strokeStyle = '#222';
  palCtx.lineWidth   = 0.5;
  for (let c = 0; c <= PALETTE_COLS; c++) {
    palCtx.beginPath();
    palCtx.moveTo(c * PALETTE_CELL + 0.5, 0);
    palCtx.lineTo(c * PALETTE_CELL + 0.5, H);
    palCtx.stroke();
  }
  for (let r = 0; r <= PALETTE_ROWS; r++) {
    palCtx.beginPath();
    palCtx.moveTo(0, r * PALETTE_CELL + 0.5);
    palCtx.lineTo(W, r * PALETTE_CELL + 0.5);
    palCtx.stroke();
  }

  const { col, row } = state.palCursor;
  palCtx.strokeStyle = PAL_CURSOR_COLOR;
  palCtx.lineWidth   = 1;
  palCtx.strokeRect(col * PALETTE_CELL + 0.5, row * PALETTE_CELL + 0.5, PALETTE_CELL - 1, PALETTE_CELL - 1);

  const idx = state.palCursor.row * PALETTE_COLS + state.palCursor.col;
  stTile.textContent = `tile ${idx.toString(16).padStart(2, '0')}`;
}


// ── Canvas sizing ──────────────────────────────────────────────────────────

function resizeCanvas() {
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}
window.addEventListener('resize', resizeCanvas);


// ── Main draw ──────────────────────────────────────────────────────────────

function draw() {
  const { zoom, pan } = state;
  const cell = CELL_PX * zoom;
  const W    = canvas.width;
  const H    = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = PETSCII[state.bgIndex].hex;
  ctx.fillRect(pan.x, pan.y, GRID_COLS * cell, GRID_ROWS * cell);

  if (tilesReady) {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const i       = r * GRID_COLS + c;
        const tileIdx = gridTile[i];
        if (tileIdx === spaceIndex()) continue;
        const img = getTile(tileIdx, gridFg[i]);
        if (!img || !img.complete || !img.naturalWidth) continue;
        ctx.drawImage(img, pan.x + c * cell, pan.y + r * cell, cell, cell);
      }
    }
  }

  if (state.showGrid) {
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth   = 1;
    const startCol = Math.floor(-pan.x / cell);
    const startRow = Math.floor(-pan.y / cell);
    const endCol   = Math.min(GRID_COLS, startCol + Math.ceil(W / cell) + 1);
    const endRow   = Math.min(GRID_ROWS, startRow + Math.ceil(H / cell) + 1);
    for (let c = Math.max(0, startCol); c <= endCol; c++) {
      const x = pan.x + c * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(x, pan.y); ctx.lineTo(x, pan.y + GRID_ROWS * cell); ctx.stroke();
    }
    for (let r = Math.max(0, startRow); r <= endRow; r++) {
      const y = pan.y + r * cell + 0.5;
      ctx.beginPath(); ctx.moveTo(pan.x, y); ctx.lineTo(pan.x + GRID_COLS * cell, y); ctx.stroke();
    }
  }

  // Canvas cursor (blinks in typing mode)
  if (cursorVisible) {
    const { col, row } = state.cursor;
    ctx.strokeStyle = state.mode === 'typing' ? '#ffff00' : CURSOR_COLOR;
    ctx.lineWidth   = state.mode === 'typing' ? 2 : 1;
    ctx.strokeRect(pan.x + col * cell + 0.5, pan.y + row * cell + 0.5, cell - 1, cell - 1);
  }

  // Selection overlay
  const sel = selectionRect();
  if (sel) {
    const sx = pan.x + sel.c0 * cell;
    const sy = pan.y + sel.r0 * cell;
    const sw = (sel.c1 - sel.c0 + 1) * cell;
    const sh = (sel.r1 - sel.r0 + 1) * cell;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    ctx.strokeStyle = '#000000';
    ctx.lineDashOffset = 3;
    ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
    ctx.restore();
  }

  // Status bar
  const modeLabel  = state.mode === 'typing' ? 'TYPE' : 'TILE';
  const writeLabel = state.writeMode.toUpperCase();
  const selLabel   = sel ? ` | SEL ${sel.c0},${sel.r0}→${sel.c1},${sel.r1}` : '';
  stZoom.textContent = `zoom ${state.zoom}×`;
  stPos.textContent  = `${state.cursor.col},${state.cursor.row}`;
  stGrid.textContent = `${GRID_COLS}×${GRID_ROWS}`;
  stMode.textContent = `${modeLabel} | ${writeLabel}${selLabel}`;
}


// ── Place / erase ──────────────────────────────────────────────────────────

function selectedTileIndex() {
  return state.palCursor.row * PALETTE_COLS + state.palCursor.col;
}

function placeTile(tileIdx) {
  const { col, row } = state.cursor;
  const i = row * GRID_COLS + col;
  snapshotForUndo();
  if (state.writeMode === 'both' || state.writeMode === 'char') {
    gridTile[i] = tileIdx ?? selectedTileIndex();
  }
  if (state.writeMode === 'both' || state.writeMode === 'colour') {
    gridFg[i] = state.fgIndex;
  }
  draw();
}

function eraseTile() {
  const { col, row } = state.cursor;
  const i = row * GRID_COLS + col;
  snapshotForUndo();
  gridTile[i] = spaceIndex();
  gridFg[i]   = 0;
  draw();
}


// ── Save / load ────────────────────────────────────────────────────────────

function buildSaveData() {
  const cells = [];
  for (let i = 0; i < GRID_COLS * GRID_ROWS; i++) {
    cells.push([gridTile[i], gridFg[i]]);
  }
  return {
    version:  doc.version,
    title:    doc.title,
    artist:   doc.artist,
    group:    doc.group,
    font:     doc.font,
    colours:  PETSCII.map(c => c.hex),
    background: state.bgIndex,
    size:     [GRID_COLS, GRID_ROWS],
    delay:    doc.delay,
    frames:   [cells],
  };
}

function saveFile() {
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

async function loadFile(file) {
  const text = await file.text();
  let data;
  try { data = JSON.parse(text); } catch { alert('Invalid file.'); return; }

  // Restore grid
  const [w, h] = data.size;
  initGrid(w, h);
  const cells = data.frames[0];
  for (let i = 0; i < cells.length && i < w * h; i++) {
    gridTile[i] = cells[i][0];
    gridFg[i]   = cells[i][1];
  }

  // Restore doc metadata
  doc.title   = data.title   ?? 'Untitled';
  doc.artist  = data.artist  ?? '';
  doc.group   = data.group   ?? '';
  doc.font    = data.font    ?? 'test';
  doc.delay   = data.delay   ?? 500;

  // Restore bg colour
  state.bgIndex = data.background ?? 0;

  // Update font selector
  const sel = document.getElementById('font-select');
  if (sel) sel.value = doc.font;

  // Update metadata inputs
  document.getElementById('meta-title').value  = doc.title;
  document.getElementById('meta-artist').value = doc.artist;
  document.getElementById('meta-group').value  = doc.group;

  updateCanvasSizeInputs();
  refreshSwatchMarkers();

  undoStack.length = 0;
  redoStack.length = 0;

  // Reload font if changed
  if (doc.font !== currentFont) {
    await loadTileset(doc.font);
  } else {
    draw();
  }
}

document.getElementById('btn-save').addEventListener('click', saveFile);

document.getElementById('btn-load').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) loadFile(file);
  e.target.value = '';
});


// ── Pan ────────────────────────────────────────────────────────────────────

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


// ── Zoom ───────────────────────────────────────────────────────────────────

function setZoom(idx, originX, originY) {
  idx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, idx));
  if (idx === state.zoomIdx) return;
  const oldZ = state.zoom;
  const newZ = ZOOM_STEPS[idx];
  const ox   = originX ?? canvas.width  / 2;
  const oy   = originY ?? canvas.height / 2;
  state.pan.x   = ox - (ox - state.pan.x) * (newZ / oldZ);
  state.pan.y   = oy - (oy - state.pan.y) * (newZ / oldZ);
  state.zoom    = newZ;
  state.zoomIdx = idx;
  draw();
}

wrap.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = wrap.getBoundingClientRect();
  setZoom(state.zoomIdx + (e.deltaY < 0 ? 1 : -1), e.clientX - rect.left, e.clientY - rect.top);
}, { passive: false });


// ── Keyboard ───────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  if (e.target !== document.body && e.target !== document.documentElement) return;

  const { cursor, palCursor } = state;

  // ── Ctrl shortcuts — always active ──
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 's') { e.preventDefault(); saveFile(); return; }
  }

  // ── Escape — dismiss selection first, then exit typing ──
  if (e.key === 'Escape') {
    if (state.selection) { clearSelection(); return; }
    if (state.mode === 'typing') { exitTyping(); return; }
    return;
  }

  // ── Shift+Arrows — extend/create selection (all modes) ──
  if (e.shiftKey) {
    switch (e.key) {
      case 'ArrowLeft':  e.preventDefault(); extendSelection(-1,  0); return;
      case 'ArrowRight': e.preventDefault(); extendSelection( 1,  0); return;
      case 'ArrowUp':    e.preventDefault(); extendSelection( 0, -1); return;
      case 'ArrowDown':  e.preventDefault(); extendSelection( 0,  1); return;
    }
  }

  // ── Number keys 1-4: fg / bg colour (not in typing mode) ──
  if (state.mode !== 'typing') {
    const codeMatch = e.code.match(/^Digit([1-4])$/);
    if (codeMatch) {
      const col = Number(codeMatch[1]) - 1;
      if (e.shiftKey) {
        const currentCol = state.bgIndex % 4;
        const currentRow = Math.floor(state.bgIndex / 4);
        setBg(paletteIndex(col, (currentCol === col) ? (currentRow + 1) % 4 : 0));
      } else {
        const currentCol = state.fgIndex % 4;
        const currentRow = Math.floor(state.fgIndex / 4);
        setFg(paletteIndex(col, (currentCol === col) ? (currentRow + 1) % 4 : 0));
      }
      return;
    }
  }

  // ── Typing mode ──────────────────────────────────────────────────────────
  if (state.mode === 'typing') {
    // Arrow keys move cursor and reset typing start column
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        cursor.col = Math.max(0, cursor.col - 1);
        state.typing.startCol = cursor.col;
        draw(); return;
      case 'ArrowRight':
        e.preventDefault();
        cursor.col = Math.min(GRID_COLS - 1, cursor.col + 1);
        state.typing.startCol = cursor.col;
        draw(); return;
      case 'ArrowUp':
        e.preventDefault();
        cursor.row = Math.max(0, cursor.row - 1);
        state.typing.startCol = cursor.col;
        draw(); return;
      case 'ArrowDown':
        e.preventDefault();
        cursor.row = Math.min(GRID_ROWS - 1, cursor.row + 1);
        state.typing.startCol = cursor.col;
        draw(); return;
    }

    // Enter — move to next row at start column
    if (e.key === 'Enter') {
      cursor.row = Math.min(GRID_ROWS - 1, cursor.row + 1);
      cursor.col = state.typing.startCol;
      draw(); return;
    }

    // Backspace — erase and move left
    if (e.key === 'Backspace') {
      e.preventDefault();
      // Move left first
      if (cursor.col > 0) {
        cursor.col--;
      } else if (cursor.row > 0) {
        cursor.row--;
        cursor.col = GRID_COLS - 1;
      }
      const i = cursor.row * GRID_COLS + cursor.col;
      snapshotForUndo();
      gridTile[i] = spaceIndex();
      gridFg[i]   = 0;
      draw(); return;
    }

    // Printable character — look up charmap
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const tileIdx = fontMeta.charmap?.[e.key];
      if (tileIdx !== undefined) {
        placeTile(tileIdx);
      }
      // Advance cursor right, wrap to col 0 on next row
      if (cursor.col < GRID_COLS - 1) {
        cursor.col++;
      } else {
        cursor.col = 0;
        cursor.row = Math.min(GRID_ROWS - 1, cursor.row + 1);
      }
      draw(); return;
    }

    // Any other key in typing mode — fall through to global shortcuts below
  }

  // ── Tile mode shortcuts ──────────────────────────────────────────────────
  const PAN_STEP = Math.round(CELL_PX * state.zoom * 4);

  switch (e.key) {
    // WASD — cursor move (plain) / pan (shift, but shift+arrows handled above)
    case 'a': case 'A':
      if (e.shiftKey) { state.pan.x -= PAN_STEP; draw(); }
      else { cursor.col = Math.max(0, cursor.col - 1); draw(); }
      break;
    case 'd': case 'D':
      if (e.shiftKey) { state.pan.x += PAN_STEP; draw(); }
      else { cursor.col = Math.min(GRID_COLS - 1, cursor.col + 1); draw(); }
      break;
    case 'w': case 'W':
      if (e.shiftKey) { state.pan.y -= PAN_STEP; draw(); }
      else { cursor.row = Math.max(0, cursor.row - 1); draw(); }
      break;
    case 's': case 'S':
      if (e.shiftKey) { state.pan.y += PAN_STEP; draw(); }
      else { cursor.row = Math.min(GRID_ROWS - 1, cursor.row + 1); draw(); }
      break;

    // Palette cursor — IJKL + arrows (tile mode only)
    case 'j': case 'J':
    case 'ArrowLeft':  e.preventDefault(); palCursor.col = Math.max(0, palCursor.col - 1);                drawPalette(); break;
    case 'l': case 'L':
    case 'ArrowRight': e.preventDefault(); palCursor.col = Math.min(PALETTE_COLS - 1, palCursor.col + 1); drawPalette(); break;
    case 'i': case 'I':
    case 'ArrowUp':    e.preventDefault(); palCursor.row = Math.max(0, palCursor.row - 1);                drawPalette(); break;
    case 'k': case 'K':
    case 'ArrowDown':  e.preventDefault(); palCursor.row = Math.min(PALETTE_ROWS - 1, palCursor.row + 1); drawPalette(); break;

    // Place / erase
    case 'e': case 'E': placeTile(); break;
    case 'q': case 'Q': eraseTile(); break;

    // Transforms
    case 'r': case 'R': applyTransform('R'); break;
    case 'h': case 'H': applyTransform('H'); break;
    case 'v': case 'V': applyTransform('V'); break;
    case 'f': case 'F': applyTransform('I'); break;

    // Enter typing mode
    case 't': case 'T': enterTyping(); break;

    // Cycle write mode
    case 'm': case 'M': cycleWriteMode(); break;

    // Grid / panel toggles
    case 'g': case 'G':
      state.showGrid = !state.showGrid; draw(); break;
    case '§':
      state.showPanel = !state.showPanel;
      document.getElementById('panel').style.display = state.showPanel ? '' : 'none';
      document.getElementById('status').style.left   = state.showPanel ? 'var(--panel-width)' : '0';
      resizeCanvas();
      break;

    // Zoom
    case '+': case '=': setZoom(state.zoomIdx + 1); break;
    case '-':            setZoom(state.zoomIdx - 1); break;
  }
});


// ── Boot ───────────────────────────────────────────────────────────────────

function centreGrid() {
  const cell  = CELL_PX * state.zoom;
  state.pan.x = Math.round((canvas.width  - GRID_COLS * cell) / 2);
  state.pan.y = Math.round((canvas.height - GRID_ROWS * cell) / 2);
}

// Populate metadata inputs
document.getElementById('meta-title').addEventListener('input',  e => doc.title  = e.target.value);
document.getElementById('meta-artist').addEventListener('input', e => doc.artist = e.target.value);
document.getElementById('meta-group').addEventListener('input',  e => doc.group  = e.target.value);

initGrid(GRID_COLS, GRID_ROWS);
initPaletteCanvas();
buildSwatches();
updateCanvasSizeInputs();
resizeCanvas();
centreGrid();
draw();
drawPalette();
initFontSelector().then(() => loadTileset(doc.font));