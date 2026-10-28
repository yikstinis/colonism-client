// What the hero says: a line typed out over his head on a plate like the labels' (see labels.js).
// It stays long enough to read (or, kept, till it's let go), then fades.

import { FONT, PLATE, EDGE } from '/render/labels.js';

const TEXT = `300 12px ${FONT}`;
const TYPE_RATE = 40; // letters per second
const MAX_W = 230; // px, the text wraps to this
const LINE_H = 16;

// ctx: the canvas to draw on
export function createSpeech(ctx) {
  let line = null; // { text, rows (wrapped once, so the plate doesn't change size as it types), t, keep }

  function wrap(text) {
    ctx.font = TEXT;
    const rows = [];
    let row = '';
    for (const word of text.split(' ')) {
      const next = row ? `${row} ${word}` : word;
      if (row && ctx.measureText(next).width > MAX_W) {
        rows.push(row);
        row = word;
      } else row = next;
    }
    rows.push(row);
    return rows;
  }

  return {
    // keep: it stays up till let go
    say(text, keep = false) {
      line = { text, rows: wrap(text), t: 0, keep };
    },
    // A kept line goes on to fade as any other (at once, if it's been up long enough)
    letGo() {
      if (line) line.keep = false;
    },
    hush() {
      line = null;
    },
    // What's being said now (till it has faded away), or null
    saying() {
      return line?.text ?? null;
    },

    // The line centered over screen (x, y), its plate's bottom just above: over the hero's head.
    // Returns its plate's { top, edge } (the x of its white edge, as a label card's), or null with nothing said
    draw(x, y, dt) {
      if (!line) return null;
      const n = line.text.length;
      const stay = n / TYPE_RATE + 2.5 + n / 30; // typed, then time to read it
      line.t = line.keep ? Math.min(line.t + dt, stay) : line.t + dt;
      const fade = Math.min(1, (stay + 0.4 - line.t) / 0.4);
      if (fade <= 0) {
        line = null;
        return null;
      }
      ctx.font = TEXT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const w = Math.round(Math.max(...line.rows.map((r) => ctx.measureText(r).width)) + 21);
      const h = line.rows.length * LINE_H + 8;
      const left = Math.round(x - w / 2) + 0.5, top = Math.round(y - 6 - h) + 0.5;
      ctx.globalAlpha = fade;
      // The plate, square on the left with a thick white edge, rounded on the right
      ctx.beginPath();
      ctx.roundRect(left, top, w, h, [0, 5, 5, 0]);
      ctx.fillStyle = PLATE;
      ctx.fill();
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillRect(left - 0.5, top - 0.5, 3, h + 1);
      // The text, typed out letter by letter across the rows
      let budget = Math.floor(line.t * TYPE_RATE); // letters typed so far
      const cap = ctx.measureText('H').actualBoundingBoxAscent;
      line.rows.forEach((row, i) => {
        const shown = row.slice(0, Math.max(0, budget));
        budget -= row.length + 1;
        if (shown) ctx.fillText(shown, left + 11, Math.round(top + 4 + LINE_H * (i + 0.5) + cap / 2));
      });
      ctx.globalAlpha = 1;
      return { top, edge: left };
    },
  };
}
