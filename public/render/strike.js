// The rocket strike's overlays: the zone where it will come down, its shadow growing on it, the
// flame at its tail, the blast. All in screen px; the caller works out where (see client.js). The
// rocket itself and its crater are sprites (tools/make-art.mjs).

// ctx: the canvas to draw on
export function createStrike(ctx) {
  return {
    // The danger zone, styled like the knife's reach (see reach.js) but red: a faint wash, a thin
    // dashed edge, pulsing gently over time t (seconds). urgency (0..1, the shell coming) counts
    // down on it: a bolder dashed line drawing itself round the edge from the top, closed as the
    // shell lands, and the wash reddening and the pulse quickening as it goes
    zone(cx, cy, r, t, urgency = 0) {
      const beat = 0.5 + 0.5 * Math.sin(t * (6 + 14 * urgency));
      ctx.save();
      ctx.fillStyle = `rgba(255, 60, 50, ${0.015 + 0.015 * beat + 0.06 * urgency})`;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.setLineDash([4, 4]); // its edge dashed, like the reach's, turning slowly
      ctx.lineDashOffset = -t * 8;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255, 60, 50, ${0.14 + 0.07 * beat})`;
      ctx.stroke();
      if (urgency > 0) { // dashed too, its dashes on the edge's (it starts a three-quarter turn along)
        ctx.lineDashOffset = -t * 8 + r * Math.PI * 1.5;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255, 60, 50, 0.32)';
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * urgency);
        ctx.stroke();
      }
      ctx.restore();
    },
    // The rocket's exhaust at (x, y): a flickering hot glow (t: seconds, for the flicker)
    exhaust(x, y, t) {
      const r = 9 + 3 * Math.sin(t * 60) + 2 * Math.sin(t * 37);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      g.addColorStop(0, 'rgba(255, 245, 200, 0.95)');
      g.addColorStop(0.3, 'rgba(255, 170, 60, 0.7)');
      g.addColorStop(1, 'rgba(255, 80, 20, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.restore();
    },
    // The rocket's shadow on the ground under it, darker and tighter as it comes down (k: 0 high up
    // .. 1 landing)
    shadow(cx, cy, k) {
      const r = 10 + 30 * (1 - k);
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + 0.4 * k})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },
    // The blast, age seconds after it went off: a flash lighting everything up and a ring of air
    // rushing out (r: the zone's radius; it reaches well past it)
    blast(cx, cy, r, age) {
      const flash = Math.max(0, 1 - age / 0.5);
      if (flash > 0) { // the whole screen lit up for a moment
        ctx.save();
        ctx.fillStyle = `rgba(255, 200, 140, ${0.35 * flash ** 2})`;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
      }
      r *= 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (flash > 0) {
        const fr = r * (0.8 + 0.8 * (1 - flash));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
        g.addColorStop(0, `rgba(255, 250, 220, ${flash})`);
        g.addColorStop(0.35, `rgba(255, 170, 60, ${0.85 * flash})`);
        g.addColorStop(1, 'rgba(255, 80, 20, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      const ring = age / 0.45;
      if (ring < 1) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - ring)})`;
        ctx.lineWidth = 3 * (1 - ring) + 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * 2.2 * ring, r * 2.2 * ring * 0.85, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}
