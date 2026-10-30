// World rules: the planet, collision and movement. Kept separate from rendering so a server can reuse
// it if multiplayer comes back.

import { moveChart, northChart, toChart, toSphere } from './sphere.js';
import { cellPoint } from './grid.js';

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
export const ROLL_SPEED = 160; // world units per second at the start, easing off towards the end (a roll ~3 m)
export const ROLL_COOLDOWN = 2; // seconds after a roll before the next one (the hotbar shows it going)
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
export const SYSTEM = 'Albion'; // the star system it's in
const PLANET_M = 300; // its radius, meters (~1.9 km round): the places on it go by angle (the map's grid), so they're as far apart as it's big
export const PLANET_R = PLANET_M * UNITS_PER_M;
export const POLE = [0, 1, 0];
// Where we come down: high in the north (65°, ~130 m from the pole), a little off to one side (25°
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
// A bug's bite, played once over BUG_BITE_TIME seconds: it rears up, jaws wide, and snaps them shut
// on him BUG_BITE_SNAP of the way through (when the bite lands), then settles back
export const BUG_BITE_TIME = 0.4, BUG_BITE_SNAP = 0.5;
// The firing loops are drawn aimed straight ahead of the facing and this far off it either way
// (radians, the way screen angles grow: + turns it to the figure's right): the one nearest the aim is
// played
export const AIM_OFFSETS = [-0.26, 0, 0.26];
export const SHOT_RANGE = 3 * UNITS_PER_M; // how far a round carries (short, to begin with)
// Crouched, the hero fires steadier: the range this much longer, the spread (and the sway) this much
// narrower
export const CROUCH_AIM = { range: 1.1, spread: 0.5 };
// The aim sways: across this either way of where the hero aims (radians), back and forth over
// SWAY_PERIOD seconds; a shot goes where the sway is when it fires
export const SHOT_SPREAD = 0.08;
export const SWAY_PERIOD = 1.2;
// The sway at time t (seconds): an even back and forth across the spread (radians, from the aim)
export function shotSway(t) {
  const k = (t / SWAY_PERIOD) % 1;
  return SHOT_SPREAD * (k < 0.5 ? 4 * k - 1 : 3 - 4 * k);
}
// A knife slash's reach (see SLASH_TIME)
export const SLASH_RANGE = 1 * UNITS_PER_M; // how far it reaches, from the feet (the least: talents to come will take it farther)
export const SLASH_ARC = (90 * Math.PI) / 180; // how wide, centered on where the hero aims (the least, as the reach)
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
// say (a press makes the hero say this); heals (a press gives him all his health back); footprint
// ([half width, half depth] meters, in its model: a big thing, drawn in front of or behind the hero by
// where it reaches to, not by its middle); breathes (its sprite's frames played round, slowly) }
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

