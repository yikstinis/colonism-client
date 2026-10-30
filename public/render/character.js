// The character: his stats and their window (C), open once he's a buff to choose (see buffs.js) or a point in one,
// over the middle of the screen while the game holds, as the talents' is (see talents.js): a card for
// each stat, side by side: how much of it he has out of STAT_MAX, a bar filling up to it, what it gives
// him now; under them the stats to come, locked, till all three are at their most.

import { FONT, PLATE, EDGE } from '/render/labels.js';

const WHITE_EDGE = 'rgba(255, 255, 255, 0.5)'; // (white all over, as the talents' taken ones)

export const STAT_MAX = 75; // the most a stat can be

// { id, name, text (what it gives at n) }
export const STATS = [
  { id: 'strength', name: 'Strength', text: (n) => `+${n} health` },
  { id: 'agility', name: 'Agility', text: (n) => `+${n}% movement speed` },
  { id: 'intelligence', name: 'Intelligence', text: (n) => `+${n}% smart strikes: x2 damage` },
];

const CARD_W = 190, CARD_H = 58, GAP = 12, PAD = 16, HEAD = 40, LOCKED_H = 44; // px
const NAME = `700 12px ${FONT}`, TEXT = `300 11px ${FONT}`, VALUE = `400 12px ${FONT}`;

// ctx: the canvas to draw on
export function createCharacter(ctx) {
  const stats = Object.fromEntries(STATS.map((s) => [s.id, 0]));
  return {
    stats, // id -> how much of it he has
    // One more of it, if it's not at its most: true if it went up
    raise(id) {
      if (stats[id] >= STAT_MAX) return false;
      stats[id]++;
      return true;
    },
    maxed: (id) => stats[id] >= STAT_MAX,
    // Any point in a stat yet
    any: () => Object.values(stats).some((n) => n > 0),
    // Them as kept at the checkpoint (see client.js)
    restore(saved) {
      for (const s of STATS) stats[s.id] = Math.min(saved?.[s.id] ?? 0, STAT_MAX);
    },

    // The window, its middle at (cx, cy). Its name and what shuts it go over it, on the HUD's cards
    // (see client.js): returns its box { left, top, w, h }
    draw(cx, cy) {
      const w = PAD * 2 + STATS.length * CARD_W + (STATS.length - 1) * GAP, h = HEAD + CARD_H + GAP + LOCKED_H + PAD;
      const left = Math.round(cx - w / 2) + 0.5, top = Math.round(cy - h / 2) + 0.5;
      const card = (x, y, cw, ch, edge, bar) => {
        ctx.beginPath();
        ctx.roundRect(x, y, cw, ch, [0, 5, 5, 0]);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.stroke();
        ctx.fillStyle = bar;
        ctx.fillRect(x - 0.5, y - 0.5, 3, ch + 1);
      };
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
      ctx.textAlign = 'left';
      ctx.font = NAME;
      ctx.fillStyle = '#fff';
      ctx.fillText('Stats', left + PAD, top + HEAD / 2);
      STATS.forEach((s, i) => {
        const x = left + PAD + i * (CARD_W + GAP), y = top + HEAD, n = stats[s.id];
        card(x, y, CARD_W, CARD_H, WHITE_EDGE, '#fff');
        ctx.font = NAME;
        ctx.fillStyle = '#fff';
        ctx.fillText(s.name, x + 11, y + 15);
        ctx.font = VALUE;
        ctx.textAlign = 'right';
        ctx.fillStyle = '#fff';
        ctx.fillText(`${n} / ${STAT_MAX}`, x + CARD_W - 10, y + 15);
        ctx.textAlign = 'left';
        ctx.font = TEXT;
        ctx.fillStyle = n ? '#aaa' : '#666';
        ctx.fillText(s.text(n), x + 11, y + 31);
        // How far it's come: a bar filling up to STAT_MAX
        const bx = x + 11, bw = CARD_W - 21, by = y + 44;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(bx, by, bw, 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx, by, Math.round((bw * n) / STAT_MAX), 4);
      });
      // The stats to come: locked till all three are at their most
      const open = STATS.every((s) => stats[s.id] >= STAT_MAX), y = top + HEAD + CARD_H + GAP;
      card(left + PAD, y, w - PAD * 2, LOCKED_H, open ? WHITE_EDGE : 'rgba(255, 255, 255, 0.12)', open ? '#fff' : 'rgba(255, 255, 255, 0.2)');
      ctx.font = NAME;
      ctx.fillStyle = open ? '#fff' : '#666';
      ctx.fillText(open ? 'New stats' : '???', left + PAD + 11, y + 15);
      ctx.font = TEXT;
      ctx.fillStyle = open ? '#aaa' : '#555';
      ctx.fillText(open ? 'Coming soon' : `Raise Strength, Agility and Intelligence to ${STAT_MAX} to unlock`, left + PAD + 11, y + 31);
      ctx.restore();
      return { left, top, w, h };
    },
  };
}
