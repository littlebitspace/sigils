// state.js
// ── Mutable app state ──────────────────────────────────────────────────────

import { ZOOM_STEPS, ZOOM_DEFAULT, WRITE_MODES } from './constants.js';

export const doc = {
  version: 1,
  title:   'Untitled',
  artist:  '',
  group:   '',
  font:    'petscii',
  delay:   500,
};

export const state = {
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
  mode:      'tile',       // 'tile' | 'typing'
  writeMode: 'both',       // 'both' | 'char' | 'colour'
  typing:    { startCol: 0 },
  selection: null,         // { anchorCol, anchorRow, cursorCol, cursorRow } | null
};


// ── Cursor blink ───────────────────────────────────────────────────────────
// drawFn is passed in rather than imported to avoid a circular dependency:
// draw.js imports state.js, so state.js must not import draw.js.

export let cursorVisible = true;
let blinkInterval        = null;

export function startBlink(drawFn) {
  cursorVisible = true;
  if (blinkInterval) return;
  blinkInterval = setInterval(() => {
    cursorVisible = !cursorVisible;
    drawFn();
  }, 500);
}

export function stopBlink() {
  clearInterval(blinkInterval);
  blinkInterval = null;
  cursorVisible = true;
}

export function enterTyping(drawFn) {
  state.mode            = 'typing';
  state.typing.startCol = state.cursor.col;
  startBlink(drawFn);
  drawFn();
}

export function exitTyping(drawFn) {
  state.mode = 'tile';
  stopBlink();
  drawFn();
}

export function cycleWriteMode(drawFn) {
  const idx       = WRITE_MODES.indexOf(state.writeMode);
  state.writeMode = WRITE_MODES[(idx + 1) % WRITE_MODES.length];
  drawFn();
}


// ── Selection ──────────────────────────────────────────────────────────────

export function selectionRect() {
  if (!state.selection) return null;
  const { anchorCol, anchorRow, cursorCol, cursorRow } = state.selection;
  return {
    c0: Math.min(anchorCol, cursorCol),
    r0: Math.min(anchorRow, cursorRow),
    c1: Math.max(anchorCol, cursorCol),
    r1: Math.max(anchorRow, cursorRow),
  };
}
