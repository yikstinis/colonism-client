// A buff to choose (the huge thing killed, see client.js): a point more of a stat (see character.js); its
// window over the middle of the screen while the game holds, as the talents' is (see talents.js): a card for each, side by side, its number
// on it to press (or a click on it). It stays till one's chosen.

import { FONT, PLATE, EDGE, BLUE, BLUE_EDGE } from '/render/labels.js';

// { id (its stat's), name, text (what it does) }
export const BUFFS = [
  { id: 'strength', name: 'Strength', text: '+1 health' },
  { id: 'agility', name: 'Agility', text: '+1% movement speed' },
  { id: 'intelligence', name: 'Intelligence', text: '+1% smart strikes: x2 damage' },
];

const CARD_W = 190, CARD_H = 44, GAP = 12, PAD = 16, HEAD = 40; // px
const TITLE = `700 12px ${FONT}`, NAME = `700 12px ${FONT}`, TEXT = `300 11px ${FONT}`, KEY = `700 10px ${FONT}`;

// ctx: the canvas to draw on
export function createBuffs(ctx) {
  let cards = []; // the cards on screen as last drawn: { id, x0, y0, x1, y1 }
  return {
    // The buff under screen point (x, y), or null
    at: (x, y) => BUFFS.find((b) => cards.some((c) => c.id === b.id && x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)) ?? null,

    // The window, its middle at (cx, cy); mouse: the cursor ({ x, y } or null); held: the number key down
    // (1 the first), or 0; off(id): its stat at its most, the card dim (not to be chosen). Returns its box { left, top, w, h }
    draw(cx, cy, mouse, held = 0, off = () => false) {
      const w = PAD * 2 + BUFFS.length * CARD_W + (BUFFS.length - 1) * GAP, h = HEAD + CARD_H + PAD;
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
      ctx.fillStyle = BLUE;
      ctx.fillRect(left - 0.5, top - 0.5, 3, h + 1);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = TITLE;
      ctx.fillStyle = '#fff';
      ctx.fillText('Choose a buff', left + PAD, top + HEAD / 2);
      cards = [];
      BUFFS.forEach((b, i) => {
        const x = left + PAD + i * (CARD_W + GAP), y = top + HEAD;
        const dim = off(b.id), over = !dim && (held === i + 1 || (mouse && mouse.x >= x && mouse.x <= x + CARD_W && mouse.y >= y && mouse.y <= y + CARD_H));
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_W, CARD_H, [0, 5, 5, 0]);
        ctx.fillStyle = over ? 'rgba(108, 184, 230, 0.18)' : 'rgba(255, 255, 255, 0.04)';
        ctx.fill();
        ctx.strokeStyle = dim ? 'rgba(255, 255, 255, 0.12)' : BLUE_EDGE;
        ctx.stroke();
        ctx.fillStyle = dim ? 'rgba(255, 255, 255, 0.2)' : BLUE;
        ctx.fillRect(x - 0.5, y - 0.5, 3, CARD_H + 1);
        ctx.font = NAME;
        ctx.fillStyle = dim ? '#666' : '#fff';
        ctx.fillText(b.name, x + 11, y + 15);
        ctx.font = TEXT;
        ctx.fillStyle = dim ? '#555' : '#aaa';
        ctx.fillText(dim ? 'At its most' : b.text, x + 11, y + 31);
        // Its number, to press: a small blue-edged key at the top right
        const kx = x + CARD_W - 24, ky = y + 6;
        ctx.beginPath();
        ctx.roundRect(kx + 0.5, ky + 0.5, 16, 16, 4);
        ctx.fillStyle = held === i + 1 ? BLUE : PLATE;
        ctx.fill();
        ctx.strokeStyle = BLUE_EDGE;
        ctx.stroke();
        ctx.font = KEY;
        ctx.textAlign = 'center';
        ctx.fillStyle = held === i + 1 ? '#000' : BLUE;
        ctx.fillText(String(i + 1), kx + 8.5, ky + 9);
        ctx.textAlign = 'left';
        cards.push({ id: b.id, x0: x, y0: y, x1: x + CARD_W, y1: y + CARD_H });
      });
      ctx.restore();
      return { left, top, w, h };
    },
  };
}
