// The journal (J): every quest so far, big on the screen as the map is, over the world gone dark: the one
// on now always in the same place, the ones done smaller and paler, up over it from between the cards
// over it (its name, and Esc). Each a card as the
// quest's at the top right (a see-through black plate, a thick edge on the left, rounded on the right;
// gold for the story's while it's on): its title, and its steps under it (plain lines, no marks: the
// done ones white, what they're after in gold), and under them what happened on the way, as he noted it
// (in italics); wrapped to the card.

import { FONT, PLATE, EDGE, GOLD, GOLD_EDGE, BLUE, BLUE_EDGE } from '/render/labels.js';

const TITLE = `700 14px ${FONT}`, STEP = `300 12px ${FONT}`, NOTE = `italic 300 12px ${FONT}`;
const SMALL_TITLE = `700 12px ${FONT}`, SMALL_NOTE = `italic 300 11px ${FONT}`; // a done quest's
const PAD = 14, TITLE_H = 20, LINE = 17, STEP_GAP = 3, GAP = 10; // px
const SPLIT = 9; // px either side of the faint line between a quest's steps and its notes

// A step's text (quests.js writes it as HTML) in runs: { text, gold } (what it's after: in a goal span;
// a <br>, a new line)
const runs = (html) => html.split(/(<span class="goal">.*?<\/span>)/).filter(Boolean).map((part) => {
  const goal = part.match(/^<span class="goal">(.*?)<\/span>$/);
  return { text: (goal ? goal[1] : part).replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, ''), gold: !!goal };
});

// ctx: the canvas to draw on
export function createJournal(ctx) {
  // The runs broken into lines no wider than width: [[{ text, gold, x }]]
  function wrap(parts, width, font = STEP) {
    ctx.font = font;
    const lines = [[]];
    let x = 0;
    for (const { text, gold } of parts)
      for (const word of text.split(/(\s+)/)) {
        if (!word) continue;
        if (word.includes('\n')) { // (a new line, whatever's left of this one)
          lines.push([]);
          x = 0;
          continue;
        }
        const w = ctx.measureText(word).width;
        if (x + w > width && x > 0) {
          lines.push([]);
          x = 0;
          if (!word.trim()) continue; // (no space to start a line)
        }
        lines[lines.length - 1].push({ text: word, gold, x });
        x += w;
      }
    return lines;
  }

  // A quest's card, laid out: its title, steps and notes in lines; small: a done one's, narrower, its
  // title and notes only, in smaller type
  function layout(q, width, small) {
    const inner = width - PAD * 2;
    const steps = [
      ...(small || !q.about ? [] : [{ about: true, lines: wrap(runs(q.about), inner) }]),
      ...(small || q.about ? [] : q.steps.map((s) => ({ ...s, lines: wrap(runs(s.text), inner) }))),
      ...(q.notes.length ? [{ note: true, first: !small, lines: wrap(runs(q.notes.join(' ')), inner, small ? SMALL_NOTE : NOTE) }] : []), // (one after the other, run on as he wrote them)
    ];
    const pad = small ? 9 : PAD, titleH = small ? 14 : TITLE_H, line = small ? 15 : LINE;
    const h = pad + titleH + steps.reduce((sum, s) => sum + STEP_GAP + (s.first ? SPLIT * 2 : 0) + s.lines.length * line, 0) + pad - 4;
    return { q, steps, h, w: width, small, pad, line };
  }

  // A card drawn with its top left at (left, top)
  function card({ q, steps, h, w, small, pad, line }, left, top) {
    // (a done one's plate as dark as ever: only what's on it dimmed, its edges faint, its text grey)
    const gold = q.main && !q.done, blue = q.side && !q.done, dim = q.done; // (blue: a side quest's)
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, [0, 5, 5, 0]);
    ctx.fillStyle = PLATE;
    ctx.fill();
    ctx.strokeStyle = gold ? GOLD_EDGE : blue ? BLUE_EDGE : dim ? 'rgba(255, 255, 255, 0.12)' : EDGE;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = gold ? GOLD : blue ? BLUE : dim ? 'rgba(255, 255, 255, 0.4)' : '#fff';
    ctx.fillRect(left - 0.5, top - 0.5, 3, h + 1);
    ctx.font = small ? SMALL_TITLE : TITLE;
    ctx.fillStyle = dim ? '#b0b0b0' : '#fff';
    ctx.fillText(q.title, left + pad, top + pad + (small ? 10 : 12));
    let y = top + pad + (small ? 14 : TITLE_H);
    for (const s of steps) {
      y += STEP_GAP;
      if (s.first) { // the notes set apart from the steps: a faint line between, room either side
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'; // (a hairline: a pixel, faint)
        ctx.fillRect(left + pad, Math.round(y + SPLIT) - 0.5, w - pad * 2, 1);
        y += SPLIT * 2;
      }
      ctx.font = s.note ? (small ? SMALL_NOTE : NOTE) : STEP;
      for (const ln of s.lines) {
        for (const run of ln) {
          ctx.fillStyle = dim ? '#888' : run.gold && !s.done && !s.note ? (q.side ? BLUE : GOLD) : s.note || s.about ? '#ccc' : s.done ? '#fff' : '#aaa'; // (what it's after in gold, in what it's about too)
          ctx.fillText(run.text, left + pad + run.x, y + (small ? 11 : 12));
        }
        y += line;
      }
    }
  }

  return {
    // quests: [{ title, about, main, done, on, steps: [{ text (HTML), done }], notes: [text] }], first to last. The
    // ones on now (on: the story's, then the side ones) always in the same place, one under the other: the
    // first's top left at (left, top), width px wide. The
    // ones done, smaller, from x0 to x1 (between the header's cards over it), the latest's bottom at
    // bottom (on the cards' line), the rest going up from it out of sight under ceiling (px)
    draw(quests, left, top, width, { x0, x1, bottom, ceiling }) {
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      let below = Math.round(top) + 0.5;
      for (const q of quests.filter((q) => q.on)) {
        const c = layout(q, width, false);
        card(c, Math.round(left) + 0.5, below);
        below += c.h + GAP;
      }
      ctx.beginPath();
      ctx.rect(0, ceiling, ctx.canvas.width, bottom - ceiling + 1); // (out of sight over ceiling)
      ctx.clip();
      let y = Math.round(bottom) + 0.5 + GAP;
      for (const q of quests.filter((q) => !q.on).reverse()) {
        const c = layout(q, Math.round(x1 - x0), true);
        y -= GAP + c.h;
        if (y + c.h < ceiling) break;
        card(c, Math.round(x0) + 0.5, y);
      }
      ctx.restore();
    },
  };
}
