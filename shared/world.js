// World rules: the planet, collision and movement. Kept separate from rendering so a server can reuse
// it if multiplayer comes back.

import { moveChart, northChart, toChart, toSphere } from './sphere.js';

export const SPEED = 100; // world units per second (~4.5 m/s, a brisk run)
// Backpedaling and sidestepping are slower than running forwards (the art generator times their
// animations for these speeds)
export const GAIT_SPEED = { run: SPEED, back: 0.6 * SPEED, left: 0.8 * SPEED, right: 0.8 * SPEED };
export const CROUCH_SPEED = 0.45; // crouched (Shift), this much of the gait's speed
export const CROUCH_CYCLE = 0.8; // seconds a step cycle takes, sneaking crouched (any gait)
export const PLAYER_SIZE = 10; // collision box (feet), centered on player x/y

// Dodge roll: a forward roll over the shoulder, faster than the run; the art generator times the
// animation to ROLL_TIME
export const ROLL_TIME = 0.5; // seconds
export const ROLL_SPEED = 200; // world units per second at the start, easing off towards the end
export const ROLL_COOLDOWN = 0.2; // seconds after a roll before the next one
// Picking something up: the hero squats, is lowest at PICK_GRAB of the way and stands up again (the
// art generator shapes the animation by these)
export const PICK_TIME = 0.6; // seconds
export const PICK_GRAB = 0.5;
// A knife slash (armed, with the left mouse button), standing or on the move
export const SLASH_TIME = 0.35; // seconds
export const SLASH_COOLDOWN = 1; // seconds after a slash before the next can start


// Facing: 8 directions, 0 = +y in world (down the screen, towards the camera), counting towards +x
export const DIR_COUNT = 8;
export function dirFromVector(dx, dy) {
  return (Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) + DIR_COUNT) % DIR_COUNT;
}
export function dirVector(dir) {
  const a = (dir * Math.PI * 2) / DIR_COUNT;
  return { dx: Math.sin(a), dy: Math.cos(a) };
}

// How a move (dx, dy) goes for someone facing dir: 'run' forwards (within 60 degrees of the facing),
// 'back' backpedaling, 'left' / 'right' sidestepping. Facing +y, the left is +x: y points south.
export function gait(dir, dx, dy) {
  const f = dirVector(dir);
  const along = (dx * f.dx + dy * f.dy) / Math.hypot(dx, dy);
  if (along > 0.5) return 'run';
  if (along < -0.5) return 'back';
  return dx * f.dy - dy * f.dx > 0 ? 'left' : 'right';
}

// The world is a planet, a ball with no edges, a plain desert all over. The game plays on a flat
// chart of it around the hero (see shared/sphere.js; world units, x right and y down the screen), its
// origin at SPAWN's coordinates; the hero is re-centered on it as he goes (recenter), the screen's up
// carried along with him, never turned, so the lay of the land never turns on the screen (north
// drifts off up instead: the globe shows it); things keep their place on the ball (placeOnChart puts
// them on the chart). The spawn is up north (LANDING). The layout below is given
// on the first chart, the one round the spawn.
export const SPAWN = { x: 528, y: 528 };
export const UNITS_PER_M = 22; // world units per meter
export const PLANET = 'Sandy'; // its name
export const SYSTEM = 'Abaddon'; // the star system it's in
export const PLANET_R = 100 * UNITS_PER_M; // ~630 m round
export const POLE = [0, 1, 0];
// Where we come down: high in the north (65°, ~44 m from the pole), a little off to one side (25°
// round from the grid's first meridian), north up to begin with
const LANDING = { lat: (65 * Math.PI) / 180, lon: (25 * Math.PI) / 180 };
export const CHART0 = northChart(
  [Math.cos(LANDING.lat) * Math.sin(LANDING.lon), Math.sin(LANDING.lat), Math.cos(LANDING.lat) * Math.cos(LANDING.lon)], POLE, [0, 1, 0]);
