// ref.js
// ── Reference image ────────────────────────────────────────────────────────

import { state }   from './state.js';
import { grid }    from './grid.js';
import { CELL_PX } from './constants.js';

export const ref = {
  img:     null,
  src:     '',
  x:       0,       // offset in grid-cell units from grid top-left
  y:       0,
  scale:   1.0,     // multiplier on top of cover-fit
  opacity: 0.5,
  visible: true,
  editing: false,
};

const MOVE_STEP  = 1;     // grid cells per keypress
const EDGE_PX    = 16;    // px threshold for edge drag zone


// ── Cover-fit calculation ──────────────────────────────────────────────────

export function coverScale() {
  if (!ref.img) return 1;
  const gridW = grid.cols * CELL_PX;
  const gridH = grid.rows * CELL_PX;
  return Math.max(gridW / ref.img.naturalWidth, gridH / ref.img.naturalHeight);
}

// Returns rendered image bounds in screen pixels
export function refScreenBounds() {
  if (!ref.img) return null;
  const { zoom, pan } = state;
  const cell   = CELL_PX * zoom;
  const cs     = coverScale();
  const totalS = cs * ref.scale;
  const ix = pan.x + ref.x * cell;
  const iy = pan.y + ref.y * cell;
  const iw = ref.img.naturalWidth  * totalS * zoom;
  const ih = ref.img.naturalHeight * totalS * zoom;
  return { x: ix, y: iy, w: iw, h: ih };
}

// Returns 'move' | 'edge-right' | 'edge-left' | 'edge-top' | 'edge-bottom' | null
export function refHitTest(screenX, screenY) {
  const b = refScreenBounds();
  if (!b) return null;
  const inside = screenX >= b.x && screenX <= b.x + b.w &&
                 screenY >= b.y && screenY <= b.y + b.h;
  if (!inside) return null;
  const nearLeft   = screenX - b.x         < EDGE_PX;
  const nearRight  = b.x + b.w - screenX   < EDGE_PX;
  const nearTop    = screenY - b.y         < EDGE_PX;
  const nearBottom = b.y + b.h - screenY   < EDGE_PX;
  if (nearLeft)   return 'edge-left';
  if (nearRight)  return 'edge-right';
  if (nearTop)    return 'edge-top';
  if (nearBottom) return 'edge-bottom';
  return 'move';
}


// ── Load ───────────────────────────────────────────────────────────────────

export function loadRefFromUrl(url, drawFn) {
  const img  = new Image();
  img.onload = () => {
    ref.img     = img;
    ref.src     = url;
    ref.x       = 0;
    ref.y       = 0;
    ref.scale   = 1.0;
    ref.visible = true;
    drawFn();
    updateRefUI();
  };
  img.onerror = () => alert('Could not load image from that URL.');
  img.crossOrigin = 'anonymous';
  img.src = url;
}

export function loadRefFromFile(file, drawFn) {
  loadRefFromUrl(URL.createObjectURL(file), drawFn);
}


// ── Keyboard actions ───────────────────────────────────────────────────────

export function moveRef(dc, dr) {
  ref.x += dc * MOVE_STEP;
  ref.y += dr * MOVE_STEP;
  updateRefUI();
}

export function changeOpacity(delta) {
  ref.opacity = Math.max(0, Math.min(1, ref.opacity + delta));
  updateRefUI();
}

export function scaleRef(delta) {
  ref.scale = Math.max(0.1, ref.scale + delta);
  updateRefUI();
}

export function setRefOpacity(value) {
  ref.opacity = Math.max(0, Math.min(1, value));
  updateRefUI();
}

export function toggleRefVisible() {
  ref.visible = !ref.visible;
  updateRefUI();
}

export function toggleRefEditing() {
  ref.editing = !ref.editing;
  updateRefUI();
}


// ── Mouse drag (called from input.js) ─────────────────────────────────────
// startRefDrag returns a mousemove handler and a mouseup handler.

export function startRefDrag(screenX, screenY, drawFn) {
  const hit = refHitTest(screenX, screenY);
  if (!hit) return null;

  const b0       = refScreenBounds();
  const startX   = screenX;
  const startY   = screenY;
  const startScl = ref.scale;
  const startX0  = ref.x;
  const startY0  = ref.y;
  const { zoom } = state;
  const cell     = CELL_PX * zoom;
  const cs       = coverScale();

  function onMove(mx, my) {
    const dx = mx - startX;
    const dy = my - startY;

    if (hit === 'move') {
      ref.x = startX0 + dx / cell;
      ref.y = startY0 + dy / cell;
    } else {
      // Scale: use horizontal delta for left/right edges, vertical for top/bottom
      // Positive delta = image gets bigger
      let delta;
      if (hit === 'edge-right')  delta =  dx;
      if (hit === 'edge-left')   delta = -dx;
      if (hit === 'edge-bottom') delta =  dy;
      if (hit === 'edge-top')    delta = -dy;

      // Convert pixel delta to scale delta
      // The image width at current scale is b0.w, so new scale = startScl * (b0.w + delta) / b0.w
      const newScale = Math.max(0.1, startScl * (b0.w + delta) / b0.w);
      ref.scale = newScale;

      // Anchor opposite edge: adjust position so the opposite side stays fixed
      const newTotalS = cs * newScale;
      const newW = ref.img.naturalWidth  * newTotalS * zoom;
      const newH = ref.img.naturalHeight * newTotalS * zoom;
      if (hit === 'edge-right' || hit === 'edge-left') {
        // Keep left edge fixed for right drag, right edge fixed for left drag
        if (hit === 'edge-left') ref.x = startX0 + (b0.w - newW) / cell;
      }
      if (hit === 'edge-bottom' || hit === 'edge-top') {
        if (hit === 'edge-top') ref.y = startY0 + (b0.h - newH) / cell;
      }
    }
    updateRefUI();
    drawFn();
  }

  return onMove;
}


// ── UI sync ────────────────────────────────────────────────────────────────

export function updateRefUI() {
  const btnVisible = document.getElementById('btn-ref-visible');
  const btnEdit    = document.getElementById('btn-ref-edit');
  const opSlider   = document.getElementById('ref-opacity');
  const scaleLabel = document.getElementById('ref-scale-label');
  if (btnVisible) btnVisible.classList.toggle('active', ref.visible);
  if (btnEdit)    btnEdit.classList.toggle('active', ref.editing);
  if (opSlider)   opSlider.value = Math.round(ref.opacity * 100);
  if (scaleLabel) scaleLabel.textContent = `${Math.round(ref.scale * 100)}%`;
}


// ── Panel init ─────────────────────────────────────────────────────────────

export function initRef(drawFn) {
  const urlInput  = document.getElementById('ref-url');
  const btnUrl    = document.getElementById('btn-ref-url');
  const fileInput = document.getElementById('ref-file-input');
  const btnFile   = document.getElementById('btn-ref-upload');
  const btnVis    = document.getElementById('btn-ref-visible');
  const btnEdit   = document.getElementById('btn-ref-edit');
  const opSlider  = document.getElementById('ref-opacity');

  btnUrl.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (url) loadRefFromUrl(url, drawFn);
  });
  urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.stopPropagation(); btnUrl.click(); }
  });

  btnFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadRefFromFile(file, drawFn);
    e.target.value = '';
  });

  btnVis.addEventListener('click',  () => { toggleRefVisible();  drawFn(); });
  btnEdit.addEventListener('click', () => { toggleRefEditing();  drawFn(); });

  opSlider.addEventListener('input', e => {
    setRefOpacity(parseInt(e.target.value) / 100);
    drawFn();
  });

  updateRefUI();
}