// The backpack: its window (B), open from the moment he's picked it up and its cue held him (see
// client.js), over the middle of the screen while the game holds, as the talents' is (see
// talents.js). Its slots in a row, square as the hotbar's (see hotbar.js), each its name under it;
// for now only the first: medicine, the medkits he has (its count in its bottom right corner, dim when
// there are none).

import { FONT, PLATE, EDGE } from '/render/labels.js';
import { ICONS } from '/render/hotbar.js';

const W = 360, PAD = 16, HEAD = 40, SLOT = 52, CAPTION = 22, ICON_SCALE = 1.6; // px
const NAME = `700 12px ${FONT}`, COUNT = `700 11px ${FONT}`, CAPTION_FONT = `400 11px ${FONT}`;

// ctx: the canvas to draw on
export function createBackpack(ctx) {
  // A slot at (x, y): its icon, the count, its name under it
  const slot = (x, y, { icon, count, name, dim }) => {
    ctx.beginPath();
    ctx.roundRect(x, y, SLOT, SLOT, 4);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.translate(x + SLOT / 2, y + SLOT / 2);
    ctx.scale(ICON_SCALE, ICON_SCALE);
    ctx.lineWidth = 1.5 / ICON_SCALE * 1.3; // (about 2px, as the hotbar's)
    ctx.lineJoin = 'round';
    ICONS[icon](ctx, 0, 0, dim);
    ctx.restore();
    ctx.font = COUNT;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = dim ? '#888' : '#fff';
    ctx.fillText(String(count), x + SLOT - 5, y + SLOT - 5);
    ctx.font = CAPTION_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = dim ? '#777' : '#bbb';
    ctx.fillText(name, x + SLOT / 2, y + SLOT + CAPTION / 2 + 1);
  };
  return {
    // The window, its middle at (cx, cy); medkits: how many he has. Its name and what shuts it go over
    // it, on the HUD's cards (see client.js): returns its box { left, top, w, h }
    draw(cx, cy, { medkits }) {
      const w = W, h = HEAD + SLOT + CAPTION + PAD;
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
      slot(left + PAD, top + HEAD, { icon: 'cross', count: medkits, name: 'Medicine', dim: !medkits });
      ctx.restore();
      return { left, top, w, h };
    },
  };
}
