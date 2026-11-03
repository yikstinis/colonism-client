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
// gates in its +y end (facing the camera, down to the campfire); it stops the hero, and shots, by its
// walls (a rectangle round them)
export const GARAGE = { x: STRUCTURES.x - 2.2 * UNITS_PER_M, y: STRUCTURES.y - 6.5 * UNITS_PER_M, yaw: 0.26 }; // (turned a little)
export const GARAGE_SIZE = [1.7, 3.0, 3.6]; // meters: its half width (x), half depth (y), its walls' height (well over the hero)
OBJECTS.push({ name: 'garage', x: GARAGE.x, y: GARAGE.y, yaw: GARAGE.yaw, footprint: GARAGE_SIZE }); // (footprint: big and tall, see client.js's drawing order)
const GARAGE_KEEP = 0.15; // meters past its walls (he's wider than his feet: his pack; the art's depth sorts the rest, see client.js)
OBSTACLES.push(...solidRect({ ...GARAGE, name: 'garage' }, 0, -GARAGE_SIZE[0] - GARAGE_KEEP, GARAGE_SIZE[0] + GARAGE_KEEP, -GARAGE_SIZE[1] - GARAGE_KEEP, GARAGE_SIZE[1] + GARAGE_KEEP)); // (its walls, square to the corners)
// Its torn-off gate leaf, leant against its side wall by the doorway (its middle, meters, in its model;
// the art draws it there): it stops the hero, and shots, and the gap between it and the wall
export const GARAGE_LEAF = [GARAGE_SIZE[0] + 0.62, GARAGE_SIZE[1] - 0.85];
// (all of it, from the wall out past its foot on the sand, as the art leans it: a rectangle, the gap under
// it to the wall in it; past its foot and its edges a little more, so he doesn't seem to stand on it)
const LEAF_FOOT = GARAGE_LEAF[0] + 1.5 * Math.sin(0.42), LEAF_HALF = 0.64; // meters: how far out its foot is (it leans 0.42 in, 1.5 up to its middle: see tools/make-art.mjs), half its width
OBSTACLES.push(...solidRect({ ...GARAGE, name: 'garage' }, 0, GARAGE_SIZE[0], LEAF_FOOT + 0.2, GARAGE_LEAF[1] - LEAF_HALF - 0.12, GARAGE_LEAF[1] + LEAF_HALF + 0.12));
// A little garden bed by its right wall, the fellow's: a frame of planks, dug earth, two rows of
// something green coming up (meters, in its model: its middle; its half width and length), along the
// wall; it stops the hero (low: shot over)
export const GARDEN = { at: [GARAGE_SIZE[0] + 1.15, -1.1], half: [0.5, 1.0] };
OBJECTS.push({ name: 'garden', ...modelToWorld(GARAGE, GARDEN.at), yaw: GARAGE.yaw, footprint: [...GARDEN.half, 0.4] });
OBSTACLES.push(...solidRect({ ...GARAGE, name: 'garden', ...modelToWorld(GARAGE, GARDEN.at) }, 0, -GARDEN.half[0] - 0.05, GARDEN.half[0] + 0.05, -GARDEN.half[1] - 0.05, GARDEN.half[1] + 0.05, null, false));
// A rusty steel drum by its front corner, on the gates' hinge side (meters, in its model): no getting in
// to the corner there; it stops the hero, and shots
export const BARREL_R = 0.3; // meters: its radius (the art draws it so)
const BARREL_SOLID = { ...modelToWorld(GARAGE, [-GARAGE_SIZE[0] - 0.33, GARAGE_SIZE[1] - 0.15]), r: (BARREL_R + 0.06) * UNITS_PER_M, cover: true, of: 'barrel' };
OBJECTS.push({ name: 'barrel', x: BARREL_SOLID.x, y: BARREL_SOLID.y, solid: BARREL_SOLID });
OBSTACLES.push(BARREL_SOLID);
// The fellow: an old scientist, standing out in front of the garage by its open doorway (meters, in its
// model), facing the camera; he stops the hero, and shots (as the turret does: the aim's reach stops at him)
const FELLOW_SOLID = { ...modelToWorld(GARAGE, [0.55, GARAGE_SIZE[1] + 0.9]), r: 0.3 * UNITS_PER_M, cover: true, of: 'garage' };
OBJECTS.push({ name: 'fellow', x: FELLOW_SOLID.x, y: FELLOW_SOLID.y, label: 'Fellow', solid: FELLOW_SOLID, say: 'Oh, a visitor! I hate visitors! Haven’t had any in years... Are you going to kill me?', speaks: true, breathes: true }); // (speaks: his line's his own, over his head)
OBSTACLES.push(FELLOW_SOLID);

