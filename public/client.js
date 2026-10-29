import {
  SPAWN, OBJECTS, REACH, ROLL_TIME, ROLL_COOLDOWN, UNITS_PER_M, VISION, GAIT_SPEED, CHART0, PLANET, SYSTEM, PLANET_R, POLE, STRIKE_SLANT, STRIKE_WAY, BAG_HITS, STRUCTURES, SAFE_ZONES, modelToWorld, TURRET_FRAMES, TURRET_RANGE, TURRET_MUZZLE, recenter, move, dirFromVector, dirVector, gait, rayHit, addObstacle, removeObstacle, startRoll, updateRoll, CROUCH_SPEED, CROUCH_AIM, CROUCH_CYCLE, AIM_OUT_TIME, AIM_OFFSETS, FIRE_ROUNDS, RELOAD_TIME, GAIT_CYCLE, SHOT_RANGE, SHOT_SPREAD, shotSway, PICK_TIME, PICK_GRAB, SLASH_TIME, SLASH_COOLDOWN, SLASH_RANGE, SLASH_ARC, BUG_BITE_TIME, BUG_BITE_SNAP,
} from '/shared/world.js';
import { ZOOM, HEIGHT_PX, toScreenX, toScreenY } from '/render/view.js';
import { loadSprites } from '/render/sprites.js';
import { createGround } from '/render/ground.js';
import { createQuests } from '/quests.js';
import { createSounds } from '/sounds.js';
import { FONT, GOLD, HOLD_TIME, createLabels } from '/render/labels.js';
import { createSpeech } from '/render/speech.js';
import { createGuide } from '/render/guide.js';
import { createReach } from '/render/reach.js';
import { createHotbar } from '/render/hotbar.js';
import { TALENTS, createTalents } from '/render/talents.js';
import { lifeBar, RING_STEP } from '/render/life.js';
import { createJournal } from '/render/journal.js';
import { MARGIN as GLOBE_MARGIN, RADIUS as GLOBE_RADIUS, createGlobe } from '/render/globe.js';
import { moveChart, toChart } from '/shared/sphere.js';
import { createShots } from '/render/shots.js';
import { createStrike } from '/render/strike.js';
import { createLevelUp } from '/render/levelup.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const questBox = document.getElementById('quest');
let journalOpen = false; // the journal (J)
const debugBox = document.getElementById('debug');
const drawGround = createGround(document.getElementById('ground')); // the desert, under this canvas

// Smoke is drawn at art-pixel resolution and scaled up, so the puffs are pixelated like the sprites
const smokeLayer = document.createElement('canvas');
const sctx = smokeLayer.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false; // crisp pixel-art sprites (reset by resizing)
}
window.addEventListener('resize', resize);
resize();

// ---------- Assets: PNG sprite sheets, see public/assets/sprites.json ----------

hud.textContent = 'Loading…';
const sprites = await loadSprites('/assets/sprites.json');
const snap = (v) => Math.round(v / sprites.scale) * sprites.scale; // screen px to the art pixel grid

// ---------- World (single player, everything runs in the browser) ----------

// The planet: we play on a flat chart of it round the hero, re-centered on him as he goes, never turned
// (see shared/world.js); the sand's pattern goes along with the chart (sand: where the chart's origin
// falls in it, world units, and how far it's turned), so it stays put on the planet
let chart = CHART0;
const sand = { x: 0, y: 0, turn: 0 };
const RECENTER = 10 * UNITS_PER_M; // this far from the chart's origin, the chart moves to the hero
// animOffset: shift of the animation clock (kept for when there are several characters)
// sprite: character sheet in sprites.json (the hero changes into 'hero_pack' with the backpack on)
const HP = 10; // the hero's health, full
const HEALTH_R = 0.49 * UNITS_PER_M; // its ring's radius round him
const MEDKITS = 3, MEDKIT_HEAL = 5; // medkits in the backpack (once he has it: 1 uses one), and how much health each gives back
const MEDKIT_COOLDOWN = 10; // seconds after one before the next can be used
let medkits = MEDKITS, medkitCool = 0; // (seconds till the next can be)
// Experience: a point for each bug killed; xpFor(level) more of it to the next level, each a talent
// point to spend (T; see render/talents.js). He starts at the first; the punching bag cut to bits
// gives him the second at once. He goes no higher than there are talents for (MAX_LEVEL)
const xpFor = (level) => 50 * level;
const MAX_LEVEL = 1 + TALENTS.length;
let xp = 0, level = 1, points = 0, talentsOpen = false;
const me = { hp: HP, x: SPAWN.x, y: SPAWN.y, dir: 0, moving: false, gait: 'run', roll: null, rollCooldown: 0, pick: null, squat: 0, slash: null, fire: null, crouch: false, animOffset: 0, stride: 0.7, sprite: 'hero' };
const objects = OBJECTS.filter((o) => !o.later); // what still lies on the map (picked up things are removed)

// ---------- Quests: look around, find the backpack (see quests.js) ----------

const quests = createQuests(questBox, () => sounds.questDone()); // (a chord as each one's done)
const journal = createJournal(ctx); // every quest so far (J)
const guide = createGuide(ctx); // the arrow to the current quest's target
const sounds = createSounds();
sounds.wake(); // (tried at once: where the browser lets a page play sound before the player does anything, the desert is heard from the start; elsewhere it waits for the first key or click)
const reach = createReach(ctx); // the knife's reach on the ground
const hotbar = createHotbar(ctx); // the things he can use, at the bottom (1, 2, the mouse's buttons)
const talents = createTalents(ctx); // what his levels buy (T)
const shots = createShots(ctx); // muzzle flashes and tracers
const globe = createGlobe(ctx); // the minimap
const leveled = createLevelUp(ctx); // a new level's spotlight

// ---------- Picking things up: walk up to one and hold E (see render/labels.js); the hero squats,
// takes it and stands up again (me.pick while at it) ----------

let hasBackpack = false;
let held = 0; // seconds E has been held on the thing in reach (it runs back down when E is let go)
let waitRelease = false; // after picking something up, E has to be let go before the next thing
const labels = createLabels(ctx);
const speech = createSpeech(ctx);
const fellowSpeech = createSpeech(ctx); // what the fellow says, over his own head
// The thing in reach that E does something with: hold to pick it up, or press to have the hero say his line
const reachable = () => objects.find((o) => (o.pickup || o.say) && Math.hypot(me.x - o.x, me.y - o.y) - (o.solid?.r ?? 0) <= REACH);

// (what the quest is after is named in gold, as in its text; its name up out of the way of its life's dots, when it has them)
const labelOf = (o, x, y) => {
  const box = sprites.objectInk(o.sprite ?? o.name, x, y);
  return { id: o.name, text: o.label, sub: o.note, box: lifeOf(o) ? { ...box, y0: box.y0 - LIFE_ROOM } : box, quest: o.name === quests.target() };
};
// A thing's life, shown over it (see render/life.js) while it's to be hit, as [left, most]: the bottles'
// while the drill's on (one each), the bag's while its quest is (a cut each); or null
const lifeOf = (o) => (o.name === 'bottles' && drillShown() && bottles.frame ? [BOTTLES_ALL - bottlesBroken, BOTTLES_ALL]
  : o.name === 'bag' && quests.target() === 'bag' ? [BAG_HITS - bagHits, BAG_HITS] : null);
const LIFE_ROOM = 6; // px the name goes up for it

// In the frame the key fills up, the thing and its card are gone and the hero has it already (the
// backpack on, the gun and the knife in hands), down in his squat; he gets up from it
function pickUp(o) {
  me.pick = { t: PICK_TIME * PICK_GRAB, item: o }; // down already (holding E): what's left is getting up
  labels.pickedUp(o.name);
  objects.splice(objects.indexOf(o), 1);
  if (o.solid) removeObstacle(o.solid);
  if (o.pickupSay) speech.say(o.pickupSay);
  if (o.name === 'backpack') {
    hasBackpack = true;
    me.sprite = 'hero_pack';
    drill = 'waiting'; // once he's up, the world holds still for him to try the gun
  }
}

// The gun's range and its aim's sway now (radians off the aim): crouched, steadier (CROUCH_AIM)
const shotRange = () => SHOT_RANGE * (me.crouch ? CROUCH_AIM.range : 1);
const shotSpread = () => SHOT_SPREAD * (me.crouch ? CROUCH_AIM.spread : 1);
const aimSway = () => shotSway(swayClock) * (me.crouch ? CROUCH_AIM.spread : 1);

// An armed animation's name, crouched or not: crouched ones have a 'c' before it
const crouched = (anim) => (me.crouch ? 'c' + anim : anim);

// The firing loop's animation for how we move and where we aim: of the ones drawn aimed off the
// facing by AIM_OFFSETS, the nearest to the aim
function fireAnim() {
  const f = dirVector(me.dir), off = Math.atan2(Math.sin(aimAngle() - Math.atan2(f.dy, f.dx)), Math.cos(aimAngle() - Math.atan2(f.dy, f.dx)));
  let v = 0;
  AIM_OFFSETS.forEach((o, i) => { if (Math.abs(off - o) < Math.abs(off - AIM_OFFSETS[v])) v = i; });
  return crouched(FIRE_ANIM[me.moving ? me.gait : 'stand'] + ['-', '', '+'][v]);
}

// A round: from the gun's muzzle (where the playing animation has it) at the swaying dot on the
// range's arc, or at whatever gives cover in the way
let lastShotAt = -Infinity; // when the last round went off (clock, ms)
let burstRounds = 0; // rounds gone in this burst (a pause of BURST_GAP and it's a new one)
const BURST_GAP = 250; // ms
function fireRound() {
  if (ammo) { // counted: reloading, none goes; the last one out, he reloads
    if (ammo.reload !== null) return; // (no round: nothing goes; the dry click, sounds.click(), is off for now)
    if (!--ammo.mag) startReload(0.25); // (its sound past this last shot's bang and the burst's tail, a bug's burst with it: not lost under them)
  }
  burstRounds = clock - lastShotAt > BURST_GAP ? 1 : burstRounds + 1;
  lastShotAt = clock;
  const a = aimAngle() + aimSway();
  let hit = rayHit(me.x, me.y, Math.cos(a), Math.sin(a), shotRange());
  // A bottle standing in the way before that: it's hit, and the round stops there
  const bottle = bottleInWay(Math.cos(a), Math.sin(a), hit);
  if (bottle) {
    hit = bottle.t;
    breakBottle(bottle.i, a);
  }
  // Bugs: every one in the aim's cone (the arc it sways across, out to its range) is hit, all the way
  // through, unless something solid's in the way to it
  for (const b of bugsInCone()) hurtBug(b, BUG_SHOT, Math.atan2(b.y - me.y, b.x - me.x), true);
  const tx = me.x + Math.cos(a) * hit, ty = me.y + Math.sin(a) * hit;
  if (!bottle && objects.includes(bag) && Math.hypot(tx - bag.x, ty - bag.y) <= bagStand.solid.r + 1) shootBag(a, tx, ty); // stopped in the bag
  // The muzzle: the model's (+x the figure's left, +y forward, z up; meters) turned to the facing
  const f = dirVector(me.dir), left = { dx: f.dy, dy: -f.dx };
  const [mx0, my0, mz] = sprites.animation(me.sprite, fireAnim())?.muzzle ?? [-0.2, 0.75, 1.35];
  const mx = me.x + (left.dx * mx0 + f.dx * my0) * UNITS_PER_M, my = me.y + (left.dy * mx0 + f.dy * my0) * UNITS_PER_M;
  shots.fire(mx, my, mz, tx, ty);
  sounds.shot();
  // The spent case kicked out of the gun's right side, spinning up and off, to lie in the sand a while
  const back = my0 - 0.35, kick = rand(25, 45), up = rand(-12, 12);
  particles.push({
    kind: 'casing', x: me.x + (left.dx * mx0 + f.dx * back) * UNITS_PER_M, y: me.y + (left.dy * mx0 + f.dy * back) * UNITS_PER_M, h: mz,
    vx: -left.dx * kick + f.dx * up, vy: -left.dy * kick + f.dy * up, vh: rand(2, 3.2), age: 0, life: rand(6, 9), spin: rand(0, 4),
  });
  sounds.casing(burstRounds); // (its ping as it's thrown out: heard more the longer the burst)
  // The last one out: the empty magazine drops out of the gun, flung off the same side, heavier
  if (ammo?.reload === 0) particles.push({
    kind: 'casing', mag: true, x: me.x + (left.dx * mx0 + f.dx * (my0 - 0.25)) * UNITS_PER_M, y: me.y + (left.dy * mx0 + f.dy * (my0 - 0.25)) * UNITS_PER_M, h: mz - 0.15,
    vx: -left.dx * rand(15, 25) + f.dx * rand(-6, 6), vy: -left.dy * rand(15, 25) + f.dy * rand(-6, 6), vh: rand(0.8, 1.4), age: 0, life: rand(10, 14), spin: rand(0, 4),
  });
}

function updatePick(dt) {
  me.pick.t += dt;
  if (me.pick.t >= PICK_TIME) me.pick = null;
}

// ---------- Input: WASD / arrows to run, Shift to crouch, Space to roll, the mouse to look around, click to slash, hold the right button to fire, R to reload ----------

const keys = new Set();
let camX = 0, camY = 0; // screen position of the world origin
let rollPressed = -Infinity; // time of the last Space press: a press shortly before a roll can start still counts
let usePressed = false; // E was pressed since the last frame
let mapOpen = false; // M: the globe big in the middle over a dark world
let mapShown = 0; // 0..1, how far it has opened
let attackPressed = false; // the left mouse button was pressed since the last frame
let triggerHeld = false; // the right one: firing while it's held
let knifeHeld = false; // the left one held (its key on the HUD shows it pressed)
let spaceHit = false; // Space was pressed since the last frame (the strike waits for it)