// The submachine gun (armed, the right mouse button held): brought up over AIM_IN_TIME, firing in
// bursts while it's held, lowered over AIM_OUT_TIME. FIRE_ROUNDS rounds go off over each cycle of the
// hero's gait (GAIT_CYCLE, seconds; standing, as running): the firing loops keep step with the legs.
export const AIM_IN_TIME = 0.1;
export const AIM_OUT_TIME = 0.12;
export const GAIT_CYCLE = { stand: 0.5, run: 0.5, back: 0.5, left: 0.45, right: 0.45 };
export const FIRE_ROUNDS = 5;
export const RELOAD_TIME = 1.5; // seconds to put a full magazine in (the art generator times the hero's reload by it)
// The firing loops are drawn aimed straight ahead of the facing and this far off it either way
// (radians, the way screen angles grow: + turns it to the figure's right): the one nearest the aim is
// played
export const AIM_OFFSETS = [-0.26, 0, 0.26];
export const SHOT_RANGE = 3.5 * UNITS_PER_M; // how far a round carries (short, to begin with)
// Crouched, the hero fires steadier: the range this much longer, the spread (and the sway) this much
// narrower
export const CROUCH_AIM = { range: 1.1, spread: 0.5 };
// The aim sways: across this either way of where the hero aims (radians), back and forth over
// SWAY_PERIOD seconds; a shot goes where the sway is when it fires
export const SHOT_SPREAD = 0.16;
export const SWAY_PERIOD = 1.2;
// The sway at time t (seconds): an even back and forth across the spread (radians, from the aim)
export function shotSway(t) {
  const k = (t / SWAY_PERIOD) % 1;
  return SHOT_SPREAD * (k < 0.5 ? 4 * k - 1 : 3 - 4 * k);
}
// A knife slash's reach (see SLASH_TIME)
export const SLASH_RANGE = 1.4 * UNITS_PER_M; // how far it reaches, from the feet
export const SLASH_ARC = (120 * Math.PI) / 180; // how wide, centered on where the hero aims
export const VISION = 8 * UNITS_PER_M; // how far a character sees in the dark; beyond it the world is in shadow

// The landing capsule next to the spawn point. yaw turns the pod's model in the ground plane; the
// art generator uses the same values.
// How much bigger the capsule (with its debris and scorch) is than its model: everything in its model
// space (POD_FIRES, POD_EXIT too) is scaled by this in the world and the art
export const POD_SCALE = 1.2;
// The hero comes out of its hatch: the spawn is just outside the doorway (model meters, the hatch
// faces +y), so the capsule stands behind it there
const POD_EXIT = [0, 1.5], POD_YAW = 0.2; // hatch turned a little from the camera
export const POD = {
  x: SPAWN.x - (POD_EXIT[0] * Math.cos(POD_YAW) - POD_EXIT[1] * Math.sin(POD_YAW)) * POD_SCALE * UNITS_PER_M,
  y: SPAWN.y - (POD_EXIT[0] * Math.sin(POD_YAW) + POD_EXIT[1] * Math.cos(POD_YAW)) * POD_SCALE * UNITS_PER_M,
  yaw: POD_YAW,
};

// Burning debris around the capsule, in meters in the pod's model space (x, y); the art generator
// draws the debris there, the client lights the fires, and they block movement
export const POD_FIRES = [[-1.45, 0.55], [1.4, 0.35], [1.1, 1.2]]; // clear of the hatch (POD_EXIT)
// A point (meters, x along, y to the left) in the model of a thing placed at { x, y, yaw } -> world
export const modelToWorld = (o, [mx, my]) => ({
  x: o.x + (mx * Math.cos(o.yaw) - my * Math.sin(o.yaw)) * UNITS_PER_M,
  y: o.y + (mx * Math.sin(o.yaw) + my * Math.cos(o.yaw)) * UNITS_PER_M,
});
const podToWorld = (m) => modelToWorld(POD, m);