// The safe space's safe zone: a rectangle round it, square to the garage (meters in the garage's
// model: its middle, its half width and half depth), the garage, the fellow, the campfire and the turret
// all inside; see SAFE_ZONES
export const SAFE_RECT = { dx: 3, dy: 1.5, w: 7, h: 7 };
// Inside the fence, all over it, old asphalt drifted over with sand (see tools/make-art.mjs: a decal, under
// everything else)
OBJECTS.unshift({ name: 'asphalt', ...modelToWorld(GARAGE, [SAFE_RECT.dx, SAFE_RECT.dy]), flat: true });
// A chain-link fence round the safe space, along its safe zone's edge, here and there: runs of panels,
// gaps between (ways in on every side). Galvanized posts, a rail along the top, the mesh between them;
// some panels holed, some leaning, the mesh torn off the rail and hanging (see tools/make-art.mjs).
// They stop the hero and the bugs (not shots: through the mesh). FENCE: a panel's length, how high its posts stand (meters);
// FENCE_YAWS: the ways a panel's turned (its sides', round from the garage's way: square to it), a
// sprite for each (kind_i)
export const FENCE = { len: 2, h: 1.55 }, FENCE_YAWS = [0, 1, 2, 3].map((k) => GARAGE.yaw + (k * Math.PI) / 2);
// How far off its line he's kept (meters, either side, past his own size): as far as it stands high on
// the screen, so behind it he's clear over it, in front of it clear in front (never seeming to stand in it)
const FENCE_KEEP = 0.35;
// A leaning one's outside: out past its top as it hangs over at each end (as far out as its lean takes
// it, and his pack and shoulder's width more: never under it, never seeming to stand in its mesh)
const FENCE_LEAN_ROOM = 0.62;
// The leaning ones (see tools/make-art.mjs): how far over each's pushed, radians, at its left end (-x
// in its model) and its right; how much its rail sags in the middle, meters
export const FENCE_LEANS = {
  fence_leaning: { lean: [0.12, 0.54], sag: 0.16 }, // (the right end most)
  fence_leaning_back: { lean: [0.5, 0.1], sag: 0.1 }, // (the left end most)
  fence_leaning_holed: { lean: [0.34, 0.38], sag: 0.24 }, // (all of it, holed too)
  fence_leaning_torn: { lean: [0.22, 0.46], sag: 0.12 }, // (its mesh torn off the rail too)
};
export const FENCE_KINDS = { F: 'fence', H: 'fence_holed', L: 'fence_leaning', K: 'fence_leaning_back', J: 'fence_leaning_holed', Q: 'fence_leaning_torn', T: 'fence_torn' };
{
  const { dx, dy, w, h } = SAFE_RECT, x0 = dx - w, x1 = dx + w, y0 = dy - h, y1 = dy + h;
  // Its sides, round it the way the angles grow (along the top, down the right, back along the bottom,
  // up the left, as the garage's model has them): where each starts, which way it goes, and a panel a
  // slot along it, its kind or a gap ('.')
  const SIDES = [
    [[x0, y0], [1, 0], 'FHF...F'],
    [[x1, y0], [0, 1], 'LJ...QK'], // (only leaning ones, pushed over outwards, each its own way)
    [[x1, y1], [-1, 0], 'FTF...H'],
    [[x0, y1], [0, -1], 'FL..FHF'],
  ];
  SIDES.forEach(([[sx, sy], [ux, uy], slots], frame) => {
    for (let i = 0; i < slots.length; i++) {
      const kind = FENCE_KINDS[slots[i]];
      if (!kind) continue;
      const along = (i + 0.5) * FENCE.len, name = `fence_${frame}_${i}`;
      // (its sprite: the kind, turned its side's way; drawn by depth, see client.js; on the sides running
      // up and down the screen, side, under him whenever he's inside by it)
      const o = { name, sprite: `${kind}_${frame}`, ...modelToWorld(GARAGE, [sx + ux * along, sy + uy * along]), yaw: FENCE_YAWS[frame], fence: { side: ux === 0, len: FENCE.len } };
      OBJECTS.push(o);
      // (outside, a leaning one's top hangs out over him: kept out from under it, as far as it leans at each end)
      const [outL, outR] = FENCE_LEANS[kind]?.lean.map((l) => Math.max(FENCE_KEEP, FENCE.h * Math.sin(l) + FENCE_LEAN_ROOM)) ?? [FENCE_KEEP, FENCE_KEEP];
      const a = -FENCE.len / 2 - 0.04, b = FENCE.len / 2 + 0.04;
      OBSTACLES.push({ poly: [[a, -outL], [b, -outR], [b, FENCE_KEEP], [a, FENCE_KEEP]].map((m) => { const q = modelToWorld(o, m); return [q.x, q.y]; }), cover: false, of: name });
    }
  });
}

