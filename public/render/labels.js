// Names over things lying around, and the prompt to pick them up, styled like a suit scanner's
// overlay. Seen from afar, a thing has a small card over it: its name and a note. In reach, the E
// key slides out to the left from under the card: holding E fills the key, and once it's full the thing is
// picked up. The same card, its key out for good, also names things on the HUD (the planet over the
// globe, M), and, keyless, the marks on the map.

export const FONT = '"Open Sans", Arial, sans-serif';
const NAME = `700 12px ${FONT}`, NOTE = `italic 300 11px ${FONT}`;
export const KEY = `700 10px ${FONT}`; // every key's name on the HUD (the hotbar's too)
const SAY = `300 12px ${FONT}`;
const COUNT = `400 9px ${FONT}`, COUNT_H = 14; // a key's count, on a smaller plate out to its left (px) // a gold card's text: what to do, in the type of his lines (render/speech.js; its key bold, as every key)
export const PLATE = 'rgba(0, 0, 0, 0.7)', EDGE = 'rgba(255, 255, 255, 0.35)';
export const GOLD = '#e6be5a', GOLD_EDGE = 'rgba(230, 190, 90, 0.6)'; // what matters most (a warning; the main quest's card, in index.html)
export const BLUE = '#6cb8e6', BLUE_EDGE = 'rgba(108, 184, 230, 0.6)'; // a side quest's (its card, in index.html; its arrow, its mark on the map)
const KEY_SIZE = 18; // px: the key's plate, whatever the card's height (at its top)
export const GAP = 14; // px from the top of a thing (or a character) up to the bottom of what's stacked over it: the same for all
export const HOLD_TIME = 0.45; // seconds E is held to pick something up (0: a press does it)

const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3; // fast, then settling

