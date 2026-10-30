// The backpack: its window (B), open from the moment he's picked it up and its cue held him (see
// client.js), over the middle of the screen while the game holds, as the character's is (see
// character.js). Nothing in it yet: a card saying what's to come.

import { FONT, PLATE, EDGE } from '/render/labels.js';

const W = 360, PAD = 16, HEAD = 40, CARD_H = 44; // px
const NAME = `700 12px ${FONT}`, TEXT = `300 11px ${FONT}`;

// ctx: the canvas to draw on
export function createBackpack(ctx) {
  return {
    // The window, its middle at (cx, cy). Its name and what shuts it go over it, on the HUD's cards
    // (see client.js): returns its box { left, top, w, h }
    draw(cx, cy) {
      const w = W, h = HEAD + CARD_H + PAD;
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
      ctx.textAlign = 'left';
      ctx.font = NAME;
      ctx.fillStyle = '#fff';
      ctx.fillText('Backpack', left + PAD, top + HEAD / 2);
      // What's to come in it, on a dim card (as the character's stats to come)
      const x = left + PAD, y = top + HEAD, cw = w - PAD * 2;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, CARD_H, [0, 5, 5, 0]);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(x - 0.5, y - 0.5, 3, CARD_H + 1);
      ctx.font = NAME;
      ctx.fillStyle = '#666';
      ctx.fillText('Empty', x + 11, y + 15);
      ctx.font = TEXT;
      ctx.fillStyle = '#555';
      ctx.fillText('Coming soon...', x + 11, y + 31);
      ctx.restore();
      return { left, top, w, h };
    },
  };
}