// The huge thing the fellow saw near the pole (see quests.js), in the middle of the map's cell C1: an
// alien bug's egg, near twice as tall as the hero, sunk in a pool of its poison, a couple of big spikes
// on it, pulsing slowly (breathes, as the fellow: its frames), green reek rising off it (see
// tools/make-art.mjs); it stops the hero, and shots; a safe zone round it; a pit under it, hidden till
// it's burst. HUGE_THING is its point on the ball ({ home, label }, as the safe space: the quest's
// arrow and the map's mark go by it)
export const HUGE_THING = { label: 'Huge thing', home: cellPoint('C1') };
Object.assign(HUGE_THING, chartPoint(CHART0, HUGE_THING.home));
// The wrecked ship the fellow saw closer to the equator (see quests.js), a little low and right of the middle of the map's cell
// C3, where the teleportation device is to be got from: a big cargo hauler come down and broken in two,
// buried deep (lower than the hero: nothing to see through; the ground's own sand drifted up it, see
// tools/make-art.mjs): its front half (the bridge at its bow, cargo pods along its spine) lying east, its
// back half (more pods, the engine block) bent up off it to the north-east, a V, the gap between them;
// some of its pods torn off, the break ragged, holes torn in its spine, its insides showing. It stops the
// hero, and shots; a big safe zone round it. WRECK is its point on the ball ({ home, label }: the
// quest's arrow and the map's mark go by it)
export const WRECK = { label: 'Ship wreckage', home: cellPoint('C3', 0.6, 0.7) }; // (the whole of it still in the cell)
Object.assign(WRECK, chartPoint(CHART0, WRECK.home));
// The ship, whole (meters; x along it, its bow +x; y across; z up): how high its middle is (sunk); its
// spine [from, to, half its width, half its height]; its cargo pods along both sides of it [where along
// it], how far out, half their size; the ones torn off [where along it, which side]; the bridge [from, to,
// half its width, half its height]; the engine block [from, to, half its width, half its height], its
// nozzles [across]; holes torn in the spine's top [where along it, half how long]
export const WRECK_SHIP = {
  zc: 0.2, spine: [-13, 13, 0.9, 0.62],
  pods: [-11.2, -8, -4.8, -1.6, 1.6, 4.8, 8, 11.2], podAcross: 1.65, podSize: [1.475, 0.65, 0.62], missing: [], // (along all of it, close together: no room to get in between)
  bridge: [13, 17.6, 1.8, 0.95], engines: [-18, -13, 2.2, 0.8], nozzles: [-1.3, 0, 1.3], holes: [[-8, 0.8], [7.8, 0.7]],
};
// Its pieces: the sprite's name; the stretch of it each is (from, to, along it); torn off (open: 1 its
// front end, -1 its back); where its middle is (meters off WRECK: x east, y south); turned (yaw: its bow
// that way); how high its highest bit stands (top)
export const WRECK_PIECES = [
  { name: 'wreck', from: 0, to: 17.8, open: -1, at: [9.4, 0], yaw: 0, top: 1.6 },
  { name: 'wreck_tail', from: -19.4, to: 0, open: 1, at: [-1.1, -16.68], yaw: 2.09, top: 1.4 }, // (bent up off the front half, closed in: nearer a V than a Г)
];
export const WRECK_SHOWN = false; // (on the map; false: its place, the quest's arrow and mark, its safe zone only)
const wreckAt = ([x, y]) => modelToWorld({ ...WRECK, yaw: 0 }, [x, y]);
const WRECK_SOLIDS = []; // (the ship's own: how near he is to it, to search it: see client.js)
// A solid shape: a rectangle in a thing's own frame (meters: from x0 to x1 along it, y0 to y1 across), as
// a polygon in the world, its corners going round; end, if given: its x1 side ragged instead (at end(y),
// no further out than x1), in narrow strips across it (each a convex polygon) behind its straight part
function solidRect(o, mid, x0, x1, y0, y1, end = null, cover = true) {
  const at = (x, y) => { const q = modelToWorld(o, [x - mid, y]); return [q.x, q.y]; };
  const poly = (pts) => ({ poly: pts.map(([x, y]) => at(x, y)), cover, of: o.id ?? o.name });
  if (!end) return [poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])];
  const n = Math.max(2, Math.ceil((y1 - y0) / 0.15)), ys = Array.from({ length: n + 1 }, (_, k) => y0 + ((y1 - y0) * k) / n);
  const ends = ys.map((y) => Math.max(x0, Math.min(x1, end(y)))), core = Math.min(...ends);
  const out = core > x0 ? [poly([[x0, y0], [core, y0], [core, y1], [x0, y1]])] : [];
  for (let k = 0; k < n; k++) if (ends[k] > core || ends[k + 1] > core) out.push(poly([[core, ys[k]], [ends[k], ys[k]], [ends[k + 1], ys[k + 1]], [core, ys[k + 1]]]));
  return out;
}
// The ragged edge where the ship's broken (as the art has it, at the height he'd walk into it): how far
// back from the break, across it
export const wreckJag = (y, z = 0.5) => 0.4 * Math.sin(y * 2.7 + z * 2.3) + 0.2 * Math.sin(y * 8.9 - z * 6.1);
for (const p of WRECK_SHOWN ? WRECK_PIECES : []) {
  const { spine, pods, podAcross, podSize, missing, bridge, engines, nozzles } = WRECK_SHIP, mid = (p.from + p.to) / 2;
  const at = wreckAt(p.at), o = { name: p.name, ...at, yaw: p.yaw, parts: [] }; // (parts: its solid shapes)
  OBJECTS.push(o);
  // Each of its parts in this piece, as drawn at its foot: the spine, the pods, the bridge, the engine block,
  // its nozzles; where it's broken, ragged as the art has it (as far as its edge reaches at any height, its
  // ribs out past it). Laid out along it with its broken end turned to x1 (flip), then back
  const brk = p.open > 0 ? p.to : p.from, flip = p.open > 0 ? 1 : -1;
  const reach = (y) => -(Math.min(...[0.1, 0.4, 0.7, 1, 1.3].map((z) => wreckJag(y, z))) - 0.2); // (out past the break)
  const add = (x0, x1, y0, y1) => { // (a rectangle of it, ragged if it reaches the break)
    const [a, b] = flip > 0 ? [x0, x1] : [-x1, -x0], edge = flip * brk;
    if (a >= edge + 0.7) return; // (all of it torn off)
    const ragged = b > edge - 1 ? (y) => edge + reach(y) : null;
    const [c0, c1] = flip > 0 ? [y0, y1] : [-y1, -y0]; // (turned round: across it the other way too)
    const end = b >= edge - 0.01 ? edge + 1 : b; // (up to the break: as far as its ragged edge may go)
    for (const s of solidRect({ ...o, yaw: o.yaw + (flip > 0 ? 0 : Math.PI) }, flip * mid, a, end, c0, c1, ragged && ((y) => Math.min(b >= edge - 0.01 ? Infinity : b, ragged(y))))) o.parts.push(s);
  };
  add(Math.max(spine[0], p.from), Math.min(spine[1], p.to), -spine[2], spine[2]);
  for (const px of pods) for (const side of [-1, 1]) {
    if (missing.some(([mx, ms]) => mx === px && ms === side) || px + podSize[0] < p.from || px - podSize[0] > p.to) continue;
    add(px - podSize[0], px + podSize[0], side * podAcross - podSize[1], side * podAcross + podSize[1]);
  }
  if (bridge[0] >= p.from && bridge[1] <= p.to + 0.5) add(bridge[0], bridge[1] - 0.4, -bridge[2], bridge[2]); // (its sloped front, sand drifted up it: in from its foot)
  if (engines[0] >= p.from - 1.5 && engines[1] <= p.to) {
    add(engines[0], engines[1], -engines[2], engines[2]);
    add(engines[0] - 0.9, engines[0], Math.min(...nozzles) - 0.62, Math.max(...nozzles) + 0.62); // (the nozzles: their ends under the sand drifted behind them)
  }
  OBSTACLES.push(...o.parts);
  WRECK_SOLIDS.push(...o.parts);
}
// Cargo containers, buried deep, tipped: the kinds by sprite name (paint; turned (yaw); tipped (pitch: its
// far end down; roll); how high its middle is: sunk); where each lies (meters off WRECK) and which it
// is. Each stops the hero, and shots; low: never seen through
export const CONTAINER_KINDS = {
  container_orange: { paint: 'orange', yaw: 0.45, pitch: 0.22, roll: 0.05, zc: 0.15 },
  container_white: { paint: 'white', yaw: -0.35, pitch: -0.08, roll: 0.18, zc: 0.05 },
  container_teal: { paint: 'teal', yaw: 1.2, pitch: 0.12, roll: -0.12, zc: 0.1 },
};
const CONTAINERS = [];
// End to end along the gap between the ship's halves (from the one's nearest edge to the other's), each a
// little askew, as if they came down there, half a meter or so apart and off the ship: no way through there
// (their solid circles reach a little past their ends, closing the gaps between them)
if (WRECK_SHOWN) {
  const [front, tail] = WRECK_PIECES.map((p) => OBJECTS.find((o) => o.name === p.name));
  let best = null; // (the nearest two points of theirs: a corner of one and the nearest point to it of the other)
  for (const [one, other, sign] of [[tail, front, 1], [front, tail, -1]]) for (const s of one.parts) for (const [x, y] of s.poly) for (const t of other.parts) {
    const q = nearestOn(t, x, y), gap = Math.hypot(q.x - x, q.y - y);
    if (!best || gap < best.gap) best = sign > 0 ? { gap, from: { x, y }, to: q } : { gap, from: q, to: { x, y } };
  }
  const ux = (best.to.x - best.from.x) / best.gap, uy = (best.to.y - best.from.y) / best.gap;
  const { from } = best, L = best.gap / UNITS_PER_M; // (the tail's edge; meters across to the front's)
  const n = Math.max(1, Math.round((L - 0.5) / 3.5)), space = (L - n * 3) / (n + 1); // (as many as fit, the room left shared out round them)
  const paints = ['orange', 'teal', 'white', 'red'], lie = [[0.12, 0.25, 0.06, 0.04], [-0.1, -0.25, -0.05, 0.08], [0.08, 0.2, 0.08, -0.05]]; // [turn, off the line (meters), pitch, roll]
  for (let i = 0; i < n; i++) {
    const [turn, off, pitch, roll] = lie[i % lie.length], t = (space + 1.5 + i * (3 + space)) * UNITS_PER_M, kind = `container_gate_${i}`;
    CONTAINER_KINDS[kind] = { paint: paints[i % paints.length], yaw: Math.atan2(uy, ux) + turn, pitch, roll, zc: 0.12, reach: 0.35 };
    CONTAINERS.push([(from.x + ux * t - uy * off * UNITS_PER_M - WRECK.x) / UNITS_PER_M, (from.y + uy * t + ux * off * UNITS_PER_M - WRECK.y) / UNITS_PER_M, kind]);
  }
}
CONTAINERS.forEach(([mx, my, kind], i) => {
  const name = `container_${i}`, o = { name, sprite: kind, ...wreckAt([mx, my]), yaw: CONTAINER_KINDS[kind].yaw, parts: [] };
  OBJECTS.push(o);
  const long = 1.5 + (CONTAINER_KINDS[kind].reach ?? 0); // (along it from its middle: a gate's out past its ends, closing the gaps between them)
  o.parts.push(...solidRect(o, 0, -long, long, -0.6, 0.6));
  OBSTACLES.push(...o.parts);
});
if (WRECK_SHOWN) Object.assign(OBJECTS.find((o) => o.name === 'wreck'), { label: WRECK.label, say: 'Nothing but scrap in here...', solids: WRECK_SOLIDS });
export const EGG_R = 1.15; // meters: how wide it is, round its middle (the art draws it so)
const EGG_SOLID = { x: HUGE_THING.x, y: HUGE_THING.y, r: (EGG_R + 0.1) * UNITS_PER_M, cover: true, of: 'egg' };
// Round it, as far as its safe zone goes, loose earth: dug up, churned (by what's in it, what crawls out
// of it), drifting off into the sand at its edge (see tools/make-art.mjs: a decal, under everything else)
export const EGG_SAFE_R = 10; // meters
OBJECTS.unshift({ name: 'loose_earth', x: HUGE_THING.x, y: HUGE_THING.y, flat: true });
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
OBJECTS.push({ name: 'equipment', x: EQUIPMENT.x, y: EQUIPMENT.y, label: EQUIPMENT.label, pickup: true, solid: EQUIPMENT_SOLID }); // (what he says picking it up: the map's cue, see client.js)
OBSTACLES.push(EQUIPMENT_SOLID);
// By it, the research station: a lattice mast, a satellite dish on its side, a lamp on its top, and a
// transformer by its foot, cabled to it (see tools/make-art.mjs); the mast behind the crate and a
// little to its left, the transformer to the mast's right. They stop the hero, and shots. The mast
// carries the station's name (it goes on the map once he's come up to it: see client.js)
export const STATION = { label: 'Research station' };
const ANTENNA_SOLID = { x: EQUIPMENT.x - 1.05 * UNITS_PER_M, y: EQUIPMENT.y - 2.6 * UNITS_PER_M, r: 0.42 * UNITS_PER_M, cover: true, of: 'antenna' };
OBJECTS.push({ name: 'antenna', x: ANTENNA_SOLID.x, y: ANTENNA_SOLID.y, label: STATION.label, solid: ANTENNA_SOLID, say: 'A strange place for research...' });
OBSTACLES.push(ANTENNA_SOLID);
export const TRANSFORMER_SIZE = [0.55, 0.4]; // meters: its cabinet's half width (x), half depth (y)
const TRANSFORMER = { x: ANTENNA_SOLID.x + 1.75 * UNITS_PER_M, y: ANTENNA_SOLID.y + 0.25 * UNITS_PER_M, yaw: 0 };
OBJECTS.push({ name: 'transformer', ...TRANSFORMER });
OBSTACLES.push(...solidRect({ ...TRANSFORMER, name: 'transformer' }, 0, -TRANSFORMER_SIZE[0] - 0.12, TRANSFORMER_SIZE[0] + 0.12, -TRANSFORMER_SIZE[1] - 0.1, TRANSFORMER_SIZE[1] + 0.15));
// Round it, as far as its safe zone goes (see SAFE_ZONES), old asphalt drifted over with sand, as the
// safe space's (a decal, under everything else: see tools/make-art.mjs)
export const STATION_SAFE_R = 8; // meters, round the crate
OBJECTS.unshift({ name: 'asphalt_station', x: EQUIPMENT.x, y: EQUIPMENT.y, flat: true });
// And just past its asphalt, a couple of cacti: a tall one with its arms up, behind the station on the
// left, a squat round one off to the right (meters off the crate, out past the asphalt's ragged rim);
// they stop the hero (the tall one shots too)
const CACTUS_SOLID = { x: EQUIPMENT.x - 6.5 * UNITS_PER_M, y: EQUIPMENT.y - 6.6 * UNITS_PER_M, r: 0.22 * UNITS_PER_M, cover: true, of: 'cactus' };
const CACTUS_SMALL_SOLID = { x: EQUIPMENT.x + 8.6 * UNITS_PER_M, y: EQUIPMENT.y - 3.2 * UNITS_PER_M, r: 0.28 * UNITS_PER_M, of: 'cactus_small' };
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
// Little volcanoes, only for the look of it: squat cones of dark rock, acid boiling in the crater on top
// (green or yellow), its reek pouring out of it, drifting low round its foot as a fog (see client.js).
// The kinds by sprite name: the acid's color, how wide its foot is (radius, meters), how high it stands
// (meters), the crater's radius (meters)
export const VOLCANO_KINDS = {
  volcano_green: { acid: 'green', r: 0.8, h: 0.9, crater: 0.15 },
  volcano_yellow: { acid: 'yellow', r: 0.9, h: 1.0, crater: 0.17 },
  volcano_small_green: { acid: 'green', r: 0.55, h: 0.55, crater: 0.11 },
  volcano_small_yellow: { acid: 'yellow', r: 0.6, h: 0.6, crater: 0.12 },
};
const VOLCANOES_EACH = 3; // (in each sector)
// Ravens, each on its own on the ground round the sectors (see client.js: they fly off as he comes): each
// { flock (which it's with), home (its point on the ball), dir (which way it faces) }
export const RAVENS = [];
const RAVEN_FLOCKS = 8; // (ravens in each sector, each on its own) // (meters from anything already there)
const STREWN_AWAY = [[STRUCTURES, 22], [WRECK, 30], [HUGE_THING, 12], [EQUIPMENT, 8], [OBJECTS.find((o) => o.name === 'pod'), 14]]; // (and from these, meters)
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
  // The volcanoes: VOLCANOES_EACH in each sector (their own draw: the rest stays where it was), clear of
  // everything; a solid circle round the foot (walked round, shot over)
  {
    let vseed = 31;
    const vrandom = () => ((vseed = (vseed * 16807) % 2147483647) - 1) / 2147483646;
    for (const cell of STREWN_CELLS)
      for (let n = 0, tries = 0; n < VOLCANOES_EACH && tries < 3000; tries++) {
        const at = chartPoint(CHART0, cellPoint(cell, 0.08 + 0.84 * vrandom(), 0.08 + 0.84 * vrandom()));
        const kinds = Object.keys(VOLCANO_KINDS), kind = kinds[Math.floor(vrandom() * kinds.length)], v = VOLCANO_KINDS[kind];
        if (taken.some((p) => Math.hypot(p.x - at.x, p.y - at.y) < STREWN_CLEAR + v.r * UNITS_PER_M)) continue;
        if (STREWN_AWAY.some(([p, m]) => Math.hypot(p.x - at.x, p.y - at.y) < m * UNITS_PER_M)) continue;
        const name = `volcano_${cell}_${n}`, solid = { ...at, r: v.r * 0.8 * UNITS_PER_M, of: name };
        OBJECTS.push({ name, sprite: kind, ...at, volcano: kind, solid });
        OBSTACLES.push(solid);
        taken.push(at);
        n++;
      }
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

// Round the escape pod and the backpack, as far as their safe zones go (see SAFE_ZONES), loose earth, as
// round the huge thing: dug up where the pod came down (one decal round them both, out from the pod, under
// everything else: see tools/make-art.mjs)
OBJECTS.unshift({ name: 'loose_earth_pod', x: POD.x, y: POD.y, flat: true });

// Safe zones round the escape pod and the backpack (overlapping: the way between them is safe too),
// and round the structures, the egg and the equipment: bugs only come for the hero when he's out of them
// all; they don't turn up in them (see client.js). { at (what it's round: anything kept on the chart with an x, y), r (world units)
// or rect (a rectangle instead: { dx, dy, w, h }, meters in at's model (turned as it is, yaw): its middle, its half width and depth),
// until (what ends it, if anything does: 'left', he's stepped out of them on the way to the safe space; 'egg', the egg burst; 'equipment', the fellow's crate picked up) }
export const POD_SAFE_R = 12, BACKPACK_SAFE_R = 11; // meters
export const SAFE_ZONES = [
  { at: OBJECTS.find((o) => o.name === 'pod'), r: POD_SAFE_R * UNITS_PER_M, until: 'left' },
  { at: OBJECTS.find((o) => o.name === 'backpack'), r: BACKPACK_SAFE_R * UNITS_PER_M, until: 'left' },
  { at: OBJECTS.find((o) => o.name === 'garage'), rect: SAFE_RECT }, // (the safe space's: a rectangle square to its garage, its fence along its edge)
  { at: OBJECTS.find((o) => o.name === 'egg'), r: EGG_SAFE_R * UNITS_PER_M, until: 'egg' },
  { at: EQUIPMENT, r: STATION_SAFE_R * UNITS_PER_M, until: 'equipment' }, // (the research station's, its asphalt as far)
  { at: WRECK, r: 26 * UNITS_PER_M }, // (big: the whole wreck and well round it)
];

// Their places on the planet: each object at a point of the ball (home); each solid circle at an
// offset from its object (of), so it stays with its sprite
for (const o of OBJECTS) o.home = toSphere(CHART0, o.x - SPAWN.x, o.y - SPAWN.y, PLANET_R);
for (const ob of OBSTACLES) {
  const parent = OBJECTS.find((o) => (o.id ?? o.name) === ob.of);
  if (ob.poly) { // (a polygon: its corners each off its object; its middle and how far out it reaches, to pass it by quickly)
    ob.offs = ob.poly.map(([x, y]) => [x - parent.x, y - parent.y]);
    shapeOf(ob);
  }
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
  for (const o of [...OBJECTS, STRUCTURES, HUGE_THING, EQUIPMENT, WRECK]) Object.assign(o, chartPoint(chart, o.home));
  for (const ob of OBSTACLES) {
    const parent = OBJECTS.find((o) => (o.id ?? o.name) === ob.of);
    if (!parent) continue; // added later, on no object (a crater's): the client carries it
    if (ob.offs) { ob.poly = ob.offs.map(([x, y]) => [parent.x + x, parent.y + y]); shapeOf(ob); continue; }
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
    if (o.poly) { // a polygon: where the ray goes into it (clipped against each of its sides)
      let t0 = 0, t1 = best, turn = 0;
      for (let i = 0; i < o.poly.length && t0 <= t1; i++) {
        const [ax, ay] = o.poly[i], [bx, by] = o.poly[(i + 1) % o.poly.length];
        if (!turn) turn = Math.sign((bx - ax) * (o.y - ay) - (by - ay) * (o.x - ax)) || 1; // (which way round it goes)
        const nx = turn * (by - ay), ny = turn * -(bx - ax); // (out of its side)
        const den = nx * dx + ny * dy, num = nx * (ax - x) + ny * (ay - y);
        if (den === 0) { if (num < 0) t0 = Infinity; continue; }
        const t = num / den;
        if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
      }
      if (t0 <= t1 && t0 > 0 && t0 < best) best = t0;
      continue;
    }
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
  // In steps no longer than most of r: one long step (a slow frame, a roll) would land well inside a thin
  // thing (a fence panel) and be pushed out of it on its far side, through it
  const steps = Math.max(1, Math.ceil((Math.hypot(dx, dy) * speed * dt) / (0.8 * r)));
  for (let i = 0; i < steps; i++) step(p, dx, dy, dt / steps, speed, r);
}
function step(p, dx, dy, dt, speed, r) {
  let nx = p.x + dx * speed * dt, ny = p.y + dy * speed * dt;
  for (let pass = 0; pass < 3; pass++) // (again: pushed out of one into the next, the bed's row, a corner between two)
    for (const o of OBSTACLES) {
      if (o.poly) { // a polygon: out of it along its nearest side, to r off it (sliding along it)
        if (Math.abs(nx - o.x) > o.reach + r || Math.abs(ny - o.y) > o.reach + r) continue;
        const q = nearestOn(o, nx, ny), ox = nx - q.x, oy = ny - q.y, d = Math.hypot(ox, oy);
        if (!q.inside && d >= r) continue;
        if (d < 1e-6) continue;
        const k = q.inside ? -1 : 1; // (inside: back out the way it came in)
        nx = q.x + ((k * ox) / d) * r;
        ny = q.y + ((k * oy) / d) * r;
        continue;
      }
      const ox = nx - o.x, oy = ny - o.y, d = Math.hypot(ox, oy), min = o.r + r;
      if (d >= min) continue;
      if (d < 1e-6) return; // right on its center: nowhere to slide
      nx = o.x + (ox / d) * min;
      ny = o.y + (oy / d) * min;
    }
  p.x = nx;
  p.y = ny;
}

// A polygon obstacle's middle and how far its corners reach from it (to pass it by quickly)
function shapeOf(ob) {
  ob.x = ob.poly.reduce((n, [x]) => n + x, 0) / ob.poly.length;
  ob.y = ob.poly.reduce((n, [, y]) => n + y, 0) / ob.poly.length;
  ob.reach = Math.max(...ob.poly.map(([x, y]) => Math.hypot(x - ob.x, y - ob.y)));
}
// The nearest point to (x, y) on a polygon obstacle's edge, and whether (x, y) is inside it
export function nearestOn(ob, x, y) {
  let best = null, inside = true;
  const P = ob.poly, n = P.length;
  let turn = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = P[i], [bx, by] = P[(i + 1) % n], ex = bx - ax, ey = by - ay;
    const side = ex * (y - ay) - ey * (x - ax);
    if (turn === 0) turn = Math.sign(side) || 0; else if (side && Math.sign(side) !== turn) inside = false;
    const k = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey))), qx = ax + ex * k, qy = ay + ey * k, d = Math.hypot(x - qx, y - qy);
    if (!best || d < best.d) best = { x: qx, y: qy, d };
  }
  return { x: best.x, y: best.y, inside };
}
// How far (x, y) is from a solid thing's edge (circle or polygon; below 0: inside it)
export function gapTo(ob, x, y) {
  if (!ob.poly) return Math.hypot(x - ob.x, y - ob.y) - ob.r;
  const q = nearestOn(ob, x, y), d = Math.hypot(x - q.x, y - q.y);
  return q.inside ? -d : d;
}
// (x, y), r round it, is in some solid thing
export const solidAt = (x, y, r = 0) => OBSTACLES.some((o) => (o.poly ? Math.abs(x - o.x) < o.reach + r && Math.abs(y - o.y) < o.reach + r : true) && gapTo(o, x, y) < r);

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
