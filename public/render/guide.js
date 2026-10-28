// The way to the current quest's target: a chevron on a ring around the hero (out by the edge of
// what he sees), pointing at it and pulsing outwards a little, how many meters away it is just inside
// it; it fades out as the target comes close enough to be seen.

import { FONT } from '/render/labels.js';

const DISTANCE = `700 11px ${FONT}`;
const NEAR = 7, FAR = 10; // meters: gone at NEAR, fully there from FAR on

// ctx: the canvas to draw on
export function createGuide(ctx) {
  let clock = 0;
  return {
    // (x, y): the hero's feet on screen; ring: px from them; (dx, dy): towards the target in world
    // units (ground directions aren't foreshortened on screen); meters: how far it is
    draw(x, y, ring, dx, dy, meters, dt) {
      clock += dt;
      const alpha = Math.min(1, Math.max(0, (meters - NEAR) / (FAR - NEAR)));
      if (alpha <= 0) return;
      const a = Math.atan2(dy, dx), r = ring + 3 * Math.sin(clock * 4);
      ctx.save();
      ctx.translate(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.rotate(a);
      // An open chevron, white on a dark rim
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const chevron = () => {
        ctx.beginPath();
        ctx.moveTo(-6, -9);
        ctx.lineTo(4, 0);
        ctx.lineTo(-6, 9);
        ctx.stroke();
      };
      ctx.globalAlpha = 0.7 * alpha;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 6;
      chevron();
      ctx.globalAlpha = 0.9 * alpha;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      chevron();
      ctx.restore();
      // The distance, on the hero's side of the arrow along the same line (upright, whatever the direction)
      const tx = Math.round(x + Math.cos(a) * (r - 34)), ty = Math.round(y + Math.sin(a) * (r - 34));
      const label = `${Math.round(meters)} u`;
      ctx.save();
      ctx.font = DISTANCE;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.7 * alpha;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(label, tx, ty);
      ctx.globalAlpha = 0.9 * alpha;
      ctx.fillStyle = '#fff';
      ctx.fillText(label, tx, ty);
      ctx.restore();
    },
  };
}