// The safe space (see quests.js), where the hero saw something as he fell: STRUCTURES_WEST meters west
// of the backpack and STRUCTURES_SOUTH south (on its chart, north up), a point on the ball ({ home,
// label }, as an object's: the quest's arrow and the map's mark go by it), its campfire and all round it
const STRUCTURES_WEST = 0.25 * PLANET_M, STRUCTURES_SOUTH = 0.3 * PLANET_M; // meters west and south of it (as the planet's big) (in the map's grid: low in the cell next to the escape pod's, well off its safe zone: a way to fight through)
const backpackHome = toSphere(CHART0, BACKPACK.x - SPAWN.x, BACKPACK.y - SPAWN.y, PLANET_R);
export const STRUCTURES = { label: 'Safe space', home: toSphere(northChart(backpackHome, POLE, [0, 1, 0]), -STRUCTURES_WEST * UNITS_PER_M, STRUCTURES_SOUTH * UNITS_PER_M, PLANET_R) };
Object.assign(STRUCTURES, chartPoint(CHART0, STRUCTURES.home)); // (its x, y on the chart, kept there as the objects')
// The safe space's campfire, burning right there: low (struck and shot over), not walked through
const CAMPFIRE_SOLID = { x: STRUCTURES.x, y: STRUCTURES.y, r: 0.55 * UNITS_PER_M, of: 'campfire' };
OBJECTS.push({ name: 'campfire', x: STRUCTURES.x, y: STRUCTURES.y, label: STRUCTURES.label, solid: CAMPFIRE_SOLID, heals: true, say: 'A prehistoric way to keep warm... Barbaric, but it works! Where does he get wood?' });
OBSTACLES.push(CAMPFIRE_SOLID);
// By it, an automatic turret: a machine gun on a tripod that turns to the nearest bug in TURRET_RANGE
// and fires at it (see client.js); tall: it stops shots
export const TURRET = { x: STRUCTURES.x + 2.6 * UNITS_PER_M, y: STRUCTURES.y - 0.6 * UNITS_PER_M }; // (on the side he comes from: east)
export const TURRET_FRAMES = 16; // its sprite's: a frame for each way the gun points, round from +x
export const TURRET_RANGE = 8 * UNITS_PER_M;
export const TURRET_MUZZLE = [0.5, 0, 0.7]; // meters: how far out from its pivot along the gun, to its left, how high (as the art draws it, scaled up)
const TURRET_SOLID = { x: TURRET.x, y: TURRET.y, r: 0.34 * UNITS_PER_M, cover: true, of: 'turret' };
OBJECTS.push({ name: 'turret', x: TURRET.x, y: TURRET.y, solid: TURRET_SOLID, aim: Math.PI / 2 });
OBSTACLES.push(TURRET_SOLID);
// Over them all, to one side: a garage, the Soviet kind (a brick box, longer than wide, along y), its
// gates in its +y end (facing the camera, down to the campfire); it stops the hero, and shots, along a
// row of circles down it
export const GARAGE = { x: STRUCTURES.x - 2.2 * UNITS_PER_M, y: STRUCTURES.y - 6.5 * UNITS_PER_M, yaw: 0.26 }; // (turned a little)
export const GARAGE_SIZE = [1.7, 3.0, 3.6]; // meters: its half width (x), half depth (y), its walls' height (well over the hero)
OBJECTS.push({ name: 'garage', x: GARAGE.x, y: GARAGE.y, yaw: GARAGE.yaw, footprint: GARAGE_SIZE }); // (footprint: big and tall, see client.js's drawing order)
OBSTACLES.push(...[-2.2, -1.1, 0, 1.1, 2.2].map((m) => ({ ...modelToWorld(GARAGE, [0, m]), r: 1.75 * UNITS_PER_M, cover: true, of: 'garage' })));
// Its torn-off gate leaf, leant against its side wall by the doorway (its middle, meters, in its model;
// the art draws it there): it stops the hero, and shots, along a few circles down its foot, and in the
// gap between it and the wall
export const GARAGE_LEAF = [GARAGE_SIZE[0] + 0.62, GARAGE_SIZE[1] - 0.85];
OBSTACLES.push(...[0.15, -0.3].flatMap((d) => [-0.45, 0, 0.45].map((m) => ({ ...modelToWorld(GARAGE, [GARAGE_LEAF[0] + d, GARAGE_LEAF[1] + m]), r: 0.38 * UNITS_PER_M, cover: true, of: 'garage' })))); // (and the gap under it to the wall: no getting in there)
// The fellow: an old scientist, standing out in front of the garage by its open doorway (meters, in its
// model), facing the camera; he stops the hero (not shots: they'd go into him)
const FELLOW_SOLID = { ...modelToWorld(GARAGE, [0.55, GARAGE_SIZE[1] + 0.9]), r: 0.3 * UNITS_PER_M, of: 'garage' };
OBJECTS.push({ name: 'fellow', x: FELLOW_SOLID.x, y: FELLOW_SOLID.y, label: 'Fellow', solid: FELLOW_SOLID, say: 'Oh, a visitor! I hate visitors! Haven’t had any in ages... Are you going to kill me?', speaks: true, breathes: true }); // (speaks: his line's his own, over his head)
OBSTACLES.push(FELLOW_SOLID);

