// Quests: a chain of tasks shown in the panel at the top right, one at a time, each a list of steps
// to tick off. The game reports what the hero does every frame (see update), steps watch for it.

import { BAG_HITS } from '/shared/world.js';

const RUN_TIME = 0.4; // seconds of running each way to count it
const FADE_TIME = 500; // ms a quest done stays, faded, before it goes
const SLIDE_TIME = 500; // ms it takes going off the screen (as .quest.gone in index.html has it)

// Run up, down, left and right on screen (diagonals count for both of their ways). Not in the chain
// for now.
function runEveryWay() {
  const ways = [['up', '↑', 0, -1], ['left', '←', -1, 0], ['down', '↓', 0, 1], ['right', '→', 1, 0]];
  const ran = Object.fromEntries(ways.map(([name]) => [name, 0]));
  return {
    text: 'Run in every direction',
    extra: () => ways.map(([name, arrow]) => `<span class="way${ran[name] >= RUN_TIME ? ' on' : ''}">${arrow}</span>`).join(''),
    update({ dt, running, dx, dy }) {
      if (running) for (const [name, , wx, wy] of ways) if (dx * wx + dy * wy > 0.5) ran[name] += dt;
      return ways.every(([name]) => ran[name] >= RUN_TIME);
    },
  };
}

// Turn all the way round: lead the cursor in a full circle around the hero (either way). Not in the
// chain for now.
function spinAround() {
  let last = null, turned = 0;
  return {
    text: 'Turn around: circle the cursor around yourself',
    extra: () => `<span class="pct">${Math.min(100, Math.round((Math.abs(turned) / (Math.PI * 2)) * 100))}%</span>`,
    update({ aim }) {
      if (aim !== null && last !== null) turned += Math.atan2(Math.sin(aim - last), Math.cos(aim - last));
      last = aim;
      return Math.abs(turned) >= Math.PI * 2;
    },
  };
}

// box: the panel element
export function createQuests(box) {
  const quests = [
    {
      title: 'Look around',
      main: true, // the story's: a gold-edged card
      target: 'backpack', // the guide arrow points at this object while the quest is on
      steps: [{ text: 'Search for your <span class="goal">backpack</span>. Looks like they threw it out right after me...', update: ({ hasBackpack }) => hasBackpack }],
    },
    {
      title: 'Target practice',
      main: true,
      // one after the other, each step leading to its own thing (target); how far along each is shows
      // by the thing (see client.js)
      steps: [
        { text: 'Shoot the <span class="goal">bottles</span> off the crate (hold right click)', target: 'bottles', update: ({ bottlesBroken }) => bottlesBroken >= 4 },
        { text: 'Hit the <span class="goal">punching bag</span> with the knife (left click)', target: 'bag', update: ({ bagHits }) => bagHits >= BAG_HITS },
      ],
    },
    {
      title: 'Where am I?',
      main: true,
      cue: 'map', // (while it's on, the game cues it: see client.js)
      steps: [{ text: 'Open the <span class="goal">map</span> to get your bearings (press M)', update: ({ mapSeen }) => mapSeen }],
    },
    {
      title: 'Keep looking',
      main: true,
      target: 'structures', // (STRUCTURES in shared/world.js: only a point yet, it stays on)
      steps: [{ text: 'I think I saw some structures to the <span class="goal">west</span> of here while I was falling...', update: () => false }],
    },
  ];
  let current = 0, html = '', last = {}; // last: the latest input

  function render() {
    const q = quests[current];
    const finished = q.steps.every((s) => s.done);
    const next = finished && q.done
      ? `<div class="title">✓ ${q.done}</div>`
      : `<div class="title">${q.title}</div>` + q.steps.map((s) =>
        `<div class="step${s.done ? ' done' : ''}">${s.text}${s.extra && !s.done ? ' ' + s.extra() : ''}</div>`).join('');
    if (next === html) return; // the panel only changes when something does
    html = next;
    box.innerHTML = html;
    box.classList.toggle('done', finished);
    box.classList.toggle('main', !!q.main);
  }
  render();

  // The panel as it is goes: a copy of it fades, then slides up off the screen; once it's gone the
  // panel, the next quest in it now, slides in from the right past the screen's edge (never both at once)
  function handOver() {
    const gone = box.cloneNode(true);
    gone.removeAttribute('id');
    box.after(gone);
    gone.getBoundingClientRect(); // (laid out as it is first, so it fades from there)
    gone.classList.add('faded');
    box.classList.add('coming');
    setTimeout(() => {
      gone.style.transform = `translateY(${-Math.ceil(gone.getBoundingClientRect().bottom + 20)}px)`;
      gone.classList.add('gone');
    }, FADE_TIME);
    setTimeout(() => {
      gone.remove();
      box.classList.remove('coming');
    }, FADE_TIME + SLIDE_TIME);
  }

  return {
    // The name of the object the current quest leads to (its first step not done's, or its own), or
    // null (none, or the quest is done)
    target() {
      const step = quests[current].steps.find((s) => !s.done);
      return step ? step.target ?? quests[current].target ?? null : null;
    },
    // The current quest's cue (what the game stops to make him do), while it isn't done, or null
    cue() {
      const q = quests[current];
      return q.steps.every((s) => s.done) ? null : q.cue ?? null;
    },
    // input: { dt, running (s), dx, dy (the run's direction), aim (angle to the cursor, or null),
    // hasBackpack, bottlesBroken (bottles shot off the crate), bagHits (knife cuts in the punching bag), mapSeen (the map's open all the way) }
    update(input) {
      last = input;
      const q = quests[current];
      if (!q.steps.every((s) => s.done)) {
        for (const s of q.steps) if (!s.done && s.update(input)) s.done = true;
      }
      // Done: the next one comes at once (the last one stays up, done), the done one going
      if (q.steps.every((s) => s.done) && current < quests.length - 1) {
        handOver(); // (as it was shown: not ticked off)
        current++;
      }
      render();
    },
  };
}
