// The talents: what a level's point buys, and their window (T), over the middle of the screen while the
// game holds: a card for each in a row, like the labels' (a see-through black plate, a thick edge on
// the left, rounded on the right): white once taken, gold while it can be (a point to spend), dim
// with none. A click on a gold one takes it. Without them, he stands still to slash or fire, and a
// reload waits while he runs.

import { FONT, PLATE, EDGE, GOLD, GOLD_EDGE } from '/render/labels.js';

// { id, name, text (what it does) }
export const TALENTS = [
  { id: 'runslash', name: 'Slash on the run', text: 'Use the knife without stopping' },
  { id: 'runfire', name: 'Shoot on the move', text: 'Fire the gun without stopping' },
  { id: 'runreload', name: 'Reload on the move', text: 'Keep reloading while running' },
];

const CARD_W = 190, CARD_H = 44, GAP = 12, PAD = 16, HEAD = 40; // px
const NAME = `700 12px ${FONT}`, TEXT = `300 11px ${FONT}`, POINTS = `400 12px ${FONT}`;

// ctx: the canvas to draw on
export function createTalents(ctx) {
  const taken = new Set();
  let cards = []; // the cards on screen as last drawn: { id, x0, y0, x1, y1 }

  const can = (t, points) => points > 0 && !taken.has(t.id);

  return {
    has: (id) => taken.has(id),
    // The ones taken (their ids), to keep; and putting them back
    taken: () => [...taken],
    restore(ids) {
      for (const id of ids) taken.add(id);
    },
    // Takes the talent under screen point (x, y) if it can be (points: how many he has to spend):
    // returns it, or null
    takeAt(x, y, points) {
      const c = cards.find((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1);
      const t = c && TALENTS.find((t) => t.id === c.id);
      if (!t || !can(t, points)) return null;
      taken.add(t.id);
      return t;
    },

    // The window, its middle at (cx, cy): points to spend; mouse: the cursor ({ x, y } or null). Its name
    // and what shuts it go over it, on the HUD's cards (see client.js): returns its box { left, top, w, h }
    draw(cx, cy, points, mouse) {
      const w = PAD * 2 + TALENTS.length * CARD_W + (TALENTS.length - 1) * GAP, h = HEAD + CARD_H + PAD;
      const left = Math.round(cx - w / 2) + 0.5, top = Math.round(cy - h / 2) + 0.5;
      ctx.save();
      ctx.fillStyle = 'rgba(4, 3, 8, 0.6)'; // the world dimmed behind it
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.beginPath();
      ctx.roundRect(left, top, w, h, [0, 5, 5, 0]);
      ctx.fillStyle = PLATE;
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(left - 0.5, top - 0.5, 3, h + 1);
      ctx.textBaseline = 'middle';
      ctx.font = POINTS;
      ctx.textAlign = 'right';
      ctx.fillStyle = points ? GOLD : '#aaa';
      ctx.fillText(`${points} point${points === 1 ? '' : 's'} to spend`, left + w - PAD, top + HEAD / 2);
      ctx.textAlign = 'left';
      cards = [];
      TALENTS.forEach((t, i) => {
        const x = left + PAD + i * (CARD_W + GAP), y = top + HEAD;
        const has = taken.has(t.id), open = can(t, points), over = open && mouse && mouse.x >= x && mouse.x <= x + CARD_W && mouse.y >= y && mouse.y <= y + CARD_H;
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_W, CARD_H, [0, 5, 5, 0]);
        ctx.fillStyle = over ? 'rgba(230, 190, 90, 0.18)' : 'rgba(255, 255, 255, 0.04)';
        ctx.fill();
        ctx.strokeStyle = open ? GOLD_EDGE : has ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();
        ctx.fillStyle = has ? '#fff' : open ? GOLD : 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x - 0.5, y - 0.5, 3, CARD_H + 1);
        const dim = !has && !open;
        ctx.font = NAME;
        ctx.fillStyle = dim ? '#666' : '#fff';
        ctx.fillText(t.name, x + 11, y + 15);
        ctx.font = TEXT;
        ctx.fillStyle = dim ? '#555' : '#aaa';
        ctx.fillText(t.text, x + 11, y + 31);
        cards.push({ id: t.id, x0: x, y0: y, x1: x + CARD_W, y1: y + CARD_H });
      });
      ctx.restore();
      return { left, top, w, h };
    },
  };
}
