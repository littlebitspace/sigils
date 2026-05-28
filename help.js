// help.js
// ── Help / keymap overlay ──────────────────────────────────────────────────

const overlay = document.getElementById('help-overlay');

export function openHelp() {
  overlay.classList.add('open');
}

export function closeHelp() {
  overlay.classList.remove('open');
}

export function toggleHelp() {
  overlay.classList.toggle('open');
}

export function isHelpOpen() {
  return overlay.classList.contains('open');
}

export function initHelp() {
  // Close button
  document.getElementById('help-close').addEventListener('click', closeHelp);

  // Click outside dialog
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeHelp();
  });

  // Panel button
  document.getElementById('btn-help').addEventListener('click', openHelp);
}