// The huge thing the fellow saw near the pole (see quests.js), in the middle of the map's cell C1: an
// alien bug's egg, near twice as tall as the hero, sunk in a pool of its poison, a couple of big spikes
// on it, pulsing slowly (breathes, as the fellow: its frames), green reek rising off it (see
// tools/make-art.mjs); it stops the hero, and shots; a safe zone round it; a pit under it, hidden till
// it's burst. HUGE_THING is its point on the ball ({ home, label }, as the safe space: the quest's
// arrow and the map's mark go by it)
export const HUGE_THING = { label: 'Huge thing', home: cellPoint('C1') };
Object.assign(HUGE_THING, chartPoint(CHART0, HUGE_THING.home));
// The wrecked ship the fellow saw closer to the equator (see quests.js), a little low and right of the middle of the map's cell
// C3, where the teleportation device is to be got from: a big white ship (as the escape pod), its orange
// paint worn, come down and broken in two, half buried in the sand (lower than the hero: nothing to see through), its halves lying square to each other, two sides of a square:
// the front half along the north (narrowing to its crumpled front, holes torn in it), the back half (a
// big round engine face at its end, the hatch in its side) down the west; their torn ends by
// the corner between them, a gap left there, the way in (see tools/make-art.mjs). Inside the square, the
// Mother's ground (see client.js). It stops the hero, and shots; a big safe zone round it. WRECK is its
// point on the ball ({ home, label }: the quest's arrow and the map's mark go by it), the square's middle
export const WRECK = { label: 'Ship wreckage', home: cellPoint('C3', 0.6, 0.7) }; // (the whole of it still in the cell)
Object.assign(WRECK, chartPoint(CHART0, WRECK.home));
// The ship, whole (meters; x along it from its back end, its front +x; round it, angles from across (y)
// up (z)): its radius; how high its middle (its axis) lies (sunk); its body [from, to], its front's tip,
// and how round that is (its radius); how far its engine face sticks out back; the hatch [where along it,
// round it]; holes torn in its top [where along it, half how long]; antennas [where along it, how tall];
// boxes of hardware on it [where along it, round it, half how big]; its front sunk deeper [from where
// along it, how much deeper at its tip], its nose gone under the sand
export const WRECK_ROCKET = {
  R: 1.5, zc: -0.6, body: [0, 16.5], tip: 21.5, noseR: 0.55, face: 0.3, hatch: [5.5, Math.PI / 3],
  holes: [[12.3, 0.7], [17.8, 0.45]], antennas: [], boxes: [[14.6, 1.3, 0.2], [10.2, 1.9, 0.17]], noseSink: [13, 1.2],
};
// How wide it is at x along it (its front narrowing to its rounded end)
export const rocketR = (x) => {
  const { R, body, tip, noseR } = WRECK_ROCKET, end = tip - noseR;
  if (x <= body[1]) return R;
  if (x <= end) return R + (noseR - R) * ((x - body[1]) / (end - body[1]));
  return Math.sqrt(Math.max(0.1, noseR * noseR - (x - end) ** 2));
};
// Its pieces: the sprite's name; the stretch of it each is (from, to, along it); torn off (open: 1 its
// front end, -1 its back); where its middle is (meters off WRECK: x east, y south); turned (yaw: its front
// that way); turned round its length (roll); how high its highest bit stands (top)
export const WRECK_PIECES = [
  { name: 'wreck', from: 9, to: 21.6, open: -1, at: [2.8, -7], yaw: 0, roll: 0.06, top: 2 },
  { name: 'wreck_tail', from: -0.5, to: 9, open: 1, at: [-7, 1.25], yaw: -Math.PI / 2, roll: -0.08, top: 2 },
];
// (not on the map for now: its place, the quest's arrow and mark, its safe zone stay; WRECK_PIECES is
// still what the art's drawn by)
export const WRECK_SHOWN = false;
const wreckAt = ([x, y]) => modelToWorld({ ...WRECK, yaw: 0 }, [x, y]);
const WRECK_SOLIDS = []; // (the rocket's own: how near he is to it, to search it: see client.js)
for (const p of WRECK_SHOWN ? WRECK_PIECES : []) {
  const { R } = WRECK_ROCKET, mid = (p.from + p.to) / 2;
  const at = wreckAt(p.at), o = { name: p.name, ...at, yaw: p.yaw, footprint: [(p.to - p.from) / 2, R, 4] }; // (footprint: big, see client.js's drawing order)
  OBJECTS.push(o);
  // Solid circles along it, as wide as it is there
  const n = Math.max(1, Math.round((p.to - p.from - 1) / 1.4));
  for (let k = 0; k <= n; k++) {
    const x = p.from + 0.5 + (k / n) * (p.to - p.from - 1);
    const { zc, tip, noseSink: [s0, deep] } = WRECK_ROCKET;
    if (zc + rocketR(Math.max(0, x)) - (x > s0 ? (deep * (x - s0)) / (tip - s0) : 0) < 0.15) continue; // (gone under the sand there)
    const solid = { ...modelToWorld(o, [x - mid, 0]), r: rocketR(Math.max(0, x)) * UNITS_PER_M, cover: true, of: p.name };
    OBSTACLES.push(solid);
    WRECK_SOLIDS.push(solid);
  }
}
// Cargo containers thrown out of it, lying round it outside the square, buried deep, tipped: the kinds by
// sprite name (paint; turned (yaw); tipped (pitch: its far end down; roll); how high its middle is: sunk);
// where each lies (meters off WRECK) and which it is. Each stops the hero, and shots; low: never seen through
export const CONTAINER_KINDS = {
  container_orange: { paint: 'orange', yaw: 0.45, pitch: 0.22, roll: 0.05, zc: 0.15 },
  container_white: { paint: 'white', yaw: -0.35, pitch: -0.08, roll: 0.18, zc: 0.05 },
  container_teal: { paint: 'teal', yaw: 1.2, pitch: 0.12, roll: -0.12, zc: 0.1 },
};
const CONTAINERS = [[13, -8, 'container_orange'], [-10.5, 9.5, 'container_white'], [7.5, 8.5, 'container_teal'], [-12.5, -1.5, 'container_orange'], [12, 3, 'container_white']];
CONTAINERS.forEach(([mx, my, kind], i) => {
  const name = `container_${i}`, o = { name, sprite: kind, ...wreckAt([mx, my]), yaw: CONTAINER_KINDS[kind].yaw };
  OBJECTS.push(o);
  for (const m of [-1, 0, 1]) OBSTACLES.push({ ...modelToWorld(o, [m, 0]), r: 0.7 * UNITS_PER_M, cover: true, of: name });
});
if (WRECK_SHOWN) Object.assign(OBJECTS.find((o) => o.name === 'wreck'), { label: WRECK.label, say: 'Nothing but scrap in here... Wait, what’s that noise?', solids: WRECK_SOLIDS }); // (say: his line as he's done searching it, see client.js)
// Where the Mother comes out: in the middle of the square (its point on the ball, as WRECK's)
export const MOTHER_AT = wreckAt([1.5, 1]);
MOTHER_AT.home = toSphere(CHART0, MOTHER_AT.x - SPAWN.x, MOTHER_AT.y - SPAWN.y, PLANET_R);
export const EGG_R = 1.15; // meters: how wide it is, round its middle (the art draws it so)
const EGG_SOLID = { x: HUGE_THING.x, y: HUGE_THING.y, r: (EGG_R + 0.1) * UNITS_PER_M, cover: true, of: 'egg' };
OBJECTS.push({ name: 'egg', x: HUGE_THING.x, y: HUGE_THING.y, label: 'Huge thing', solid: EGG_SOLID, breathes: true, quest: 'hugeThing', say: 'I won’t fight the urge to destroy this abomination!', sayOff: 'Ew, it’s huge... Looks disgusting!' }); // (sayOff: his line while its quest, quest, isn't on; say, on it: it wakes, see client.js)
OBSTACLES.push(EGG_SOLID);
// ...and the pit under it, left once it's burst (see client.js): a deep well of its poison; walked round, shot over
OBJECTS.push({ name: 'egg_pit', x: HUGE_THING.x, y: HUGE_THING.y, flat: true, later: true, solid: { x: HUGE_THING.x, y: HUGE_THING.y, r: 1.1 * UNITS_PER_M, of: 'egg_pit', dx: 0, dy: 0 } });