window.addEventListener('keydown', (e) => {
  sounds.wake();
  keys.add(e.code);
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      rollPressed = clock;
      spaceHit = true;
    }
  }
  if (e.code === 'KeyT' && !e.repeat && level > 1 && me.hp > 0) {
    talentsOpen = !talentsOpen;
    if (talentsOpen) sounds.press(); // (the key's click: in, and out the other way round)
    else sounds.done();
  }
  if (e.code === 'Digit1' && !e.repeat && hasBackpack && medkits > 0 && medkitCool <= 0 && me.hp > 0 && me.hp < HP) { // a medkit: health back
    medkits--;
    medkitCool = MEDKIT_COOLDOWN;
    me.hp = Math.min(HP, me.hp + MEDKIT_HEAL);
    hotbar.used('1'); // (no sound for now: sounds.heal())
  }
  if (e.code === 'KeyR' && !e.repeat && ammo && ammo.reload === null && ammo.mag < MAG && me.hp > 0) startReload(); // R: reload before the magazine's out
  if (e.code === 'KeyE' && !e.repeat) {
    usePressed = true;
    if (!gameHeld() && !me.pick && reachable()) sounds.press(); // (its click: only with something in reach to use, and the game going)
  }
  if (e.code === 'Escape' && !e.repeat && (talentsOpen || mapOpen || journalOpen)) sounds.press(); // (its click in; out the other way round as it's let go, and the window shuts)
  if (e.code === 'KeyJ' && !e.repeat && me.hp > 0) { // the journal, big in the middle as the map (one or the other)
    journalOpen = !journalOpen;
    if (journalOpen) mapOpen = talentsOpen = false;
    if (journalOpen) sounds.press(); // (the key's click: in, and out the other way round)
    else sounds.done();
  }
  if (e.code === 'KeyM' && !e.repeat && mapKnown) {
    mapOpen = !mapOpen;
    if (mapOpen) journalOpen = false;
    if (mapOpen) sounds.press(); // (the key's click: in, and out the other way round, as the talents')
    else sounds.done();
  }
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Escape') { // (shut as it's let go: held, its key shows it on the window's card)
    if (talentsOpen || mapOpen || journalOpen) sounds.done(); // (out, as T, M or J does it)
    mapOpen = talentsOpen = journalOpen = false;
  }
  if (e.code === 'KeyE') waitRelease = false;
});
let mouse = null; // the cursor on screen, once it has moved over the page
window.addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY }; });
document.addEventListener('mouseleave', () => { mouse = null; });
window.addEventListener('mousedown', (e) => {
  sounds.wake(); // (the sound can start only once he's done something)
  if (talentsOpen) { // the talents' window: a click takes one
    const t = e.button === 0 && talents.takeAt(e.clientX, e.clientY, points);
    if (t) {
      points--; // (no sound)
      if (talentCue === 'frozen') { // (its cue done: he's free once the window's shut)
        talentCue = 'done';
        speech.letGo();
      }
      if (talentAsk && !points) talentAsk = false; // (a later one's ask: done with)
    }
    return;
  }
  if (e.button === 0) attackPressed = knifeHeld = true;
  if (e.button === 2) triggerHeld = true;
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) knifeHeld = false;
  if (e.button === 2) triggerHeld = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault()); // the right button fires
window.addEventListener('blur', () => {
  keys.clear();
  triggerHeld = knifeHeld = false;
});

function inputDirection() {
  let kx = 0, ky = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ky -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ky += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) kx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) kx += 1;
  const len = Math.hypot(kx, ky) || 1;
  return { dx: kx / len, dy: ky / len };
}

// Where the hero looks: from the middle of the body towards the cursor, as a ground direction (the
// ground isn't foreshortened on screen); null without a cursor or with it right on the body
// The angle (screen = ground) the hero aims at: the cursor's, or where he faces
function aimAngle() {
  const aim = aimDirection(), f = dirVector(me.dir);
  return aim && !me.roll ? Math.atan2(aim.dy, aim.dx) : Math.atan2(f.dy, f.dx);
}
let swayClock = 0; // the gun's aim's sway runs on this (see shotSway)

// The game holding still: a cue waiting for its key, a window open over it, or him dead
const gameHeld = () => me.hp <= 0 || journalCue.phase === 'frozen' || strike.phase === 'frozen' || talentCue === 'frozen' || talentsOpen
  || mapCue.phase === 'frozen' || mapOpen || journalOpen;
let heldAim = null; // the cursor as it was when the game last held still (the aim stays put through it), or null: it's going
function aimDirection() {
  const at = heldAim ?? mouse;
  if (!at) return null;
  const dx = at.x - (camX + toScreenX(me.x)), dy = at.y - (camY + toScreenY(me.y) - 30);
  return Math.hypot(dx, dy) < 6 ? null : { dx, dy };
}

hud.textContent = 'WASD — run, Space — roll, mouse — look';

// ---------- Fire, smoke and sparks: from the crashed pod and anything else burning ----------

// An object's model point (meters: x along it, y to its left, z up) -> world position + height (m)
function modelPoint(o, [mx, my, mz]) {
  const c = Math.cos(o.yaw ?? 0), s = Math.sin(o.yaw ?? 0);
  return { x: o.x + (mx * c - my * s) * UNITS_PER_M, y: o.y + (mx * s + my * c) * UNITS_PER_M, h: mz };
}
// Each object's sprite may list fires and smoke in its model (see tools/make-art.mjs)
// (where they are on the chart: placed again whenever it moves)
const sourcesOf = (key) => OBJECTS.flatMap((o) => (sprites.object(o.name)?.[key] ?? []).map((m) => modelPoint(o, m)));
const pod = OBJECTS.find((o) => o.name === 'pod');
let smokeSources, sparkSource, fireSources;
const craters = []; // where the rocket came down (see the strike below), and the crate of bottles blew up: { x, y, age, solid (its circle in OBSTACLES), small }
const CRATER_SOLID = 1.0 * UNITS_PER_M; // the bowl's circle the hero can't walk into
const CRATER_FIRES = [[-0.75, 0.3], [0.7, -0.2], [0.2, 0.7], [-0.2, -0.55]]; // meters off a crater's middle: it burns in the bowl
const SMALL_CRATER_FIRES = [[-0.1, 0.05], [0.12, -0.04]]; // (a small one's: a little fire, 'crater_small')
function placeSources() {
  // (and the strike's craters: they burn, smoke rising off them)
  smokeSources = [...sourcesOf('smoke'), ...craters.map((c) => ({ x: c.x, y: c.y, h: c.small ? 0.2 : 0.3, small: c.small }))];
  sparkSource = sprites.object('pod').sparks && modelPoint(pod, sprites.object('pod').sparks); // optional
  fireSources = [...sourcesOf('fires'), ...craters.flatMap((c) => (c.small ? SMALL_CRATER_FIRES : CRATER_FIRES)
    .map(([dx, dy]) => ({ x: c.x + dx * UNITS_PER_M, y: c.y + dy * UNITS_PER_M, h: 0, big: c.small ? 0.75 : 1.25 })))];
}
placeSources();
const firstFires = fireSources.length; // the fires there are to begin with
const particles = [];
let smokeTimer = 0, sparkTimer = 0, fireTimer = 0;
const reeks = []; // where a bug burst, its green reek rising a while: { x, y, t (seconds of it left) }
const REEK = [120, 170, 70]; // its color
const rand = (a, b) => a + Math.random() * (b - a);

// shotDt: the time for what the gun throws (cases, splinters): it goes on while the drill holds the world
function updateParticles(dt, shotDt = dt) {
  smokeTimer += dt;
  while (smokeTimer > 0.04) {
    smokeTimer -= 0.04;
    const src = smokeSources[Math.floor(Math.random() * smokeSources.length)];
    if (src) particles.push({ // (a small source's: a thin wisp)
      kind: 'smoke', x: src.x + rand(-3, 3), y: src.y + rand(-3, 3), h: src.h,
      vx: rand(6, 11), vy: rand(-4, -1), vh: rand(0.5, 0.85) * (src.small ? 0.7 : 1), age: 0, life: rand(3, 4.5) * (src.small ? 0.6 : 1), grow: rand(8, 12) * (src.small ? 0.45 : 1),
    });
  }
  sparkTimer += dt;
  while (sparkSource && sparkTimer > 0.18) {
    sparkTimer -= 0.18;
    particles.push({
      kind: 'spark', x: sparkSource.x + rand(-6, 6), y: sparkSource.y + rand(-4, 4), h: sparkSource.h,
      vx: rand(-5, 8), vy: rand(-5, 3), vh: rand(0.6, 1.4), age: 0, life: rand(0.5, 1.1),
    });
  }
  // Flames: short-lived tongues licking upwards; some turn into a wisp of smoke at the top
  // (as many tongues a second for each fire however many there are; a big fire's tongues are bigger)
  fireTimer += dt;
  const every = 0.007 * firstFires / Math.max(1, fireSources.length);
  while (fireSources.length && fireTimer > every) {
    fireTimer -= every;
    const fire = Math.floor(Math.random() * fireSources.length), src = fireSources[fire];
    // Tongues start wide near the middle of the fire and narrow as they rise
    const off = rand(-1, 1);
    particles.push({
      kind: 'fire', fire, x: src.x + off * 5 * (src.big ?? 1), y: src.y + rand(-2, 2), h: 0,
      vx: -off * 3 + rand(0, 3), vy: rand(-1, 1), vh: rand(0.8, 1.5) * (1 - Math.abs(off) * 0.4) * (src.big ?? 1),
      age: 0, life: rand(0.25, 0.6), size: rand(1.8, 3) * (src.big ?? 1), sway: rand(0, Math.PI * 2),
    });
    if (Math.random() < 0.015) particles.push({ // an ember flies up out of the fire
      kind: 'spark', fire, x: src.x + rand(-3, 3), y: src.y, h: 0.3, vx: rand(-4, 6), vy: rand(-3, 2), vh: rand(1.2, 2), age: 0, life: rand(0.8, 1.4),
    });
    if (Math.random() < 0.04) particles.push({
      kind: 'smoke', x: src.x, y: src.y, h: 0.45, vx: rand(5, 9), vy: rand(-3, -1), vh: rand(0.4, 0.7),
      age: 0, life: rand(1.5, 2.5), grow: rand(4, 6),
    });
  }
  for (let i = reeks.length - 1; i >= 0; i--) { // a thin green wisp off each, thinning out as it goes
    const r = reeks[i];
    if ((r.t -= dt) <= 0) { reeks.splice(i, 1); continue; }
    if (Math.random() < dt * 9 * Math.min(1, r.t / 1.5)) particles.push({
      kind: 'smoke', tint: REEK, x: r.x + rand(-3, 3), y: r.y + rand(-2, 2), h: 0.1,
      vx: rand(2, 6), vy: rand(-2, 0), vh: rand(0.25, 0.45), age: 0, life: rand(1.5, 2.5), grow: rand(3, 5),
    });
  }
  const worldDt = dt;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i], dt = p.kind === 'casing' || p.kind === 'clod' ? shotDt : worldDt;
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.h += p.vh * dt;
    if (p.kind === 'clod') { // thrown up, falling back
      p.vh -= 18 * dt;
      if (p.h < 0) { p.h = 0; p.vx = p.vy = p.vh = 0; }
    } else if (p.kind === 'casing') { // the same, but it bounces off the ground once or twice, rolling on, till it lies still
      if (!p.still) p.vh -= 18 * dt;
      if (p.h < 0) {
        p.h = 0;
        if (p.vh < -1.5) { p.vh *= -0.35; p.vx *= 0.5; p.vy *= 0.5; } else { p.vx = p.vy = p.vh = 0; p.still = true; }
      }
    } else p.vh *= 1 - 0.35 * dt; // smoke slows as it rises and spreads
  }
}

