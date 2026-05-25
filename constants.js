// constants.js
// ── Immutable app-wide constants ───────────────────────────────────────────

export const CELL_PX       = 16;
export const ZOOM_STEPS    = [0.5, 1, 2, 3, 4];
export const ZOOM_DEFAULT  = 1;

export const PALETTE_COLS  = 16;
export const PALETTE_ROWS  = 16;
export const PALETTE_CELL  = 11;

export const FONT_SIZE     = 16;
export const TOTAL_TILES   = 256;
export const MAX_UNDO      = 100;

export const GRID_COLOR       = '#2a2a2a';
export const CURSOR_COLOR     = '#ffffff';
export const PAL_CURSOR_COLOR = '#ffffff';
export const EMPTY_COLOR      = '#2a2a2a';

export const WRITE_MODES = ['both', 'char', 'colour'];

export const PETSCII = [
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

export function paletteIndex(col, row) { return row * 4 + col; }