// The fellow's equipment he lost in the West (see quests.js), in the middle of the map's cell D2,
// where his beacon shows it: a wooden crate to the hero's waist, open, test tubes and flasks packed in
// it, his beacon's lamp on a corner (see tools/make-art.mjs); hold E to pick it
// up; it stops the hero, and shots (tall enough to hide behind); a safe zone
// round it. EQUIPMENT is its point on the ball ({ home, label }, as the huge thing's: the quest's arrow
// and the map's mark go by it, picked up or not)
export const EQUIPMENT = { label: 'Equipment', home: cellPoint('D2') };
Object.assign(EQUIPMENT, chartPoint(CHART0, EQUIPMENT.home));
const EQUIPMENT_SOLID = { x: EQUIPMENT.x, y: EQUIPMENT.y, r: 0.58 * UNITS_PER_M, cover: true, of: 'equipment' };
OBJECTS.push({ name: 'equipment', x: EQUIPMENT.x, y: EQUIPMENT.y, label: EQUIPMENT.label, pickup: true, solid: EQUIPMENT_SOLID, pickupSay: 'Test tubes, flasks... Easy now, not a single one cracked.' });
OBSTACLES.push(EQUIPMENT_SOLID);
// By it, a desert well: a ring of rough stones round a dark hole (see tools/make-art.mjs), behind it
// and a little to its left; it stops the hero, and shots (waist-high stone). It goes on the map once
// he's come up to it (see client.js)
const WELL_SOLID = { x: EQUIPMENT.x - 1.05 * UNITS_PER_M, y: EQUIPMENT.y - 2.6 * UNITS_PER_M, r: 0.78 * UNITS_PER_M, cover: true, of: 'well' };
OBJECTS.push({ name: 'well', x: WELL_SOLID.x, y: WELL_SOLID.y, label: 'Well', solid: WELL_SOLID, say: 'Almost empty... Useless...' });
OBSTACLES.push(WELL_SOLID);
// And by the well, a couple of cacti: a tall one with its arms up behind it on the left, a squat round
// one off to its right, over the crate's right corner; they stop the hero (the tall one shots too)
const CACTUS_SOLID = { x: WELL_SOLID.x - 1.45 * UNITS_PER_M, y: WELL_SOLID.y - 0.5 * UNITS_PER_M, r: 0.22 * UNITS_PER_M, cover: true, of: 'cactus' };
const CACTUS_SMALL_SOLID = { x: WELL_SOLID.x + 3.1 * UNITS_PER_M, y: WELL_SOLID.y + 1.0 * UNITS_PER_M, r: 0.28 * UNITS_PER_M, of: 'cactus_small' };
OBJECTS.push({ name: 'cactus', x: CACTUS_SOLID.x, y: CACTUS_SOLID.y, solid: CACTUS_SOLID }, { name: 'cactus_small', x: CACTUS_SMALL_SOLID.x, y: CACTUS_SMALL_SOLID.y, solid: CACTUS_SMALL_SOLID });
OBSTACLES.push(CACTUS_SOLID, CACTUS_SMALL_SOLID);

