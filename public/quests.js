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

// box: the panel element; side: the side quests' (under it); done(): called as each one's done
export function createQuests(box, side, done = () => {}) {
  const quests = [
    {
      title: 'Look around',
      main: true, // the story's: a gold-edged card
      target: 'backpack', // the guide arrow points at this object while the quest is on
      steps: [{ text: 'Search for your <span class="goal">backpack</span>. Looks like they threw it out right after me...', update: ({ hasBackpack }) => hasBackpack }],
    },
    {
      title: 'Check equipment',
      main: true,
      // What it's about, under its title: shown in place of its steps (they're kept count of all the same;
      // the talent's comes up as a note in the journal once there's one to pick: see client.js)
      about: 'I need to make sure everything works. Shoot the <span class="goal">bottles</span>, hit the <span class="goal">punching bag</span>.',
      // one after the other, each step leading to its own thing (target); how far along each is shows
      // by the thing (see client.js)
      steps: [
        { text: 'Shoot the <span class="goal">bottles</span> off the crate (hold right click)', target: 'bottles', update: ({ bottlesBroken }) => bottlesBroken >= 4 },
        { text: 'Hit the <span class="goal">punching bag</span> with the knife (left click)', target: 'bag', update: ({ bagHits }) => bagHits >= BAG_HITS },
        { text: 'Pick your first <span class="goal">talent</span> (press T)', update: ({ talentsTaken }) => talentsTaken > 0 },
      ],
    },
    {
      title: 'Safe space',
      main: true,
      about: 'I need to <span class="goal">find a place</span> where I can catch my breath.',
      cue: 'map', // (while it's on, the game cues the map once, as he steps out of the safe zones: see client.js)
      target: 'campfire', // (the way there shown from the start: its campfire, named for it, gold over it till it's done)
      steps: [{ text: 'Get to the safe space', update: ({ firesideUsed }) => firesideUsed }], // (on till he's used its campfire: E)
    },
    {
      title: 'Talk to the fellow',
      main: true,
      target: 'fellow', // (out in front of the garage)
      about: 'There’s a strange <span class="goal">old fellow</span> here. Hope I won’t have to torture him...',
      steps: [{ text: 'Talk to the <span class="goal">fellow</span>', update: ({ fellowTalked }) => fellowTalked }], // (E by him)
    },
    {
      title: 'Find a way off the planet',
      main: true,
      target: 'fellow',
      about: 'Try to <span class="goal">find something out</span> from the fellow. He looks smart, maybe he knows something...',
      steps: [{ text: 'Find something out', update: ({ fellowAsked }) => fellowAsked }], // (he's asked him the way off: 1, and had his answer)
    },
    {
      title: 'Bring the equipment to the fellow',
      main: true,
      about: 'The fellow lost his <span class="goal">equipment</span>. He’s useless without it. Bring it back.',
      steps: [
        { text: 'Find the <span class="goal">equipment</span> (hold E to pick it up)', target: 'equipment', update: ({ hasEquipment }) => hasEquipment }, // (its case in sector D2, see shared/world.js)
        { text: 'Bring the equipment to the <span class="goal">fellow</span>', target: 'fellow', update: ({ equipmentReturned }) => equipmentReturned }, // (E by him with it)
      ],
    },
    {
      title: 'Evacuation plan',
      main: true,
      target: 'fellow',
      about: 'Criticize the <span class="goal">fellow</span>’s idea of how to get us rescued...',
      steps: [{ text: 'Hear out the fellow’s plan', update: ({ fellowThreatened }) => fellowThreatened }], // (E by him: he owns up; then 1, the hero's answer)
    },
    {
      title: 'Teleportation device',
      main: true,
      target: 'wreck', // (a little low and right of the middle of sector C3, see shared/world.js)
      about: 'Get the <span class="goal">teleportation device</span> from the <span class="goal">ship’s wreckage</span>.',
      steps: [{ text: 'Get the teleportation device', update: () => false }], // (nothing ends it yet: the wreck, near the equator, to come)
    },
  ];
  // Side quests: off the chain, white, each on from when it's started (see start) alongside the one on,
  // in a panel of their own under its (side), and in the journal
  const sides = {
    hugeThing: {
      title: 'Huge thing',
      target: 'hugeThing', // (a place: its mark in sector C1, see client.js; a white arrow to it)
      about: 'The fellow saw some <span class="goal">huge thing</span> near the pole. Might be worth a look...',
      steps: [{ text: 'Check out the huge thing', update: ({ eggKilled }) => eggKilled }], // (done once it's burst, see client.js)
    },
  };
  let current = 0, html = '', sideHtml = '', last = {}; // last: the latest input
  const sidesOn = () => Object.values(sides).filter((q) => q.on && !q.steps.every((s) => s.done));

  function render() {
    const q = quests[current];
    const finished = q.steps.every((s) => s.done);
    const next = finished && q.done
      ? `<div class="title">✓ ${q.done}</div>`
      : `<div class="title">${q.title}</div>` + (q.about ? `<div class="about">${q.about}</div>` : '') + (q.about ? [] : q.steps).map((s) =>
        `<div class="step${s.done ? ' done' : ''}">${s.text}${s.extra && !s.done ? ' ' + s.extra() : ''}</div>`).join('');
    if (next === html) return; // the panel only changes when something does
    html = next;
    box.innerHTML = html;
    box.classList.toggle('done', finished);
    box.classList.toggle('main', !!q.main);
  }
  function renderSides() {
    const next = sidesOn().map((q) => `<div class="title">${q.title}</div>` + (q.about ? `<div class="about">${q.about}</div>` : '')).join('<div class="split"></div>');
    if (next === sideHtml) return;
    sideHtml = next;
    side.innerHTML = sideHtml;
    side.classList.toggle('none', !sideHtml);
    side.classList.add('side');
  }
  render();
  renderSides();

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
    // The quests so far, first to last, for the journal: [{ title, about, main, done, on, steps: [{ text, done }], notes }]
    // (on: the one on now, and after it the side ones on)
    // (a side one done: among the done ones, before the quest that was on when it was done)
    list() {
      const doneSides = Object.values(sides).filter((q) => q.on && q.steps.every((s) => s.done));
      const entry = (q, on, side = false) => ({
        title: q.title, about: q.about ?? '', main: !!q.main, side, done: q.steps.every((s) => s.done), on, steps: q.steps.map((s) => ({ text: s.text, done: !!s.done })),
        notes: q.notes ?? [],
      });
      return [
        ...quests.slice(0, current + 1).flatMap((q, i) => [...doneSides.filter((d) => (d.doneAt ?? current) === i).map((d) => entry(d, false, true)), entry(q, i === current)]),
        ...sidesOn().map((q) => entry(q, true, true)),
      ];
    },
    // Where he's got to, to keep (see client.js: the checkpoint): the quest on, each so far's steps done
    // and notes; load() puts it back
    save: () => ({
      current, quests: quests.slice(0, current + 1).map((q) => ({ done: q.steps.map((s) => !!s.done), notes: q.notes ?? [] })),
      sides: Object.fromEntries(Object.entries(sides).filter(([, q]) => q.on).map(([id, q]) => [id, { done: q.steps.map((s) => !!s.done), notes: q.notes ?? [], doneAt: q.doneAt }])),
    }),
    load(saved) {
      for (const [id, sq] of Object.entries(saved.sides ?? {})) {
        if (!sides[id]) continue;
        sides[id].on = true;
        sides[id].steps.forEach((s, k) => { s.done = !!sq.done[k]; });
        sides[id].notes = [...sq.notes];
        sides[id].doneAt = sq.doneAt;
      }
      renderSides();
      current = Math.min(saved.current, quests.length - 1);
      saved.quests.forEach((sq, i) => {
        if (!quests[i]) return;
        quests[i].steps.forEach((s, k) => { s.done = !!sq.done[k]; });
        quests[i].notes = [...sq.notes];
      });
      render();
    },
    // A side quest (by its id in sides) on from now; started(id): it is (done or not); finished(id): it's done
    start(id) {
      sides[id].on = true;
      renderSides();
    },
    started: (id) => !!sides[id].on,
    finished: (id) => !!sides[id].on && sides[id].steps.every((s) => s.done), // (and done)
    // Something that happened, noted down in the journal under the quest on now (as he'd write it), or
    // under a side quest (by its id in sides)
    note(text, id = null) {
      ((id ? sides[id] : quests[current]).notes ??= []).push(text);
    },
    // The name of the object the current quest leads to (its first step not done's, or its own), or
    // null (none, or the quest is done)
    target() {
      const step = quests[current].steps.find((s) => !s.done);
      return step ? step.target ?? quests[current].target ?? null : null;
    },
    // The names of what the side quests on lead to (their own targets)
    sideTargets: () => sidesOn().map((q) => q.target).filter(Boolean),
    // The name the current quest's target goes by on the map, if not its own (its mark), or null
    mark: () => quests[current].mark ?? null,
    // The current quest is the story's (gold)
    main: () => !!quests[current].main,
    // The current quest's cue (what the game stops to make him do), while it isn't done, or null
    cue() {
      const q = quests[current];
      return q.steps.every((s) => s.done) ? null : q.cue ?? null;
    },
    // input: { dt, running (s), dx, dy (the run's direction), aim (angle to the cursor, or null),
    // hasBackpack, bottlesBroken (bottles shot off the crate), bagHits (knife cuts in the punching bag), talentsTaken (how many he has), firesideUsed (he's used the safe space's campfire: E), fellowTalked (he's spoken to the fellow: E), fellowAsked (he's asked him the way off: 1, and had his answer), hasEquipment (he's picked up the fellow's crate), equipmentReturned (and handed it back to him: E by him), fellowThreatened (told him he's going to die: the evacuation plan's answer) }
    update(input) {
      last = input;
      for (const q of sidesOn()) {
        for (const s of q.steps) if (!s.done && s.update(input)) s.done = true;
        if (q.steps.every((s) => s.done)) q.doneAt = current; // (where it goes among the done ones in the journal)
      }
      renderSides();
      const q = quests[current];
      if (!q.steps.every((s) => s.done)) {
        for (const s of q.steps) if (!s.done && s.update(input)) s.done = true;
        if (q.steps.every((s) => s.done)) done(q);
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
