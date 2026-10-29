// A new level: a spotlight on him from above the screen. A wide cone of warm light fades in on him,
// breathing, dust drifting down through it, and stays on him while he has a talent point to spend;
// it goes out once they're spent.
// All in screen px; the caller says where he stands (see client.js).

const MOTES = 28; // dust drifting down through it
const BEAM = { top: 70, bottom: 190, over: 60 }; // px: how wide it is at the top of the screen and at his feet; how far above the screen it comes from
const IN = 0.5; // s: coming on
const OUT = 0.6; // s: going out

// ctx: the canvas to draw on
export function createLevelUp(ctx) {
  let age = Infinity; // s since the last new level
  let shown = 0; // the spotlight: 1 on, 0 out
  let clock = 0; // s, for its breathing
  const motes = Array.from({ length: MOTES }, () => ({ u: Math.random() * 2 - 1, v: Math.random(), speed: 0.04 + Math.random() * 0.08, phase: Math.random() * 10 })); // u across it (-1..1), v down it (0..1)

  return {
    // A new level: it comes on
    start() {
      age = 0;
    },

    // Over everything, the dark too (it lights him up). (cx, cy) his feet; dt: seconds since the last
    // frame; on: a talent point still to spend (the spotlight stays while it is)
    over(cx, cy, dt, on) {
      age += dt;
      clock += dt;
      if (on && age < Infinity) shown = Math.min(1, shown + dt / IN);
      else shown = Math.max(0, shown - dt / OUT);
      if (shown <= 0) return;
      const body = cy - 30;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // The cone: from above the screen down past his feet; brightest round him, fading out under his
      // feet. Many thin layers, wide to narrow, adding up to soft edges
      const top = -BEAM.over, bottom = cy + 30;
      const breathe = 1 + 0.06 * Math.sin(clock * 2.1) + 0.04 * Math.sin(clock * 5.3);
      const light = shown * 0.7 * breathe;
      const half = (y, k) => ((BEAM.top + (BEAM.bottom - BEAM.top) * ((y - top) / (bottom - top))) * k) / 2; // its half-width at y
      for (let i = 0; i < 12; i++) {
        const k = 1 - i * 0.075, a = 0.045, c = `255, ${215 + i * 3}, ${165 + i * 7}`; // (a little warm out at the edges, near white in)
        const g = ctx.createLinearGradient(0, top, 0, bottom);
        g.addColorStop(0, `rgba(${c}, ${0.35 * a * light})`);
        g.addColorStop(Math.max(0, (body - 20 - top) / (bottom - top)), `rgba(${c}, ${a * light})`);
        g.addColorStop(1, `rgba(${c}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(cx - half(top, k), top);
        ctx.lineTo(cx + half(top, k), top);
        ctx.lineTo(cx + half(bottom, k), bottom);
        ctx.lineTo(cx - half(bottom, k), bottom);
        ctx.fill();
      }
      // The light on him: a warm glow round him while it's on
      const halo = shown * 0.25, r = 55;
      const g = ctx.createRadialGradient(cx, body, 0, cx, body, r);
      g.addColorStop(0, `rgba(255, 250, 238, ${0.7 * halo})`);
      g.addColorStop(0.4, `rgba(255, 220, 160, ${0.35 * halo})`);
      g.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - r, body - r, r * 2, r * 2);
      // Dust in it: specks drifting down, swaying, glinting; on the art's pixels
      for (const m of motes) {
        m.v += m.speed * dt;
        if (m.v > 1) Object.assign(m, { v: 0, u: Math.random() * 2 - 1 });
        const y = top + (bottom - 40 - top) * m.v, x = cx + (m.u + 0.08 * Math.sin(clock * 0.8 + m.phase)) * half(y, 0.8);
        const glint = 0.4 + 0.6 * Math.max(0, Math.sin(clock * 2 + m.phase * 3)), edge = Math.min(1, m.v * 6, (1 - m.v) * 6);
        ctx.fillStyle = `rgba(255, 248, 232, ${0.5 * shown * glint * edge})`;
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
      ctx.restore();
    },
  };
}
