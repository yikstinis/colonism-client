// Where a knife slash reaches: a sector on the sand in front of the hero, towards where he aims, under
// everything standing or lying there, fading out to its sides. Faint while he's armed, so the reach
// shows; in a slash it flares up;
// from then till the knife's ready again it's pink, going back to white.
// The gun's range goes on beyond it as a dashed line, a small arc at its end; firing, the cone
// between (where the rounds go) is lit faintly, flaring with each one. Anything solid in the way (the
// capsule, a fire) cuts them all short.

// ctx: the canvas to draw on
export function createReach(ctx) {
  let flare = 0; // 1 right after a slash, fading out
  let shown = 1; // fades to 0 while hidden (in a roll), and back
  return {
    // (x, y): the hero's feet on screen; radius: px; angle: towards the aim (screen, radians); arc:
    // the sector's width (radians); slash: how far through a slash (0..1), or null; dt: seconds;
    // hidden: fade it out (rolling, say); range: px, the pistol's, shown as a dashed line on along the
    // aim from the sector's edge, ending in a small arc at that range (fading out to its ends)
    // limit(a, px): how far (px) a reach along screen angle a gets before something solid stops it;
    // spread: how far the gun's aim sways either way (radians); fire: how lit the cone is (0: not
    // firing; 1 as a round goes off, fading to a glow while the trigger's held); cooling: how far the
    // knife has yet to go till it's ready again (1 as a slash starts, 0 ready): the sector pink, then white
    draw(x, y, radius, angle, arc, slash, dt, hidden = false, range = 0, limit = (a, px) => px, spread = 0, fire = 0, cooling = 0) {
      flare = slash !== null ? 1 : Math.max(0, flare - dt * 3);
      shown = hidden ? 0 : Math.min(1, shown + dt / 0.15); // gone in a frame, back gently
      if (shown <= 0) return;
      const from = angle - arc / 2;
      const tint = `255, ${Math.round(255 - 115 * cooling)}, ${Math.round(255 - 125 * cooling)}`; // (white, or as pink as it has yet to cool)
      // No side edges: brightest where he aims, fading out to nothing towards both sides (a gradient
      // round the hero), the fill and the outer edge alike
      const fade = (alpha) => {
        const g = ctx.createConicGradient(from, x, y), span = arc / (Math.PI * 2);
        g.addColorStop(0, `rgba(${tint}, 0)`);
        g.addColorStop(span / 2, `rgba(${tint}, ${alpha})`);
        g.addColorStop(span, `rgba(${tint}, 0)`);
        g.addColorStop(1, `rgba(${tint}, 0)`);
        return g;
      };
      // The sector's outline, ray by ray: each stops where something solid is in the way
      const STEPS = 40, edge = [];
      for (let i = 0; i <= STEPS; i++) {
        const a = from + (arc * i) / STEPS, r = limit(a, radius);
        edge.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
      }
      ctx.save();
      ctx.globalAlpha = shown;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (const [px, py] of edge) ctx.lineTo(px, py);
      ctx.closePath();
      ctx.fillStyle = fade(0.05 + 0.07 * flare + 0.05 * cooling); // (a touch stronger while pink, so it shows)
      ctx.fill();
      ctx.beginPath();
      edge.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]); // the reach's edge, dashed
      ctx.strokeStyle = fade(0.3 + 0.2 * flare);
      ctx.stroke();
      ctx.setLineDash([]);
      // Firing: the cone the rounds go into, lit faintly (paler than a slash): from just past the
      // knife's reach (where the range's dashed line starts) out to the range's arc
      if (fire > 0 && range > radius + 6) {
        const STEPS = 16, from = radius + 6, at = (i) => angle - spread + (2 * spread * i) / STEPS;
        ctx.beginPath();
        for (let i = 0; i <= STEPS; i++) { // out along the arc...
          const a = at(i), r = Math.max(from, limit(a, range));
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        for (let i = STEPS; i >= 0; i--) ctx.lineTo(x + Math.cos(at(i)) * from, y + Math.sin(at(i)) * from); // ...and back round the inside
        ctx.closePath();
        // (brightest along the aim, fading out to nothing towards both sides, as the slash's sector)
        const g = ctx.createConicGradient(angle - spread, x, y), span = (2 * spread) / (Math.PI * 2);
        g.addColorStop(0, 'rgba(255, 255, 255, 0)');
        g.addColorStop(span / 2, `rgba(255, 255, 255, ${0.06 * fire})`);
        g.addColorStop(span, 'rgba(255, 255, 255, 0)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fill();
      }
      const reachAt = limit(angle, range);
      if (range > radius && reachAt > radius + 6) {
        const c = Math.cos(angle), sn = Math.sin(angle), x0 = x + c * (radius + 6), y0 = y + sn * (radius + 6);
        const x1 = x + c * reachAt, y1 = y + sn * reachAt;
        const g = ctx.createLinearGradient(x0, y0, x + c * range, y + sn * range);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
        g.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 6]);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        // The arc at the end, dashed too, a little brighter in the middle than at its ends; ray by ray
        // like the sector's edge, so where something solid is in the way it follows that
        const span = spread, ENDS = 10, ends = []; // either way from the aim (radians)
        for (let i = 0; i <= ENDS; i++) {
          const a = angle - span + (2 * span * i) / ENDS, r = limit(a, range);
          ends.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
        }
        const end = ctx.createConicGradient(angle - span, x, y);
        end.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        end.addColorStop(span / (Math.PI * 2), 'rgba(255, 255, 255, 0.35)');
        end.addColorStop((2 * span) / (Math.PI * 2), 'rgba(255, 255, 255, 0.15)');
        end.addColorStop(1, 'rgba(255, 255, 255, 0.15)');
        ctx.strokeStyle = end;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ends.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    },

    // His health: a ring round him on the sand, dashed, a dash for each point, going round from the
    // back (back: straight back from the aim, screen radians; lost ones faint white, going first), the disc
    // inside lit faintly: green, full; the less he has, the redder, and the more it pulses (faster,
    // deeper). The dashes stay as they are. time: seconds, for the pulse
    health(x, y, radius, back, hp, max, time) {
      if (shown <= 0) return;
      const hurt = 1 - hp / max, mix = (a, b) => Math.round(a + (b - a) * hurt);
      const tint = `${mix(110, 255)}, ${mix(230, 95)}, ${mix(120, 80)}`; // (green, to red)
      const pulse = 1 + 0.7 * hurt * Math.sin(time * Math.PI * 2 * (0.8 + 1.6 * hurt)); // (none at full health)
      ctx.save();
      ctx.globalAlpha = shown;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${tint}, ${(0.07 + 0.05 * hurt) * pulse})`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      const step = (Math.PI * 2) / max, gap = step * 0.3;
      for (let i = 0; i < max; i++) { // (from straight back, clockwise on screen; the last ones lost first)
        const a = back + i * step - step / 2;
        ctx.beginPath();
        ctx.arc(x, y, radius, a + gap / 2, a + step - gap / 2);
        ctx.strokeStyle = i < hp ? 'rgba(110, 230, 120, 0.45)' : 'rgba(255, 255, 255, 0.15)'; // (green, steady; lost: faint white)
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}
