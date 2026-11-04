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

  // A quest's plate, its top left at (left, top), w by h px: a see-through black, its edges, the thick one
  // on the left (a done one's as dark as ever: only what's on it dimmed, its edges faint, its text grey)
  function plate(q, left, top, w, h) {
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
  }

  // What's on a card, its top left at (left, top)
  function content({ q, steps, w, small, pad, line }, left, top) {
    const dim = q.done;
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

  let pos = null; // where the wheel's got the journal to: skip, as it slides there (null: right there)

  return {
    // Next time it's drawn it's right where the wheel is (the journal opened)
    reset() { pos = null; },
    // quests: [{ title, about, main, done, on, steps: [{ text (HTML), done }], notes: [text] }], first to last.
    // The ones done first, then the ones on now (the story's, then the side ones). skip: how many of the
    // done ones the wheel has gone back by: the one it's at sits where the first on now does with no
    // skip, full size (its top left at (left, top), width px wide), the ones after it down under it, one
    // under the other; the ones before it smaller, from x0 to x1 (between the header's cards over it),
    // the latest's bottom at bottom (on the cards' line), the rest going up out of sight under ceiling
    // (px). The wheel's place slides to skip (dt: seconds), and everything with it, as one: between two
    // notches each card is between where it is at the one and at the other (none ever over another, as
    // at neither), the one going from small to full size (or back) growing as it goes, what's on it
    // fading from the one to the other
    draw(quests, left, top, width, { x0, x1, bottom, ceiling, skip = 0 }, dt = 0) {
      ctx.save();
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      const list = [...quests.filter((q) => !q.on), ...quests.filter((q) => q.on)];
      const done = list.filter((q) => !q.on).length;
      pos = pos === null ? skip : pos + (skip - pos) * (1 - Math.exp(-dt * 14)); // (~0.2 s a notch)
      if (Math.abs(skip - pos) < 0.002) pos = skip;
      const big = new Map(), small = new Map(); // q -> its card, laid out (once a frame, each size)
      const bigOf = (q) => big.get(q) ?? big.set(q, layout(q, width, false)).get(q);
      const smallOf = (q) => small.get(q) ?? small.set(q, layout(q, Math.round(x1 - x0), true)).get(q);
      const at = (s) => { // where each card is with the wheel s notches back: [{ c, x, y }], as list
        const focus = Math.max(0, done - s), out = [];
        let y = Math.round(top);
        for (const q of list.slice(focus)) {
          out.push({ c: bigOf(q), x: Math.round(left), y });
          y += bigOf(q).h + GAP;
        }
        y = Math.round(bottom) + GAP;
        for (const q of list.slice(0, focus).reverse()) {
          y -= GAP + smallOf(q).h;
          out.unshift({ c: smallOf(q), x: Math.round(x0), y });
        }
        return out;
      };
      // Between two notches, in two beats: first everything slides up or down (over the first part of the
      // way), the one between small and full size as it is, narrow (between the header's cards); then,
      // once it's under them, it grows (or, the other way, it goes narrow first, then slides off)
      const lo = Math.floor(pos), t = pos - lo;
      const from = at(lo), to = t > 0 ? at(lo + 1) : from;
      const SLIDE = 0.6; // (of the way between two notches, the slide)
      const ease = (u) => u * u * (3 - 2 * u);
      const slid = ease(Math.min(1, t / SLIDE));
      const mix = (a, b, u) => a + (b - a) * u;
      ctx.beginPath();
      ctx.rect(0, ceiling, ctx.canvas.width, ctx.canvas.height); // (out of sight over ceiling)
      ctx.clip();
      list.forEach((q, i) => {
        const a = from[i], b = to[i]; // (a card changing size: small at a, full size at b)
        const y = Math.round(mix(a.y, b.y, slid)) + 0.5;
        let grown = 0; // (how far from narrow to wide it is)
        if (a.c !== b.c) { // (once its top's under bottom, the header's cards' bottom, and on: it grows)
          const under = Math.max(0, Math.min(1, (bottom - a.y) / (b.y - a.y)));
          let s0 = 0, s1 = 1; // (where along the slide that is: the ease turned back)
          for (let n = 0; n < 16; n++) (ease((s0 + s1) / 2) < under ? (s0 = (s0 + s1) / 2) : (s1 = (s0 + s1) / 2));
          const start = SLIDE * s1;
          grown = ease(Math.max(0, Math.min(1, (t - start) / (1 - start))));
        }
        const x = Math.round(mix(a.x, b.x, grown)) + 0.5, w = Math.round(mix(a.c.w, b.c.w, grown));
        const h = Math.round(mix(a.c.h, b.c.h, b.c.h >= a.c.h ? grown : slid)); // (no taller than where it's going as it slides: none over the next)
        if (y + h < ceiling || y > ctx.canvas.height) return;
        plate(q, x, y, w, h);
        if (a.c === b.c) return content(a.c, x, y);
        ctx.save(); // (growing or going narrow: what's on it, each scaled to its width, the one fading out over the first half, the other in over the second, inside it)
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        const was = ctx.globalAlpha;
        for (const [c, alpha] of [[a.c, 1 - grown * 2], [b.c, grown * 2 - 1]]) {
          if (alpha <= 0) continue;
          ctx.save();
          ctx.globalAlpha = was * alpha;
          ctx.translate(x, y);
          ctx.scale(w / c.w, w / c.w);
          content(c, 0, 0);
          ctx.restore();
        }
        ctx.restore();
      });
      ctx.restore();
    },
  };
}