// The hero's backpack, thrown clear of the capsule in the crash: far enough off to lie in the dark,
// so finding it is a task. yaw turns its model like POD.yaw.
export const BACKPACK = { x: SPAWN.x - 340, y: SPAWN.y + 283, yaw: 0.6 };
// A wrecked army bed nearby, thrown out with it (yaw turns its model like POD.yaw)
// It and the burning mattress lie close round the backpack's left and bottom and right (BED_AT, MATTRESS
// below): it can only be come up to from above
const BED_AT = { deg: 125, r: 1.0 }; // its middle: which way from the backpack, how far (meters); it lies across that way
export const BED = {
  x: BACKPACK.x + BED_AT.r * Math.cos((BED_AT.deg * Math.PI) / 180) * UNITS_PER_M,
  y: BACKPACK.y + BED_AT.r * Math.sin((BED_AT.deg * Math.PI) / 180) * UNITS_PER_M,
  yaw: ((BED_AT.deg + 90) * Math.PI) / 180,
};
// The rocket that comes down on the way to the backpack (the strike, see client.js): it flies in
// STRIKE_SLANT off the vertical, along STRIKE_WAY on the ground (a unit vector), and leaves a crater
// CRATER_R across its bowl (meters); the art generator draws them so
export const STRIKE_SLANT = (30 * Math.PI) / 180;
export const STRIKE_WAY = { x: 0.15, y: 0.989 }; // from the top of the screen
export const CRATER_R = 1.25;
// Bottles on a crate up and a little left of the backpack, as far off as the gun reaches from
// wherever it's picked up (he can't move in the drill): its first try (see quests.js). The crate's
// low: shots go over it; only the bottles on it are hit (see client.js)
const BOTTLES_AT = { deg: -110, r: 3.4 }; // which way from the backpack (0: right, -90: up), how far (meters)
export const BOTTLES = { // (in SHOT_RANGE from wherever the backpack's picked up)
  x: BACKPACK.x + BOTTLES_AT.r * Math.cos((BOTTLES_AT.deg * Math.PI) / 180) * UNITS_PER_M,
  y: BACKPACK.y + BOTTLES_AT.r * Math.sin((BOTTLES_AT.deg * Math.PI) / 180) * UNITS_PER_M,
};
export const BOTTLES_R = 0.4 * UNITS_PER_M;
const BOTTLES_SOLID = { x: BOTTLES.x, y: BOTTLES.y, r: BOTTLES_R, of: 'bottles' };
// The wreck of a wooden bedside table, thrown out with them: left of the crate, out of the gun's way
// to it
export const STAND = { x: BOTTLES.x - 2.2 * UNITS_PER_M, y: BOTTLES.y + 0.3 * UNITS_PER_M, yaw: 0.9 };
const STAND_SOLID = { x: STAND.x, y: STAND.y, r: 0.32 * UNITS_PER_M, of: 'stand' };
// A punching bag left of the backpack, by the bed's head (clear of the gun's way to the bottles): the
// knife's first try (see quests.js); its stand stays put, the bag on it rocks when hit, and goes to
// bits; tall, it stops shots till then
export const BAG = { x: BACKPACK.x - 2.6 * UNITS_PER_M, y: BACKPACK.y - 0.45 * UNITS_PER_M };
export const BAG_R = 0.34 * UNITS_PER_M; // its base's
export const BAG_HITS = 2; // knife cuts it takes: it goes to bits with the last (the quest counts them)
const BAG_SOLID = { x: BAG.x, y: BAG.y, r: BAG_R, cover: true, of: 'bag_stand' }; // (cover: while the bag's on it)
// The bedding off the bed, scattered around the backpack: one model (its origin at the backpack) of a
// mattress burning at one end, a pillow and a plaid blanket, each piece at its place in it (meters,
// a yaw for the piece). The fires on the mattress's torn end, in the model's meters, like POD_FIRES.
export const BEDDING = { x: BACKPACK.x, y: BACKPACK.y, yaw: 0 };
// The blanket and the pillow lie out on a ring round the backpack's right and bottom (GLADE_R), the
// mattress close in, closing the way to it with the bed (its burnt end up, away from the bed, clear of it)
export const GLADE_R = 2.6; // meters
const onRing = (deg, turn = 90, r = GLADE_R) => ({
  x: r * Math.cos((deg * Math.PI) / 180), y: r * Math.sin((deg * Math.PI) / 180), yaw: ((deg + turn) * Math.PI) / 180,
});
export const BLANKET = onRing(38, 118, 2.4); // big, spread out, thrown down askew
export const PILLOW = onRing(88, 62, 1.95); // past the mattress, by the bed's foot, tumbled askew
export const MATTRESS = onRing(11, -90, 1.0);
// Where the mattress stops the hero, along it (meters, in its own frame: its burnt end, +x, has the fires)
const MATTRESS_SOLID = [-0.7, -0.2];
const inMattress = ([fx, fy]) => [
  MATTRESS.x + fx * Math.cos(MATTRESS.yaw) - fy * Math.sin(MATTRESS.yaw),
  MATTRESS.y + fx * Math.sin(MATTRESS.yaw) + fy * Math.cos(MATTRESS.yaw),
];
export const BEDDING_FIRES = [[0.5, -0.14], [0.56, 0.2]].map(inMattress);
// How close the hero gets to use a thing with E: from its edge (its solid circle), so big things
// like the capsule are in reach too
export const REACH = 1.2 * UNITS_PER_M;

