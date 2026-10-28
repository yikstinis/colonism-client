// The hotbar, at the bottom of the screen in the middle, once he has the backpack: the things he can
// use, in square slots side by side on one plate as a label's card turned on its side (rounded at the
// top, its thick white edge along the bottom, a thin white line round it), a thick black border inside
// that line, the same between them; each one's key out from under its bottom edge, as a label's key
// comes out from under its card's (rounded where it's out, filled white while it's held): the medkit (1), the knife and the gun (the mouse's buttons). A slot getting ready again is dark over what's left of the wait, going round
// clockwise from the top; a count in its bottom right corner (medkits left, rounds in the magazine).
// A use flashes its slot.

import { FONT, PLATE, EDGE } from '/render/labels.js';

const SIZE = 52, TAB = 18, ICON_SCALE = 1.6; // px: a slot, the key's tab; the icons drawn this much bigger than they're made
const KEY_FONT = `700 10px ${FONT}`, COUNT = `700 11px ${FONT}`;

// The icons: plain white outlines, as simple as can be, centered on (x, y); dim: none left
const LINE = 'rgba(255, 255, 255, 0.9)', DIM = 'rgba(255, 255, 255, 0.25)';
const ICONS = {
  cross(ctx, x, y, dim) { // a plus, its arms as wide as they're long
    const a = 3, l = 9;
    ctx.beginPath();
    ctx.moveTo(x - a, y - l);
    for (const [dx, dy] of [[a, -l], [a, -a], [l, -a], [l, a], [a, a], [a, l], [-a, l], [-a, a], [-l, a], [-l, -a], [-a, -a]]) ctx.lineTo(x + dx, y + dy);
    ctx.closePath();
    ctx.strokeStyle = dim ? DIM : LINE;
    ctx.stroke();
  },
  fist(ctx, x, y, dim) { // seen from the front: four knuckles over the fingers folded in, the thumb across them, the wrist under
    ctx.strokeStyle = dim ? DIM : LINE;
    ctx.beginPath();
    ctx.roundRect(x - 8, y - 6, 16, 11, 3); // the fingers
    ctx.moveTo(x - 4, y - 6); ctx.lineTo(x - 4, y - 1); // between them
    ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 1);
    ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 4, y - 1);
    ctx.moveTo(x - 8, y + 1); ctx.lineTo(x + 3, y + 1); // the thumb
    ctx.moveTo(x - 5, y + 5); ctx.lineTo(x - 5, y + 9); ctx.lineTo(x + 6, y + 9); ctx.lineTo(x + 6, y + 5); // the wrist
    ctx.stroke();
  },
  crosshair(ctx, x, y, dim) { // a ring, four ticks out of it, a dot in the middle
    ctx.strokeStyle = ctx.fillStyle = dim ? DIM : LINE;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + dx * 4, y + dy * 4); ctx.lineTo(x + dx * 10, y + dy * 10); }
    ctx.stroke();
    ctx.fillRect(x - 1, y - 1, 2, 2);
  },
};

// ctx: the canvas to draw on
export function createHotbar(ctx) {
  const flash = new Map(); // key -> 1 as it's used, fading

  const textWidth = (str, font) => {
    ctx.font = font;
    return ctx.measureText(str).width;
  };

  return {
    // The slot with this key was used: it flashes
    used(key) { flash.set(key, 1); },

    // slots: [{ key, icon (or null: empty), count (or null), cool (0..1: how much of its wait is
    // left), held, dim }]; (cx, bottom): the bar's middle, its bottom (its keys' tabs'); dt: seconds
    draw(slots, cx, bottom, dt) {
      const w = slots.length * SIZE, left = Math.round(cx - w / 2) + 0.5, top = Math.round(bottom - TAB - SIZE) + 0.5;
      ctx.save();
      // The bar: one plate, rounded at the top, square at the bottom
      const bar = new Path2D();
      bar.roundRect(left, top, w, SIZE, [5, 5, 0, 0]);
      ctx.fillStyle = PLATE;
      ctx.fill(bar);
      slots.forEach((s, i) => {
        const x = left + i * SIZE;
        const f = Math.max(0, (flash.get(s.key) ?? 0) - dt * 2.5);
        flash.set(s.key, f);
        ctx.save();
        ctx.clip(bar);
        if (f > 0) {
          ctx.fillStyle = `rgba(255, 255, 255, ${0.3 * f})`;
          ctx.fillRect(x, top, SIZE, SIZE);
        }
        if (s.icon) {
          ctx.save();
          ctx.translate(x + SIZE / 2, top + SIZE / 2 + 1);
          ctx.scale(ICON_SCALE, ICON_SCALE);
          ctx.lineWidth = 1.5 / ICON_SCALE * 1.3; // (about 2px, whatever the scale)
          ctx.lineJoin = 'round';
          ICONS[s.icon](ctx, 0, 0, s.dim);
          ctx.restore();
        }
        if (s.cool > 0) { // its wait, going round
          ctx.beginPath();
          ctx.rect(x, top, SIZE, SIZE);
          ctx.clip();
          ctx.beginPath();
          ctx.moveTo(x + SIZE / 2, top + SIZE / 2);
          ctx.arc(x + SIZE / 2, top + SIZE / 2, SIZE, -Math.PI / 2 + (1 - s.cool) * Math.PI * 2, Math.PI * 1.5);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.fill();
        }
        ctx.restore();
        if (s.count !== null && s.count !== undefined) {
          ctx.font = COUNT;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = s.dim ? '#888' : '#fff';
          ctx.fillText(String(s.count), x + SIZE - 5, top + SIZE - 5);
        }
      });
      // A thick black border inside its edge, and between the slots; the edge round it all, thin and
      // white, as the labels'
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      for (let i = 1; i < slots.length; i++) {
        ctx.beginPath();
        ctx.moveTo(left + i * SIZE, top);
        ctx.lineTo(left + i * SIZE, top + SIZE);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.roundRect(left + 1.5, top + 1.5, w - 3, SIZE - 3, [4, 4, 0, 0]);
      ctx.stroke();
      // Each one's key, out from under the bottom edge (drawn before it: it's under it), as a label's
      slots.forEach((s, i) => {
        const x = left + i * SIZE;
        const kw = Math.max(TAB, Math.round(textWidth(s.key, KEY_FONT) + 12)), kx = Math.round(x + SIZE / 2 - kw / 2) + 0.5, ky = top + SIZE;
        const tab = new Path2D();
        tab.roundRect(kx, ky, kw, TAB, [0, 0, 5, 5]);
        ctx.fillStyle = s.held ? '#fff' : PLATE;
        ctx.fill(tab);
        ctx.strokeStyle = EDGE;
        ctx.lineWidth = 1;
        ctx.stroke(tab);
        ctx.font = KEY_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = s.held ? '#000' : '#fff';
        ctx.fillText(s.key, kx + kw / 2, ky + TAB / 2 + 1);
      });
      ctx.strokeStyle = EDGE; // the thin white line round it, as the labels'
      ctx.lineWidth = 1;
      ctx.stroke(bar);
      ctx.fillStyle = '#fff'; // its thick white edge along the bottom, as a label's along its left
      ctx.fillRect(left - 0.5, top + SIZE - 1.5, w + 1, 3);
      ctx.restore();
    },
  };
}