// Cacti and rocks strewn over the sectors round here (C1, D1, C2, D2, C3, D3): so many of each in each
// sector, at random (the same every time), clear of everything else there and of the places that matter;
// each a solid circle as wide as it is (the tall ones stopping shots too). Kinds by sprite name:
// [radius (meters), cover]
const CACTUS_KINDS = { cactus: [0.22, true], cactus_small: [0.28, false], cactus_organ: [0.25, true], cactus_pear: [0.35, false], cactus_cluster: [0.38, false] };
const ROCK_KINDS = { rock_boulder: [0.85, true], rock_slab: [0.75, false], rock_pile: [0.55, false], rock_spire: [0.5, true], rock_pair: [0.95, true] };
// Cracks in the ground, acid in them, its reek rising (green or yellow): the kinds by sprite name (the
// acid's color; the cracks, each [how wide (half, meters), its points (meters: x east, y south)], one
// point a round hole). Each lies flat; walked round (solid circles along it), shot over
export const FISSURE_KINDS = {
  fissure_long: { acid: 'green', paths: [[0.32, [[-2.2, 0.3], [-1.2, -0.1], [-0.3, 0.25], [0.6, -0.15], [1.5, 0.1], [2.3, -0.3]]]] },
  fissure_fork: { acid: 'yellow', paths: [[0.28, [[-1.6, 0.8], [-0.6, 0.3], [0.2, 0], [1.3, -0.6], [2, -0.7]]], [0.2, [[0.2, 0], [0.9, 0.6], [1.6, 0.9]]]] },
  fissure_pool: { acid: 'green', paths: [[0.75, [[0, 0]]], [0.18, [[-1.7, -0.45], [-0.6, -0.1]]], [0.16, [[0.6, 0.2], [1.7, 0.65]]], [0.14, [[0.1, 0.6], [0.35, 1.4]]]] },
  fissure_web: { acid: 'yellow', paths: [[0.2, [[-1.8, -0.5], [-0.8, -0.2], [0, -0.4], [1, 0.1], [1.9, 0]]], [0.15, [[-0.8, -0.2], [-0.5, 0.6], [-0.9, 1.1]]], [0.14, [[1, 0.1], [1.3, 0.8]]]] },
  fissure_zigzag: { acid: 'green', paths: [[0.22, [[-2.6, -0.6], [-1.6, 0.4], [-0.6, -0.5], [0.4, 0.5], [1.4, -0.4], [2.5, 0.3]]]] },
  fissure_star: { acid: 'yellow', paths: [[0.45, [[0, 0]]], ...[0.3, 1.5, 2.6, 3.7, 5].map((a, i) => [0.15 - 0.01 * i, [[Math.cos(a) * 0.35, Math.sin(a) * 0.35], [Math.cos(a + 0.2) * (1.3 + 0.3 * (i % 2)), Math.sin(a + 0.2) * (1.3 + 0.3 * (i % 2))]]])] },
  fissure_twin: { acid: 'green', paths: [[0.24, [[-2, -0.5], [-0.9, -0.7], [0.3, -0.45], [1.6, -0.8]]], [0.2, [[-1.5, 0.55], [-0.4, 0.35], [0.8, 0.6], [1.9, 0.3]]]] },
  fissure_hook: { acid: 'yellow', paths: [[0.26, [[-2, 0.8], [-1.2, 0.2], [-0.2, -0.3], [0.8, -0.3], [1.5, 0.2], [1.7, 0.9]]]] },
  fissure_small: { acid: 'green', paths: [[0.2, [[-0.9, 0.2], [-0.2, -0.1], [0.5, 0.15], [1, -0.15]]]] },
  fissure_pools: { acid: 'yellow', paths: [[0.5, [[-0.9, -0.1]]], [0.38, [[0.9, 0.25]]], [0.18, [[-0.9, -0.1], [0, 0.15], [0.9, 0.25]]], [0.12, [[0.9, 0.25], [1.6, 0.9]]]] },
};
// How wide a crack is t of the way along it (0..1): narrowing to its ends (a hole: all of it)
export const fissureWidth = (w, pts, t) => (pts.length < 2 ? w : w * (0.3 + 0.7 * Math.sin(Math.PI * t) ** 0.6));
// Along each of its cracks every so far (meters): { x, y, w (how wide there) }
export function fissurePoints(kind, step) {
  const out = [];
  for (const [w, pts] of FISSURE_KINDS[kind].paths) {
    if (pts.length < 2) { out.push({ x: pts[0][0], y: pts[0][1], w }); continue; }
    const lens = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1])), total = lens.reduce((a, b) => a + b, 0);
    for (let d = step / 2; d < total; d += step) {
      let i = 0, left = d;
      while (left > lens[i]) left -= lens[i++];
      const k = left / lens[i];
      out.push({ x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k, w: fissureWidth(w, pts, d / total) });
    }
  }
  return out;
}
const STREWN_CELLS = ['C1', 'D1', 'C2', 'D2', 'C3', 'D3'], STREWN_CLEAR = 5 * UNITS_PER_M;
const FISSURES_EACH = 14; // (cracks in each sector)
// Ravens, each on its own on the ground round the sectors (see client.js: they fly off as he comes): each
// { flock (which it's with), home (its point on the ball), dir (which way it faces) }
export const RAVENS = [];
const RAVEN_FLOCKS = 8; // (ravens in each sector, each on its own) // (meters from anything already there)
const STREWN_AWAY = [[STRUCTURES, 22], [WRECK, 18], [HUGE_THING, 12], [EQUIPMENT, 8], [OBJECTS.find((o) => o.name === 'pod'), 14]]; // (and from these, meters)
{
  const taken = OBJECTS.filter((o) => !o.later).map((o) => ({ x: o.x, y: o.y }));
  const strew = (KINDS, each, seed) => {
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (const cell of STREWN_CELLS)
      for (let n = 0, tries = 0; n < each && tries < 200; tries++) {
        const at = chartPoint(CHART0, cellPoint(cell, 0.05 + 0.9 * random(), 0.05 + 0.9 * random()));
        const kinds = Object.keys(KINDS), kind = kinds[Math.floor(random() * kinds.length)];
        if (taken.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < STREWN_CLEAR)) continue;
        if (STREWN_AWAY.some(([p, m]) => Math.hypot(p.x - at.x, p.y - at.y) < m * UNITS_PER_M)) continue;
        const name = `${kind.split('_')[0]}_${cell}_${n}`, [r, cover] = KINDS[kind], solid = { ...at, r: r * UNITS_PER_M, cover, of: name };
        OBJECTS.push({ name, sprite: kind, ...at, solid });
        OBSTACLES.push(solid);
        taken.push(at);
        n++;
      }
  };
  strew(CACTUS_KINDS, 24, 7);
  strew(ROCK_KINDS, 16, 11);
  // The cracks: flat, FISSURES_EACH in each sector, as clear of everything; solid circles along them
  let seed = 23;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const cell of STREWN_CELLS)
    for (let n = 0, tries = 0; n < FISSURES_EACH && tries < 500; tries++) {
      const at = chartPoint(CHART0, cellPoint(cell, 0.05 + 0.9 * random(), 0.05 + 0.9 * random()));
      const kinds = Object.keys(FISSURE_KINDS), kind = kinds[Math.floor(random() * kinds.length)];
      if (taken.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < STREWN_CLEAR + 2 * UNITS_PER_M)) continue;
      if (STREWN_AWAY.some(([p, m]) => Math.hypot(p.x - at.x, p.y - at.y) < m * UNITS_PER_M)) continue;
      const name = `fissure_${cell}_${n}`, circles = fissurePoints(kind, 0.5).filter((c) => c.w > 0.12);
      const solids = circles.map((c) => ({ x: at.x + c.x * UNITS_PER_M, y: at.y + c.y * UNITS_PER_M, r: (c.w + 0.12) * UNITS_PER_M, of: name }));
      OBJECTS.push({ name, sprite: kind, ...at, flat: true, solid: solids.reduce((a, b) => (b.r > a.r ? b : a)) });
      OBSTACLES.push(...solids);
      taken.push(at);
      n++;
    }
  // The ravens: RAVEN_FLOCKS in each sector, each on its own, on a spot clear of things
  for (const cell of STREWN_CELLS)
    for (let n = 0, tries = 0; n < RAVEN_FLOCKS && tries < 200; tries++) {
      const at = chartPoint(CHART0, cellPoint(cell, 0.05 + 0.9 * random(), 0.05 + 0.9 * random()));
      if (taken.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < 3 * UNITS_PER_M)) continue;
      if (STREWN_AWAY.some(([p, m]) => Math.hypot(p.x - at.x, p.y - at.y) < m * UNITS_PER_M)) continue;
      const flock = `${cell}_${n}`, birds = 1; // (each on its own)
      for (let i = 0; i < birds; i++) {
        const a = random() * Math.PI * 2, d = (0.3 + random() * 1.2) * UNITS_PER_M, x = at.x + Math.cos(a) * d, y = at.y + Math.sin(a) * d;
        RAVENS.push({ flock, home: toSphere(CHART0, x - SPAWN.x, y - SPAWN.y, PLANET_R), dir: Math.floor(random() * 8) });
      }
      n++;
    }
}