const POD_SOLID = { x: POD.x, y: POD.y, r: 1.05 * POD_SCALE * UNITS_PER_M, cover: true, of: 'pod' }; // tall: blocks a blade or a shot
const BACKPACK_SOLID = { x: BACKPACK.x, y: BACKPACK.y, r: 0.35 * UNITS_PER_M, of: 'backpack' };

// Objects placed on the map: { name (sprite in assets/sprites.json), x, y, yaw (its model's turn,
// where its sprite has fires or smoke in model space), label (its name shown
// over it), note (a line under the name), solid (its circle in OBSTACLES, taken out when it's
// picked up), flat (lies flat on the ground: drawn under the characters), later (not there at first: put down later); and what E does with it: pickup (hold E to pick it up; the hero says pickupSay then) or
// say (a press makes the hero say this) }
export const OBJECTS = [
  {
    name: 'pod', x: POD.x, y: POD.y, yaw: POD.yaw, label: 'Escape pod', solid: POD_SOLID,
    say: 'I can’t believe they just threw me overboard... After all these years together!',
  },
  { name: 'bed', x: BED.x, y: BED.y, flat: true }, // overturned, low: the hero always goes over it
  { name: 'stand', x: STAND.x, y: STAND.y, flat: true, solid: STAND_SOLID },
  { name: 'bag_stand', x: BAG.x, y: BAG.y, solid: BAG_SOLID },
  { name: 'bag', x: BAG.x, y: BAG.y, label: 'Punching bag', say: 'Takes all my beating, never complains...' }, // (on its stand: drawn over it)
  { name: 'bedding', x: BEDDING.x, y: BEDDING.y, yaw: BEDDING.yaw, flat: true },
  { name: 'bottles', x: BOTTLES.x, y: BOTTLES.y, label: 'Bottles', solid: BOTTLES_SOLID, say: 'My booze! Funny how not a single bottle broke in the fall...' },
  {
    name: 'backpack', x: BACKPACK.x, y: BACKPACK.y, label: 'Backpack', pickup: true, solid: BACKPACK_SOLID, flat: true,
    pickupSay: 'Lucky they threw my stuff out too! Must’ve thought it was junk...',
  },
];

// Solid circles { x, y, r, cover } in world units: the capsule's footprint, the fires and things lying
// around (removeObstacle takes one out, say when it's picked up). They all stop the hero; the ones
// with cover (tall enough to hide behind) stop a blade or a shot too: low ones are struck over.
export const OBSTACLES = [
  POD_SOLID,
  ...POD_FIRES.map((f) => ({ ...podToWorld(f.map((v) => v * POD_SCALE)), r: 0.5 * POD_SCALE * UNITS_PER_M, of: 'pod' })), // can't walk into the fires
  BACKPACK_SOLID,
  STAND_SOLID,
  BAG_SOLID,
  BOTTLES_SOLID,
  ...BEDDING_FIRES.map((f) => ({ ...modelToWorld(BEDDING, f), r: 0.4 * UNITS_PER_M, of: 'bedding' })), // the mattress fires
  ...MATTRESS_SOLID.map((m) => ({ ...modelToWorld(BEDDING, inMattress([m, 0])), r: 0.42 * UNITS_PER_M, of: 'bedding' })), // and the rest of it
  // The bed: a row of circles along it (its frame is long and narrow)
  ...[-0.65, 0, 0.65].map((m) => ({
    x: BED.x + Math.cos(BED.yaw) * m * UNITS_PER_M, y: BED.y + Math.sin(BED.yaw) * m * UNITS_PER_M, r: 0.42 * UNITS_PER_M, of: 'bed',
  })),
];

