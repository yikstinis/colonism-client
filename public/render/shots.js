// A shot's light: a flash at the muzzle (a flame out along the line of fire, sparks) and a tracer streaking off along the line of fire, both
// gone in a moment. Drawn over the dark: they light it up.

const LIFE = 0.2; // seconds a shot's light lasts, its sparks the longest
const TRACER = 0.12; // the tracer, the first part of it
const FLASH = 0.07; // the flash, the first part of that

// ctx: the canvas to draw on
export function createShots(ctx) {
  const shots = []; // { x, y, h (where the muzzle was: world units, meters up), tx, ty (where it went, on the ground), t }
  return {
    // From the muzzle at (x, y), h meters up, to (tx, ty) on the ground: where the aim's dot was
    fire(x, y, h, tx, ty) {
      // Each flash its own: its flame's length and its side tongues' spread, a few sparks thrown forward
      const sparks = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => ({
        a: (Math.random() - 0.5) * 1.2, v: 120 + Math.random() * 160,
      }));
      shots.push({ x, y, h, tx, ty, t: 0, len: 0.8 + 0.5 * Math.random(), side: 0.5 + 0.4 * Math.random(), turn: Math.random() * Math.PI, sparks });
    },
    // The chart moved (re-centered on the hero): carry(point) puts a point of the old one on the new
    carry(carry) {
      for (const s of shots) {
        const m = carry({ x: s.x, y: s.y }), t = carry({ x: s.tx, y: s.ty });
        Object.assign(s, { x: m.x, y: m.y, tx: t.x, ty: t.y });
      }
    },
    // project(x, y, h): a world point and height on screen
    draw(dt, project) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.t += dt;
        if (s.t > LIFE) {
          shots.splice(i, 1);
          continue;
        }
        const p = project(s.x, s.y, s.h), e = project(s.tx, s.ty, 0), k = s.t / LIFE;
        const ex = e.x, ey = e.y, d = Math.hypot(ex - p.x, ey - p.y) || 1, ux = (ex - p.x) / d, uy = (ey - p.y) / d;
        if (s.t < TRACER) {
          const g = ctx.createLinearGradient(p.x, p.y, ex, ey), kt = s.t / TRACER;
          g.addColorStop(0, `rgba(255, 225, 160, ${0.7 * (1 - kt)})`);
          g.addColorStop(1, 'rgba(255, 225, 160, 0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        // Sparks thrown off the muzzle, forward, fading and slowing
        for (const sp of s.sparks) {
          const c = Math.cos(sp.a), sn = Math.sin(sp.a), vx = ux * c - uy * sn, vy = ux * sn + uy * c;
          const r = sp.v * s.t * (1 - 0.5 * k), x = p.x + vx * r, y = p.y + vy * r;
          ctx.strokeStyle = `rgba(255, ${200 - 80 * k}, 90, ${1 - k})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - vx * 4, y - vy * 4);
          ctx.stroke();
        }
        if (s.t < FLASH) {
          const f = 1 - s.t / FLASH;
          // A wide glow lighting up the hero and the ground around him
          const R = 64, glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
          glow.addColorStop(0, `rgba(255, 245, 210, ${0.9 * f})`);
          glow.addColorStop(0.25, `rgba(255, 180, 80, ${0.45 * f})`);
          glow.addColorStop(1, 'rgba(255, 120, 30, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
          // The flame: a long tongue out along the line of fire, two short ones off its sides and a
          // star of small spikes round the muzzle, white hot at the root
          const tongue = (a, len, w) => {
            const c = Math.cos(a), sn = Math.sin(a), vx = ux * c - uy * sn, vy = ux * sn + uy * c;
            const tip = len * (0.6 + 0.4 * f), g = ctx.createLinearGradient(p.x, p.y, p.x + vx * tip, p.y + vy * tip);
            g.addColorStop(0, `rgba(255, 250, 225, ${f})`);
            g.addColorStop(0.4, `rgba(255, 190, 90, ${0.85 * f})`);
            g.addColorStop(1, 'rgba(255, 110, 30, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(p.x - vy * w, p.y + vx * w);
            ctx.quadraticCurveTo(p.x + vx * tip * 0.45 - vy * w * 1.6, p.y + vy * tip * 0.45 + vx * w * 1.6, p.x + vx * tip, p.y + vy * tip);
            ctx.quadraticCurveTo(p.x + vx * tip * 0.45 + vy * w * 1.6, p.y + vy * tip * 0.45 - vx * w * 1.6, p.x + vy * w, p.y - vx * w);
            ctx.closePath();
            ctx.fill();
          };
          tongue(0, 42 * s.len, 4);
          tongue(s.side, 18, 2.5);
          tongue(-s.side, 18, 2.5);
          for (let j = 0; j < 4; j++) tongue(s.turn + j * Math.PI / 2, 9, 1.5);
          const core = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
          core.addColorStop(0, `rgba(255, 255, 245, ${f})`);
          core.addColorStop(1, 'rgba(255, 230, 160, 0)');
          ctx.fillStyle = core;
          ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
        }
      }
      ctx.restore();
    },
  };
}