// Safe zones round the escape pod and the backpack (overlapping: the way between them is safe too),
// and round the structures, the egg and the equipment: bugs only come for the hero when he's out of them
// all; they don't turn up in them (see client.js). { at (what it's round: anything kept on the chart with an x, y), r (world units),
// until (what ends it, if anything does: 'map', the map opened at its cue; 'egg', the egg burst; 'equipment', the fellow's crate picked up) }
export const SAFE_ZONES = [
  { at: OBJECTS.find((o) => o.name === 'pod'), r: 12 * UNITS_PER_M, until: 'map' },
  { at: OBJECTS.find((o) => o.name === 'backpack'), r: 11 * UNITS_PER_M, until: 'map' },
  { at: STRUCTURES, r: 10 * UNITS_PER_M },
  { at: OBJECTS.find((o) => o.name === 'egg'), r: 10 * UNITS_PER_M, until: 'egg' },
  { at: EQUIPMENT, r: 8 * UNITS_PER_M, until: 'equipment' },
  { at: WRECK, r: 16 * UNITS_PER_M }, // (big: the whole wreck and well round it)
];

// Their places on the planet: each object at a point of the ball (home); each solid circle at an
// offset from its object (of), so it stays with its sprite
for (const o of OBJECTS) o.home = toSphere(CHART0, o.x - SPAWN.x, o.y - SPAWN.y, PLANET_R);
for (const ob of OBSTACLES) {
  const parent = OBJECTS.find((o) => (o.id ?? o.name) === ob.of);
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
  for (const o of [...OBJECTS, STRUCTURES, HUGE_THING, EQUIPMENT, WRECK, MOTHER_AT]) Object.assign(o, chartPoint(chart, o.home));
  for (const ob of OBSTACLES) {
    const parent = OBJECTS.find((o) => (o.id ?? o.name) === ob.of);
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
export function move(p, dx, dy, dt, speed = SPEED, r = PLAYER_SIZE / 2) { // (r: how far it keeps off solid things)
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  if (len > 1) { dx /= len; dy /= len; }
  let nx = p.x + dx * speed * dt, ny = p.y + dy * speed * dt;
  for (let pass = 0; pass < 2; pass++) // twice: pushed out of one circle into the next (the bed's row)
    for (const o of OBSTACLES) {
      const ox = nx - o.x, oy = ny - o.y, d = Math.hypot(ox, oy), min = o.r + r;
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

export function updateRoll(p, dt, cooldown = ROLL_COOLDOWN) { // (cooldown: the wait after it, seconds: shorter with a talent)
  if (!p.roll) {
    p.rollCooldown = Math.max(0, (p.rollCooldown ?? 0) - dt);
    return false;
  }
  const k = p.roll.t / ROLL_TIME;
  move(p, p.roll.dx, p.roll.dy, dt, ROLL_SPEED * (1 - 0.55 * k * k)); // slows down to get up
  p.roll.t += dt;
  if (p.roll.t >= ROLL_TIME) {
    p.roll = null;
    p.rollCooldown = cooldown;
  }
  return true;
}