// Where the hero saw some structures as he fell (see quests.js): STRUCTURES_WEST meters from the
// backpack, straight on due west from it (on the great circle that sets out west there), only a point
// on the ball for now ({ home, label }, as an object's: the quest's arrow and the map's mark go by it)
const STRUCTURES_WEST = 60;
const backpackHome = toSphere(CHART0, BACKPACK.x - SPAWN.x, BACKPACK.y - SPAWN.y, PLANET_R);
export const STRUCTURES = { label: 'Safe place', home: toSphere(northChart(backpackHome, POLE, [0, 1, 0]), -STRUCTURES_WEST * UNITS_PER_M, 0, PLANET_R) };
Object.assign(STRUCTURES, chartPoint(CHART0, STRUCTURES.home)); // (its x, y on the chart, kept there as the objects')

// The safe place: a huge army tent pitched there, along x, its door in the middle of its +y side,
// facing the camera (the art generator draws it so): its open door shows, room to stand before it.
// TENT_SIZE: its half length (x) and half width (y), meters; it stops the hero along a row of circles
// down its middle (clear of the ground before its door), and shots
// (for now: pitched by the capsule, to see the two side by side; its place is STRUCTURES)
export const TENT = { x: POD.x + 11 * UNITS_PER_M, y: POD.y - 1 * UNITS_PER_M, yaw: -0.08 };
export const TENT_SIZE = [4.5, 3.0];
OBJECTS.push({ name: 'tent', x: TENT.x, y: TENT.y, yaw: TENT.yaw, label: 'Army tent', say: 'Somebody was here before me... Looks abandoned.' });
OBSTACLES.push(...[-3, -1.5, 0, 1.5, 3].map((m) => ({ ...modelToWorld(TENT, [m, 0]), r: (TENT_SIZE[1] - 0.2) * UNITS_PER_M, cover: true, of: 'tent' })));

// Safe zones round the escape pod and the backpack (overlapping: the way between them is safe too),
// and round the structures: bugs only come for the hero when he's out of them
// all; they don't turn up in them (see client.js). { at (what it's round: anything kept on the chart with an x, y), r (world units) }
export const SAFE_ZONES = [
  { at: OBJECTS.find((o) => o.name === 'pod'), r: 12 * UNITS_PER_M },
  { at: OBJECTS.find((o) => o.name === 'backpack'), r: 11 * UNITS_PER_M },
  { at: STRUCTURES, r: 10 * UNITS_PER_M },
];

// Their places on the planet: each object at a point of the ball (home); each solid circle at an
// offset from its object (of), so it stays with its sprite
for (const o of OBJECTS) o.home = toSphere(CHART0, o.x - SPAWN.x, o.y - SPAWN.y, PLANET_R);
for (const ob of OBSTACLES) {
  const parent = OBJECTS.find((o) => o.name === ob.of);
  ob.dx = ob.x - parent.x;
  ob.dy = ob.y - parent.y;
}

// A point on the ball: where it is on the chart, { x, y }
function chartPoint(chart, home) {
  const c = toChart(chart, home, PLANET_R);
  return { x: SPAWN.x + c.x, y: SPAWN.y + c.y };
}

// Puts the objects (and the structures' place) and the solid circles on the chart (where they are on it now)
export function placeOnChart(chart) {
  for (const o of [...OBJECTS, STRUCTURES]) Object.assign(o, chartPoint(chart, o.home));
  for (const ob of OBSTACLES) {
    const parent = OBJECTS.find((o) => o.name === ob.of);
    if (!parent) continue; // added later, on no object (a crater's): the client carries it
    ob.x = parent.x + ob.dx;
    ob.y = parent.y + ob.dy;
  }
}

