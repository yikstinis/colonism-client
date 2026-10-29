// The talents: what a level's point buys, and their window (T), over the middle of the screen while the
// game holds: their cards in rows, like the labels' (a see-through black plate, a thick edge on the left,
// rounded on the right): white once taken (all the way), gold while it can be (a point to spend), dim
// with none. A click on a gold one takes it (a rank of it). The first row's are taken once: without
// them, he stands still to slash or fire, and a reload waits while he runs. The second row's have
// ranks, a point each, shown as pips on the card.

import { FONT, PLATE, EDGE, GOLD, GOLD_EDGE } from '/render/labels.js';

// { id, name, text (what it does), row (0, 1: which row of the window), ranks (how many times it can be
// taken: 1 if not given), needs (a talent to have taken first: the one over it) }
export const TALENTS = [
  { id: 'runslash', name: 'Slash on the run', text: 'Use the knife without stopping', row: 0 },
  { id: 'runfire', name: 'Shoot on the move', text: 'Fire the gun without stopping', row: 0 },
  { id: 'runreload', name: 'Reload on the move', text: 'Keep reloading while running', row: 0 },
  { id: 'quickknife', name: 'Quick knife', text: '-1% of the knife\'s wait', row: 1, ranks: 5, needs: 'runslash' },
  { id: 'quickroll', name: 'Quick roll', text: '-1% of the roll\'s wait', row: 1, ranks: 5, needs: 'runfire' },
  { id: 'quickreload', name: 'Quick reload', text: '-1% of the reload\'s time', row: 1, ranks: 5, needs: 'runreload' },
];
const ranksOf = (t) => t.ranks ?? 1;
// Points all the talents can take, all their ranks (a level for each: see client.js)
export const TALENT_POINTS = TALENTS.reduce((n, t) => n + ranksOf(t), 0);

const CARD_W = 190, CARD_H = 44, GAP = 12, PAD = 16, HEAD = 40; // px
const NAME = `700 12px ${FONT}`, TEXT = `300 11px ${FONT}`, POINTS = `400 12px ${FONT}`;

// ctx: the canvas to draw on
export function createTalents(ctx) {
  const taken = new Map(); // id -> how many of its ranks
  let cards = []; // the cards on screen as last drawn: { id, x0, y0, x1, y1 }

  const rank = (id) => taken.get(id) ?? 0;
  const unlocked = (t) => !t.needs || rank(t.needs) > 0; // (the one it needs taken)
  const can = (t, points) => points > 0 && unlocked(t) && rank(t.id) < ranksOf(t);

  return {
    has: (id) => rank(id) > 0,
    rank, // (how many of its ranks are taken)
    // The ones taken (an id for each rank of it), to keep; and putting them back
    taken: () => [...taken].flatMap(([id, n]) => Array(n).fill(id)),
    restore(ids) {
      for (const id of ids) taken.set(id, rank(id) + 1);
    },
    // Takes the talent under screen point (x, y) if it can be (points: how many he has to spend):
    // returns it, or null
    takeAt(x, y, points) {
      const c = cards.find((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1);
      const t = c && TALENTS.find((t) => t.id === c.id);
      if (!t || !can(t, points)) return null;
      taken.set(t.id, rank(t.id) + 1);
      return t;
    },

    // The window, its middle at (cx, cy): points to spend; mouse: the cursor ({ x, y } or null). Its name
    // and what shuts it go over it, on the HUD's cards (see client.js): returns its box { left, top, w, h }
    draw(cx, cy, points, mouse) {
      const rows = [0, 1].map((r) => TALENTS.filter((t) => t.row === r)).filter((r) => r.length), most = Math.max(...rows.map((r) => r.length));
      const w = PAD * 2 + most * CARD_W + (most - 1) * GAP, h = HEAD + rows.length * CARD_H + (rows.length - 1) * GAP + PAD;
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
      rows.forEach((row, r) => row.forEach((t, i) => {
        const x = left + PAD + i * (CARD_W + GAP), y = top + HEAD + r * (CARD_H + GAP);
        const n = rank(t.id), has = n >= ranksOf(t), open = can(t, points), over = open && mouse && mouse.x >= x && mouse.x <= x + CARD_W && mouse.y >= y && mouse.y <= y + CARD_H;
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_W, CARD_H, [0, 5, 5, 0]);
        ctx.fillStyle = over ? 'rgba(230, 190, 90, 0.18)' : 'rgba(255, 255, 255, 0.04)';
        ctx.fill();
        ctx.strokeStyle = open ? GOLD_EDGE : has ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.12)';
        ctx.stroke();
        ctx.fillStyle = has ? '#fff' : open ? GOLD : 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(x - 0.5, y - 0.5, 3, CARD_H + 1);
        const dim = !has && !open && !n;
        ctx.font = NAME;
        ctx.fillStyle = dim ? '#666' : '#fff';
        ctx.fillText(t.name, x + 11, y + 15);
        ctx.font = TEXT;
        ctx.fillStyle = dim ? '#555' : '#aaa';
        ctx.fillText(unlocked(t) ? t.text : `Needs ${TALENTS.find((o) => o.id === t.needs).name}`, x + 11, y + 31); // (locked: what opens it)
        if (ranksOf(t) > 1) for (let k = 0; k < ranksOf(t); k++) { // its ranks: a pip each, filled as taken (at the top right)
          const px = x + CARD_W - 10 - (ranksOf(t) - k) * 9, py = y + 10;
          ctx.fillStyle = k < n ? '#fff' : 'rgba(255, 255, 255, 0.15)';
          ctx.fillRect(px, py, 6, 6);
        }
        cards.push({ id: t.id, x0: x, y0: y, x1: x + CARD_W, y1: y + CARD_H });
      }));
      ctx.restore();
      return { left, top, w, h };
    },
  };
}
