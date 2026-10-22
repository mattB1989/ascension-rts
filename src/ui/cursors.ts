// Context cursors (desktop): what a right click would do here.
// Small inline SVGs, so nothing is downloaded.

export type CursorKind = 'default' | 'select' | 'move' | 'mine' | 'build' | 'rally' | 'board' | 'unload' | 'paradrop' | 'place' | 'nope';

function svg(body: string, hx: number, hy: number, fallback: string): string {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${body}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(s)}") ${hx} ${hy}, ${fallback}`;
}

const OUT = 'stroke="#10161f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"';
const IN = (c: string) => `stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
const both = (d: string, c: string) => `<path d="${d}" ${OUT}/><path d="${d}" ${IN(c)}/>`;

const CURSORS: Record<CursorKind, string> = {
  default: 'default',
  select: 'pointer',
  place: 'crosshair',
  nope: 'not-allowed',
  // Four chevrons pointing in: "go here".
  move: svg(both('M16 4v7M16 21v7M4 16h7M21 16h7M13 8l3 3 3-3M13 24l3-3 3 3M8 13l3 3-3 3M24 13l-3 3 3 3', '#7dff8a'), 16, 16, 'crosshair'),
  // Pickaxe.
  mine: svg(both('M6 26L20 12M10 7c6-3 13-1 17 4M10 7c4 0 8 2 11 5l3 3', '#5ff0e0'), 6, 26, 'pointer'),
  // Hammer.
  build: svg(both('M6 26l12-12M14 6l8 8 4-4-8-8z', '#ffd25a'), 6, 26, 'pointer'),
  // Flag.
  rally: svg(both('M8 28V4M8 5h16l-4 5 4 5H8', '#7dff8a'), 8, 28, 'pointer'),
  // Arrow into a hull: board.
  board: svg(both('M16 3v13M11 11l5 5 5-5M5 20h22l-4 7H9z', '#6fd3ff'), 16, 16, 'pointer'),
  // Arrow out of a hull onto land: unload.
  unload: svg(both('M16 16V3M11 8l5-5 5 5M5 20h22l-4 7H9z', '#6fd3ff'), 16, 16, 'pointer'),
  // Parachute.
  paradrop: svg(both('M4 14a12 10 0 0 1 24 0zM4 14l12 13 12-13M16 14v13', '#ffffff'), 16, 27, 'crosshair'),
};

export function cursorCss(kind: CursorKind): string {
  return CURSORS[kind];
}