// The chart re-centered on chart point (x, y) (the hero, as he gets away from the origin), its up
// carried there; the objects go to their places on it. turn: how far the new chart is turned against
// the old one round the hero (radians, as screen angles go; next to nothing, the charts' own slight
// bend away from their origins): whatever was on the old chart near him goes to the new one turned by it.
export function recenter(chart, x, y) {
  const next = moveChart(chart, x - SPAWN.x, y - SPAWN.y, PLANET_R);
  const east = toChart(next, toSphere(chart, x - SPAWN.x + UNITS_PER_M, y - SPAWN.y, PLANET_R), PLANET_R); // a meter east of him
  placeOnChart(next);
  return { chart: next, turn: Math.atan2(east.y, east.x) };
}
// How far (world units) a ray from (x, y) along the unit (dx, dy) goes before it meets something
// giving cover, up to max: where a shot stops, how far a blade reaches
export function rayHit(x, y, dx, dy, max) {
  let best = max;
  for (const o of OBSTACLES) {
    if (!o.cover) continue;
    const ox = o.x - x, oy = o.y - y, along = ox * dx + oy * dy;
    const off2 = ox * ox + oy * oy - along * along, r2 = o.r * o.r;
    if (off2 > r2) continue; // the ray passes it by
    const t = along - Math.sqrt(r2 - off2); // where it enters
    if (t >= 0 && t < best) best = t;
  }
  return best;
}

// A solid circle that turns up later, on no object (a crater's): addObstacle puts it in
export function addObstacle(o) {
  OBSTACLES.push(o);
}

export function removeObstacle(o) {
  const i = OBSTACLES.indexOf(o);
  if (i >= 0) OBSTACLES.splice(i, 1);
}

// Moves player p in place by direction (dx, dy) over dt seconds. Solid circles push the feet back out
// along their normal, so running into one at an angle slides round it (a test per axis would stop
// dead on a diagonal). There's no edge: the world is round.
export function move(p, dx, dy, dt, speed = SPEED) {
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  if (len > 1) { dx /= len; dy /= len; }
  let nx = p.x + dx * speed * dt, ny = p.y + dy * speed * dt;
  for (let pass = 0; pass < 2; pass++) // twice: pushed out of one circle into the next (the bed's row)
    for (const o of OBSTACLES) {
      const ox = nx - o.x, oy = ny - o.y, d = Math.hypot(ox, oy), min = o.r + PLAYER_SIZE / 2;
      if (d >= min) continue;
      if (d < 1e-6) return; // right on its center: nowhere to slide
      nx = o.x + (ox / d) * min;
      ny = o.y + (oy / d) * min;
    }
  p.x = nx;
  p.y = ny;
}

// Rolls: start one with startRoll (if the player can), then call updateRoll every frame instead of
// move until it returns false. p.roll = { t, dx, dy } while rolling; p.rollCooldown counts down after.
export function startRoll(p, dx, dy) {
  if (p.roll || p.rollCooldown > 0) return false;
  if (dx === 0 && dy === 0) ({ dx, dy } = dirVector(p.dir)); // standing: roll where we face
  const len = Math.hypot(dx, dy);
  p.roll = { t: 0, dx: dx / len, dy: dy / len };
  p.dir = dirFromVector(dx, dy);
  return true;
}

export function updateRoll(p, dt) {
  if (!p.roll) {
    p.rollCooldown = Math.max(0, (p.rollCooldown ?? 0) - dt);
    return false;
  }
  const k = p.roll.t / ROLL_TIME;
  move(p, p.roll.dx, p.roll.dy, dt, ROLL_SPEED * (1 - 0.55 * k * k)); // slows down to get up
  p.roll.t += dt;
  if (p.roll.t >= ROLL_TIME) {
    p.roll = null;
    p.rollCooldown = ROLL_COOLDOWN;
  }
  return true;
}
