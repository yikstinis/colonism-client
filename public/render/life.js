// Life, the hero's and everything's to be hit alike: a short bar for each point, side by side, red while it's
// left, faint white once lost. A bug's or a thing's in short rows over it, up from it; his round him, a
// ring of as many as go round it, the rest in rings out from it, each centred straight behind him.
// Past the first FADE rows or rings, the farther out, the fainter.

const LEN = 3, THICK = 2, GAP = 1; // px: a point's bar, long and thick; the gap after it (and between rings)
const PERIOD = LEN + GAP;
export const RING_STEP = THICK + GAP, RING_THICK = THICK; // px from one ring to the next; how thick one is
export const BAR_LEN = LEN, BAR_PERIOD = PERIOD; // px: how long a bar is along its ring; from one to the next (the magazine's, in client.js, as these)
const FADE = 2, FADING = 0.75; // the first FADE rows (rings) solid; each one out from them FADING as seen as the last
const ROW = 25, BAR_FADING = 0.85; // over a bug or a thing: bars in a row (about as wide as a bug); its rows fading slower
export const fade = (row, k = FADING) => k ** Math.max(0, row - FADE + 1); // (the magazine's rows fade as the rings: see client.js)
const LEFT = '#e0261c', LOST = 'rgba(255, 255, 255, 0.25)';

// Over a bug or a thing: max bars in rows of ROW, the first's middle at screen (cx, y), the rest up from
// it, each centred; life fills the first row first, each from the left
export function lifeBar(ctx, cx, y, life, max) {
  ctx.save();
  const seen = ctx.globalAlpha;
  for (let row = 0, done = 0; done < max && fade(row, BAR_FADING) > 0.01; row++) {
    const n = Math.min(ROW, max - done), w = n * PERIOD - GAP, x0 = Math.round(cx - w / 2), y0 = Math.round(y) - row * (THICK + GAP);
    ctx.globalAlpha = seen * fade(row, BAR_FADING);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = done + i < life ? LEFT : LOST;
      ctx.fillRect(x0 + i * PERIOD, y0, LEN, THICK);
    }
    done += n;
  }
  ctx.restore();
}

// How many bars go round a ring of radius r
const ringBars = (r) => Math.floor((Math.PI * 2 * r) / PERIOD);

// Round the hero at screen (x, y): the first ring at radius r, as many as go round it (ringBars), the
// rest in a ring out from it; each centred straight behind him (back: straight back from the aim,
// screen radians). Life fills the first ring first; within a ring the lost ones go from its ends (round
// in front), what's left of it straight behind him
export function lifeRing(ctx, x, y, r, back, life, max) {
  ctx.save();
  const seen = ctx.globalAlpha; // (as it's drawn: faded out in a roll, say)
  ctx.lineWidth = THICK;
  for (let row = 0, done = 0; done < max && fade(row) > 0.01; row++) { // (none past where they'd show)
    const rr = r + row * (THICK + GAP), cap = ringBars(rr), n = Math.min(cap, max - done); // (this ring's bars)
    const left = Math.max(0, Math.min(n, life - done)), lost = n - left; // (the left ones in its middle)
    const step = PERIOD / rr, full = n === cap; // (a whole ring's bars go round evenly)
    const from = full ? back - Math.PI : back - (n * step) / 2;
    const at = full ? (Math.PI * 2) / n : step;
    ctx.globalAlpha = seen * fade(row); // (the farther out, the fainter: there, not in the way)
    for (let i = 0; i < n; i++) {
      const a = from + (i + 0.5) * at;
      ctx.beginPath();
      ctx.arc(x, y, rr, a - LEN / 2 / rr, a + LEN / 2 / rr);
      ctx.strokeStyle = i >= Math.floor(lost / 2) && i < Math.floor(lost / 2) + left ? LEFT : LOST;
      ctx.stroke();
    }
    done += n;
  }
  ctx.restore();
}

