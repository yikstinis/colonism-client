// The minimap: the planet as a little globe in the bottom left corner, the hero always at its center
// (an arrow, the way he faces), turning under him as he goes; a grid of parallels and meridians so the
// turning shows, marks on it (the capsule). Drawn like the reach overlay: a faint white wash,
// dashed lines.

import { add, dot, rotate, scale } from '/shared/sphere.js';
import { POLE, EAST, THIRD, STEP, lonOf, latOf, nameOf } from '/shared/grid.js';

export const RADIUS = 85; // px, in the corner
export const MARGIN = 18;

// ctx: the canvas to draw on
export function createGlobe(ctx) {
  let hover = null; // the cell under the cursor as last drawn: { name }, or null
  return {
    // The cell under the cursor (see draw), or null
    hovered: () => hover,
    // view: { o (the hero's point), u, r (the screen's up and right there) }; dir: (dx, dy), the way
    // he faces on screen; marks: [{ at (a point of the ball), color }]; place: { x, y, r, dot, arrow }
    // (px), where the globe is, how big, how big its marks, the hero's arrow (times; the corner, by default);
    // cells: [{ at (a point of the ball), to (another, or none), color, hatch (a color: hatched across in it) }]: the grid's cell each is in
    // (between two parallels and two meridians; a triangle at a pole), or all the cells from the one at's
    // in to the one to's (the block of them between), filled in (a part of it done, say). Gives the marks on the near
    // side, where they are: [{ mark, x, y }]. pointer: the cursor ({ x, y }, or null), its cell picked
    // out (lit faintly, its name along its bottom edge; kept for hovered()). look: { o, u, r }, the way the
    // ball is looked at (turned on the map by dragging it; the hero's own view, by default): his arrow
    // then where his point is on it, and only on its near side
    draw(view, dir, marks, place = null, cells = [], pointer = null, look = view) {
      const H = ctx.canvas.height;
      const { x: cx, y: cy, r: R, dot: size = 3, arrow = 1 } = place ?? { x: MARGIN + RADIUS, y: H - MARGIN - RADIUS, r: RADIUS };
      // A point of the ball on the globe: where (px), and how much it faces us (>0: the near side)
      const onGlobe = (q) => ({ x: cx + dot(q, look.r) * R, y: cy - dot(q, look.u) * R, z: dot(q, look.o) });
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
      // The cells: each the grid's square it's in (STEP apart, both ways), or a block of them, its edges
      // along the parallels and meridians, filled (the near side of it)
      const at = (lat, lon) => add(scale(POLE, Math.sin(lat)), scale(add(scale(EAST, Math.cos(lon)), scale(THIRD, Math.sin(lon))), Math.cos(lat)));
      const cellOf = (q) => [Math.floor(latOf(q) / STEP), Math.floor(lonOf(q) / STEP)];
      // A block of cells filled: from lat la0 to la1, lon lo0 to lo1, its edges along the parallels and
      // meridians (the near side of it)
      const fillBlock = (la0, la1, lo0, lo1, color, hatch = null) => {
        const edge = [], n = (from, to) => Math.max(12, Math.round((Math.abs(to - from) / STEP) * 12)); // (points along an edge)
        for (let i = 0, k = n(lo0, lo1); i <= k; i++) edge.push(at(la0, lo0 + ((lo1 - lo0) * i) / k)); // along the lower parallel...
        for (let i = 0, k = n(la0, la1); i <= k; i++) edge.push(at(la0 + ((la1 - la0) * i) / k, lo1)); // ...up a meridian...
        for (let i = 0, k = n(lo0, lo1); i <= k; i++) edge.push(at(la1, lo1 - ((lo1 - lo0) * i) / k)); // ...back along the upper one...
        for (let i = 0, k = n(la0, la1); i <= k; i++) edge.push(at(la1 - ((la1 - la0) * i) / k, lo0)); // ...and down the other
        ctx.beginPath();
        let any = false;
        for (const e of edge) {
          const g = onGlobe(e);
          if (g.z <= 0) continue;
          if (any) ctx.lineTo(g.x, g.y);
          else ctx.moveTo(g.x, g.y);
          any = true;
        }
        if (!any) return;
        ctx.closePath();
        if (color) {
          ctx.fillStyle = color;
          ctx.fill();
        }
        if (hatch) { // diagonal lines across it, inside it only
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = hatch;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let d = -2 * R; d < 2 * R; d += 6) {
            ctx.moveTo(cx + d - R, cy - R);
            ctx.lineTo(cx + d + R, cy + R);
          }
          ctx.stroke();
          ctx.restore();
        }
      };
      for (const { at: q, to = q, color = null, hatch = null } of cells) {
        const [a, b] = [cellOf(q), cellOf(to)]; // (the block's corners, in cells)
        fillBlock(Math.min(a[0], b[0]) * STEP, (Math.max(a[0], b[0]) + 1) * STEP, Math.min(a[1], b[1]) * STEP, (Math.max(a[1], b[1]) + 1) * STEP, color, hatch);
      }
      // The cell under the cursor (on the near side of the ball): lit faintly, its name along its bottom edge
      hover = null;
      const px = pointer && (pointer.x - cx) / R, py = pointer && -(pointer.y - cy) / R;
      if (pointer && px * px + py * py < 1) {
        const q = add(add(scale(look.r, px), scale(look.u, py)), scale(look.o, Math.sqrt(1 - px * px - py * py)));
        const row = Math.floor(latOf(q) / STEP), col = Math.floor(lonOf(q) / STEP);
        fillBlock(row * STEP, (row + 1) * STEP, col * STEP, (col + 1) * STEP, 'rgba(255, 255, 255, 0.12)');
        // Its name, small, along its bottom edge on screen (as if written on the ball): from that edge's
        // left end, just over it, turned as it runs
        const [c00, c01, c11, c10] = [[row, col], [row, col + 1], [row + 1, col + 1], [row + 1, col]].map(([r, c]) => onGlobe(at(r * STEP, c * STEP)));
        const edges = [[c00, c01], [c01, c11], [c11, c10], [c10, c00]].filter(([a, b]) => a.z > 0 && b.z > 0 && Math.hypot(a.x - b.x, a.y - b.y) > 4);
        const bottom = edges.sort((e, f) => f[0].y + f[1].y - (e[0].y + e[1].y))[0];
        if (bottom) {
          const [l, r] = bottom[0].x < bottom[1].x ? bottom : [bottom[1], bottom[0]];
          const len = Math.hypot(r.x - l.x, r.y - l.y), ux = (r.x - l.x) / len, uy = (r.y - l.y) / len;
          ctx.save();
          ctx.translate(l.x + ux * 6 + uy * 4, l.y + uy * 6 - ux * 4); // (a little along it, a little over it)
          ctx.rotate(Math.atan2(uy, ux));
          ctx.font = `400 9px "Open Sans", Arial, sans-serif`; // (small, plain, grey: just a note on it)
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
          ctx.fillText(nameOf(row, col), 0, 0);
          ctx.restore();
        }
        hover = { name: nameOf(row, col) };
      }
      ctx.restore();
      ctx.save();
      // The marks on the near side, whole even right at the rim (not clipped by the ball)
      const shown = [];
      for (const mark of marks) {
        const g = onGlobe(mark.at);
        if (g.z <= 0) continue;
        ctx.beginPath();
        ctx.arc(g.x, g.y, size, 0, Math.PI * 2);
        ctx.lineWidth = 3; // (on a dark rim, as the hero's arrow)
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.stroke();
        ctx.fillStyle = mark.color;
        ctx.fill();
        shown.push({ mark, x: g.x, y: g.y });
      }
      // The hero: an arrow at his point (the center, unturned), the way he faces, white on a dark rim
      const me = onGlobe(view.o), way = add(scale(view.r, dir.dx), scale(view.u, -dir.dy)); // (the way he faces, on the ball)
      if (me.z <= 0) {
        ctx.restore();
        return shown;
      }
      const a = Math.atan2(-dot(way, look.u), dot(way, look.r));
      ctx.translate(me.x, me.y);
      ctx.rotate(a);
      ctx.scale(arrow, arrow);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3 / arrow; // (a dark rim round it, as wide whatever its size: not lost among the white marks)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
      return shown;
    },
  };
}
