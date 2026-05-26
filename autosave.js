// autosave.js
// ── Autosave to localStorage ───────────────────────────────────────────────
// Debounced save on every grid mutation.
// On boot, offers to restore if an autosave exists and is newer than last save.

import { doc, state, markDirty }   from './state.js';
import { grid, initGrid }          from './grid.js';
import { loadTileset, currentFont } from './font.js';
import { refreshPalette,
         initPaletteGrid,
         refreshSwatchMarkers }    from './palette.js';
import { updateCanvasSizeInputs }  from './ui.js';
import { undoStack, redoStack }    from './history.js';
import { draw }                    from './draw.js';

const AUTOSAVE_KEY     = 'lbe_autosave';
const AUTOSAVE_DELAY   = 5000;   // ms debounce

let autosaveTimer = null;

// ── Save ───────────────────────────────────────────────────────────────────

export function scheduleAutosave(buildSaveDataFn) {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      const data = buildSaveDataFn();
      data._autosaveAt = Date.now();
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Autosave failed:', e);
    }
  }, AUTOSAVE_DELAY);
}

export function clearAutosave() {
  clearTimeout(autosaveTimer);
  localStorage.removeItem(AUTOSAVE_KEY);
}


// ── Restore ────────────────────────────────────────────────────────────────

export async function checkAutosave(applyDataFn) {
  let raw;
  try { raw = localStorage.getItem(AUTOSAVE_KEY); } catch { return; }
  if (!raw) return;

  let data;
  try { data = JSON.parse(raw); } catch { return; }

  const savedAt = data._autosaveAt
    ? new Date(data._autosaveAt).toLocaleString()
    : 'unknown time';

  const restore = confirm(
    `Unsaved work found from ${savedAt}.\n\nRestore it?`
  );

  if (restore) {
    await applyDataFn(data);
    markDirty();
  } else {
    clearAutosave();
  }
}