// A flickering orange glow around each fire, on the ground and on the capsule
function drawFireGlow(now) {
  ctx.globalCompositeOperation = 'lighter';
  fireSources.forEach((f, i) => {
    const x = camX + toScreenX(f.x), y = camY + toScreenY(f.y) - 6;
    const flicker = 0.75 + 0.15 * Math.sin(now * 0.017 + i * 2) + 0.1 * Math.sin(now * 0.041 + i);
    const r = 46 * flicker;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,120,40,${0.32 * flicker})`);
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  });
  ctx.globalCompositeOperation = 'source-over';
}

// Draws the particles that pass `which` (flames go in depth order with the bodies, the rest on top)
// Bits of things (blood, meat, cases, splinters, glass), flying low or come down on the sand: drawn with
// the things lying flat, under everyone
const onGround = (p) => p.kind === 'clod' || p.kind === 'casing' || p.kind === 'puddle';

function drawParticles(P, which) {
  const w = Math.ceil(canvas.width / P), h = Math.ceil(canvas.height / P);
  if (smokeLayer.width !== w || smokeLayer.height !== h) {
    smokeLayer.width = w;
    smokeLayer.height = h;
  }
  sctx.clearRect(0, 0, w, h);
  const H_PX = HEIGHT_PX * UNITS_PER_M; // screen px per meter of height
  // Smoke first, then flames added on top: where tongues overlap they add up into a hot core
  particles.sort((a, b) => (a.kind === 'fire') - (b.kind === 'fire') || (b.kind === 'puddle') - (a.kind === 'puddle')); // (puddles under the bits on them)
  for (const p of particles) {
    if (!which(p)) continue;
    const k = p.age / p.life;
    const sx = (camX + toScreenX(p.x)) / P, sy = (camY + toScreenY(p.y) - p.h * H_PX) / P;
    if (p.kind === 'puddle') { // a bug's slime on the sand: spreading out at first, fading at the end
      const spread = 0.4 + 0.6 * Math.min(1, p.age / 0.6), a = Math.min(1, (p.life - p.age) / (0.3 * p.life));
      sctx.fillStyle = `rgba(46, 88, 28, ${0.7 * a})`;
      for (const [dx, dy, r] of p.blobs) {
        sctx.beginPath();
        sctx.ellipse(sx + (toScreenX(dx) * spread) / P, sy + (toScreenY(dy) * spread) / P, (toScreenX(r) * spread) / P, (toScreenY(r) * spread) / P, 0, 0, Math.PI * 2);
        sctx.fill();
      }
    } else if (p.kind === 'smoke') {
      const fadeIn = Math.min(1, p.age / (0.15 * p.life));
      const g = 60 + 70 * k; // dark near the pod, lighter grey as it thins out (or its own color, lighter too)
      sctx.fillStyle = p.tint ? `rgba(${p.tint.map((v) => Math.round(v + 40 * k)).join(',')},${0.45 * fadeIn * (1 - k) ** 1.3})`
        : `rgba(${g},${g + 3},${g + 8},${0.7 * fadeIn * (1 - k) ** 1.3})`;
      sctx.beginPath();
      sctx.arc(sx, sy, 2 + k * p.grow, 0, Math.PI * 2);
      sctx.fill();
    } else if (p.kind === 'fire') {
      // A tongue of flame: a tall, swaying sliver, yellow near the bottom, orange then dark red as it
      // cools; drawn additively so overlapping tongues glow brighter
      const r = 255, g = Math.round(200 - 150 * k), b = Math.round(90 - 80 * k);
      const sway = Math.sin(p.sway + p.age * 22) * 0.6 * k;
      sctx.globalCompositeOperation = 'lighter';
      sctx.fillStyle = `rgba(${r},${g},${b},${0.9 * (1 - k * 0.8)})`;
      sctx.beginPath();
      sctx.ellipse(sx + sway, sy, p.size * (1 - k * 0.6) * 0.7, p.size * (1.1 + k), 0, 0, Math.PI * 2);
      sctx.fill();
      sctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'blaze') { // the blast's fireball: big hot blobs, yellow-white to red to soot
      const r = p.size * (0.6 + 0.8 * k), g = Math.round(230 - 180 * k), b = Math.round(150 - 140 * k);
      sctx.globalCompositeOperation = 'lighter';
      sctx.fillStyle = `rgba(255,${g},${Math.max(0, b)},${0.85 * (1 - k) ** 1.5})`;
      sctx.beginPath();
      sctx.arc(sx, sy, r / P, 0, Math.PI * 2);
      sctx.fill();
      sctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'casing') { // a brass sliver (or a black magazine, bigger, turning slower): flipping end over end in the air, glinting
      const flying = p.h > 0 || p.vx || p.vy, turn = Math.floor(p.spin + p.age * (p.mag ? 12 : 30)) % 2;
      const [w, h] = (flying && turn ? [1, 2] : [2, 1]).map((v) => v * (p.mag ? 2 : 1));
      sctx.globalAlpha = Math.min(1, 4 * (1 - k));
      sctx.fillStyle = p.mag ? (flying && turn ? '#3a3a40' : '#1a1a1e') : flying && turn ? '#f2d27a' : '#b8913e';
      sctx.fillRect(Math.round(sx), Math.round(sy), w, h);
      sctx.globalAlpha = 1;
    } else if (p.kind === 'clod') {
      sctx.globalAlpha = Math.min(1, 3 * (1 - k));
      sctx.fillStyle = p.color ?? 'rgb(40,34,32)';
      sctx.fillRect(Math.round(sx), Math.round(sy), p.size ?? 2, p.size ?? 2);
      sctx.globalAlpha = 1;
    } else {
      sctx.fillStyle = `rgba(255,${170 - 90 * k},60,${1 - k})`;
      sctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
    }
  }
  ctx.drawImage(smokeLayer, 0, 0, w * P, h * P);
}

// ---------- The bottles: a round that passes close enough to a standing one breaks it ----------

const bottles = OBJECTS.find((o) => o.name === 'bottles');
const BOTTLE_SPOTS = sprites.object('bottles').spots; // meters on the crate's top (x along, y to the left)
const BOTTLE_TOP = sprites.object('bottles').top; // the crate's height (meters): they stand on it
const BOTTLE_GLASS = ['#358e4c', '#ab5c22', '#9db3b1', '#358e4c']; // each one's glass, as the art has it
const CRATE_CHIPS = ['#a66136', '#61361b', '#cdad46', '#8e512b', '#9b7a27']; // the crate's wood and its straw, flying
const BOTTLE_R = 0.15 * UNITS_PER_M; // how close a round passes to hit one (a little more than it's drawn: from up here they're small)
bottles.frame = (1 << BOTTLE_SPOTS.length) - 1; // the sprite's frame: bit i, BOTTLE_SPOTS[i] still stands
let bottlesBroken = 0; // (the quest counts them)

// The nearest standing bottle a round from the hero along (dx, dy) hits within max: { i, t (how far) }, or null
function bottleInWay(dx, dy, max) {
  let best = null;
  BOTTLE_SPOTS.forEach(([sx, sy], i) => {
    if (!(bottles.frame & (1 << i))) return;
    const ox = bottles.x + sx * UNITS_PER_M - me.x, oy = bottles.y + sy * UNITS_PER_M - me.y, along = ox * dx + oy * dy;
    const off2 = ox * ox + oy * oy - along * along;
    if (off2 > BOTTLE_R * BOTTLE_R) return; // passes it by
    const t = along - Math.sqrt(BOTTLE_R * BOTTLE_R - off2);
    if (t >= 0 && t < max && (!best || t < best.t)) best = { i, t };
  });
  return best;
}

// How far a round from the hero along (dx, dy) goes within max: to whatever gives cover, or a standing bottle (bugs it goes through)
const aimHit = (dx, dy, max) => {
  const hit = rayHit(me.x, me.y, dx, dy, max);
  return bottleInWay(dx, dy, hit)?.t ?? hit;
};

// Bottle i (BOTTLE_SPOTS) is hit by a round going at angle a: it bursts
function breakBottle(hit, a) { // (hit: its i)
  bottles.frame &= ~(1 << hit);
  bottlesBroken++;
  // It bursts: glass flies on the shot's way mostly, glinting
  const bx = bottles.x + BOTTLE_SPOTS[hit][0] * UNITS_PER_M, by = bottles.y + BOTTLE_SPOTS[hit][1] * UNITS_PER_M;
  sounds.shatter(Math.max(-1, Math.min(1, (bx - me.x) / VISION))); // (heard from where it is)
  for (let i = 0; i < 16; i++) {
    const v = rand(15, 70), b = a + rand(-1.1, 1.1);
    particles.push({
      kind: 'clod', x: bx + rand(-2, 2), y: by + rand(-2, 2), h: BOTTLE_TOP + rand(0.1, 0.9), vx: Math.cos(b) * v, vy: Math.sin(b) * v,
      vh: rand(1, 4), age: 0, life: rand(5, 8), color: i % 4 ? BOTTLE_GLASS[hit] : '#e6f2ee', size: Math.random() < 0.25 ? 2 : 1, // (lying a while)
    });
  }
  if (!bottles.frame) { // the last one: the crate blows up with it, to bits flying the shot's way mostly (lying round a while), a small burning crater left
    objects.splice(objects.indexOf(bottles), 1);
    labels.pickedUp(bottles.name);
    removeObstacle(bottles.solid);
    const solid = { x: bottles.x, y: bottles.y, r: 0.3 * UNITS_PER_M }; // its fire: walked round, shot over
    addObstacle(solid);
    craters.push({ x: bottles.x, y: bottles.y, age: 0, solid, small: true });
    placeSources(); // it burns there now
    for (let i = 0; i < 50; i++) {
      const v = rand(15, 90), b = a + rand(-1.4, 1.4);
      particles.push({
        kind: 'clod', x: bottles.x + rand(-6, 6), y: bottles.y + rand(-3, 3), h: rand(0.1, BOTTLE_TOP + 0.1), vx: Math.cos(b) * v, vy: Math.sin(b) * v,
        vh: rand(1, 4.5), age: 0, life: rand(6, 10), color: CRATE_CHIPS[i % CRATE_CHIPS.length], size: Math.random() < 0.5 ? 3 : 2,
      });
    }
    for (let i = 0; i < 6; i++) particles.push({ // a puff of dust
      kind: 'smoke', x: bottles.x + rand(-6, 6), y: bottles.y + rand(-3, 3), h: rand(0.1, 0.4), vx: Math.cos(a) * rand(4, 12), vy: Math.sin(a) * rand(4, 12),
      vh: rand(0.1, 0.4), age: 0, life: rand(0.8, 1.4), grow: rand(5, 9),
    });
    setTimeout(() => speech.say('Probably shouldn’t have done that...'), 300);
  }
}
const BOTTLES_ALL = BOTTLE_SPOTS.length;

// ---------- The punching bag: a knife slash that reaches it cuts it, and it rocks; the second cut
// and it's in bits, its stand left ----------

const bag = OBJECTS.find((o) => o.name === 'bag');
const bagStand = OBJECTS.find((o) => o.name === 'bag_stand');
const SLASH_CUT = 0.55; // how far through a slash (0..1) the blade's in the middle of its sweep: it hits then
let bagHits = 0; // (the quest counts them)
let bagSwing = 0; // 1 right after a hit, dying down: how hard it rocks
const BAG_BITS = ['#9c221a', '#69130f', '#c8b48a', '#a5967c', '#1b1b22']; // its leather, the sand in it, its straps

// The bag's within the slash: its near side in reach, inside the arc where he aims
function bagInReach() {
  const dx = bag.x - me.x, dy = bag.y - me.y;
  const off = Math.atan2(Math.sin(Math.atan2(dy, dx) - aimAngle()), Math.cos(Math.atan2(dy, dx) - aimAngle()));
  return objects.includes(bag) && Math.hypot(dx, dy) - bagStand.solid.r <= SLASH_RANGE && Math.abs(off) <= SLASH_ARC / 2;
}

// A round in the bag: sand and bits of leather knocked out of it, back the shot's way mostly, and it shudders
function shootBag(a, x, y) {
  bagSwing = Math.max(bagSwing, 0.35);
  for (let i = 0; i < 5; i++) particles.push({
    kind: 'clod', x, y, h: rand(0.6, 1.2), vx: -Math.cos(a) * rand(8, 25) + rand(-12, 12), vy: -Math.sin(a) * rand(8, 25) + rand(-12, 12),
    vh: rand(0.3, 1.6), age: 0, life: rand(2, 4), color: BAG_BITS[(i + 2) % BAG_BITS.length], size: 2,
  });
}

function hitBag() {
  bagHits++;
  bagSwing = 1;
  const a = Math.atan2(bag.y - me.y, bag.x - me.x);
  if (bagHits >= BAG_HITS) { // in bits: leather and sand flying the cut's way, lying round a while; its stand left, low
    levelUp(); // (and a level for him, a talent point with it)
    objects.splice(objects.indexOf(bag), 1);
    labels.pickedUp(bag.name);
    bagStand.solid.cover = false;
    for (let i = 0; i < 50; i++) {
      const v = rand(15, 80), b = a + rand(-1.4, 1.4);
      particles.push({
        kind: 'clod', x: bag.x + rand(-5, 5), y: bag.y + rand(-3, 3), h: rand(0.35, 1.4), vx: Math.cos(b) * v, vy: Math.sin(b) * v,
        vh: rand(0.5, 3.5), age: 0, life: rand(6, 10), color: BAG_BITS[i % BAG_BITS.length], size: Math.random() < 0.5 ? 3 : 2,
      });
    }
    for (let i = 0; i < 8; i++) particles.push({ // a puff of the sand it was filled with
      kind: 'smoke', x: bag.x + rand(-5, 5), y: bag.y + rand(-3, 3), h: rand(0.4, 1.2), vx: Math.cos(a) * rand(4, 12), vy: Math.sin(a) * rand(4, 12),
      vh: rand(0.1, 0.4), age: 0, life: rand(0.8, 1.4), grow: rand(5, 9),
    });
    return;
  }
  for (let i = 0; i < 10; i++) particles.push({ // dust and sand out of the cut
    kind: 'clod', x: bag.x - Math.cos(a) * 6 + rand(-2, 2), y: bag.y - Math.sin(a) * 6 + rand(-2, 2), h: rand(0.6, 1.1),
    vx: -Math.cos(a) * rand(10, 30) + rand(-12, 12), vy: -Math.sin(a) * rand(10, 30) + rand(-12, 12), vh: rand(0.5, 2), age: 0, life: rand(0.6, 1.2),
    color: i % 3 ? '#c8b48a' : '#9c221a', size: 2,
  });
}
// The drill, once the backpack's picked up: off, waiting (for him to stand up with it), on (the world
// holds still, he can only aim, crouch and shoot), done (every bottle broken)
let drill = 'off';
// The rounds: counted once the drill's done: in the magazine; full
// magazines to put in he has no end of
const MAG = 10; // rounds in one
const RELOAD_SOUNDS = [[0.55, 'in'], [1, 'bolt']]; // a reload's sounds, at how far through it (0..1): the new one in, the bolt (as it's done: he can fire then)
// A reload started: the magazine out at once (or after seconds), heard then whether or not it goes on yet
// (running, it waits)
function startReload(after = 0) {
  ammo.reload = 0;
  sounds.reload('out', after);
}
let ammo = null; // { mag, reload (seconds into it, or null) }, or null: not counted yet
const drillShown = () => drill === 'waiting' || drill === 'on'; // what to do shows from the moment he has the gun

// ---------- Bugs: out of the safe zones, they come out of the dark for the hero ----------

// With him out of every safe zone (SAFE_ZONES, round the pod and the backpack), a pack of them
// (BUG_PACK) turns up every BUG_EVERY seconds just out of sight on one side, up to BUG_MAX
// alive at once (never inside a safe zone). Small and wild: they come at him at a good pace, weaving from side to
// side, and from BUG_LUNGE off throw themselves at him in a dash; round whatever's in the way, after
// him into the safe zones too, stopping at his feet. Close to him (in BUG_REACH, at his feet or keeping
// up with him as he runs) it bites, BUG_BITE.every seconds, a point of his health each (not while he
// rolls); the first a moment after it gets that close (at his feet, a shorter one). Each bite plays
// its animation (rearing up, then snapping at him), timed so the snap is when the bite lands: if he's
// got away by then, it snaps at nothing.
// A round takes BUG_SHOT off its life, a cut BUG_CUT, blood spraying; at none it bursts into meat, gone
const BUG_EVERY = [1, 1], BUG_PACK = [1, 3], BUG_MAX = 20, BUG_LIFE = 2, BUG_SHOT = 1, BUG_CUT = 2;
const BUG_LIFE_UP = 40; // px: its life's line over its feet
const SQUEALS = 0.6, SQUEAL_SHOT_LOUD = 2; // how often one squeals as it dies (shot or cut alike); shot, how much louder (heard over the gun)
// As fast as he sidesteps: backpedaling, they catch him up slowly; sideways, they keep up; running
// on, he gets away
const BUG_SPEED = GAIT_SPEED.left, BUG_STRIDE = GAIT_SPEED.left / GAIT_SPEED.run / 0.9; // (its legs' pace: the art's steps are drawn for 0.9 of his run)
const BUG_R = 0.3 * UNITS_PER_M; // its body's circle (hit by rounds and the knife)
const BUG_WEAVE = 0.7; // radians it swings off its way to him either side, weaving
const BUG_LUNGE = 2.5 * UNITS_PER_M, BUG_DASH = { time: 0.25, speed: 1.8, every: 1.2 }; // seconds, times its speed, seconds between
const BUG_NEAR = 0.7 * UNITS_PER_M, BUG_GONE = 2.5 * VISION; // it stops this close; left this far behind, it's dropped
const BUG_REACH = 1.3 * UNITS_PER_M; // it bites this close
const BUG_BITE = { first: 0.35, running: 0.75, every: 1 }; // seconds: from getting to his feet to its first bite, from getting close running alongside, then between bites
const BLOOD = ['#4a0606', '#6b0b0b', '#2e0404']; // dark red
const ICHOR = ['#3f7a1e', '#5c9a2c', '#2c5414']; // its green insides
const BONE = ['#e8e2cf', '#d2c9b0', '#f4f0e4', '#bfb59a']; // bits of its shell and bone, off-white
const MEAT = ['#5a0d0d', '#7a1818', '#3a0808', '#412917', '#26180d']; // its flesh, and bits of its brown hide
const bugs = []; // the live ones: { x, y, dir, life, moving, animOffset (ms), weave (its weaving's phase), dash (seconds left of one, or till the next can come: < 0), bite (seconds till its next, at him), attack (seconds into its bite's animation, or undefined) }
let bugTimer = rand(...BUG_EVERY);
// The safe zones where they are on the chart now: their centers' places (kept on it, picked up or not)
const safeZones = SAFE_ZONES.map((z) => ({ o: z.at, r: z.r }));
const inSafe = (x, y, pad = 0) => safeZones.some((z) => Math.hypot(x - z.o.x, y - z.o.y) < z.r + pad);

// A pack of n, out of sight round him on one side, each clear of solid things and the safe zones
function spawnPack(n) {
  const a = rand(0, Math.PI * 2);
  for (let k = 0, tries = 0; k < n && tries < 16; tries++) {
    const b = a + rand(-0.35, 0.35), d = VISION + rand(1, 2.5) * UNITS_PER_M, x = me.x + Math.cos(b) * d, y = me.y + Math.sin(b) * d;
    if (inSolid(x, y) || inSafe(x, y, BUG_R)) continue;
    bugs.push({ x, y, dir: dirFromVector(me.x - x, me.y - y), life: BUG_LIFE, moving: false, animOffset: rand(0, 1000), weave: rand(0, Math.PI * 2), dash: -rand(0, BUG_DASH.every) });
    k++;
  }
}
// (x, y) is in some solid thing's circle (with a bug's room round it)
const inSolid = (x, y) => objects.some((o) => o.solid && Math.hypot(o.solid.x - x, o.solid.y - y) < o.solid.r + BUG_R) || craters.some((c) => Math.hypot(c.x - x, c.y - y) < c.solid.r + BUG_R);

let bugMet = false; // the first one seen yet (noted in the journal)
function updateBugs(dt) {
  // The first one to come into sight on the way to the safe space: noted down
  if (!bugMet && quests.cue() === 'map' && bugs.some((b) => Math.hypot(b.x - me.x, b.y - me.y) < VISION)) {
    bugMet = true;
    quests.note('This place could be dangerous...'); // (in the journal, under the quest on)
  }
  if (!inSafe(me.x, me.y) && (bugTimer -= dt) <= 0) {
    bugTimer = rand(...BUG_EVERY);
    const alive = bugs.length;
    if (alive < BUG_MAX) spawnPack(Math.min(BUG_MAX - alive, Math.round(rand(...BUG_PACK))));
  }
  for (let i = bugs.length - 1; i >= 0; i--) {
    const b = bugs[i], dx = me.x - b.x, dy = me.y - b.y, d = Math.hypot(dx, dy);
    if (d > BUG_GONE) { bugs.splice(i, 1); continue; }
    b.moving = d > BUG_NEAR && dt > 0;
    if (b.attack !== undefined && (b.attack += dt) >= BUG_BITE_TIME) b.attack = undefined; // (its bite played out)
    if (d > BUG_REACH) b.bite = undefined; // (got away from it: the next time it's close it waits a moment again)
    else if (dt > 0 && (b.bite = (b.bite ?? (b.moving ? BUG_BITE.running : BUG_BITE.first)) - dt) <= 0) { // close: it bites
      b.bite = BUG_BITE.every;
      if (!me.roll) bitten(Math.atan2(-dy, -dx));
    }
    // Its bite's animation starts that much before the bite, for the snap to come as it lands
    if (b.bite !== undefined && b.attack === undefined && b.bite <= BUG_BITE_TIME * BUG_BITE_SNAP && b.bite > 0) b.attack = BUG_BITE_TIME * BUG_BITE_SNAP - b.bite;
    if (b.attack !== undefined) b.dir = dirFromVector(dx, dy); // (biting, turned to him)
    if (!b.moving) { b.dir = dirFromVector(dx, dy); continue; }
    // Close enough, and not too soon after the last: a dash at him, straight; else on its way, weaving
    b.dash -= dt;
    if (d < BUG_LUNGE && b.dash < -BUG_DASH.every) b.dash = BUG_DASH.time;
    const dashing = b.dash > 0;
    b.weave += dt * 7;
    const a = Math.atan2(dy, dx) + (dashing ? 0 : BUG_WEAVE * Math.sin(b.weave) * Math.min(1, d / BUG_LUNGE)), mx = Math.cos(a), my = Math.sin(a);
    if (b.attack === undefined) b.dir = dirFromVector(mx, my); // (biting, it stays turned to him)
    move(b, mx, my, dt, BUG_SPEED * (dashing ? BUG_DASH.speed : 1));
  }
}

// Experience for him: on to the next level each time there's enough, a talent point with each (none
// at the last: the bar stays full)
function gainXp(n) {
  if (level >= MAX_LEVEL) return;
  xp += n;
  while (level < MAX_LEVEL && xp >= xpFor(level)) {
    xp -= xpFor(level);
    levelUp();
  }
}
// The next level, its talent point with it
function levelUp() {
  if (level >= MAX_LEVEL) return;
  level++;
  if (level >= MAX_LEVEL) xp = 0;
  points++;
  hotbar.levelUp();
  sounds.levelUp();
  leveled.start();
  if (talentCue === 'done') talentAsk = true; // (the first one's cue holds everything still, his line and what to press in gold: those after it don't, what to press over him, in white, till he's spent it)
}

// A bug bites him, from angle a (it to him): a point of his health, a little of his blood out the far side
function bitten(a) {
  me.hp = Math.max(0, me.hp - 1);
  sounds.bite();
  for (let i = 0; i < 6; i++) {
    const v = rand(10, 35), c = a + rand(-0.8, 0.8);
    particles.push({
      kind: 'clod', x: me.x + rand(-2, 2), y: me.y + rand(-2, 2), h: rand(0.5, 1), vx: Math.cos(c) * v, vy: Math.sin(c) * v,
      vh: rand(0.5, 2), age: 0, life: rand(6, 9), color: BLOOD[i % BLOOD.length], size: 2,
    });
  }
}

// The bugs in the aim's cone: within the sway either side of where he aims (their bodies' edges), in
// range, nothing solid between
function bugsInCone() {
  const aim = aimAngle(), spread = shotSpread(), range = shotRange();
  return bugs.filter((b) => {
    const dx = b.x - me.x, dy = b.y - me.y, d = Math.hypot(dx, dy), off = Math.atan2(dy, dx) - aim;
    if (d < BUG_R) return true; // (on top of him)
    if (d - BUG_R > range || Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) > spread + Math.atan2(BUG_R, d)) return false;
    return rayHit(me.x, me.y, dx / d, dy / d, d) >= d - BUG_R;
  });
}

// (x, y), r round it, is within the knife's slash: its near side in reach, inside the arc where he aims
function inSlash(x, y, r) {
  const dx = x - me.x, dy = y - me.y, a = Math.atan2(dy, dx) - aimAngle();
  return Math.hypot(dx, dy) - r <= SLASH_RANGE && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) <= SLASH_ARC / 2;
}

// ---------- The turret by the campfire: it turns to the nearest bug in TURRET_RANGE it can see and,
// once its gun's on it, fires at it, a round every TURRET_EVERY: each a point off its life ----------

const turret = OBJECTS.find((o) => o.name === 'turret'); // (its aim: where its gun points, radians; frame: its sprite's for that)
const TURRET_TURN = 5, TURRET_ON = 0.12, TURRET_EVERY = 0.16; // radians a second it turns; how close to on it, to fire; seconds between rounds
let turretCool = 0;

function updateTurret(dt) {
  turretCool = Math.max(0, turretCool - dt);
  let target = null, best = Infinity;
  for (const b of bugs) { // (the nearest, with nothing solid in the way)
    const dx = b.x - turret.x, dy = b.y - turret.y, d = Math.hypot(dx, dy);
    if (d > TURRET_RANGE || d >= best || rayHit(turret.x, turret.y, dx / d, dy / d, d) < d - 2) continue;
    target = b;
    best = d;
  }
  if (target) {
    const want = Math.atan2(target.y - turret.y, target.x - turret.x), off = Math.atan2(Math.sin(want - turret.aim), Math.cos(want - turret.aim));
    turret.aim += Math.max(-TURRET_TURN * dt, Math.min(TURRET_TURN * dt, off));
    if (Math.abs(off) < TURRET_ON && !turretCool) {
      turretCool = TURRET_EVERY;
      const [out, side, up] = TURRET_MUZZLE, c = Math.cos(turret.aim), sn = Math.sin(turret.aim);
      shots.fire(turret.x + (c * out - sn * side) * UNITS_PER_M, turret.y + (sn * out + c * side) * UNITS_PER_M, up, target.x, target.y);
      sounds.shot();
      hurtBug(target, BUG_SHOT, turret.aim, true);
    }
  }
  turret.frame = ((Math.round((turret.aim / (Math.PI * 2)) * TURRET_FRAMES) % TURRET_FRAMES) + TURRET_FRAMES) % TURRET_FRAMES;
}

// Bug b hurt by n, from angle a: blood out of it the hit's way, it's knocked back a little; at none left
// it bursts (squealing now and then; shot: louder, over the gun), a spray of blood and chunks of meat flying (lying
// there a while), and it's gone
function hurtBug(b, n, a, shot = false) {
  b.life -= n;
  b.x += Math.cos(a) * 4;
  b.y += Math.sin(a) * 4;
  const dead = b.life <= 0;
  for (let i = 0; i < (dead ? 50 : 8); i++) { // blood: on its death a burst all round, the hit's way most
    const v = rand(10, dead ? 110 : 50), c = a + (dead ? (Math.random() < 0.6 ? rand(-0.9, 0.9) : rand(-Math.PI, Math.PI)) : rand(-1, 1));
    particles.push({
      kind: 'clod', x: b.x + rand(-2, 2), y: b.y + rand(-2, 2), h: rand(0.1, 0.4), vx: Math.cos(c) * v, vy: Math.sin(c) * v,
      vh: rand(0.5, dead ? 4 : 2.5), age: 0, life: rand(8, 12), color: BLOOD[i % BLOOD.length], size: Math.random() < 0.4 ? 3 : 2,
    });
  }
  if (!dead) return;
  gainXp(1);
  for (let i = 0; i < 18; i++) { // its green insides, splashing out with the blood
    const v = rand(10, 80), c = a + rand(-1.6, 1.6);
    particles.push({
      kind: 'clod', x: b.x + rand(-2, 2), y: b.y + rand(-2, 2), h: rand(0.1, 0.4), vx: Math.cos(c) * v, vy: Math.sin(c) * v,
      vh: rand(0.5, 3.5), age: 0, life: rand(8, 12), color: ICHOR[i % ICHOR.length], size: Math.random() < 0.4 ? 3 : 2,
    });
  }
  for (let i = 0; i < 10; i++) { // white bits of its shell and bone, flung out, a few big ones
    const v = rand(15, 70), c = a + rand(-1.8, 1.8);
    particles.push({
      kind: 'clod', x: b.x + rand(-3, 3), y: b.y + rand(-2, 2), h: rand(0.15, 0.4), vx: Math.cos(c) * v, vy: Math.sin(c) * v,
      vh: rand(1, 4), age: 0, life: rand(10, 14), color: BONE[i % BONE.length], size: i < 3 ? 4 : Math.random() < 0.5 ? 3 : 2,
    });
  }
  const blobs = [[0, 0, rand(0.35, 0.45)]]; // its slime pooling where it was, a few blobs round the middle
  for (let i = 0; i < 4; i++) {
    const c = rand(0, Math.PI * 2), d = rand(0.15, 0.35);
    blobs.push([Math.cos(c) * d * UNITS_PER_M, Math.sin(c) * d * UNITS_PER_M, rand(0.15, 0.28)]);
  }
  particles.push({ kind: 'puddle', x: b.x, y: b.y, h: 0, vx: 0, vy: 0, vh: 0, age: 0, life: rand(9, 12), blobs: blobs.map(([x, y, r], i) => [i ? x : 0, i ? y : 0, r * UNITS_PER_M]) });
  reeks.push({ x: b.x, y: b.y, t: 4 });
  sounds.splatter(Math.max(-1, Math.min(1, (b.x - me.x) / VISION)), Math.random() < SQUEALS, shot ? SQUEAL_SHOT_LOUD : 1); // (heard from where it is)
  for (let i = 0; i < 26; i++) { // meat: chunks of it, big and small, flung high and wide
    const v = rand(15, 90), c = a + rand(-2, 2);
    particles.push({
      kind: 'clod', x: b.x + rand(-4, 4), y: b.y + rand(-3, 3), h: rand(0.15, 0.4), vx: Math.cos(c) * v, vy: Math.sin(c) * v,
      vh: rand(1.5, 5), age: 0, life: rand(10, 14), color: MEAT[i % MEAT.length], size: i < 5 ? 5 : Math.random() < 0.5 ? 4 : 3,
    });
  }
  bugs.splice(bugs.indexOf(b), 1);
}

// ---------- The strike: on the way to the backpack a rocket comes down on the hero ----------

// Once: when he's done talking at the capsule and has gone STRIKE_CUE from it (clear of it, so he can
// roll any way), or, if he never stops there, as he runs to the backpack: everything stops, a red zone under him, the warning; Space, and
// he rolls out of it as a rocket comes down on it (STRIKE_FALL seconds from STRIKE_HEIGHT meters),
// blows up big and leaves a burning crater
const STRIKE_R = 1.4 * UNITS_PER_M; // the zone's radius
const STRIKE_NEAR = 15 * UNITS_PER_M; // this close to the backpack, it comes (a few steps out of the capsule)
const STRIKE_CUE = 3 * UNITS_PER_M; // from the capsule's side
const STRIKE_FALL = 0.7, STRIKE_HEIGHT = 9, STRIKE_BLAST = 0.9; // seconds, meters, seconds
const STRIKE_WARNING = 'My bald spot is tingling... something’s coming down!'; // he says it
const STRIKE_PROMPT = 'Roll out of the way or die!'; // and over his line, in gold, what to do
const STRIKE_PRESSED = 0.18; // seconds the prompt stays once Space is hit, its key pressed (filled)
// It comes in at a slant (STRIKE_SLANT, STRIKE_WAY in shared/world.js): the 'rocket' sprite, a
// smoke trail behind it; the blast leaves the 'crater' decal, burning
// Where the rocket is k (0..1) of the way down, from where it lands (screen px): x, y; the ground under
// it: gx, gy; how high (meters): h, and how far back along the ground (world units): back
function shellAt(k) {
  const h = STRIKE_HEIGHT * (1 - k * k), back = h * Math.tan(STRIKE_SLANT) * UNITS_PER_M;
  const gx = -toScreenX(STRIKE_WAY.x * back), gy = -toScreenY(STRIKE_WAY.y * back);
  return { gx, gy, x: gx, y: gy - h * HEIGHT_PX * UNITS_PER_M, h, back };
}
const strikes = createStrike(ctx);
let strike = { phase: 'armed' }; // armed, frozen, falling, blast, done; x, y: where (world units), t: seconds in the phase
const canRoll = () => strike.phase !== 'armed' && strike.phase !== 'frozen'; // (he learns to roll rolling clear of it: till then, no rolls)
const rollShown = () => strike.phase !== 'armed'; // (and it shows from when it holds him, Space to press)
let strikeClock = 0; // real seconds, for the zone's pulse (it beats on while the game holds)
let shake = 0; // the camera shaking after the blast (dies down to 0)
let trailTimer = 0;

function updateStrike(dt) {
  shake = Math.max(0, shake - dt * 2);
  for (const c of craters) c.age += dt;
  if (strike.phase === 'armed') {
    const bag = objects.find((o) => o.name === 'backpack');
    // (cue: he has spoken at the capsule; it comes once he's quiet and has walked off from it)
    const off = Math.hypot(pod.x - me.x, pod.y - me.y) - pod.solid.r;
    const cued = strike.cue !== undefined && speech.saying() !== pod.say && off >= STRIKE_CUE && !me.roll && !me.pick;
    const near = bag && quests.target() === 'backpack' && me.moving && !me.roll && !me.pick && Math.hypot(bag.x - me.x, bag.y - me.y) < STRIKE_NEAR;
    if (cued || near) {
      strike = { phase: 'frozen', x: me.x, y: me.y, t: 0, sound: sounds.incoming() }; // (heard from now, far off)
      speech.say(STRIKE_WARNING, true); // (kept up till he rolls)
    }
    return;
  }
  strike.t += dt;
  if (strike.phase === 'falling') { // fire and smoke streaming from its tail as it flies
    const at = shellAt(strike.t / STRIKE_FALL), tail = sprites.object('rocket').tail;
    const x = strike.x - STRIKE_WAY.x * at.back + tail[0] * UNITS_PER_M, y = strike.y - STRIKE_WAY.y * at.back + tail[1] * UNITS_PER_M, h = at.h + tail[2];
    for (trailTimer += dt; trailTimer > 0.008; trailTimer -= 0.008) {
      particles.push({ kind: 'blaze', x, y, h, vx: -STRIKE_WAY.x * 40 + rand(-6, 6), vy: -STRIKE_WAY.y * 40 + rand(-6, 6), vh: rand(1, 2.5), age: 0, life: rand(0.1, 0.22), size: rand(4, 8) });
      if (Math.random() < 0.6) particles.push({ kind: 'smoke', x, y, h, vx: rand(-4, 4), vy: rand(-4, 4), vh: rand(0, 0.3), age: 0, life: rand(0.8, 1.5), grow: rand(4, 8) });
    }
  }
  if (strike.phase === 'falling' && strike.t >= STRIKE_FALL) {
    Object.assign(strike, { phase: 'blast', t: 0 });
    shake = 1.6;
    const solid = { x: strike.x, y: strike.y, r: CRATER_SOLID }; // its bowl: walked round, shot over
    addObstacle(solid);
    craters.push({ x: strike.x, y: strike.y, age: 0, solid });
    placeSources(); // it burns there now
    explode(strike.x, strike.y);
    sounds.blast();
    const hit = Math.hypot(me.x - strike.x, me.y - strike.y) < STRIKE_R;
    quests.note('My own crew tried to kill me... Again... They launched a rocket! They are ruthless!'); // (in the journal, under the quest on)
    setTimeout(() => speech.say(hit ? 'Ugh... That hurt.' : 'Why do they hate me so much?'), 500);
  } else if (strike.phase === 'blast' && strike.t >= STRIKE_BLAST) strike.phase = 'done';
}

// ---------- The talents' cue: at his first new level (the bag cut to bits), once the slash is done,
// everything holds still; as for the map, a line over him and over it, in gold, what to press (T): till
// he takes a talent (the window shut with none taken, it's still on) ----------

const TALENT_LINE = 'I think I’ve learned something...'; // he says it
const TALENT_PROMPT = 'Pick a talent!'; // and over his line
let talentCue = 'armed'; // armed, frozen, done
let talentAsk = false; // a later level's: what to press, over him, kept up (the game going on) till its point's spent

function updateTalentCue() {
  if (talentCue === 'armed' && points > 0 && !talentsOpen && !me.slash) {
    talentCue = 'frozen';
    speech.say(TALENT_LINE, true); // (kept up till he takes one)
    quests.note('At least I learned something...'); // (in the journal, under the quest on)
  }
}

// ---------- The map's cue: once the quest to open it is on (after the talents') and he steps out of the
// safe zones, the slash done, everything holds still; as for the strike, a line over him and over it, in gold, what to press: till M opens the map ----------

const MAP_LINE = 'I think I saw something to the west...'; // he says it
const MAP_PROMPT = 'Check the map!'; // and over his line
let mapCue = { phase: 'armed', t: 0 }; // armed, frozen, pressed, done; t: seconds in the phase
let mapKnown = false; // the minimap and M: none till its cue holds him (Check the map!)

// ---------- The journal's cue: from the start everything holds still, a line over him and over it, in
// gold, what to press, as for the map: till J opens the journal. Till then there's no quest at the top
// right, and no J ----------

const JOURNAL_LINE = 'Yeah, it’s okay, I’m alive! Looks like my journal made it too.'; // he says it
const JOURNAL_PROMPT = 'Open your journal...'; // and over his line
let journalCue = { phase: 'armed', t: 0 }; // armed, frozen, pressed, done; t: seconds in the phase
const journalKnown = () => journalCue.phase === 'pressed' || journalCue.phase === 'done';

function updateJournalCue(dt) {
  if (journalCue.phase === 'armed') {
    journalCue = { phase: 'frozen', t: 0 };
    speech.say(JOURNAL_LINE, true); // (kept up till the journal's open)
  } else if (journalCue.phase === 'pressed' && (journalCue.t += dt) >= STRIKE_PRESSED) journalCue.phase = 'done';
}

function updateMapCue(dt) {
  if (mapCue.phase === 'armed') {
    if (quests.cue() === 'map' && !mapOpen && !me.slash && talentCue === 'done' && !talentsOpen && !inSafe(me.x, me.y)) { // (after the talents', once he steps out of the safe zones)
      mapCue = { phase: 'frozen', t: 0 };
      mapKnown = true; // (the minimap and M from now on)
      speech.say(MAP_LINE, true); // (kept up till the map's open)
    }
  } else if (mapCue.phase === 'pressed' && (mapCue.t += dt) >= STRIKE_PRESSED) mapCue.phase = 'done';
}

// The blast's smoke and the bits flying out of it
// A big one: a ball of fire rolling up, a column of black smoke, sparks and clods of earth flying
function explode(x, y) {
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, v = rand(40, 220);
    particles.push({ kind: 'spark', x, y, h: 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vh: rand(1, 7), age: 0, life: rand(0.4, 1.2) });
  }
  for (let i = 0; i < 40; i++) { // clods, falling back
    const a = Math.random() * Math.PI * 2, v = rand(30, 120);
    particles.push({ kind: 'clod', x, y, h: 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vh: rand(3, 8), age: 0, life: rand(1, 1.6) });
  }
  for (let i = 0; i < 46; i++) { // the fireball
    const a = Math.random() * Math.PI * 2, d = rand(0, STRIKE_R);
    particles.push({
      kind: 'blaze', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, h: rand(0, 1),
      vx: Math.cos(a) * rand(10, 40), vy: Math.sin(a) * rand(8, 30), vh: rand(1.5, 4), age: 0, life: rand(0.5, 1.1), size: rand(10, 22),
    });
  }
  for (let i = 0; i < 90; i++) { // the smoke, rising after it
    const a = Math.random() * Math.PI * 2, d = rand(0, STRIKE_R * 1.3);
    particles.push({
      kind: 'smoke', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, h: rand(0, 2),
      vx: Math.cos(a) * rand(8, 35) + rand(3, 10), vy: Math.sin(a) * rand(6, 25), vh: rand(1, 3.5), age: 0, life: rand(3, 6), grow: rand(16, 30),
    });
  }
}

// ---------- Vision: we see only a circle around us, everything farther lies in darkness ----------

const visionLayer = document.createElement('canvas');
const vctx = visionLayer.getContext('2d');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
let visionKey = '';

// Darkness beyond VISION around screen point (cx, cy), in art pixels with a dithered edge like the
// sprites. We stay on the same screen pixel, so the mask is only rebuilt when the window resizes.
function drawVision(P, cx, cy) {
  const w = Math.ceil(canvas.width / P), h = Math.ceil(canvas.height / P);
  const key = `${w}x${h}@${cx},${cy}`;
  if (key !== visionKey) {
    visionKey = key;
    visionLayer.width = w;
    visionLayer.height = h;
    const img = vctx.createImageData(w, h);
    const r = toScreenX(VISION) / P, edge = r * 0.6; // the outer part of the circle fades out
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x + 0.5 - cx / P, y + 0.5 - cy / P);
        let k = Math.max(0, Math.min(1, (d - (r - edge)) / edge)); // 0 = seen, 1 = dark
        k = k * k * (3 - 2 * k); // eases in and out: no visible rim at either end
        const th = (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16;
        const level = Math.min(16, Math.floor(k * 16 + th)); // 17 steps of darkness, dithered between
        img.data.set([4, 3, 8, Math.round((level / 16) * 235)], (y * w + x) * 4);
      }
    vctx.putImageData(img, 0, 0);
  }
  ctx.drawImage(visionLayer, 0, 0, w * P, h * P);
}

// ---------- Main loop ----------

// ---------- The log (for now: to find what hangs): errors, slow frames, and where each frame is, kept in
// the browser as it goes, so a frame that never ended is found when the page is loaded again. F9 saves it
// to a file ----------

const LOG = 'colonism.log', CRUMB = 'colonism.crumb';
const logLines = (() => { try { return JSON.parse(localStorage.getItem(LOG)) ?? []; } catch { return []; } })();
// What's going on, in short, for the log
const gameState = () => ({
  map: mapOpen, journal: journalOpen, talents: talentsOpen, journalCue: journalCue.phase, strike: strike.phase, talentCue, mapCue: mapCue.phase,
  quest: quests.save().current, hp: me.hp, level, bugs: bugs.length, particles: particles.length, fires: fireSources.length, x: Math.round(me.x), y: Math.round(me.y),
});
function log(what, detail = '') {
  const line = `${new Date().toISOString()} ${what}${detail ? ' ' + detail : ''} ${JSON.stringify(gameState())}`;
  console.warn('[colonism]', line);
  logLines.push(line);
  if (logLines.length > 300) logLines.splice(0, logLines.length - 300);
  try { localStorage.setItem(LOG, JSON.stringify(logLines)); } catch { /* (full, or none) */ }
}
// Where the frame is now (kept at once: if it never gets on from here, the next load finds it)
function crumb(stage) {
  try { localStorage.setItem(CRUMB, stage); } catch { /* (none) */ }
}
{ // the last session's last frame, if it never ended
  let stopped = null;
  try { stopped = localStorage.getItem(CRUMB); } catch { /* (none) */ }
  if (stopped && stopped !== 'idle') { logLines.push(`${new Date().toISOString()} LAST SESSION STOPPED IN A FRAME, at: ${stopped}`); console.warn('[colonism] last session stopped in a frame, at:', stopped); }
  log('loaded');
}
window.addEventListener('error', (e) => log('ERROR', `${e.message} ${e.error?.stack ?? ''}`.replace(/\s+/g, ' ')));
window.addEventListener('unhandledrejection', (e) => log('REJECTION', String(e.reason?.stack ?? e.reason).replace(/\s+/g, ' ')));
window.addEventListener('keydown', (e) => { // F9: the log, to a file
  if (e.code !== 'F9') return;
  e.preventDefault();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([logLines.join('\n')], { type: 'text/plain' }));
  a.download = `colonism-log-${Date.now()}.txt`;
  a.click();
});

let last = performance.now();
let clock = 0; // the game's time (ms): it stands still while the strike holds everything
let dead = 0; // seconds since he died (his health gone), or 0: alive
// Each frame, logged: where it is (crumbs), how long it took, any error in it (then on to the next
// frame all the same: an error doesn't stop the game)
function frame(real) {
  crumb('frame');
  const t0 = performance.now();
  try {
    step(real);
  } catch (e) {
    log('ERROR in frame', String(e?.stack ?? e).replace(/\s+/g, ' '));
    requestAnimationFrame(frame);
  }
  const took = performance.now() - t0;
  if (took > 250) log('SLOW FRAME', `${Math.round(took)} ms`);
  crumb('idle');
}
function step(real) {
  const realDt = Math.min((real - last) / 1000, 0.1);
  last = real;
  strikeClock += realDt;
  if (me.hp <= 0) { // dead: everything stops where it is, the screen goes dark, and it says so
    dead += realDt;
    keys.clear();
    spaceHit = attackPressed = triggerHeld = knifeHeld = false;
    mapOpen = false;
    heldAim ??= mouse && { ...mouse }; // (the aim held where it was: the cursor turns nothing till it goes on)
    render(clock, 0, realDt);
    const k = Math.min(1, dead / 1.5), W = canvas.width, H = canvas.height;
    ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, (dead - 0.5) / 1.2)); // (the words a moment after)
    ctx.font = `300 64px ${FONT}`;
    ctx.letterSpacing = '12px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#a3201a';
    ctx.fillText('YOU DIED', W / 2, H / 2);
    ctx.restore();
    requestAnimationFrame(frame);
    return;
  }
  updateJournalCue(realDt);
  if (journalCue.phase === 'frozen') { // the journal's cue: everything holds still till J opens it
    if (journalOpen) {
      journalCue = { phase: 'pressed', t: 0 };
      speech.letGo();
    }
    spaceHit = attackPressed = false;
    heldAim ??= mouse && { ...mouse };
    render(clock, 0, realDt);
    requestAnimationFrame(frame);
    return;
  }
  if (strike.phase === 'frozen') { // everything holds still until Space: then he rolls clear
    if (spaceHit) {
      const { dx, dy } = inputDirection();
      me.rollCooldown = 0;
      startRoll(me, dx, dy);
      hotbar.used('Space');
      sounds.roll();
      Object.assign(strike, { phase: 'falling', t: 0 });
      strike.sound?.land(STRIKE_FALL);
      speech.letGo();
    }
    spaceHit = attackPressed = false;
    heldAim ??= mouse && { ...mouse };
    render(clock, 0, realDt); // (he still talks)
    requestAnimationFrame(frame);
    return;
  }
  if (talentCue === 'frozen' && !talentsOpen) { // the same, till he takes a talent (T opens them)
    spaceHit = attackPressed = false;
    heldAim ??= mouse && { ...mouse };
    render(clock, 0, realDt);
    requestAnimationFrame(frame);
    return;
  }
  if (talentsOpen) { // the talents' window: everything holds still under it
    spaceHit = attackPressed = false;
    heldAim ??= mouse && { ...mouse };
    render(clock, 0, realDt);
    const box = talents.draw(canvas.width / 2, canvas.height / 2, points, mouse);
    // Over it, as over the map: its name on the left, its key held down (it's open), and Esc to shut it on the right
    labels.tag('Talents', 'T', Math.round(box.left) - labels.keyWidth('T'), box.top - 10, 1);
    labels.tag('Close', 'Esc', Math.round(box.left + box.w) - labels.tagWidth('Close', 'Esc'), box.top - 10, keys.has('Escape') ? 1 : 0);
    requestAnimationFrame(frame);
    return;
  }
  if (mapCue.phase === 'frozen') { // the same, till M opens the map
    if (mapOpen) {
      mapCue = { phase: 'pressed', t: 0 };
      speech.letGo();
    }
    spaceHit = attackPressed = false;
    heldAim ??= mouse && { ...mouse };
    render(clock, 0, realDt);
    requestAnimationFrame(frame);
    return;
  }
  if (mapOpen || journalOpen) { // the map, the journal: everything holds still under them, as under the talents
    spaceHit = attackPressed = false;
    heldAim ??= mouse && { ...mouse };
    render(clock, 0, realDt);
    requestAnimationFrame(frame);
    return;
  }
  spaceHit = false;
  heldAim = null; // (going again: the aim follows the cursor)
  const dt = realDt, now = (clock += dt * 1000);
  swayClock += dt;
  if (drill === 'waiting' && !me.pick) drill = 'on';
  if (drill === 'on' && bottlesBroken >= BOTTLES_ALL) {
    drill = 'done';
    quests.note('Had to sacrifice a few things...'); // (in the journal, under the quest on)
    ammo = { mag: MAG, reload: null };
  }
  const drilling = drill === 'on'; // the drill: the world stands still, he can only aim, crouch and shoot
  const worldDt = drilling ? 0 : dt;
  updateStrike(worldDt);
  updateTalentCue();
  updateMapCue(dt);

  // Holding E on a thing squats the hero for it as the key fills (me.squat, 0..1): when it's full
  // he's down and takes it. He stays put meanwhile, facing it; let go early, and he gets up as fast
  // as the key empties.
  const near = me.pick ? null : reachable();
  const holding = !!near?.pickup && keys.has('KeyE') && !me.roll && !waitRelease;
  held = holding ? held + dt : Math.max(0, held - 2 * dt);
  me.squat = me.pick ? 0 : held / HOLD_TIME;
  // A click slashes with the knife in front (armed only), standing or on the move. The gait's clock
  // restarts with it: the slash-on-the-move frames start the legs' cycle from its beginning, so after
  // the slash the gait goes on from where they leave it
  const free = hasBackpack && !me.slash && !me.fire && !me.roll && !me.pick && me.squat === 0; // armed, hands free
  medkitCool = Math.max(0, medkitCool - dt);
  me.knifeCool = Math.max(0, (me.knifeCool ?? 0) - dt); // (seconds till the knife's ready again: a slash and SLASH_COOLDOWN after it)
  if (attackPressed && free && !drilling && !me.knifeCool) {
    me.slash = { t: 0 };
    me.knifeCool = SLASH_TIME + SLASH_COOLDOWN;
    me.animOffset = -now;
    sounds.swish(SLASH_TIME * SLASH_CUT);
  }
  attackPressed = false;
  if (me.slash && (me.slash.t += dt) >= SLASH_TIME) me.slash = null;
  if (me.slash && !me.slash.done && me.slash.t >= SLASH_TIME * SLASH_CUT) { // the cut: whatever it reaches is hit, once
    me.slash.done = true;
    const intoBag = bagInReach(), cutBugs = bugs.filter((b) => inSlash(b.x, b.y, BUG_R)); // (a copy: the dead drop out of bugs)
    if (intoBag) hitBag();
    for (const b of cutBugs) hurtBug(b, BUG_CUT, Math.atan2(b.y - me.y, b.x - me.x));
    if (cutBugs.length) sounds.cut('flesh');
    else if (intoBag) sounds.cut('bag');
  }
  bag.jolt = bagSwing > 0 ? Math.sin(now / 1000 * 26) * 3 * bagSwing : 0; // (px, the bag rocking)
  bagSwing = Math.max(0, bagSwing - dt * 1.6);
  // The right button held fires the gun in bursts: up at once, the first round going off the moment
  // it's pressed (and caught again while it's being lowered), FIRE_ROUNDS rounds over each cycle of
  // the gait's clock (the firing loops keep step with it) while it's held, lowered when it's let go.
  // Standing, the clock restarts with it, so the next round comes a whole round's time after the first
  const ready = hasBackpack && !me.slash && !me.roll && !me.pick && me.squat === 0; // (as free, but the gun may be on its way down)
  if (triggerHeld && ready && (!me.fire || me.fire.phase === 'out')) {
    if (!me.moving) me.animOffset = -now;
    me.fire = { phase: 'loop', t: 0, round: null };
  }
  if (me.fire) {
    const f = me.fire;
    f.t += dt;
    if (f.phase === 'loop' && (!triggerHeld || me.roll || me.pick || me.squat > 0)) {
      if (me.moving || me.roll) me.fire = null;
      else Object.assign(f, { phase: 'out', t: 0 });
    } else if (f.phase === 'loop') {
      const cycle = !me.moving ? GAIT_CYCLE.stand : me.crouch ? CROUCH_CYCLE : GAIT_CYCLE[me.gait]; // sneaking, slower
      const round = Math.floor((((now + me.animOffset) / 1000) / cycle) * FIRE_ROUNDS);
      if (round !== f.round) {
        f.round = round;
        fireRound();
      }
    }
    if (me.fire?.phase === 'out' && me.fire.t >= AIM_OUT_TIME) me.fire = null;
  }
  // Reloading goes on while he stands (on the move too, with the talent; running without it, it waits
  // where it is): with the trigger held through it, he fires on once it's done
  if (ammo && ammo.reload !== null && (!me.moving || talents.has('runreload'))) {
    const was = ammo.reload / RELOAD_TIME;
    ammo.reload += dt;
    const k = ammo.reload / RELOAD_TIME; // (its sounds as it gets to them)
    for (const [at, part] of RELOAD_SOUNDS) if (was < at && k >= at) sounds.reload(part);
    if (ammo.reload >= RELOAD_TIME) {
      Object.assign(ammo, { mag: MAG, reload: null });
      me.animOffset = -now; // (the gait's clock from the start again: the reload's legs end where a cycle starts)
    }
  }
  const busy = me.pick || me.squat > 0 || drilling;
  me.crouch = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !me.roll && !me.pick && me.squat === 0; // Shift held: crouched, sneaking (in the drill too: aiming crouched)
  const input = busy ? { dx: 0, dy: 0 } : inputDirection();
  if (!busy && canRoll() && now - rollPressed < 150 && startRoll(me, input.dx, input.dy)) {
    rollPressed = -Infinity;
    hotbar.used('Space');
    sounds.roll();
  }
  // Slashing or firing, he stands still for it, unless a talent lets him do it on the move (a roll he
  // can still throw himself into)
  const planted = (me.slash && !talents.has('runslash')) || (me.fire && !talents.has('runfire'));
  const { dx, dy } = planted ? { dx: 0, dy: 0 } : input;
  me.moving = dx !== 0 || dy !== 0;
  // The hero looks at the cursor and runs any way, sideways or backwards too; rolling, he faces the
  // roll (startRoll turns him). Without a cursor he looks where he runs.
  const aim = aimDirection();
  if (me.pick) updatePick(dt);
  else if (!updateRoll(me, dt)) {
    if (me.squat > 0) { if (near) me.dir = dirFromVector(near.x - me.x, near.y - me.y); } // turned to it
    else if (aim) me.dir = dirFromVector(aim.dx, aim.dy);
    else if (me.moving) me.dir = dirFromVector(dx, dy);
    if (me.moving) {
      me.gait = gait(me.dir, dx, dy); // forwards, backpedaling or sidestepping, each its own speed
      move(me, dx, dy, dt, GAIT_SPEED[me.gait] * (me.crouch ? CROUCH_SPEED : 1));
      // A footstep on the sand at each half of the legs' cycle, softer sneaking: counted on evenly by
      // the time gone at the gait's pace (a change of gait, or the clock reset by a slash, never sets
      // two off at once); the first soon after he sets off
      me.stride += (dt * 2) / (me.crouch ? CROUCH_CYCLE : GAIT_CYCLE[me.gait]);
      if (me.stride >= 1) {
        me.stride %= 1;
        sounds.step(me.crouch ? 0.4 : me.gait === 'run' ? 1 : 0.75);
      }
    } else me.stride = 0.7;
  }
  if (near && usePressed && !me.roll && !drilling) { // starting to use something: whatever the hero was saying is cut off
    speech.hush();
    if (near.say && !near.speaks) speech.say(near.say); // (a thing's line is the hero's; one that speaks says its own)
    if (near.heals) me.hp = HP; // (warming himself by it: health back, all of it; no sound for now: sounds.heal())
    if (near.name === 'fellow') { // he speaks; before the hero's warmed himself by the fire, the old man sends him to it (not a talk yet)
      fellowSpeech.say(firesideUsed ? near.say : 'Oh, a visitor! I do love visitors! Looks like you need to warm up. Don’t be shy!');
      if (firesideUsed && !fellowTalked) { // (the talk, once: noted in the journal, under the quest to have it)
        fellowTalked = true;
        quests.note('Nothing interesting so far...');
      }
    }
    if (near.name === 'campfire') firesideUsed = saving = true; // (the safe space reached; and he'll start from here next time: kept once the quests have taken it in, below)
    if (near.name === 'pod' && strike.phase === 'armed') strike.cue = true; // when he's done talking and walks off, it comes
  }
  usePressed = false;
  if (holding && held >= HOLD_TIME) {
    sounds.done(); // (the key's click the other way round: it's full)
    pickUp(near);
    held = 0;
    waitRelease = true;
  }
  quests.update({ dt, running: me.moving && !me.roll, dx, dy, aim: aim && Math.atan2(aim.dy, aim.dx), hasBackpack, bottlesBroken, bagHits, talentsTaken: TALENTS.filter((tl) => talents.has(tl.id)).length, firesideUsed, fellowTalked });
  if (!fellowSeen && Math.hypot(fellowObj.x - me.x, fellowObj.y - me.y) < VISION) fellowSeen = true; // (on the map from now on)
  for (const o of objects) if (o.breathes) o.frame = Math.floor((clock / 1000) * 1.3) % (sprites.object(o.name)?.frames ?? 1); // (breathing, slowly)
  if (saving) {
    saving = false;
    saveCheckpoint();
  }
  crumb('bugs');
  updateBugs(worldDt);
  crumb('turret');
  updateTurret(worldDt);
  crumb('update');
  // The fires he can see, heard: each nearer (within his sight) adds to it, his own close by the most
  { // the bugs in sight: how near (and how many), and which side, mostly
    let near = 0, side = 0;
    for (const b of bugs) {
      const k = Math.max(0, 1 - Math.hypot(b.x - me.x, b.y - me.y) / VISION) ** 2;
      near += k;
      side += k * Math.max(-1, Math.min(1, (b.x - me.x) / VISION));
    }
    sounds.bugs(Math.min(1, near), near ? side / near : 0, dt);
  }
  sounds.fire(Math.min(1, fireSources.reduce((n, f) => n + Math.max(0, 1 - Math.hypot(f.x - me.x, f.y - me.y) / VISION) ** 2, 0)), dt);
  // Gone far enough from the chart's origin: the chart moves to us, and everything on it with it
  // (turned round us by next to nothing: whatever is near us on the old chart goes on the new one so)
  if (Math.hypot(me.x - SPAWN.x, me.y - SPAWN.y) > RECENTER) {
    const sx = me.x - SPAWN.x, sy = me.y - SPAWN.y, next = recenter(chart, me.x, me.y);
    const c = Math.cos(next.turn), s = Math.sin(next.turn);
    const carry = (p) => {
      const x = p.x - me.x, y = p.y - me.y;
      return Object.assign(p, { x: SPAWN.x + x * c - y * s, y: SPAWN.y + x * s + y * c });
    };
    const gc = Math.cos(sand.turn), gs = Math.sin(sand.turn);
    sand.x += sx * gc - sy * gs;
    sand.y += sx * gs + sy * gc;
    sand.turn -= next.turn;
    chart = next.chart;
    for (const p of particles) carry(p);
    for (const r of reeks) carry(r); // (where the bugs burst, their reek rising)
    for (const b of bugs) carry(b);
    for (const c of craters) {
      carry(c);
      carry(c.solid);
    }
    if (strike.x !== undefined) carry(strike);
    shots.carry(carry);
    me.x = SPAWN.x;
    me.y = SPAWN.y;
    placeSources();
  }
  crumb('particles');
  updateParticles(worldDt, dt);

  render(now, dt);
  requestAnimationFrame(frame);
}

// ---------- The checkpoint: at the safe space's campfire (E), where he's got to is kept in the browser;
// the next time the game starts, it starts there: by the fire, all the way through what came before it
// (the backpack and the gun, the drill, the bag, the strike, the journal, the talents, the map), his
// level, experience, talent points and talents, his medkits and the quests (their notes too) as they
// were, his health full ----------

const CHECKPOINT = 'colonism.checkpoint';
// The map's sectors (the grid's cells) where there's something to do: each explored (made it through: at
// the safe space's checkpoint) and its main activity done or not (the escape pod's: the backpack found;
// the safe space's: its campfire used). Explored, light green on the map; its main activity done, hatched
// (the escape pod's done (D1) opens it and the safe space's (C2))
const SECTORS = [
  { at: () => pod.home, explored: () => hasBackpack || checkpointReached, activity: () => hasBackpack },
  { at: () => STRUCTURES.home, explored: () => hasBackpack || checkpointReached, activity: () => firesideUsed },
];
const sectorCells = () => SECTORS.flatMap((s) => [
  ...(s.explored() ? [{ at: s.at(), color: 'rgba(175, 225, 175, 0.17)' }] : []),
  ...(s.activity() ? [{ at: s.at(), hatch: 'rgba(175, 225, 175, 0.35)' }] : []),
]);
let checkpointReached = false, firesideUsed = false, fellowTalked = false, fellowSeen = false, saving = false;
const fellowObj = OBJECTS.find((o) => o.name === 'fellow'); // (firesideUsed: its campfire used, the quest to get there done; saving: to keep where he's got to, this frame)
function saveCheckpoint() {
  checkpointReached = true;
  try {
    localStorage.setItem(CHECKPOINT, JSON.stringify({ level, xp, points, talents: talents.taken(), medkits, quests: quests.save() }));
  } catch { /* (no storage: nothing kept) */ }
}
function loadCheckpoint() {
  let saved = null;
  try {
    if (new URLSearchParams(location.search).has('new')) localStorage.removeItem(CHECKPOINT); // (?new: from the very start again, the checkpoint dropped)
    saved = JSON.parse(localStorage.getItem(CHECKPOINT));
  } catch { /* (none, or unreadable) */ }
  if (!saved) return;
  checkpointReached = firesideUsed = true;
  ({ level, xp, points, medkits } = saved);
  talents.restore(saved.talents);
  quests.load(saved.quests);
  // All that came before it, done: the backpack on, the gun counted out, the bottles and the bag gone,
  // every cue past
  hasBackpack = true;
  me.sprite = 'hero_pack';
  for (const o of [objects.find((o) => o.name === 'backpack'), bottles, bag]) {
    if (!objects.includes(o)) continue;
    objects.splice(objects.indexOf(o), 1);
    if (o.solid) removeObstacle(o.solid);
  }
  bagStand.solid.cover = false;
  bottles.frame = 0;
  bottlesBroken = BOTTLES_ALL;
  bagHits = BAG_HITS;
  drill = 'done';
  ammo = { mag: MAG, reload: null };
  strike = { phase: 'done' };
  journalCue = { phase: 'done', t: 0 };
  talentCue = 'done';
  mapCue = { phase: 'done', t: 0 };
  mapKnown = true;
  bugMet = true;
  // Him by the fire, on its near side (the chart comes to him on the first frame)
  me.x = STRUCTURES.x;
  me.y = STRUCTURES.y + 1.6 * UNITS_PER_M;
}
loadCheckpoint();
requestAnimationFrame(frame);

// ---------- Rendering ----------

const GAIT_ANIM = { run: 'walk', back: 'back', left: 'strafeL', right: 'strafeR' }; // animations in sprites.json
const SLASH_ANIM = { run: 'slashRun', back: 'slashBack', left: 'slashL', right: 'slashR' }; // the slash on the move
const SNEAK_ANIM = { run: 'sneak', back: 'sneakBack', left: 'sneakL', right: 'sneakR' }; // crouched, on the move
const RELOAD_ANIM = { run: 'reloadRun', back: 'reloadBack', left: 'reloadL', right: 'reloadR' }; // reloading on the move (with the talent)
const FIRE_ANIM = { stand: 'fire', run: 'fireRun', back: 'fireBack', left: 'fireStrafeL', right: 'fireStrafeR' }; // firing loops (+ the aim's -, '' or +)

// The debug window at the top left: every field of the hero (whatever he has, new ones too) and the
// rest of his state, then the bugs, one line each; redrawn ten times a second
const DEBUG_EVERY = 100; // ms
const DEBUG_BUGS = 10; // the bugs listed (the rest only counted)
let debugAt = -Infinity;
const show = (v) => v === null || v === undefined ? '—' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2))
  : typeof v === 'boolean' ? (v ? 'yes' : 'no') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k} ${show(x)}`).join(', ') : String(v);
function updateDebug() {
  const t = performance.now();
  if (t - debugAt < DEBUG_EVERY) return;
  debugAt = t;
  const row = (k, v) => `${k.padEnd(12)} ${v}`;
  const lines = ['HERO',
    ...Object.entries(me).map(([k, v]) => row(k, k === 'x' || k === 'y' ? `${show(v / UNITS_PER_M)} m` : show(v))),
    row('health', `${me.hp} / ${HP}`),
    row('level', `${level} (xp ${xp} / ${xpFor(level)}, points ${points})`),
    row('talents', TALENTS.filter((tl) => talents.has(tl.id)).map((tl) => tl.id).join(', ') || '—'),
    row('backpack', show(hasBackpack)),
    row('medkits', `${medkits} / ${MEDKITS}`),
    row('ammo', ammo ? `${ammo.mag} / ${MAG}${ammo.reload !== null ? `, reloading ${show(ammo.reload)} / ${show(RELOAD_TIME)} s` : ''}` : '—'),
    '', `BUGS ${bugs.length}`,
    ...bugs.slice(0, DEBUG_BUGS).map((b) => `${show(Math.hypot(b.x - me.x, b.y - me.y) / UNITS_PER_M).padStart(6)} m  life ${show(b.life)}  ${b.moving ? 'moving' : 'still'}  dash ${show(b.dash)}  bite ${show(b.bite)}`),
    ...(bugs.length > DEBUG_BUGS ? [`  … ${bugs.length - DEBUG_BUGS} more`] : []),
  ];
  debugBox.textContent = lines.join('\n');
}

// talkDt: how far his line types on (the strike's freeze stops the rest, not that)
function render(now, dt, talkDt = dt) {
  updateDebug();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const PX = sprites.scale;
  // The camera is locked to our snapped position: we stay on the same screen pixel and the world
  // scrolls under us in whole art pixels (no 1px wobble when moving diagonally)
  camX = snap(W / 2) - snap(toScreenX(me.x));
  camY = snap(H / 2 + 20) - snap(toScreenY(me.y));
  if (shake > 0) { // the blast shakes the ground: the world jolts under us
    camX += snap((Math.random() - 0.5) * 16 * shake);
    camY += snap((Math.random() - 0.5) * 16 * shake);
  }

  // Sand: drawn on its own canvas under this one
  const art = (v) => (v * ZOOM) / PX; // world units -> art pixels
  drawGround(W, H, PX, camX, camY, PX / ZOOM / UNITS_PER_M, { origin: [art(SPAWN.x), art(SPAWN.y)], shift: [art(sand.x), art(sand.y)], turn: sand.turn });

  // Objects: decals (scorched ground) lie under everything, then shadows
  const placed = objects.map((o) => ({ ...o, sx: snap(camX + toScreenX(o.x) + (o.jolt ?? 0)), sy: snap(camY + toScreenY(o.y)) })); // (jolt: px it's knocked aside)
  for (const o of placed) sprites.drawObject(ctx, o.sprite ?? o.name, 'decal', o.sx, o.sy);
  for (const c of craters) sprites.drawObject(ctx, c.small ? 'crater_small' : 'crater', 'body', snap(camX + toScreenX(c.x)), snap(camY + toScreenY(c.y))); // flat: with the decals
  const sx = strike.x !== undefined && camX + toScreenX(strike.x), sy = strike.x !== undefined && camY + toScreenY(strike.y);
  if (strike.phase === 'frozen' || strike.phase === 'falling') { // where it'll come down, under everything standing
    strikes.zone(sx, sy, toScreenX(STRIKE_R), strikeClock, strike.phase === 'falling' ? strike.t / STRIKE_FALL : 0);
    if (strike.phase === 'falling') { // its shadow on the ground under it, closing in
      const at = shellAt(strike.t / STRIKE_FALL);
      strikes.shadow(sx + at.gx, sy + at.gy, strike.t / STRIKE_FALL);
    }
  }
  for (const o of placed) sprites.drawObject(ctx, o.sprite ?? o.name, 'shadow', o.sx, o.sy);
  // Things lying flat on the ground go under the characters whichever side they stand on
  for (const o of placed) if (o.flat) sprites.drawObject(ctx, o.sprite ?? o.name, 'body', o.sx, o.sy);
  drawParticles(PX, onGround); // the bits of things with them
  // Armed, the knife's reach on the sand in front of us, towards where we aim (or face): over the
  // things lying flat (they don't stop it), under all standing there (the ones that do cut it short),
  // and under us
  if (hasBackpack) {
    const angle = aimAngle();
    reach.draw(snap(camX + toScreenX(me.x)), snap(camY + toScreenY(me.y)), toScreenX(SLASH_RANGE), angle, SLASH_ARC,
      me.slash ? me.slash.t / SLASH_TIME : null, dt, !!me.roll, toScreenX(shotRange()), // gone while rolling
      (a, px) => toScreenX(aimHit(Math.cos(a), Math.sin(a), px / toScreenX(1))), // stopped by solid things, and the bottles
      shotSpread(), me.fire?.phase === 'loop' ? 0.5 + 0.5 * Math.exp(-(clock - lastShotAt) / 90) : 0, // the cone lit while firing, flaring with each round
      Math.min(1, (me.knifeCool ?? 0) / SLASH_COOLDOWN)); // the knife getting ready again: the sector empty through the slash, then filling back in
    // The rounds left in the magazine, on the sand along the aim, just to the right of its line (as he
    // looks): a square for each, in a row (they run down from the far end;
    // reloading, they fill back in from the near end, pale red to white; the empty ones blink pale red
    // while it's empty). Not there with something solid in the way before its end (the aim's line stops there)
    const along = toScreenX(SLASH_RANGE) + 4; // (just past the knife's reach)
    const end = along + 4 * MAG - 1, clear = toScreenX(aimHit(Math.cos(angle), Math.sin(angle), end / toScreenX(1))) >= end;
    if (ammo && !me.roll && clear) {
      const gap = 5; // px off the line
      ctx.save();
      ctx.translate(camX + toScreenX(me.x), camY + toScreenY(me.y));
      ctx.rotate(angle); // x on along the aim, y to its right
      const blink = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 5), k = ammo.reload !== null ? ammo.reload / RELOAD_TIME : null;
      const full = k !== null ? Math.floor(MAG * k) : ammo.mag; // (reloading: the ones in already)
      const on = k !== null ? `rgba(255, ${Math.round(140 + 115 * k)}, ${Math.round(120 + 135 * k)}, ${0.45 + 0.15 * k})` : 'rgba(255, 255, 255, 0.6)';
      const off = k !== null ? `rgba(255, 110, 90, ${0.15 + 0.3 * blink})` : 'rgba(255, 255, 255, 0.15)';
      for (let i = 0; i < MAG; i++) {
        ctx.fillStyle = i < full ? on : off;
        ctx.fillRect(along + 4 * i, gap, 3, 3);
      }
      ctx.restore();
    }
  }
  // The roll getting ready again: a ring inside his health's, two of its rings' steps in (there in a roll too)
  const rollGone = me.roll ? me.roll.t : ROLL_TIME + ROLL_COOLDOWN - (me.rollCooldown ?? 0); // (seconds since a roll started)
  const rollCool = Math.max(0, 1 - rollGone / (ROLL_TIME + ROLL_COOLDOWN));
  if (rollShown()) reach.roll(snap(camX + toScreenX(me.x)), snap(camY + toScreenY(me.y)), toScreenX(HEALTH_R) - 2 * RING_STEP, aimAngle() + Math.PI, rollCool, dt);
  // His health, a ring on the sand round him (there in a roll too, unlike the reach)
  reach.health(snap(camX + toScreenX(me.x)), snap(camY + toScreenY(me.y)), toScreenX(HEALTH_R), aimAngle() + Math.PI, me.hp, HP, strikeClock); // (the pulse on real time)

  // Characters, farther up the screen first. All shadows go on the ground before any body.
  const players = [me];
  // Each character's screen position is snapped to the art pixel grid once; shadow and body are
  // both drawn from it, so they never jitter against each other
  // Reloading: it plays over the reload, the gun's trigger held or not; standing, or on the move with
  // the talent (without it, the reload waits while he runs, and he just runs on)
  const reloading = (p) => p === me && ammo?.reload != null && (!p.moving || talents.has('runreload')) && !p.roll && !p.slash && !p.pick && p.squat === 0;
  const pose = (p) => ({
    x: snap(camX + toScreenX(p.x)), y: snap(camY + toScreenY(p.y)), dir: p.dir,
    // The roll, the slash, the reload and picking up play once, from their start
    // (squatting while E fills, the pick animation's way down follows the key)
    time: p.roll ? p.roll.t * 1000 : p.slash ? p.slash.t * 1000 : reloading(p) ? ammo.reload * 1000 : p.fire && p.fire.phase !== 'loop' ? p.fire.t * 1000 : p.pick ? p.pick.t * 1000
      : p.squat > 0 ? p.squat * PICK_GRAB * PICK_TIME * 1000 : now + p.animOffset,
    anim: p.roll ? 'roll' : p.slash ? crouched(p.moving ? SLASH_ANIM[p.gait] : 'slash')
      : reloading(p) ? crouched(p.moving ? RELOAD_ANIM[p.gait] : 'reload')
      : p.fire ? { in: crouched('aimIn'), loop: fireAnim(), out: crouched('aimOut') }[p.fire.phase]
      : p.pick || p.squat > 0 ? 'pick'
      : p.crouch ? (p.moving ? SNEAK_ANIM[p.gait] : 'crouch') : p.moving ? GAIT_ANIM[p.gait] : 'idle',
  });
  for (const p of players) sprites.drawCharacterShadow(ctx, p.sprite, pose(p));
  // Biting, the whole bug's thrown at him too (the art's small): drawn drawing back a little as it rears
  // up, then jumping BUG_BITE_JUMP at him for the snap, and back (meters)
  const BUG_BITE_JUMP = 0.35;
  const biteJump = (k) => (k < BUG_BITE_SNAP ? -0.1 * (k / BUG_BITE_SNAP) + (BUG_BITE_JUMP + 0.1) * Math.max(0, (k - BUG_BITE_SNAP + 0.15) / 0.15)
    : BUG_BITE_JUMP * (1 - (k - BUG_BITE_SNAP) / (1 - BUG_BITE_SNAP)));
  const bugAt = (b) => {
    if (b.attack === undefined) return b;
    const dx = me.x - b.x, dy = me.y - b.y, d = Math.hypot(dx, dy) || 1, j = biteJump(b.attack / BUG_BITE_TIME) * UNITS_PER_M;
    return { x: b.x + (dx / d) * j, y: b.y + (dy / d) * j };
  };
  const bugPose = (b) => ({
    x: snap(camX + toScreenX(bugAt(b).x)), y: snap(camY + toScreenY(bugAt(b).y)), dir: b.dir,
    time: b.attack !== undefined ? b.attack * 1000 : now * BUG_STRIDE + b.animOffset, // (its bite plays once, from its start)
    anim: b.attack !== undefined ? 'bite' : b.moving ? 'walk' : 'idle',
  });
  for (const b of bugs) sprites.drawCharacterShadow(ctx, 'bug', bugPose(b));
  const me0 = pose(me);
  // The cursor hidden while it's within his gun's range of him (the aim's shown there); out past it, or
  // with a window open (the map, the journal, the talents) or no gun yet, it's there as ever
  const pointing = mouse && hasBackpack && !mapOpen && !journalOpen && !talentsOpen && Math.hypot(mouse.x - me0.x, mouse.y - me0.y) < toScreenX(shotRange());
  canvas.style.cursor = pointing ? 'none' : '';
  // An object in front of us that covers our body is drawn see-through
  const hidesMe = (o) => {
    if ((o.footprint ? tallY(o) : o.y) <= me.y || ['bottles', 'bag', 'bag_stand'].includes(o.name)) return false; // (a big thing: by its footprint) // (the crate's low, the bottles and the bag slim: they stay solid)
    const b = sprites.objectBounds(o.sprite ?? o.name, o.sx, o.sy);
    const inset = (b.x1 - b.x0) * 0.15; // the frame is a bit larger than the crown
    return me0.x > b.x0 + inset && me0.x < b.x1 - inset && me0.y - 40 > b.y0 && me0.y - 40 < o.sy;
  };
  // A big thing's depth, for the order (o.footprint): in front of him if anywhere in the screen's column
  // he's in (as wide as him) it reaches nearer the camera (lower down) than his feet; behind him if not
  const tallY = (o) => {
    const [a, b] = o.footprint, corners = [[-a, -b], [a, -b], [a, b], [-a, b]].map((m) => modelToWorld(o, m));
    let front = -Infinity;
    for (const x of [me.x - 0.35 * UNITS_PER_M, me.x, me.x + 0.35 * UNITS_PER_M])
      corners.forEach((p, i) => { // (where the column crosses each of its sides)
        const q = corners[(i + 1) % 4];
        if ((p.x - x) * (q.x - x) > 0 || p.x === q.x) return;
        front = Math.max(front, p.y + ((x - p.x) / (q.x - p.x)) * (q.y - p.y));
      });
    return front > me.y ? me.y + 0.01 : me.y - 0.01;
  };
  // Bodies sorted by depth: objects and characters
  const bodies = [
    ...placed.filter((o) => !o.flat).map((o) => ({ y: o.footprint ? tallY(o) : o.y, draw: () => sprites.drawObject(ctx, o.sprite ?? o.name, 'body', o.sx, o.sy, hidesMe(o) ? 0.45 : 1, o.frame) })),
    ...players.map((p) => ({ y: p.y, draw: () => sprites.drawCharacter(ctx, p.sprite, pose(p)) })),
    ...bugs.map((b) => ({ y: b.y, draw: () => sprites.drawCharacter(ctx, 'bug', bugPose(b)) })),
    // Flames and embers of each fire stand at its debris pile
    ...fireSources.map((f, i) => ({ y: f.y, draw: () => drawParticles(PX, (p) => p.fire === i) })),
  ].sort((a, b) => a.y - b.y);
  for (const b of bodies) b.draw();
  // Life over each bug, and over the bottles and the bag while they're to be hit (under the dark: seen with them)
  for (const b of bugs) {
    const p = bugPose(b);
    lifeBar(ctx, p.x, p.y - BUG_LIFE_UP, b.life, BUG_LIFE);
  }
  for (const o of placed) {
    const life = lifeOf(o);
    if (life) {
      const box = sprites.objectInk(o.sprite ?? o.name, o.sx, o.sy);
      lifeBar(ctx, (box.x0 + box.x1) / 2, box.y0 - 5, ...life);
    }
  }

  drawFireGlow(now);
  drawParticles(PX, (p) => p.fire === undefined && !onGround(p)); // smoke rises above everything (sparks, blasts too)
  // Names over things, the pick-up prompt on the one in reach; under the dark, so they show only along with
  // the things themselves
  const near = me.pick ? null : reachable();
  const shown = placed.filter((o) => o.label && !(o === bottles && (drillShown() || !bottles.frame))).map((o) => labelOf(o, o.sx, o.sy)); // (the drill draws the bottles')
  const edges = labels.draw(shown, near?.name ?? null, near?.pickup ? held / HOLD_TIME : keys.has('KeyE') ? 1 : 0, dt); // (nothing to hold for: the key full while pressed)
  const bagCard = quests.target() === 'bag' && shown.find((item) => item.id === 'bag');
  if (bagCard) { // the knife's quest: what to do over the bag's name, on its edge (seen only with the bag, like it)
    const over = bagCard.box.y0 - 4 - 22 - 7;
    labels.warn('Use your knife to say goodbye to an old friend...', 'LMB', edges.bag, over - 22 >= 8 ? over : bagCard.box.y1 + 6 + 22, knifeHeld ? 1 : 0, `${bagHits}/${BAG_HITS}`);
  }
  crumb('render: the dark');
  drawVision(PX, me0.x, me0.y); // and the dark over all of it
  if (strike.phase === 'falling') { // the shell coming down on the zone, faster and faster (over the dark: it must be seen)
    const at = shellAt(strike.t / STRIKE_FALL);
    const x = snap(sx + at.x), y = snap(sy + at.y), tail = sprites.object('rocket').tail;
    const tx = x + toScreenX(tail[0] * UNITS_PER_M), ty = y + toScreenY(tail[1] * UNITS_PER_M) - tail[2] * HEIGHT_PX * UNITS_PER_M;
    strikes.exhaust(tx, ty, strikeClock);
    sprites.drawObject(ctx, 'rocket', 'body', x, y); // its nose there
  }
  if (strike.phase === 'blast') strikes.blast(sx, sy, toScreenX(STRIKE_R), strike.t); // it lights up the dark
  if (drillShown()) { // the bottles' name where it always is, and what to do over it (both over the dark, lined up on their white edges)
    const item = labelOf(bottles, snap(camX + toScreenX(bottles.x)), snap(camY + toScreenY(bottles.y)));
    const edge = labels.one(item);
    const over = item.box.y0 - 4 - 22 - 7; // its bottom; with no room on screen over it, it goes under the bottles
    const at = over - 22 >= 8 ? over : item.box.y1 + 6 + 22;
    labels.warn('Shoot them! Not like I’m planning any parties...', 'RMB', edge, at, triggerHeld ? 1 : 0, `${bottlesBroken}/${BOTTLES_ALL}`); // (in gold: it's what to do; its key pressed while it's held)
  }
  leveled.over(me0.x, me0.y, talkDt, points > 0); // a new level's spotlight on him till its point's spent: over the dark (on real time, as his line)
  // Shots light it up: over the dark
  shots.draw(dt, (x, y, h) => ({ x: camX + toScreenX(x), y: camY + toScreenY(y) - h * HEIGHT_PX * UNITS_PER_M }));
  // The way to where the quest leads, out by the edge of what we see (over the dark, so it doesn't
  // fade into it; and on the screen, however small)
  // Our own spot on the ball, the screen's up and right there: the arrow and the globe go by it
  const here = moveChart(chart, me.x - SPAWN.x, me.y - SPAWN.y, PLANET_R);
  const goal = objects.find((o) => o.name === quests.target()) ?? (quests.target() === 'structures' ? STRUCTURES : null); // (a thing, or a place)
  if (goal) {
    const ring = Math.min(toScreenX(VISION) * 0.75, Math.min(W, H) / 2 - 40);
    const to = toChart(here, goal.home, PLANET_R); // straight from us, the shortest way round the ball
    guide.draw(me0.x, me0.y, ring, to.x, to.y, Math.hypot(to.x, to.y) / UNITS_PER_M, dt, quests.main()); // (gold for the story's)
  }
  // What the hero says, over his head (in the light, he's in it): always as high, clear of the gun
  // he holds up once armed
  // Shooting the bottles (from when he has the gun): what crouching does, in gold, right over him, in one
  // place (Shift held down while he is); his line over it then, lined up on its edge
  let sayAt = me0.y - 98, sayEdge = null;
  if (drillShown()) {
    const hint = 'Crouch to shoot farther...', key = 'Shift', bottom = me0.y - 104; // (where his line's bottom would be)
    const edge = Math.round(me0.x - labels.warnWidth(hint, key) / 2) + labels.keyWidth(key);
    labels.warn(hint, key, edge, bottom, me.crouch ? 1 : 0);
    sayAt = bottom - 22; // (its plate 6 px over it)
    sayEdge = edge;
  }
  const said = speech.draw(me0.x, sayAt, talkDt, sayEdge);
  const fellow = placed.find((o) => o.name === 'fellow');
  if (fellow) fellowSpeech.draw(fellow.sx, fellow.sy - 98, talkDt); // (the fellow's line, over his head)
  const pressed = strike.phase === 'falling' && strike.t < STRIKE_PRESSED; // (Space just hit: its key shows it)
  if ((strike.phase === 'frozen' || pressed) && said) labels.warn(STRIKE_PROMPT, 'Space', said.edge, said.top - 6, pressed ? 1 : 0); // over his line, on its edge
  if (talentCue === 'frozen' && said) labels.warn(TALENT_PROMPT, 'T', said.edge, said.top - 6, keys.has('KeyT') ? 1 : 0);
  if (talentAsk && points && talentCue === 'done') { // a later level's: over him (or over his line), in white
    const hold = keys.has('KeyT') ? 1 : 0;
    if (said) labels.warn(TALENT_PROMPT, 'T', said.edge, said.top - 6, hold, '', false);
    else labels.warn(TALENT_PROMPT, 'T', Math.round(me0.x - labels.warnWidth(TALENT_PROMPT, 'T') / 2) + labels.keyWidth('T'), me0.y - 104, hold, '', false);
  }
  const journalPressed = journalCue.phase === 'pressed'; // (J just hit)
  if ((journalCue.phase === 'frozen' || journalPressed) && said) labels.warn(JOURNAL_PROMPT, 'J', said.edge, said.top - 6, journalPressed ? 1 : 0);
  const mapPressed = mapCue.phase === 'pressed'; // (M just hit)
  if ((mapCue.phase === 'frozen' || mapPressed) && said) labels.warn(MAP_PROMPT, 'M', said.edge, said.top - 6, mapPressed ? 1 : 0);
  // The minimap (once he knows of it: mapKnown): the planet as a globe under us, turning as we go; the capsule, the poles and where the quest leads on it. The map (M):
  // the world goes as dark as beyond what we see, and the globe moves over us, well inside our sight
  mapShown = Math.max(0, Math.min(1, mapShown + (mapOpen ? talkDt : -talkDt) / 0.25)); // (on real time: the game holds while it's open)
  const k = mapShown * mapShown * (3 - 2 * mapShown);
  if (k > 0) {
    ctx.fillStyle = `rgba(4, 3, 8, ${(k * 235) / 255})`; // the dark beyond sight's
    ctx.fillRect(0, 0, W, H);
  }
  const lerp = (a, b) => a + (b - a) * k;
  const corner = { x: GLOBE_MARGIN + GLOBE_RADIUS, y: H - GLOBE_MARGIN - GLOBE_RADIUS, r: GLOBE_RADIUS };
  const big = { x: me0.x, y: me0.y, r: Math.min(toScreenX(VISION), Math.min(W, H) / 2 - 50) * 0.6 };
  const place = { x: lerp(corner.x, big.x), y: lerp(corner.y, big.y), r: lerp(corner.r, big.r), dot: lerp(3, 4), arrow: lerp(1, 1.8) };
  crumb('render: the globe');
  const marks = !mapKnown ? [] : globe.draw(here, dirVector(me.dir), [
    { at: pod.home, color: '#fff', name: pod.label },
    { at: POLE, color: '#fff', name: 'N' }, // the poles
    { at: POLE.map((v) => -v), color: '#fff', name: 'S' },
    ...(fellowSeen && goal?.name !== 'fellow' ? [{ at: fellowObj.home, color: '#fff', name: fellowObj.label }] : []), // (the fellow, once he's been seen)
    ...(goal ? [{ at: goal.home, color: GOLD, name: quests.mark() ?? goal.label, quest: true }] : []), // where the quest leads, in gold (as the quest is)
    ...(goal !== STRUCTURES && goal?.name !== 'campfire' && mapCue.phase !== 'armed' ? [{ at: STRUCTURES.home, color: '#fff', name: STRUCTURES.label }] : []), // (and the safe place, once he's said where it is: white, when it's not where the quest leads)
  ], place, sectorCells(), mapOpen && k >= 1 ? mouse : null); // (the grid's cells from where he came down to where he made it, all of them between: done, once he's at the safe space's checkpoint: the cell under the cursor picked out, the map open)
  if (k > 0) { // open, the marks get their names
    ctx.save();
    ctx.globalAlpha = k;
    crumb('render: the map\'s names');
    // Each name to the right of its mark; where two would overlap there, the one whose mark is further left
    // goes to its left (each on its own side)
    const widths = marks.map((m) => labels.tagWidth(m.mark.name, 'M') - labels.keyWidth('M'));
    marks.forEach((m, i) => {
      const left = marks.some((o, j) => j !== i && o.x > m.x && Math.abs(o.y - m.y) < 24 && m.x + 14 < o.x + 14 + widths[j] + 4 && m.x + 14 + widths[i] > o.x + 14 - 4);
      labels.pin(m.mark.name, left ? m.x - 14 - widths[i] : m.x + 14, m.y, left, m.mark.quest); // (to the left: mirrored, its edge towards its mark; the quest's: in gold)
    });
    ctx.restore();
  }
  if (mapKnown) labels.tag(PLANET, 'M', place.x - place.r, place.y - place.r - 10, mapOpen || keys.has('KeyM') ? 1 : 0, // its name over it
    `, ${SYSTEM} System`);
  // The hotbar, once he has the backpack, at the bottom in the middle: the medkits (1: the wait after one), the roll (Space:
  // the roll and its wait after), the knife (its wait after a slash) and the gun (the reload; the rounds left)
  if (hasBackpack) hotbar.draw([
    { key: '1', icon: 'cross', held: keys.has('Digit1'), dim: !medkits, cool: medkitCool / MEDKIT_COOLDOWN }, // (how many are left: not shown for now)
    ...(rollShown() ? [{ key: 'Space', icon: 'roll', held: keys.has('Space'), cool: rollCool }] : []),
    { key: 'LMB', icon: 'fist', held: knifeHeld, cool: Math.min(1, (me.knifeCool ?? 0) / (SLASH_TIME + SLASH_COOLDOWN)) },
    { key: 'RMB', icon: 'crosshair', held: triggerHeld, cool: ammo?.reload != null ? 1 - ammo.reload / RELOAD_TIME : 0, count: ammo && ammo.reload == null ? ammo.mag : null },
  ], W / 2, H - GLOBE_MARGIN, dt, { level, k: level >= MAX_LEVEL ? 1 : xp / xpFor(level), points });
  // The bottom right corner, as the planet's name is over the globe, growing up from it: the journal (J) at
  // the bottom, over it the talents (T: once there are some to have, his second level on), then the map
  // (M: once he knows of it); one over the other, on one white edge
  const menu = [...(journalKnown() ? [['Journal', 'J', journalOpen]] : []), ...(level > 1 ? [['Talents', 'T', talentsOpen]] : []), ...(mapKnown ? [['Map', 'M', mapOpen]] : [])];
  const menuEdge = W - GLOBE_MARGIN - Math.max(...menu.map(([text, key]) => labels.tagWidth(text, key) - labels.keyWidth(key)));
  menu.forEach(([text, key, on], i) => labels.tag(text, key, menuEdge - labels.keyWidth(key), H - GLOBE_MARGIN - i * 28, on || keys.has(`Key${key}`) ? 1 : 0));
  // The quest at the top right (once he has opened the journal), going as the journal opens over it; the
  // journal's key out from under its white edge (J opens it)
  const jk = journalOpen ? 1 : 0; // (at once, as the talents')
  questBox.hidden = !journalKnown(); // (none till he has opened the journal)
  questBox.style.opacity = String(1 - jk);
  if (jk < 1 && journalKnown()) {
    const box = questBox.getBoundingClientRect();
    ctx.save();
    ctx.globalAlpha = 1 - jk;
    labels.key('J', box.left, box.top + 15, journalOpen || keys.has('KeyJ') ? 1 : 0, questBox.classList.contains('main')); // (on its title's line: its border, padding and half a line down; gold by a main quest)
    ctx.restore();
  }
  if (k > 0) { // on the map: about the planet under its name, lined up on it; over the globe's right, as the name is over its left, Esc to close it
    const m = PLANET_R / UNITS_PER_M, rows = [`Ø ${Math.round(2 * m)} u`, `${Math.round(4 * Math.PI * m * m).toLocaleString('en-US')} u²`]; // across; its surface
    ctx.save();
    ctx.globalAlpha = k;
    ctx.font = `400 12px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    const name = Math.round(place.x - place.r + labels.keyWidth('M')) + 11; // (where the name starts on its card)
    rows.forEach((row, i) => ctx.fillText(row, name, Math.round(place.y - place.r - 10 + 9 + i * 16)));
    labels.tag('Close', 'Esc', Math.round(place.x + place.r) - labels.tagWidth('Close', 'Esc'), place.y - place.r - 10, keys.has('Escape') ? 1 : 0);
    ctx.restore();
  }
  // The journal (J): over all of it, the world gone as dark as under the map; every quest so far (the one
  // on now in one place, the done ones up from between its cards); its name over it on the left (J held:
  // it's open), Esc to close it on the right
  if (jk > 0) {
    ctx.save();
    ctx.globalAlpha = jk;
    ctx.fillStyle = 'rgba(4, 3, 8, 0.92)';
    ctx.fillRect(0, 0, W, H);
    const width = Math.min(460, W - 80), left = W / 2 - width / 2, top = Math.round(H * 0.42), head = top - 10; // (its cards' bottom, just over the one on now)
    const nameEnd = Math.round(left) + labels.tagWidth('Journal', 'J') - labels.keyWidth('J'), closeAt = Math.round(left + width) - labels.tagWidth('Close', 'Esc');
    journal.draw(quests.list(), left, top, width, { x0: nameEnd + 10, x1: closeAt - 10, bottom: head, ceiling: 20 });
    labels.tag('Journal', 'J', Math.round(left) - labels.keyWidth('J'), head, 1);
    labels.tag('Close', 'Esc', closeAt, head, keys.has('Escape') ? 1 : 0);
    ctx.restore();
  }
}
