// The minimap: the planet as a little globe in the bottom left corner, the hero always at its center
// (an arrow, the way he faces), turning under him as he goes; a grid of parallels and meridians so the
// turning shows, marks on it (the capsule). Drawn like the reach overlay: a faint white wash,
// dashed lines.

import { add, dot, rotate, scale } from '/shared/sphere.js';

export const RADIUS = 85; // px, in the corner
export const MARGIN = 18;
// The grid's axis, and two more square to it (any fixed ones will do)
const POLE = [0, 1, 0], EAST = [1, 0, 0], THIRD = [0, 0, 1];

// ctx: the canvas to draw on
export function createGlobe(ctx) {
  return {
    // view: { o (the hero's point), u, r (the screen's up and right there) }; dir: (dx, dy), the way
    // he faces on screen; marks: [{ at (a point of the ball), color }]; place: { x, y, r, dot, arrow }
    // (px), where the globe is, how big, how big its marks, the hero's arrow (times; the corner, by default). Gives the marks on
    // the near side, where they are: [{ mark, x, y }]
    draw(view, dir, marks, place = null) {
      const H = ctx.canvas.height;
      const { x: cx, y: cy, r: R, dot: size = 3, arrow = 1 } = place ?? { x: MARGIN + RADIUS, y: H - MARGIN - RADIUS, r: RADIUS };
      // A point of the ball on the globe: where (px), and how much it faces us (>0: the near side)
      const onGlobe = (q) => ({ x: cx + dot(q, view.r) * R, y: cy - dot(q, view.u) * R, z: dot(q, view.o) });
      ctx.save();
      // The ball: no rim, just a faint white wash like the melee reach's, shaded round: a highlight up
      // and to the left fading across it, and a touch lighter again at the limb
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();
      const light = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, 0, cx - R * 0.35, cy - R * 0.4, R * 1.5);
      light.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
      light.addColorStop(0.45, 'rgba(255, 255, 255, 0.04)');
      light.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
      ctx.fillStyle = light;
      ctx.fill();
      const limb = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
      limb.addColorStop(0, 'rgba(255, 255, 255, 0)');
      limb.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
      ctx.fillStyle = limb;
      ctx.fill();
      ctx.lineWidth = 1;
      // The grid: dashed circles on the near side only, fainter towards the rim (stroked a piece at a
      // time for the fading, the dashes carried on from piece to piece)
      ctx.setLineDash([3, 3]);
      const curve = (point) => {
        let prev = null, run = 0;
        for (let i = 0; i <= 144; i++) {
          const g = onGlobe(point((i / 144) * Math.PI * 2));
          if (prev && g.z > 0 && prev.z > 0) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + 0.2 * Math.min(g.z, prev.z)})`;
            ctx.lineDashOffset = run;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(g.x, g.y);
            ctx.stroke();
            run += Math.hypot(g.x - prev.x, g.y - prev.y);
          }
          prev = g;
        }
      };
      const circle = (a, b, k) => (t) => scale(add(scale(a, Math.cos(t)), scale(b, Math.sin(t))), k); // radius k, in the plane of a and b
      for (const lat of [-60, -30, 0, 30, 60].map((d) => (d * Math.PI) / 180)) { // parallels
        const ring = circle(EAST, THIRD, Math.cos(lat));
        curve((t) => add(ring(t), scale(POLE, Math.sin(lat))));
      }
      for (let k = 0; k < 6; k++) curve(circle(rotate(EAST, POLE, (k * Math.PI) / 6), POLE, 1)); // meridians, through the poles
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.restore();
      ctx.save();
      // The marks on the near side, whole even right at the rim (not clipped by the ball)
      const shown = [];
      for (const mark of marks) {
        const g = onGlobe(mark.at);
        if (g.z <= 0) continue;
        ctx.beginPath();
        ctx.arc(g.x, g.y, size, 0, Math.PI * 2);
        ctx.fillStyle = mark.color;
        ctx.fill();
        shown.push({ mark, x: g.x, y: g.y });
      }
      // The hero: an arrow at the center, the way he faces
      const a = Math.atan2(dir.dy, dir.dx);
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.scale(arrow, arrow);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
      return shown;
    },
  };
}
