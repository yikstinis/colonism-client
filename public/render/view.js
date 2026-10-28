// Top-down camera at 70 degrees (keep in sync with ELEV in tools/make-art.mjs). The ground is shown as a plain grid: 1 world unit = ZOOM px
// (a 16-unit tile is 64 px). Height moves things up the screen by HEIGHT_PX per unit.

export const ZOOM = 3; // = 4 * ART_ZOOM in tools/make-art.mjs
export const HEIGHT_PX = ZOOM * Math.cos((70 * Math.PI) / 180);

export const toScreenX = (x) => x * ZOOM;
export const toScreenY = (y) => y * ZOOM;
export const toWorld = (sx, sy) => ({ x: sx / ZOOM, y: sy / ZOOM });
