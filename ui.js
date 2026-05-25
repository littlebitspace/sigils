// ui.js
// ── Misc DOM helpers ───────────────────────────────────────────────────────
// Small utilities that touch the DOM but don't belong to a specific module.

import { grid } from './grid.js';
import { doc }  from './state.js';

export function updateCanvasSizeInputs() {
  document.getElementById('canvas-w').value = grid.cols;
  document.getElementById('canvas-h').value = grid.rows;
}

export function initMetaInputs() {
  document.getElementById('meta-title').addEventListener('input',  e => doc.title  = e.target.value);
  document.getElementById('meta-artist').addEventListener('input', e => doc.artist = e.target.value);
  document.getElementById('meta-group').addEventListener('input',  e => doc.group  = e.target.value);
}