// ctx: the canvas to draw on
export function createLabels(ctx) {
  const opened = new Map(); // id -> how far its card has opened, 0..1

  const width = (str, font) => {
    ctx.font = font;
    return ctx.measureText(str).width;
  };
  const keyWidth = (key) => Math.max(KEY_SIZE, Math.round(width(key, KEY) + 12));
  // Left-aligned text, centered on cy by the capitals' height
  function text(str, font, x, cy, color) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(cy + ctx.measureText('H').actualBoundingBoxAscent / 2));
  }

  // The card, centered over the thing (or, given at, with its key's left edge at at.x and its bottom
  // at at.y): a thick white edge on the left, rounded on the right. open (0..1) slides the prompt out
  // to the left from under the card's left edge, hold (0..1) fills its key. item.gold: edged in gold,
  // its key too, the key's name in gold, the text plain. item.quest (what the quest is after): edged in
  // gold, its key too (and filled in gold as it's held), the names white.
  function card(item, open, hold, key = 'E') {
    const gold = item.gold || item.quest, font = item.gold || item.say ? SAY : NAME; // (say: in his lines' type, gold or not)
    const name = width(item.text, font), line = name + (item.tail ? width(item.tail, NAME) : 0);
    const w = Math.round(Math.max(line, item.sub ? width(item.sub, NOTE) : 0) + 20);
    const h = item.sub ? 34 : 22;
    const left = item.pin ? Math.round(item.pin.x) + 0.5 : item.at ? Math.round(item.at.x + keyWidth(key)) + 0.5 : Math.round((item.box.x0 + item.box.x1) / 2 - w / 2) + 0.5;
    const top = item.pin ? Math.round(item.pin.y - h / 2) + 0.5 : item.at ? Math.round(item.at.y - h) + 0.5 : Math.round(item.box.y0 - GAP - h) + 0.5;

    if (open > 0) prompt(left, top, h, open, hold, key, gold, !!item.gold, item.count); // first: it's under the card

    // Square on the left with a thick white edge, rounded on the right (flip: the other way round, the
    // edge on the right)
    ctx.beginPath();
    ctx.roundRect(left, top, w, h, item.flip ? [5, 0, 0, 5] : [0, 5, 5, 0]);
    ctx.fillStyle = PLATE;
    ctx.fill();
    ctx.strokeStyle = gold ? GOLD_EDGE : item.side ? BLUE_EDGE : EDGE; // (side: a side quest's, in blue)
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = gold ? GOLD : item.side ? BLUE : '#fff';
    ctx.fillRect(item.flip ? left + w - 2.5 : left - 0.5, top - 0.5, 3, h + 1);
    const x = left + (item.flip ? 9 : 11), mid = top + 11;
    text(item.text, font, x, mid, '#fff');
    if (item.tail) text(item.tail, NAME, x + name, mid, '#aaa'); // the rest of the line, grey
    if (item.sub) text(item.sub, NOTE, x, mid + 12, '#aaa');
    return left; // where its white edge is
  }

  // The key (E): a small plate (square, or wider for a longer key's name, as Space), rounded on the left, that slides out to the left from under the card's left edge (at
  // x = edge) as open goes 0..1, cut at that edge, so it seems to come from under it. Held, it fills
  // from right to left and its letter turns black over the fill.
  // count: a small line on a smaller white-edged plate out from under the key to its left ('0/4')
  function prompt(edge, cardTop, cardH, open, hold, key, gold = false, goldName = false, count = '') { // gold: edged and filled in gold; goldName: its name too
    const s = KEY_SIZE, kw = keyWidth(key), left = edge - Math.round(kw * open), top = cardTop + 2, cy = top + s / 2 - 0.5;
    const letter = (color) => text(key, KEY, left + kw / 2 - width(key, KEY) / 2, cy, color);
    const plate = new Path2D();
    plate.roundRect(left, top, kw, s, [5, 0, 0, 5]); // rounded on the left, square where it meets the card
    if (count && open >= 1) { // (cut by the key's outline: it seems to come from under it)
      const tw = Math.round(width(count, COUNT) + 10), tx = left - tw, tab = new Path2D(), under = new Path2D();
      tab.roundRect(tx, top + (s - COUNT_H) / 2, tw + 6, COUNT_H, [4, 0, 0, 4]);
      under.rect(tx - 2, top - 1, tw + 10, s + 2);
      under.addPath(plate);
      ctx.save();
      ctx.clip(under, 'evenodd'); // all but the key
      ctx.fillStyle = PLATE;
      ctx.fill(tab);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 1;
      ctx.stroke(tab);
      text(count, COUNT, tx + tw / 2 - width(count, COUNT) / 2, cy, '#fff');
      ctx.restore();
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(edge - kw - 2, top - 1, kw + 2, s + 2);
    ctx.clip();
    ctx.fillStyle = PLATE;
    ctx.fill(plate);
    ctx.strokeStyle = gold ? GOLD_EDGE : EDGE;
    ctx.lineWidth = 1;
    ctx.stroke(plate);
    letter(goldName ? GOLD : '#fff');
    const fill = Math.round((kw - 1) * hold);
    if (fill > 0) { // within the rounded plate
      ctx.clip(plate);
      ctx.beginPath();
      ctx.rect(left + kw - 0.5 - fill, top, fill + 1, s); // from the card's side out
      ctx.clip();
      ctx.fillStyle = gold ? GOLD : '#fff';
      ctx.fillRect(left, top, kw, s);
      letter('#000');
    }
    ctx.restore();
  }

  return {
    // items: [{ id, text, sub, box (screen rect the thing covers), quest }] visible this frame; near: the
    // id in reach (or null); hold: 0..1, how full its key is (how long E has been held). Returns each
    // card's white edge (x) by id, to line up others over them
    draw(items, near, hold, dt) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const edges = {};
      for (const item of items) {
        const o = Math.max(0, Math.min(1, (opened.get(item.id) ?? 0) + (item.id === near ? dt : -dt) / 0.18));
        opened.set(item.id, o);
        edges[item.id] = card(item, ease(o), item.id === near ? hold : 0);
      }
      return edges;
    },
    // A name on the HUD, its key out: the key's left edge at x, the card's bottom at y; hold (0..1)
    // fills the key; tail: more on the name's line, in grey; sub: a note under it
    tag(text, key, x, y, hold = 0, tail = '', sub = '') {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      card({ text, tail, sub, at: { x, y } }, 1, hold, key);
    },
    // A warning edged in gold, its key out to press (Space, for the shell): its edge at x (as a card gives
    // it: on the half pixel), lined up over the card or line under it, its bottom at y; count: how far
    // along it is ('0/4'), small on a tab over its key
    warn(text, key, x, y, hold = 0, count = '', gold = true) { // (gold false: the same, plain white: what to do that's not the story's)
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      card({ text, count, gold, say: true, at: { x: x - 0.5 - keyWidth(key), y } }, 1, hold, key);
    },
    // One thing's card, as draw() puts it but with its key in: returns the x of its white edge
    one(item) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      return card(item, 0, 0);
    },
    keyWidth,
    // Just a key, out from under the left edge (at x) of something else on the HUD (the quest's, J), as a
    // card's comes out from under it, its middle at y (on the line it goes with); hold (0..1) fills it;
    // gold: edged in gold, its name too (by a main quest's gold edge)
    key(key, x, y, hold = 0, gold = false) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      prompt(Math.round(x) + 0.5, Math.round(y - KEY_SIZE / 2 - 2) + 0.5, 22, 1, hold, key, gold, gold);
    },
    // How wide tag() makes one, its key and all (to line it up by its right end)
    tagWidth(text, key, tail = '') {
      return keyWidth(key) + Math.round(width(text, NAME) + (tail ? width(tail, NAME) : 0) + 20);
    },
    // A plain name card, its white edge at x, its bottom at y (to line up under another's)
    under(text, x, y) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      card({ text, pin: { x: x - 0.5, y: y - 11 } }, 0, 0); // (x as a card gives it: on the half pixel)
    },
    // A name by a point (a mark on the map): the card's left edge at x, its middle at y
    // (flip: the card mirrored, its thick edge on the right: a name to the left of its point; quest: edged
    // in gold, as what the quest's after is; side: in blue, as what a side quest's after is)
    pin(text, x, y, flip = false, quest = false, side = false) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      card({ text, pin: { x, y }, flip, quest, side }, 0, 0);
    },
    // A thing with this id was picked up: its card goes with it
    pickedUp(id) {
      opened.delete(id);
    },
  };
}
