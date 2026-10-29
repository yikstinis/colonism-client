// The map's grid on the planet: parallels and meridians a step apart, its cells named as on a
// chessboard (see the globe, render/globe.js, that draws it); where a cell is on the ball.

import { add, cross, dot, rotate, scale } from './sphere.js';

// The grid's axis, and two more square to it (any fixed ones will do)
export const POLE = [0, 1, 0], GRID_TURN = (6 * Math.PI) / 180; // (the grid turned round the pole a little: the escape pod nearer the middle of its cell)
export const EAST = rotate([1, 0, 0], POLE, GRID_TURN);
export const THIRD = cross(EAST, POLE);
export const STEP = Math.PI / 6; // the grid's cells: this far apart both ways (12 round, 6 from pole to pole)
export const lonOf = (q) => Math.atan2(dot(q, THIRD), dot(q, EAST));
export const latOf = (q) => Math.asin(Math.max(-1, Math.min(1, dot(q, POLE))));
// A cell's name, as on a chessboard: a letter for its column (A to L, west to east), a number for its row
// (1 to 6, north to south); by its indexes (row: floor(lat / STEP), column: floor(lon / STEP))
export const nameOf = (row, col) => 'ABCDEFGHIJKL'[(((5 - col) % 12) + 12) % 12] + (3 - row);
// The name of the cell a point of the ball is in
export const cellName = (q) => nameOf(Math.floor(latOf(q) / STEP), Math.floor(lonOf(q) / STEP));
// The middle of a cell next to the one a point of the ball is in: rows (dRow) up towards the north pole,
// columns (dCol) round (as longitude grows)
export function cellNext(q, dRow, dCol) {
  const lat = (Math.floor(latOf(q) / STEP) + dRow + 0.5) * STEP, lon = (Math.floor(lonOf(q) / STEP) + dCol + 0.5) * STEP;
  return add(scale(POLE, Math.sin(lat)), scale(add(scale(EAST, Math.cos(lon)), scale(THIRD, Math.sin(lon))), Math.cos(lat)));
}

// A point in the cell by its name ('D2'): u across it, west to east, v down it, north to south (0..1
// each; its middle by default)
export function cellPoint(name, u = 0.5, v = 0.5) {
  const row = 3 - Number(name.slice(1)), col = 5 - 'ABCDEFGHIJKL'.indexOf(name[0]);
  const lat = (row + 1 - v) * STEP, lon = (col + 1 - u) * STEP; // (longitude grows westwards: see nameOf)
  return add(scale(POLE, Math.sin(lat)), scale(add(scale(EAST, Math.cos(lon)), scale(THIRD, Math.sin(lon))), Math.cos(lat)));
}
