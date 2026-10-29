// Generates the game art (top-down view, camera 70 degrees) into public/assets/ plus sprites.json.
//   npm run art              everything (~3 min)
//   (the heroes' frames are drawn on all the cores: a worker thread each, WORKERS=n to say how many)
//   ONLY=pod npm run art     just some parts (hero, hero_pack, pod, backpack, bed, stand, bedding, ...); the rest is kept as is
// Real art can replace the PNGs later as long as it keeps the layout from sprites.json.

import fs from 'node:fs';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ramp, rng, Sheet } from './lib/image.mjs';
import { SHADOW_LIGHT, bodySdf, box, capsule, cone, ellipsoid, renderBody, renderShadow } from './lib/sdf-body.mjs';
import {
  AIM_IN_TIME, AIM_OFFSETS, AIM_OUT_TIME, BACKPACK, BUG_BITE_SNAP, BUG_BITE_TIME, RELOAD_TIME, CROUCH_CYCLE, BED, BEDDING, BEDDING_FIRES, BLANKET, FIRE_ROUNDS, GAIT_CYCLE, GLADE_R, MATTRESS, PICK_GRAB,
  CRATER_R, PICK_TIME, PILLOW, POD, POD_FIRES, POD_SCALE, ROLL_TIME, STRIKE_SLANT, STRIKE_WAY, SLASH_TIME, STAND, TURRET_FRAMES, GARAGE, GARAGE_SIZE, GARAGE_LEAF,
} from '../shared/world.js';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets');
const save = (sheet, name) => sheet.save(path.join(OUT, name));

// Camera elevation above the horizon (keep in sync with public/render/view.js); ELEV_DEG env overrides it
const ELEV = ((Number(process.env.ELEV_DEG) || 70) * Math.PI) / 180;

// Camera zoom of all art (1 = 88 screen px per meter). Keep public/render/view.js ZOOM = 4 * ART_ZOOM.
const ART_ZOOM = 0.75;

// ---------- Hero: a realistic muscular body, rendered from a smooth 3D model into pixel art ----------

const HERO = 78, HERO_ANCHOR = [39, 57];
const DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
const WALK = 20; // run cycle frames (many in-betweens keep a fast run smooth)
const PX_PER_M = 44 * ART_ZOOM;
const SKIN = ramp('#1a0e0b', '#341c15', '#53301f', '#73452e', '#935e41', '#b27a57', '#cc9873', '#e4b894');
const CLOTH = ramp('#060608', '#0c0c10', '#131318', '#1b1b22', '#25252e', '#30303b', '#3d3d4a', '#4c4c5c'); // black leather boots
const GOLD = ramp('#2a1a05', '#4a2d0a', '#6d4410', '#915c16', '#b2761e', '#cf9228', '#e6ae39', '#f6cc5a'); // buckle, epaulettes: a warm gold
const BELT = ramp('#120a06', '#21130b', '#331d10', '#462915', '#5a361c', '#6f4424', '#85532e', '#9c643a'); // brown leather belt
const SUIT = ramp('#0a0a07', '#13130d', '#1d1c13', '#28271a', '#343222', '#413e2a', '#4f4b33', '#5e593d'); // dark khaki coverall fabric

const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const lerp = (a, b, t) => add(a, mul(add(b, mul(a, -1)), t));
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Anatomy of a ~1.85 m muscular man in a khaki coverall, in meters. Each group blends
// smoothly inside; groups blend into each other only slightly, so hanging arms don't melt into
// the torso.
// ---------- Run cycle: keyframed like hand animation (contact, down, push-off, flight, kick, reach) ----------

const DEG = Math.PI / 180;
// Stocky proportions: limb lengths (meters); the hips sit as high as the legs are long
const THIGH = 0.42, SHIN = 0.395, UPPER_ARM = 0.27, FOREARM = 0.24;
const HIP_Z = THIGH + SHIN + 0.06; // ankle height above the ground
const DROP = HIP_Z - 0.93; // the upper body was modeled with the hips at 0.93
// Per leg, t in [0, 1): [t, hip flexion (forward +), knee flexion, ankle (toes down +)], degrees.
// Amplitudes are kept smaller than real life: seen from above, any horizontal swing of a limb
// shows at full length while its vertical extent is foreshortened, so real angles look too long.
const RUN_LEG = [
  [0.0, 16, 12, 0], // contact: foot lands ahead
  [0.1, 11, 28, 4], // down: knee absorbs the landing
  [0.22, 0, 30, 10], // mid-stance: body at its lowest
  [0.35, -13, 14, 32], // push-off: toes drive the body forward hard
  [0.45, -11, 60, 24], // flight: foot leaves the ground, the leg tucks up
  [0.58, 0, 80, 12], // heel kicks up high behind
  [0.72, 28, 78, 4], // passing: knee drives high and forward
  [0.86, 27, 44, 0], // reach: knee still bent in the air, opens to land
];

// Backpedaling, same columns, as people walk backwards: the leg reaches back nearly straight and
// lands toes first; the body moves back over it; the foot leaves the ground in front and is carried
// back under the body, lifted by the hip more than by the knee. The knee bends little: folding it
// throws the foot up behind, and the feet would trail behind the hips the whole cycle.
const BACK_LEG = [
  [0.0, -14, 4, 18], // reach back: toes touch down, knee nearly straight
  [0.15, -6, 6, 6], // the heel lowers
  [0.32, 6, 8, 0], // the body moves back over the foot
  [0.5, 16, 8, -6], // the foot is in front now, toes about to lift
  [0.62, 24, 34, 0], // lift-off: the thigh comes up, the knee bends a little
  [0.74, 16, 44, 6], // the foot passes under the body, raised
  [0.87, -4, 22, 14], // the leg straightens as it reaches back
];

// The knife slash (body()'s slash, 0..1), left arm: [t, elbow - shoulder (xyz), wrist - elbow (xyz)],
// in meters of the standing model (+x out on this side, +y forward). A backhand cut from the right
// down to the left: the knife drawn across the body up by the right shoulder, cut down and out
// diagonally in front, ending low on the left
const SLASH_ARM = [
  [0.0, 0.05, 0.03, -0.265, -0.01, 0.1, -0.215], // rest: the knife half lowered
  [0.16, 0.02, 0.25, -0.04, -0.08, 0.16, 0.1], // swinging the arm out in front first, clear of the chest and the face
  [0.32, -0.12, 0.19, 0.12, 0.0, -0.13, 0.13], // wind up: elbow raised, the arm folded tight, the fist by the right of the head
  [0.45, -0.04, 0.24, 0.0, -0.12, 0.12, 0.1], // unfolding as it comes down
  [0.58, 0.03, 0.24, -0.1, 0.07, 0.22, -0.08], // the cut: the arm straight, down and out in front
  [0.78, 0.12, 0.12, -0.22, 0.04, 0.16, -0.08], // follow through, low on the left, the elbow giving a little
];
// The whole body goes into it: [t, twist (the shoulders; the hips follow by half), forward lean,
// side lean (+ to the left)]. Wound up to the right, the weight over the right foot; then leaning
// into the cut, forward and over to the left, the shoulders swinging round past square
// The submachine gun, right arm: [elbow - shoulder (xyz), wrist - elbow (xyz)], meters of the
// standing model (-x out on this side): up by the shoulder at rest, straight out in front firing, the
// wrist thrown up a little by each round's kick
const GUN_REST = [-0.045, 0.06, -0.26, 0.03, 0.13, 0.19];
const GUN_AIM = [0.02, 0.26, -0.04, 0.02, 0.24, 0.0];
const GUN_KICK = [0.02, 0.24, -0.03, 0.02, 0.22, 0.06];
// Reloading, the gun arm brings it in, low in front of the chest, its barrel across to the left
const GUN_RELOAD = [0.05, 0.14, -0.22, 0.1, 0.17, 0.08];
// Reloading (0..1 through it): the knife hand goes to the magazine under the gun, pulls it, tosses it
// out to the side, takes a full one off the belt, slaps it in and goes back; [t, where the hand is]
// (in the standing model, meters; 'well': under the gun, 'rest': where it is otherwise)
const RELOAD_HAND = [[0, 'rest'], [0.15, 'well'], [0.3, 'pulled'], [0.42, [0.33, 0.26, 0.92]], [0.55, [0.17, 0.12, 0.98]], [0.7, 'well'], [0.8, 'pushed'], [1, 'rest']];
// The magazine through it: in the gun, in the hand (pulled, or the full one) or gone
const reloadMag = (r) => ({ in: r < 0.3 || r >= 0.72, hand: (r >= 0.3 && r < 0.42) || (r >= 0.55 && r < 0.72) });
// The gun arm, how far in to reload
const reloadGun = (r) => smoothstep(0, 0.12, r) * (1 - smoothstep(0.86, 1, r));

// Firing turns the body behind the gun: [twist (- brings the right shoulder forward), forward lean],
// aimed and at a round's kick
const AIM_BODY = [-0.18, 0.04], KICK_BODY = [-0.16, 0.01];
const SLASH_BODY = [[0.0, 0, 0, 0], [0.16, 0.2, 0.02, -0.04], [0.32, 0.42, 0.04, -0.08], [0.58, -0.05, 0.3, 0.07], [0.78, -0.42, 0.24, 0.12]];
// How much of the slash the knife is in (to turn its blade), 0 at rest
const slashSwing = (t) => smoothstep(0, 0.25, t) * (1 - smoothstep(0.8, 1, t));

// Squatting leg with the hip `height` above the ankle and the foot `fwd` in front of the hip: returns
// [thigh, shin] angles (forward from straight down, radians) with THIGH and SHIN fitting both
function squat(height, fwd) {
  let lo = 0, hi = 1.6;
  for (let i = 0; i < 30; i++) { // the thigh tips forward until the hip has come down far enough
    const a = (lo + hi) / 2, shin = Math.asin(Math.max(-1, Math.min(1, (THIGH * Math.sin(a) - fwd) / SHIN)));
    if (THIGH * Math.cos(a) + SHIN * Math.cos(shin) > height) lo = a; else hi = a;
  }
  return [lo, -Math.asin(Math.max(-1, Math.min(1, (THIGH * Math.sin(lo) - fwd) / SHIN)))];
}

// The elbow of an arm from shoulder sh to wrist wr (within reach), bent out to the side and back
function elbow(sh, wr, side) {
  const d = add(wr, mul(sh, -1)), l = Math.min(Math.hypot(...d), UPPER_ARM + FOREARM - 1e-4), u = norm(d);
  const along = (UPPER_ARM ** 2 - FOREARM ** 2 + l * l) / (2 * l), out = Math.sqrt(Math.max(0, UPPER_ARM ** 2 - along ** 2));
  const pole = norm([side, -0.6, 0.4]), perp = norm(add(pole, mul(u, -(pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2]))));
  return add(sh, add(mul(u, along), mul(perp, out)));
}

// Periodic Catmull-Rom interpolation of keyframes [t, ...values] at time t in [0, 1)
function curve(keys, t) {
  t = ((t % 1) + 1) % 1;
  const n = keys.length;
  let i = n - 1;
  while (i > 0 && keys[i][0] > t) i--;
  const k0 = keys[(i - 1 + n) % n], k1 = keys[i], k2 = keys[(i + 1) % n], k3 = keys[(i + 2) % n];
  const t1 = k1[0], t2 = k2[0] + (i + 1 >= n ? 1 : 0);
  const u = (t - t1 + (t < t1 ? 1 : 0)) / (t2 - t1);
  return k1.slice(1).map((_, j) => {
    const p0 = k0[j + 1], p1 = k1[j + 1], p2 = k2[j + 1], p3 = k3[j + 1];
    return 0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  });
}

// breath in [0, 1]: 0 = exhaled, 1 = full inhale (chest expands, shoulders and head rise).
// Moving is a light run: the upper body leans forward, bounces with every step, shifts its weight
// over the stance leg and twists the shoulders against the hips; the arms pump with bent elbows.
// yaw: facing angle (0 = towards the camera). Running away from the camera, limbs that swing back
// point straight at the camera and look like long sticks from above, so they are toned down there.
// gait (moving): 'run' forwards, 'back' backpedaling, 'left' / 'right' sidestepping towards the
// figure's left (+x) / right, legs stepping out sideways without crossing; those three are lighter,
// more upright than the run.
// pick (standing, 0..1): how far down the hero is to pick something up: the hips sink and go back,
// the knees bend, the back bends forward; the right hand reaches for the ground in front, the left
// one goes to the knee (armed, the hands keep the weapons).
// slash (armed; 0..1 through it, or null): a knife slash in front (see SLASH_ARM), standing or on the
// move: the legs keep to their gait.
// Returns the dressed body (sdf, material) and its bare shape, which casts the shadow. packed: with the
// backpack, the pistol and the knife (see gear()).
// crouch (0..1): crouched, standing or sneaking in the gait: the hips low and back, knees bent, the
// back leaning forward; unarmed and still, the hands on the knees.
// fire (armed, or null): the gun brought up and firing, standing or on the move: { aim (0..1, how far
// up), kick (0..1, a round's recoil), off (radians: aimed this far off straight ahead, a positive one
// to the figure's right, -x, as screen angles grow; the arm and the shoulders turn to it) }.
// reload (armed: 0..1 through it, or null): the gun's magazine changed (see RELOAD_HAND).
function body(phase, moving, breath = 0, yaw = 0, packed = false, gait = 'run', pick = 0, slash = null, crouch = 0, fire = null, reload = null) {
  const run = !moving || gait === 'run', lat = moving ? { left: 1, right: -1 }[gait] ?? 0 : 0;
  const runK = run ? 1 : 0.35; // how much of the run's whole-body motion
  const away = Math.max(0, -Math.cos(yaw)); // 1 = running straight away from the camera
  const torso = [], head = [], limbs = [], hands = [], feet = [];
  const t = phase / (Math.PI * 2); // run cycle time in [0, 1): left leg contact at 0, right at 0.5
  // Standing is a heroic pose: chest out, shoulders back, chin up, feet apart, hands on the hips
  const hero = moving ? 0 : 1 - Math.max(pick, crouch);
  const b = moving ? 0.15 + 0.12 * Math.cos(4 * Math.PI * (t - 0.45)) : breath; // breathe with the steps (subtle)
  // Shoulders rise and roll back on the inhale (the roll back is what reads from above)
  const lift = 0.06 * b, back = moving ? 0 : -0.022 * b - 0.018 * hero; // no roll-back while running: it bulges the back

  // Whole-body motion of the run
  // Two bounces per cycle: lowest at mid-stance (t = 0.22, 0.72), highest in flight (0.45, 0.95)
  const bounce = Math.cos(4 * Math.PI * (t - 0.45));
  const armPhase = Math.cos(2 * Math.PI * (t - 0.88)) * (run ? 1 : 0.4); // 1 when the right arm is furthest forward
  // Strong forward lean, a bit deeper on landing; a quarter less when running away from the
  // camera, where a leaning back faces the camera and can read as a hump
  const [cut, cutLean, cutSide] = slash !== null ? curve(SLASH_BODY, slash) : [0, 0, 0]; // a knife slash's body motion
  const [aimTwist, aimLean] = fire ? [0, 1].map((j) => fire.aim * (AIM_BODY[j] + (KICK_BODY[j] - AIM_BODY[j]) * fire.kick + (j ? 0 : 0.5 * fire.off))) : [0, 0]; // firing's
  const lean = (moving ? (run ? (0.33 - 0.05 * bounce) * (1 - 0.25 * away) : 0.1) * (1 - 0.5 * crouch) : 0.72 * pick) + cutLean + aimLean + 0.38 * crouch;
  // Seen from behind, back motion is mostly side to side, so it's amplified for those views
  const backView = 1 + away;
  // Shoulders follow the arms; slashing, the cut turns them (on the move, over a little of the run's swing)
  const twist = (moving ? -0.12 * armPhase * (1 + 0.6 * away) * (slash !== null || fire ? 0.3 : 1) : 0) + cut + aimTwist;
  // Bounding from foot to foot: a ballistic arc per step, lowest at mid-stance (t = 0.17, 0.67),
  // highest in flight. Big on purpose: seen from above, height is foreshortened a lot.
  const stepT = (((t - 0.17) * 2) % 1 + 1) % 1;
  // (higher for views from behind, where height reads worse)
  const bob = (moving ? (0.18 * Math.sin(Math.PI * stepT) ** 1.3 - 0.04) * runK * (1 + 0.6 * away) * (1 - 0.7 * crouch) : -0.38 * pick) - 0.26 * crouch;
  const sit = -0.14 * pick - 0.1 * crouch; // the hips go back as they sink
  const shift = moving ? 0.005 * Math.cos(2 * Math.PI * (t - 0.22)) : 0; // weight over the stance leg (small, or it reads as limping)
  const pelvis = -(twist - cut) * 0.5 + cut * 0.5; // hips turn against the shoulders (in a slash, with them)
  // Lean over the stance leg; sidestepping, also a little into the step
  const sideBend = (moving ? 0.03 * backView * Math.cos(2 * Math.PI * (t - 0.22)) + 0.05 * lat : 0) + cutSide;
  // Upper body follows a flexible spine: twist, forward lean and side bend all grow with height
  // above the hips, and the chest leans more than the lower back, so the back is curved, not a plank
  const U = ([x, y, z]) => {
    const h = z - 0.93, s = Math.max(0, Math.min(1, h / 0.6));
    const tw = twist * Math.max(0, Math.min(1, (z - 0.95) / 0.45));
    const xt = x * Math.cos(tw) - y * Math.sin(tw), yt = x * Math.sin(tw) + y * Math.cos(tw);
    const fwd = lean * (0.7 + 0.3 * s), lat = sideBend * s; // mostly even lean: a hunched curve bulges the back towards the camera
    return [xt + shift + h * Math.sin(lat), yt + h * Math.sin(fwd) + sit, 0.93 + h * Math.cos(fwd) * Math.cos(lat) + bob + DROP];
  };
  const E = (c, r) => ellipsoid(U(c), r);
  const C = (a, c, r0, r1) => capsule(U(a), U(c), r0, r1);

  // Torso: rib cage, pectorals, lats, abdomen with abs, pelvis, glutes, trapezius, deltoids.
  // While running the back muscles are flatter: leaning forward, the back faces the camera and
  // full-size muscles merge into one puffed-up mass.
  const flat = moving ? 0.6 : 1;
  torso.push(
    E([0, 0.012 * hero, 1.31 + 0.006 * b], [0.17 + 0.012 * b, (moving ? 0.1 : 0.115) + 0.012 * b, 0.19 + 0.008 * b]), // rib cage
    E([-0.075, 0.075 + 0.01 * b + 0.016 * hero, 1.36 + 0.01 * b], [0.085, 0.045, 0.065]), // pectorals
    E([0.075, 0.075 + 0.01 * b + 0.016 * hero, 1.36 + 0.01 * b], [0.085, 0.045, 0.065]),
    E([-0.12, -0.025 * flat, 1.27], [0.07, 0.085 - 0.012 * (1 - flat), 0.14]), // lats
    E([0.12, -0.025 * flat, 1.27], [0.07, 0.085 - 0.012 * (1 - flat), 0.14]),
    E([0, -0.06 * flat, 1.33], [0.1, 0.05 * flat, 0.13]), // upper back
    E([0, 0.01, 1.12], [0.125, 0.095, 0.13]), // abdomen
    E([0, 0.065, 1.12], [0.065, 0.035, 0.1]), // abs
    E([0, 0, 0.96], [0.122, 0.09, 0.095]), // pelvis (narrow, athletic)
    E([-0.052, -0.045, 0.93], [0.058, 0.05, 0.075]), // glutes
    E([0.052, -0.045, 0.93], [0.058, 0.05, 0.075]),
    E([0, -0.025 + back, 1.49 + lift], [0.16, 0.075, 0.055]), // trapezius

    E([0, -0.055, 1.1], [0.11, 0.06, 0.13]), // lower back: one smooth form (separate ridges read as a slit in pixels)
  );
  const neck = C([0, 0, 1.47 + lift * 0.6], [0, 0.01 + back * 0.5, 1.58 + lift * 0.5], 0.058, 0.05);
  torso.push(neck);
  for (const sx of [-1, 1]) {
    const armFwd = moving ? (sx < 0 ? armPhase : -armPhase) : 0; // deltoids ride with the arms
    const rise = 0.018 * armFwd * backView;
    torso.push(E([sx * (0.215 + 0.006 * b), back + 0.02 * armFwd, 1.43 + lift + rise], [0.07, 0.075, 0.07]));
    // Shoulder blades glide with the arm: apart and up when it swings forward, together when back
    torso.push(E([sx * (0.075 + 0.025 * armFwd), -0.09 * flat + back, 1.37 + lift * 0.7 + rise * 0.8], [0.065, 0.03 * flat, 0.075]));
  }

  // Head: skull, jaw, brow, nose, ears (rises with the shoulders; while running it stays more
  // upright than the torso, looking ahead)
  const up = (v) => {
    // The head stays steady while running: it turns back against the shoulders and absorbs half the
    // bounce. Seen from behind that reads as the head moving on its own, so there it follows the body.
    const steady = 1 - away;
    const c = Math.cos(-twist * 0.8 * steady), sn = Math.sin(-twist * 0.8 * steady);
    const [x, y] = [v[0] * c - v[1] * sn, v[0] * sn + v[1] * c];
    // (picking something up, the chin goes down to look at it)
    return U([x, y + back * 0.5 - 0.01 * hero - 0.04 * lean - 0.05 * pick, v[2] + lift * 0.5 + 0.01 * hero - bob * 0.5 * steady * (moving ? 1 : 0) - 0.06 * pick]);
  };
  head.push(
    ellipsoid(up([0, 0.005, 1.665]), [0.075, 0.09, 0.098]), // skull
    ellipsoid(up([0, 0.03, 1.6]), [0.065, 0.07, 0.05]), // jaw
    ellipsoid(up([0, 0.068, 1.67]), [0.06, 0.025, 0.016]), // brow ridge
    capsule(up([0, 0.085, 1.65]), up([0, 0.098, 1.62]), 0.012, 0.016), // nose
    ellipsoid(up([-0.075, 0, 1.655]), [0.012, 0.022, 0.028]), // ears
    ellipsoid(up([0.075, 0, 1.655]), [0.012, 0.022, 0.028]),
  );

  // Legs follow the keyframed cycle (the right leg half a cycle later). Sidestepping, the run's hip
  // swing turns sideways (ab: the leg swung out towards +x), the knee lifts the foot a little.
  const knees = {}; // side -> knee, where the left hand rests when picking something up
  for (const side of [-1, 1]) {
    let [hipDeg, kneeDeg, ankleDeg] = curve(gait === 'back' ? BACK_LEG : RUN_LEG, t + (side > 0 ? 0 : 0.5));
    let ab = 0;
    if (lat) {
      ab = hipDeg * 0.45 * lat * DEG; // small: the legs stay apart
      [hipDeg, kneeDeg, ankleDeg] = [6 + 0.25 * kneeDeg, kneeDeg * 0.6, ankleDeg * 0.3];
    }
    // Standing weight is on the left leg (straight, a bit back); the right one is relaxed:
    // forward, knee slightly bent, toes turned out more
    const relaxed = !moving && !pick && !crouch && side < 0;
    const back = hipDeg < 0 ? 1 - 0.65 * away : 1; // leg behind the body: smaller extension when facing away
    const kick = 1 - 0.1 * away; // the heel still kicks up: the folding leg is what reads as bounding
    let a = moving ? hipDeg * 0.8 * back * DEG : relaxed ? 0.12 : -0.04;
    let a2 = a - (moving ? kneeDeg * 0.85 * kick * DEG : relaxed ? 0.2 : 0.02);
    if (pick) [a, a2] = squat(THIGH + SHIN - 0.38 * pick, 0.03 + 0.14 * pick); // the feet stay put
    if (crouch) { // knees bent as in a squat; sneaking, the gait's swing (smaller) on top of it
      const [sa, sa2] = squat(THIGH + SHIN - 0.26 * crouch, 0.03 + 0.1 * crouch);
      [a, a2] = moving ? [sa + 0.6 * a, sa2 + 0.6 * a2] : [sa, sa2];
    }
    const drop = moving ? -side * 0.005 * Math.cos(2 * Math.PI * (t - 0.22)) : side * 0.008; // swing side hip sags a little
    const hip = [side * 0.082 * Math.cos(pelvis) + shift, side * 0.082 * Math.sin(pelvis) + sit, HIP_Z + bob + drop];
    const spread = moving && !lat ? 0 : 0.07; // feet shoulder-width apart
    // Seen from behind, the legs' reach towards/away from the camera is what makes them look long:
    // shorten just that (hip height and foot placement stay the same)
    const reach = moving ? 1 - 0.35 * away : 1;
    const ca = Math.cos(ab), sa = Math.sin(ab);
    const knee = add(hip, [side * spread * 0.5 + sa * THIGH, Math.sin(a) * ca * THIGH * reach, -Math.cos(a) * ca * THIGH]);
    const ankle = add(knee, [side * spread * 0.5 + sa * SHIN, Math.sin(a2) * ca * SHIN * reach, -Math.cos(a2) * ca * SHIN]);
    knees[side] = knee;
    const fwd = [0, Math.cos(a), Math.sin(a)]; // thigh front direction
    const toe = moving ? ankleDeg * DEG - a2 * 0.5 : 0; // foot pitch relative to the ground: toes down on push-off
    const toeOut = (relaxed ? 0.06 : 0.025) * hero;
    const foot = capsule(add(ankle, [0, -0.03, -0.045]), add(ankle, [side * toeOut, 0.14 * Math.cos(toe) * reach, -0.06 - 0.14 * Math.sin(toe)]), 0.032, 0.026);
    feet.push(foot, capsule(ankle, lerp(ankle, knee, 0.3), 0.046, 0.05)); // with a boot shaft, for the suit
    limbs.push({ k: 0.035, prims: [
      capsule(hip, knee, 0.085, 0.052), // thigh
      ellipsoid(add(lerp(hip, knee, 0.4), mul(fwd, 0.03)), [0.075, 0.068, 0.14]), // quadriceps
      ellipsoid(add(lerp(hip, knee, 0.45), [side * 0.015, -0.02, 0]), [0.055, 0.055, 0.12]), // hamstring
      capsule(knee, ankle, 0.047, 0.032), // shin
      ellipsoid(add(lerp(knee, ankle, 0.3), [0, -0.03, 0]), [0.052, 0.058, 0.095]), // calf
      foot,
    ] });
  }

  // Arms. Standing: hands on the hips, elbows out. Running: elbows bent, arms pump opposite to the legs.
  // Packed (armed): the right hand holds the pistol up by the shoulder, the left one the knife
  // half lowered; running, the gun hand stays up and the knife arm swings a little.
  // (Seen from the camera, +x is the figure's left: the world's y points south, towards the camera.)
  const fists = {}; // side -> [elbow, fist center], where the weapons go
  let gunWr = null; // (the gun hand's wrist, standing model: reloading, the other hand goes under it)
  for (const side of [-1, 1]) {
    const armFwd = moving ? (side < 0 ? armPhase : -armPhase) : 0; // 1 = this arm furthest forward
    const shL = [side * (0.215 + 0.006 * b), back + 0.02 * armFwd, 1.42 + lift + 0.018 * armFwd * backView]; // shoulder rides with the arm
    let elL, wrL;
    if (packed) {
      const gun = side < 0, swing = armFwd * (gun ? 0.3 : 0.8);
      elL = add(shL, gun ? [side * 0.045, 0.06 + 0.1 * swing, -0.26] : [side * 0.05, 0.03 + 0.1 * swing, -0.265]);
      wrL = add(elL, gun ? [-side * 0.03, 0.13 + 0.2 * swing, 0.19] : [-side * 0.01, 0.1 + 0.2 * swing, -0.215]);
      if (gun && fire) { // the gun arm comes up and fires (the keys are for this, the right, side), turned to the aim
        const k = lerp(lerp(GUN_REST, GUN_AIM, fire.aim), GUN_KICK, fire.kick * fire.aim);
        const c = Math.cos(fire.off * fire.aim), sn = Math.sin(fire.off * fire.aim);
        const turn = ([x, y, z]) => [x * c - y * sn, x * sn + y * c, z];
        elL = add(shL, turn(k.slice(0, 3)));
        wrL = add(elL, turn(k.slice(3)));
      }
      if (!gun && slash !== null) { // the knife arm cuts (the keys are for this, the left, side)
        const k = curve(SLASH_ARM, slash);
        elL = add(shL, k.slice(0, 3));
        wrL = add(elL, k.slice(3));
      }
      if (reload !== null && gun) { // the gun brought in to reload
        const k = lerp(GUN_REST, GUN_RELOAD, reloadGun(reload));
        elL = add(shL, k.slice(0, 3));
        wrL = add(elL, k.slice(3));
      }
      if (gun) gunWr = wrL;
      if (reload !== null && !gun) { // the knife hand changing the magazine: from key to key
        const well = add(gunWr, [0.03, 0.05, -0.17]);
        const spot = (k) => (k === 'rest' ? wrL : k === 'well' ? well : k === 'pulled' ? add(well, [0.01, 0, -0.05]) : k === 'pushed' ? add(well, [0, 0, 0.03]) : k);
        const i = RELOAD_HAND.findIndex(([t], j) => reload < (RELOAD_HAND[j + 1]?.[0] ?? 2));
        const [t0, a] = RELOAD_HAND[i], [t1, b] = RELOAD_HAND[Math.min(i + 1, RELOAD_HAND.length - 1)];
        wrL = lerp(spot(a), spot(b), smoothstep(0, 1, t1 > t0 ? (reload - t0) / (t1 - t0) : 0));
        elL = elbow(shL, wrL, side);
      }
    } else if (moving) {
      // Arms trail the opposite leg slightly; the elbow closes on the forward swing
      let swing = (side < 0 ? armPhase : -armPhase) * 0.3; // upper arm angle, forward is positive
      if (swing < 0) swing *= 1 - 0.6 * away; // elbows driving back would poke at the camera
      const fore = swing + 1.25 + 0.25 * Math.max(0, swing / 0.3); // forearm angle: a strong, bent-elbow pump
      elL = add(shL, [side * 0.03, Math.sin(swing) * UPPER_ARM, -Math.cos(swing) * UPPER_ARM]);
      wrL = add(elL, [-side * 0.04, Math.sin(fore) * FOREARM, -Math.cos(fore) * FOREARM]);
    } else {
      elL = [side * 0.36, -0.06 + back, 1.16 + lift * 0.6];
      wrL = [side * 0.165, 0.025, 1.02 + lift * 0.2];
    }
    const sh = U(shL);
    let el = U(elL), wr = U(wrL);
    const reachDown = pick || (moving ? 0 : crouch);
    if (reachDown && !packed) { // from the hands on the hips: picking up, the right one to the ground in front and the left to its knee; crouched, both to the knees
      const to = side < 0 && pick ? [-0.1, 0.36, 0.07] : add(knees[side], [0, 0.03, 0.07]);
      const d = add(lerp(wr, to, reachDown), mul(sh, -1)); // (as far as the arm reaches)
      wr = add(sh, mul(norm(d), Math.min(Math.hypot(...d), UPPER_ARM + FOREARM)));
      el = elbow(sh, wr, side);
    }
    const fist = add(wr, mul(add(wr, mul(el, -1)), 0.15));
    fists[side] = [el, fist];
    const hand = moving || packed || pick || crouch
      ? ellipsoid(fist, [0.032, 0.035, 0.035]) // loose fist
      : ellipsoid(add(wr, [-side * 0.015, 0.015, -0.025]), [0.025, 0.05, 0.035]); // hand resting on the hip
    hands.push(hand);
    limbs.push({ k: 0.03, prims: [
      capsule(sh, el, 0.052, 0.038), // upper arm
      ellipsoid(add(lerp(sh, el, 0.45), [0, 0.03, 0]), [0.042, 0.042, 0.075]), // biceps
      ellipsoid(add(lerp(sh, el, 0.4), [side * 0.01, -0.03, 0]), [0.042, 0.042, 0.085]), // triceps
      capsule(el, wr, 0.04, 0.026), // forearm
      ellipsoid(add(lerp(el, wr, 0.25), [side * 0.008, 0.01, 0]), [0.04, 0.038, 0.07]), // forearm muscles
      hand,
    ] });
  }

  return dress({
    torso, head, neck, limbs, hands, feet,
    collar: E([0, 0.005, 1.5 + lift * 0.6], [0.08, 0.075, 0.03]),
    belt: { at: U([0, 0, 1.0]), up: norm(add(U([0, 0, 1.05]), mul(U([0, 0, 0.95]), -1))) },
    extras: [...(packed ? gear(U, fists, slash === null ? 0 : slashSwing(slash), reload === null ? undefined : reloadMag(reload)) : []), ...regalia(U, lift)],
  });
}

// ---------- Gear: the backpack on the back, a submachine gun and an army knife in the hands ----------

// The uniform's gold, on everyone: a buckle on the belt in front, epaulettes on the shoulders with a
// bullion fringe hanging round their outer ends (a demob's dress uniform). map: standing model -> this
// pose; lift: the shoulders' rise with the breath. Material: the hero's gold (makeHero).
function regalia(map, lift = 0) {
  const gold = [], black = [];
  const B = (list, p, half, r) => {
    const o = map(p), axis = (d) => norm(add(map(add(p, mul(d, 0.01))), mul(o, -1)));
    list.push(box(o, [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])], half, r));
  };
  B(gold, [0, 0.15, 1.0], [0.045, 0.008, 0.032], 0.006); // the buckle
  for (const sx of [-1, 1]) {
    const top = 1.53 + lift;
    // The epaulette: a strap from the collar out along the shoulder, a round pad on its end over the
    // shoulder, gold on a black rim a little bigger under it
    const disk = (list, z0, z1, r) => list.push(cone(map([sx * 0.21, -0.005, z0]), map([sx * 0.21, -0.005, z1]), r, r));
    B(black, [sx * 0.145, -0.005, top - 0.004], [0.055, 0.045, 0.01], 0.008);
    disk(black, top - 0.016, top + 0.006, 0.066);
    B(gold, [sx * 0.145, -0.005, top], [0.05, 0.035, 0.011], 0.008);
    disk(gold, top - 0.011, top + 0.011, 0.056);
    for (let i = 0; i <= 8; i++) { // the fringe round its outer end, hanging down over the shoulder
      const a = -1.2 + (2.4 * i) / 8, ca = Math.cos(a), sa = Math.sin(a);
      gold.push(capsule(map([sx * (0.21 + 0.045 * ca), 0.05 * sa, top - 0.005]), map([sx * (0.23 + 0.06 * ca), 0.065 * sa, top - 0.09]), 0.009, 0.011));
    }
  }
  return [{ k: 0.006, material: 9, prims: gold }, { k: 0.003, material: 2, prims: black }]; // black: the boots' leather
}

// A frame on the body: maps point p of the standing model to this pose, given where the standing
// model's point ref is now (origin) and the direction its local up turned to (in the y-z plane:
// x stays to the right, forward is up turned towards +y)
function frameAt(origin, up, ref) {
  const fwd = [0, up[2], -up[1]];
  return ([x, y, z]) => add(origin, add([x - ref[0], 0, 0], add(mul(fwd, y - ref[1]), mul(up, z - ref[2]))));
}

// Capsules only, so every part turns with the body in any pose. back maps points of the standing
// model (meters, as in body() before the run's lean and twist) to this pose: the backpack rides with
// the chest. fists: side (-1 = the right hand, +1 = the left) -> [elbow, fist center], the weapons are held in them.
// Materials index the hero's ramps (makeHero).
// slashing (0..1): how much the knife is in a slash: the blade then runs along the forearm, its flat
// level, facing the camera
let lastMuzzle = null; // the gun's muzzle in the last pose built (model space), for the manifest
// mag: where the gun's magazine is: in it, and/or in the knife hand (reloading)
function gear(back, fists, slashing = 0, mag = { in: true, hand: false }) {
  const C = (map, a, b, r0, r1 = r0) => capsule(map(a), map(b), r0, r1);
  const bag = [], webbing = [], steel = [], mat = [], trim = [], pocket = [], leather = [];
  for (const sx of [-1, 1]) {
    bag.push(C(back, [sx * 0.06, -0.25, 1.1], [sx * 0.06, -0.25, 1.36], 0.11, 0.1)); // main bag
    // Shoulder strap: from the top of the bag over the shoulder, down the chest, back under the arm
    const strap = [[0.11, -0.15, 1.44], [0.12, -0.03, 1.56], [0.12, 0.1, 1.47], [0.13, 0.14, 1.3], [0.17, 0.08, 1.16], [0.15, -0.15, 1.08]];
    const side = ([x, y, z]) => [x * sx, y, z];
    for (let i = 0; i + 1 < strap.length; i++) webbing.push(C(back, side(strap[i]), side(strap[i + 1]), 0.016));
    webbing.push(C(back, [sx * 0.11, -0.25, 0.98], [sx * 0.13, -0.25, 0.98], 0.085)); // around the mat
  }
  bag.push(C(back, [-0.11, -0.22, 1.43], [0.11, -0.22, 1.43], 0.07)); // top flap
  // The lid pocket on the flap, as on the backpack lying in the sand: a strap from the outer side
  // over its top, a big buckle on the outer side
  const B = (list, p, half, r) => {
    const o = back(p), axis = (d) => norm(add(back(add(p, mul(d, 0.01))), mul(o, -1)));
    list.push(box(o, [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])], half, r));
  };
  B(pocket, [0, -0.27, 1.49], [0.13, 0.09, 0.05], 0.025);
  webbing.push(C(back, [0, -0.365, 1.42], [0, -0.335, 1.55], 0.015), C(back, [0, -0.335, 1.55], [0, -0.18, 1.56], 0.015));
  B(steel, [0, -0.37, 1.46], [0.034, 0.01, 0.025], 0.004);
  bag.push(C(back, [0, -0.34, 1.16], [0, -0.34, 1.3], 0.07)); // outer pocket
  mat.push(C(back, [-0.2, -0.25, 0.98], [0.2, -0.25, 0.98], 0.075)); // rolled-up sleeping mat under the bag
  // Weapons, in each fist's frame: d along the forearm, p across it in the plane of the arm (for a
  // forearm pointing up p points back, for one pointing down it points forward)
  const at = (o, ...terms) => terms.reduce((v, [dir, k]) => add(v, mul(dir, k)), o);
  // (a forearm pointing sideways, as in a slash, has no such plane: p is just forward then)
  const across = (v) => (Math.hypot(v[1], v[2]) > 0.2 ? norm([0, -v[2], v[1]]) : [0, 1, 0]);
  const frameOf = ([el, fist]) => {
    const d = norm(add(fist, mul(el, -1)));
    return { fist, d, p: across(d) };
  };
  // A compact submachine gun in the right hand, no stock, held like a pistol: pointing up along the
  // forearm and tipped out from the body at rest (straight up, the camera above would see it end-on),
  // level out in front firing. Its top t faces back when it points up: the receiver sits on the back
  // of the fist, the grip goes through it. Black, with blue parts (the muzzle, the charging handle,
  // the trigger, the end cap) like the sleeping mat; a red-dot sight on top, a long magazine in front
  // of the grip.
  {
    const { fist, d, p } = frameOf(fists[-1]);
    const g = norm(add(d, [-0.45 * Math.max(0, d[2]), 0, 0])); // the barrel: tipped out as much as it points up
    const t = norm(add(p, mul(g, -dot(p, g)))), s = cross(g, t);
    const B = (list, along, up, half, r = 0.006) => list.push(box(at(fist, [g, along], [t, up]), [g, t, s], half, r));
    B(webbing, -0.005, -0.06, [0.03, 0.075, 0.024]); // pistol grip
    B(webbing, 0.05, 0.03, [0.1, 0.035, 0.026]); // lower receiver
    B(webbing, 0.06, 0.085, [0.11, 0.025, 0.026]); // upper receiver
    B(webbing, 0.25, 0.07, [0.09, 0.035, 0.03]); // the railed handguard
    trim.push(capsule(at(fist, [g, 0.34], [t, 0.07]), at(fist, [g, 0.39], [t, 0.07]), 0.026)); // muzzle device
    if (mag.in) B(webbing, 0.1, -0.12, [0.028, 0.11, 0.02]); // the long magazine
    B(webbing, 0.07, 0.14, [0.035, 0.028, 0.03]); // red-dot sight ...
    B(trim, 0.105, 0.14, [0.005, 0.02, 0.022], 0.003); // ... its lens
    B(trim, -0.06, 0.095, [0.012, 0.012, 0.03], 0.004); // charging handle
    trim.push(capsule(at(fist, [g, 0.01], [t, -0.01]), at(fist, [g, 0.02], [t, -0.04]), 0.008)); // trigger
    trim.push(capsule(at(fist, [g, -0.07], [t, 0.06]), at(fist, [g, -0.09], [t, 0.06]), 0.02)); // the end cap where a stock would go
    lastMuzzle = at(fist, [g, 0.39], [t, 0.07]);
  }
  // An army knife in the left hand, in a reverse grip: the blade about square to the forearm, point down. Its flat faces up and out (edge-on, the camera above would see just a line),
  // the edge out and down. A short, dark blade with a bright honed edge and a clipped point, a steel
  // guard and pommel, a grip of stacked brown leather rings.
  {
    const { fist, d, p } = frameOf(fists[1]);
    if (mag.hand) webbing.push(box(add(fist, [0, 0.02, -0.08]), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.02, 0.028, 0.11], 0.006)); // a magazine in it, down out of the fist
    // Held as knives are, in a reverse grip: the fist round the grip, the blade out of it at about 65
    // degrees to the forearm (not along it), on the little finger's side, its point down, whatever
    // the arm does
    const tilt = 1.15;
    const blade = (side) => norm(add(mul(d, Math.cos(tilt)), mul(side, Math.sin(tilt))));
    let b = blade(p);
    if (blade(mul(p, -1))[2] < b[2]) b = blade(mul(p, -1)); // of the two ways out of the fist, the one pointing down
    // Turned towards the chest (the arm drawn back to wind up a slash), the blade would go into the
    // hero: then it comes out of the fist the other way, away from the chest
    const out = add(fist, mul(back([0, 0.02, 1.45]), -1)); // from the chest to the fist
    if (dot(b, out) < 0) {
      const away = add(out, mul(d, -dot(out, d))); // square to the forearm, outwards
      if (Math.hypot(...away) > 0.01) b = norm(add(mul(d, Math.cos(tilt)), mul(norm(away), Math.sin(tilt))));
    }
    const q = across(b); // across the blade in the vertical plane, up
    let w = norm(add([0.85, 0, 0], mul(q, -0.5))); // from the spine to the edge (+x is out, on the left side)
    if (slashing) { // the flat level: the edge across the blade, sideways, leading the cut
      let level = cross(b, [0, 0, 1]);
      if (Math.hypot(...level) > 0.2) {
        level = norm(level);
        if (dot(level, w) < 0) level = mul(level, -1);
        w = norm(lerp(w, level, slashing));
      }
    }
    w = norm(add(w, mul(b, -dot(w, b)))); // square to the blade
    const n = cross(b, w); // through the blade
    for (const k of [-0.045, -0.015, 0.015, 0.045]) leather.push(capsule(at(fist, [b, k - 0.012]), at(fist, [b, k + 0.012]), 0.022)); // grip
    steel.push(ellipsoid(at(fist, [b, -0.07]), [0.024, 0.024, 0.024])); // pommel
    steel.push(box(at(fist, [b, 0.068], [w, 0.012]), [b, w, n], [0.008, 0.045, 0.014], 0.004)); // guard
    webbing.push(box(at(fist, [b, 0.145], [w, 0.016]), [b, w, n], [0.07, 0.016, 0.007], 0.003)); // the dark blade ...
    steel.push(box(at(fist, [b, 0.145], [w, 0.036]), [b, w, n], [0.07, 0.006, 0.005], 0.002)); // ... its honed edge
    for (let i = 0; i <= 4; i++) { // the clipped point: the edge sweeps up to it
      const f = i / 4;
      (f > 0.6 ? steel : webbing).push(capsule(at(fist, [b, 0.21], [w, 0.04 * f]), at(fist, [b, 0.255], [w, 0.022]), 0.006));
    }
  }
  return [
    { k: 0.03, material: 4, prims: bag }, { k: 0.008, material: 5, prims: webbing }, { k: 0.006, material: 6, prims: steel },
    { k: 0.02, material: 7, prims: mat }, { k: 0.004, material: 7, prims: trim }, // the trim in the mat's blue
    { k: 0.01, material: 8, prims: pocket }, { k: 0.004, material: 3, prims: leather }, // the knife's grip in the belt's leather
  ];
}

// Puts the coverall on a body made of primitives: loose fabric over the torso, arms and legs (it
// softens the muscles) and a collar; head, neck and hands bare; boots over the feet. The belt is a
// band of leather over the torso's fabric across the spine: centered at belt.at, belt.up along the spine.
// extras: things worn over the outfit, [{ k, material, prims }] (they cast a shadow too).
function dress({ torso, head, neck, limbs, hands, feet, collar, belt, extras = [] }) {
  const bodyShape = bodySdf([{ k: 0.045, prims: torso }, { k: 0.02, prims: head }, ...limbs], 0.018);
  const worn = extras.map((e) => bodySdf([{ k: e.k, prims: e.prims }], e.k));
  const shape = (x, y, z) => Math.min(bodyShape(x, y, z), ...worn.map((f) => f(x, y, z)));
  const covered = new Set([...hands, ...feet, neck]);
  const fabric = bodySdf([
    { k: 0.06, prims: [...torso.filter((p) => !covered.has(p)), collar] },
    ...limbs.map((l) => ({ k: l.k + 0.02, prims: l.prims.filter((p) => !covered.has(p)) })),
  ], 0.03);
  const suit = (x, y, z) => fabric(x, y, z) - 0.014;
  // The belt follows the coverall's shape, so it shows in any pose (just the torso: the arms hanging
  // by the waist stay khaki); a thick one, 7 cm wide and standing 1.5 cm off the fabric
  const waist = bodySdf([{ k: 0.06, prims: torso.filter((p) => !covered.has(p)) }], 0.03);
  const beltSdf = (x, y, z) => {
    const band = Math.abs((x - belt.at[0]) * belt.up[0] + (y - belt.at[1]) * belt.up[1] + (z - belt.at[2]) * belt.up[2]) - 0.035;
    return band > 0.03 ? band : Math.max(waist(x, y, z) - 0.029, band); // far from the band: skip the torso
  };
  const bare = bodySdf([{ k: 0.02, prims: head }, { k: 0.02, prims: [neck] }, { k: 0.01, prims: hands }], 0.018);
  const bootSdf = bodySdf([{ k: 0.03, prims: feet }], 0.03);
  const boots = (x, y, z) => bootSdf(x, y, z) - 0.008;
  const parts = [bare, suit, boots, beltSdf]; // materials: skin, suit, black leather, brown leather
  return {
    shape,
    sdf: (x, y, z) => Math.min(parts[0](x, y, z), parts[1](x, y, z), parts[2](x, y, z), parts[3](x, y, z), ...worn.map((f) => f(x, y, z))),
    material: (x, y, z) => {
      const d = parts.map((f) => f(x, y, z));
      let top = -1, dt = Math.min(...d) + 0.002; // gear sits on top of the outfit
      worn.forEach((f, i) => { const di = f(x, y, z); if (di < dt) { dt = di; top = i; } });
      if (top >= 0) return extras[top].material;
      if (d[3] < Math.min(d[0], d[1], d[2]) + 0.003) return 3;
      return d[2] < d[1] + 0.003 && d[2] < d[0] ? 2 : d[1] < d[0] + 0.003 ? 1 : 0;
    },
  };
}

// ---------- Dodge roll: a forward roll, the body tucked into a ball ----------

const ROLL = 14; // frames, played once over ROLL_TIME
const ROLL_R = 0.42; // height of the ball's center while rolling
// Joints of the two poses (meters, ground at z = 0, facing +y; x for the left side, mirrored for the
// right; +x is the figure's left): a low crouch diving forward, and a tight tuck around the roll
// center at ROLL_R, the head turned away to the right, off the rolling shoulder
const CROUCH = {
  pelvis: [0, -0.14, 0.52], waist: [0, -0.1, 0.72], chest: [0, 0, 0.9], neck: [0, 0.12, 1.04], head: [0, 0.2, 1.12],
  shoulder: [0.19, 0.06, 1.0], elbow: [0.27, 0.18, 0.78], wrist: [0.18, 0.36, 0.66],
  hip: [0.08, -0.14, 0.47], knee: [0.13, 0.2, 0.42], ankle: [0.12, 0.04, 0.08], toe: [0.12, 0.2, 0.03],
};
const TUCK = Object.fromEntries(Object.entries({
  pelvis: [0, -0.13, -0.1], waist: [0, -0.2, 0.05], chest: [0, -0.1, 0.2], neck: [-0.03, 0.05, 0.29], head: [-0.07, 0.14, 0.2],
  shoulder: [0.19, 0, 0.26], elbow: [0.25, 0.1, 0.03], wrist: [0.14, 0.3, 0],
  hip: [0.08, -0.12, -0.12], knee: [0.12, 0.2, 0.15], ankle: [0.11, -0.02, -0.18], toe: [0.11, 0.12, -0.24],
}).map(([k, v]) => [k, add(v, [0, 0, ROLL_R])]));

const smoothstep = (e0, e1, v) => { const x = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return x * x * (3 - 2 * x); };

// t in [0, 1): dive into a crouch, tuck, roll a full turn forward over the left shoulder and
// diagonally across the back to the right hip, open up and rise. packed: with the gear (see gear()).
function rollBody(t, packed = false) {
  const tuck = smoothstep(0, 0.22, t) * (1 - smoothstep(0.78, 1, t));
  const turn = Math.PI * 2 * smoothstep(0.08, 0.92, t);
  const J = (name, side = 1) => {
    const [x, y, z] = lerp(CROUCH[name], TUCK[name], tuck);
    return [x * side, y, z];
  };
  const torso = [], limbs = [], hands = [], feet = [];
  // The torso from capsules along the spine, so it bends with it; two side by side make it wide
  for (const sx of [-1, 1]) {
    torso.push(capsule(add(J('pelvis'), [sx * 0.05, 0, 0]), add(J('waist'), [sx * 0.06, 0, 0]), 0.1, 0.1));
    torso.push(capsule(add(J('waist'), [sx * 0.06, 0, 0]), add(J('chest'), [sx * 0.08, 0, 0]), 0.1, 0.12));
  }
  torso.push(capsule(J('shoulder', -1), J('shoulder'), 0.075)); // shoulders and trapezius
  const neck = capsule(J('neck'), lerp(J('neck'), J('head'), 0.5), 0.058, 0.05);
  torso.push(neck);
  const head = [ellipsoid(J('head'), [0.075, 0.09, 0.098])];
  for (const side of [-1, 1]) {
    const hip = J('hip', side), knee = J('knee', side), ankle = J('ankle', side);
    const foot = capsule(ankle, J('toe', side), 0.032, 0.026);
    feet.push(foot, capsule(ankle, lerp(ankle, knee, 0.3), 0.046, 0.05));
    limbs.push({ k: 0.035, prims: [capsule(hip, knee, 0.085, 0.055), capsule(knee, ankle, 0.05, 0.034), foot] });
    const sh = J('shoulder', side), el = J('elbow', side), wr = J('wrist', side); // arms hug the shins
    const hand = ellipsoid(add(wr, mul(add(wr, mul(el, -1)), 0.15)), [0.032, 0.035, 0.035]);
    hands.push(hand);
    limbs.push({ k: 0.03, prims: [capsule(sh, el, 0.055, 0.04), capsule(el, wr, 0.042, 0.028), hand] });
  }
  const belt = { at: lerp(J('pelvis'), J('waist'), 0.5), up: norm(add(J('waist'), mul(J('pelvis'), -1))) };
  // The backpack rides on a frame along the spine, the weapons in the fists
  const dir = (a, b) => norm(add(J(b), mul(J(a), -1)));
  const fists = Object.fromEntries([-1, 1].map((side) => {
    const el = J('elbow', side), wr = J('wrist', side);
    return [side, [el, add(wr, mul(add(wr, mul(el, -1)), 0.15))]];
  }));
  const spine = frameAt(lerp(J('waist'), J('neck'), 0.21), dir('waist', 'neck'), [0, 0, 1.2]);
  const extras = [...(packed ? gear(spine, fists) : []), ...regalia(spine)];
  const dressed = dress({ torso, head, neck, limbs, hands, feet, belt, extras, collar: ellipsoid(J('neck'), [0.08, 0.075, 0.03]) });
  // The tucked body leans over to the left and turns its left shoulder forward, so that shoulder
  // meets the ground first; then the whole body turns forward around the roll center: the top goes
  // towards +y, then down. The ground cuts away whatever dips below it.
  const lean = 0.55 * tuck, yaw = 0.4 * tuck;
  const cl = Math.cos(lean), sl = Math.sin(lean), cw = Math.cos(yaw), sw = Math.sin(yaw);
  const c = Math.cos(turn), s = Math.sin(turn);
  const unturn = (f) => (x, y, z) => {
    let h = z - ROLL_R;
    [y, h] = [y * c - h * s, y * s + h * c]; // undo the forward turn (around x)
    [x, h] = [x * cl - h * sl, x * sl + h * cl]; // undo the lean (around y)
    [x, y] = [x * cw + y * sw, -x * sw + y * cw]; // undo the shoulder turn (around z)
    return f(x, y, h + ROLL_R);
  };
  const cut = (f) => (x, y, z) => Math.max(f(x, y, z), -z);
  return { shape: cut(unturn(dressed.shape)), sdf: cut(unturn(dressed.sdf)), material: unturn(dressed.material) };
}

const IDLE = 6; // breathing loop
// Cast shadows: their own frames, anchored at the same ground point as the body
const SHADOW_W = 96, SHADOW_H = 80, SHADOW_ANCHOR = [48, 52];

// Backpedaling and sidestepping: frames per cycle and how long a cycle lasts (s), to suit the
// speeds in shared/world.js
const GAIT = 12, BACK_CYCLE = 0.5, STRAFE_CYCLE = 0.45;
// Picking up (played once over PICK_TIME): down, a moment at the bottom around PICK_GRAB, back up
const PICK = 12;
// Crouching: a still loop, and sneaking in each gait (a slow cycle)
const CROUCH_LOOP = 4, SNEAK = 8, SNEAK_CYCLE = CROUCH_CYCLE;
const SLASH = 10;
// The gun: frames to bring it up or down; firing loops, two frames a round (the kick, back)
const AIM_FRAMES = 4, BURST = 2 * FIRE_ROUNDS;
const RELOAD = 12, RELOAD_RUN = 24; // the reload's frames, played once over RELOAD_TIME: standing, on the move (more: the legs run on)
const FIRE_ANIM = { stand: 'fire', run: 'fireRun', back: 'fireBack', left: 'fireStrafeL', right: 'fireStrafeR' };
const pickDepth = (t) => smoothstep(0, PICK_GRAB - 0.05, t) * (1 - smoothstep(PICK_GRAB + 0.05, 1, t));

// A long job's progress on stdout, so a run in the background can be followed: a line every 5%, as
// "hero_pack: 35% (274/784 frames, 4m 12s, ~7m 50s left)". Returns the function to call per item done.
function progress(name, total, unit) {
  const start = Date.now();
  const time = (ms) => {
    const sec = Math.round(ms / 1000);
    return sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`;
  };
  let done = 0, shown = 0;
  console.log(`${name}: 0% (0/${total} ${unit})`);
  return () => {
    done++;
    const pct = Math.floor((done / total) * 100);
    if (pct < shown + 5 && done < total) return;
    shown = pct;
    const spent = Date.now() - start;
    const left = done < total ? `, ~${time((spent / done) * (total - done))} left` : '';
    console.log(`${name}: ${pct}% (${done}/${total} ${unit}, ${time(spent)}${left})`);
  };
}

// The hero's animations, in column order: [name, frames, fps, (frame, yaw) => pose, muzzle (its
// muzzle goes in the manifest)]; packed: with the backpack, the pistol and the knife
function heroAnims(packed = false) {
  const cycle = (i, n) => (i / n) * Math.PI * 2;
  // The armed animations, standing up (crouch 0) or crouched (1, 'c' before the name; sneaking on
  // the move, the legs' cycle CROUCH_CYCLE). The knife: a slash (played once over SLASH_TIME),
  // standing and in each gait, the legs going on from the start of their cycle (the game restarts
  // the gait's clock with the slash, so the run picks up where it leaves it). The gun: brought up and
  // lowered; firing loops, standing and in each gait, FIRE_ROUNDS rounds over the gait's cycle (the
  // legs keep step), each with an aim turned to AIM_OFFSETS: the game picks the nearest to where it
  // aims, and has the muzzle in the manifest
  const armed = (crouch) => {
    const c = crouch ? 'c' : '';
    const cycleOf = (gait) => (gait === 'stand' ? GAIT_CYCLE.stand : crouch ? CROUCH_CYCLE : GAIT_CYCLE[gait]);
    const aim = (k) => ({ aim: k, kick: 0, off: 0 });
    return [
      [c + 'slash', SLASH, SLASH / SLASH_TIME, (i, yaw) => body(0, false, 0, yaw, packed, 'run', 0, i / SLASH, crouch)],
      ...[['slashRun', 'run'], ['slashBack', 'back'], ['slashL', 'left'], ['slashR', 'right']].map(([anim, gait]) => [c + anim, SLASH, SLASH / SLASH_TIME,
        (i, yaw) => body(Math.PI * 2 * ((i / SLASH) * SLASH_TIME) / cycleOf(gait), true, 0, yaw, packed, gait, 0, i / SLASH, crouch)]),
      [c + 'aimIn', AIM_FRAMES, AIM_FRAMES / AIM_IN_TIME, (i, yaw) => body(0, false, 0, yaw, packed, 'run', 0, null, crouch, aim(smoothstep(0, 1, (i + 1) / AIM_FRAMES)))],
      [c + 'reload', RELOAD, RELOAD / RELOAD_TIME, (i, yaw) => body(0, false, 0, yaw, packed, 'run', 0, null, crouch, null, (i + 0.5) / RELOAD)],
      // (on the move, in each gait: the legs going on from the start of their cycle, as with a slash)
      ...[['reloadRun', 'run'], ['reloadBack', 'back'], ['reloadL', 'left'], ['reloadR', 'right']].map(([anim, gait]) => [c + anim, RELOAD_RUN, RELOAD_RUN / RELOAD_TIME,
        (i, yaw) => body(Math.PI * 2 * ((i / RELOAD_RUN) * RELOAD_TIME) / cycleOf(gait), true, 0, yaw, packed, gait, 0, null, crouch, null, (i + 0.5) / RELOAD_RUN)]),
      [c + 'aimOut', AIM_FRAMES, AIM_FRAMES / AIM_OUT_TIME, (i, yaw) => body(0, false, 0, yaw, packed, 'run', 0, null, crouch, aim(1 - smoothstep(0, 1, (i + 1) / AIM_FRAMES)))],
      ...['stand', 'run', 'back', 'left', 'right'].flatMap((gait) => AIM_OFFSETS.map((off, v) => [
        c + FIRE_ANIM[gait] + ['-', '', '+'][v], BURST, BURST / cycleOf(gait),
        (i, yaw) => body(gait === 'stand' ? 0 : cycle(i, BURST), gait !== 'stand', 0, yaw, packed, gait === 'stand' ? 'run' : gait, 0, null, crouch,
          { aim: 1, kick: i % (BURST / FIRE_ROUNDS) === 0 ? 1 : 0, off }),
        true, // its muzzle goes in the manifest
      ])),
    ];
  };
  // Animations in column order: [name, frames, fps, (frame, yaw) => pose]
  const anims = [
    ['idle', IDLE, 2.5, (i, yaw) => body(0, false, (1 - Math.cos(cycle(i, IDLE))) / 2, yaw, packed)],
    ['walk', WALK, 40, (i, yaw) => body(cycle(i, WALK), true, 0, yaw, packed)], // run: a 0.5 s cycle, ~240 steps per minute
    ['roll', ROLL, ROLL / ROLL_TIME, (i) => rollBody(i / ROLL, packed)],
    ['back', GAIT, GAIT / BACK_CYCLE, (i, yaw) => body(cycle(i, GAIT), true, 0, yaw, packed, 'back')],
    ['strafeL', GAIT, GAIT / STRAFE_CYCLE, (i, yaw) => body(cycle(i, GAIT), true, 0, yaw, packed, 'left')],
    ['strafeR', GAIT, GAIT / STRAFE_CYCLE, (i, yaw) => body(cycle(i, GAIT), true, 0, yaw, packed, 'right')],
    ['pick', PICK, PICK / PICK_TIME, (i, yaw) => body(0, false, 0, yaw, packed, 'run', pickDepth((i + 0.5) / PICK))],
    ['crouch', CROUCH_LOOP, 2, (i, yaw) => body(0, false, (1 - Math.cos(cycle(i, CROUCH_LOOP))) / 2, yaw, packed, 'run', 0, null, 1)],
    ...[['sneak', 'run'], ['sneakBack', 'back'], ['sneakL', 'left'], ['sneakR', 'right']].map(([anim, gait]) =>
      [anim, SNEAK, SNEAK / SNEAK_CYCLE, (i, yaw) => body(cycle(i, SNEAK), true, 0, yaw, packed, gait, 0, null, 1)]),
    // Armed, a knife slash (played once over SLASH_TIME), standing and in each gait: the legs go on
    // from the start of their cycle (the game restarts the gait's clock with the slash, so the run
    // picks up where the slash leaves it)
    // Armed: the knife and the gun, standing up and crouched ('c' before the name)
    ...(packed ? [0, 1].flatMap(armed) : []),
  ];
  return anims;
}

// Frame i of animation a (heroAnims' index) facing row (DIRS): its body and its cast shadow (RGBA),
// and the gun's muzzle if it goes in the manifest
function heroFrame(anims, a, i, row) {
  const [, , , pose, muzzle] = anims[a];
  const yaw = (row * Math.PI) / 4;
  const { sdf, material, shape } = pose(i, yaw);
  // The gun's muzzle, model space (meters: +x the figure's left, +y forward, z up), on its aim
  const m = muzzle && i === 1 && row === 0 ? lastMuzzle.map((v) => Math.round(v * 1000) / 1000) : null;
  const img = renderBody(sdf, {
    W: HERO, H: HERO, anchor: HERO_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw,
    camDist: 5.5, focusZ: 0.9, ramps: [SKIN, SUIT, CLOTH, BELT, PACK_RAMPS[CANVAS], PACK_RAMPS[STRAP], PACK_RAMPS[BUCKLE], PACK_RAMPS[MAT], PACK_RAMPS[POCKET], GOLD], material, outline: [16, 9, 7],
  });
  const shadow = renderShadow(shape, {
    W: SHADOW_W, H: SHADOW_H, anchor: SHADOW_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw,
    camDist: 5.5, focusZ: 0.9, light: SHADOW_LIGHT, alpha: 0.55,
  });
  return { img, shadow, muzzle: m };
}

// name: the sheet's name (and its shadow's); packed: with the backpack, the pistol and the knife.
// Its frames are drawn by worker threads (this module again, see the end), a share each
async function makeHero(name, packed = false) {
  const anims = heroAnims(packed);
  const cols = anims.reduce((n, a) => n + a[1], 0);
  const color = new Sheet(cols * HERO, DIRS.length * HERO);
  const shadows = new Sheet(cols * SHADOW_W, DIRS.length * SHADOW_H);
  const animations = {}, jobs = [];
  let col = 0;
  anims.forEach(([anim, frames, fps], a) => {
    animations[anim] = { start: col, frames, fps };
    for (let i = 0; i < frames; i++, col++) DIRS.forEach((_, row) => jobs.push({ a, i, row, col }));
  });
  const tick = progress(name, jobs.length, 'frames');
  const n = Math.max(1, Math.min(jobs.length, Number(process.env.WORKERS) || os.cpus().length));
  await Promise.all(Array.from({ length: n }, (_, w) => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { packed, jobs: jobs.filter((_, j) => j % n === w) } });
    worker.on('message', ({ a, i, row, col, img, shadow, muzzle }) => {
      if (muzzle) animations[anims[a][0]].muzzle = muzzle;
      color.blit(img, HERO, HERO, col * HERO, row * HERO);
      shadows.blit(shadow, SHADOW_W, SHADOW_H, col * SHADOW_W, row * SHADOW_H);
      tick();
    });
    worker.on('error', reject);
    worker.on('exit', (code) => (code ? reject(new Error(`a worker for ${name} stopped (${code})`)) : resolve()));
  })));
  save(color, `${name}.png`);
  save(shadows, `${name}_shadow.png`);
  return {
    image: `${name}.png`, frame: [HERO, HERO], anchor: HERO_ANCHOR, rows: DIRS,
    shadow: { image: `${name}_shadow.png`, frame: [SHADOW_W, SHADOW_H], anchor: SHADOW_ANCHOR },
    animations,
  };
}

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- Landing capsule (a white dome like a suborbital crew capsule): a 3D model like the hero,
// plus a ground decal (scorched landing spot) ----------

// The model is built at its own size and drawn POD_SCALE times bigger (frames sized for that)
const POD_W = Math.round(170 * POD_SCALE), POD_H = Math.round(130 * POD_SCALE), POD_ANCHOR = [100, 66].map((v) => Math.round(v * POD_SCALE));
const DECAL_W = Math.round(210 * POD_SCALE), DECAL_H = Math.round(190 * POD_SCALE), DECAL_ANCHOR = [105, 95].map((v) => Math.round(v * POD_SCALE)); // fits the whole scorched ring
const POD_RAMPS = [
  ramp('#1d2024', '#2e3237', '#454a50', '#5f656b', '#7c8288', '#9aa0a5', '#b9bdc1', '#d6d9db'), // white hull (night)
  ramp('#07080a', '#0e1013', '#15181c', '#1d2126', '#262b31', '#30363d', '#3b424a', '#48505a'), // dark hardware
  ramp('#2a1206', '#45200b', '#673010', '#8a4214', '#ad5619', '#cc6c22', '#e3872f', '#f2a54a'), // orange hatch
  ramp('#0d0b0a', '#18140f', '#241d16', '#30271d', '#3d3125', '#4b3c2e', '#5a4938', '#6a5643'), // soot
  ramp('#03080e', '#061019', '#0a1824', '#0f2232', '#152d42', '#1d3a54', '#2a4c6a', '#3d6484'), // window glass
  ramp('#0a0b0e', '#111318', '#191c22', '#22262e', '#2c313a', '#373d48', '#434a57', '#505866'), // cabin walls and floor
  ramp('#160d08', '#26150c', '#381f10', '#4c2a15', '#61361b', '#774322', '#8e512b', '#a66136'), // pilot seat
  ramp('#08080a', '#0f0f12', '#17171b', '#202025', '#2b2a2f', '#37353a', '#444146', '#524e52'), // charred debris
  ramp('#8a1e08', '#a72a0c', '#c33a10', '#da4e16', '#ea661e', '#f58028', '#fb9c38', '#ffbb52'), // red-hot metal, embers
];
const [HULL, DARK, HATCH, SOOT, GLASS, CABIN, SEAT, CHAR, HOT] = [0, 1, 2, 3, 4, 5, 6, 7, 8];

// Burning debris torn off the capsule on landing, lying on the ground (meters, model space; shared
// with the world rules, which make the fires block movement); the flames rise from these
const FIRES = POD_FIRES;

// Model space, meters: the capsule stands on the ground with a slight lean towards +x; y is to its
// left, z up.
const POD_LEAN = 0.08;
const POD_UP = [Math.sin(POD_LEAN), 0, Math.cos(POD_LEAN)];
const POD_R = 1.05, POD_WALL = 0.95, POD_H_M = 1.75; // near-vertical wall, then a low dome
const podUp = (h) => mul(POD_UP, h);
// Point on the hull at height h, angle phi around it (0 = towards +y), pushed out by `out`
const podAt = (h, phi, r, out = 0) => add(podUp(h), add(mul([0, 1, 0], Math.cos(phi) * (r + out)), mul([Math.cos(POD_LEAN), 0, -Math.sin(POD_LEAN)], Math.sin(phi) * (r + out))));

function podModel() {
  const parts = POD_RAMPS.map(() => []);
  // Hull: a bell — a slightly tapered, almost vertical wall, then a low rounded top
  parts[HULL].push(cone(podUp(0.02), podUp(POD_WALL), POD_R, POD_R - 0.1));
  parts[HULL].push(ellipsoid(podUp(POD_WALL), [POD_R - 0.1, POD_R - 0.1, POD_H_M - POD_WALL]));
  parts[SOOT].push(cone(podUp(-0.05), podUp(0.12), POD_R + 0.02, POD_R + 0.02)); // sooty base from the landing burn
  // Big round entry hatch on the wall facing the camera, open: a thick orange frame around the dark
  // doorway; a round orange-framed window on each side of it
  for (const f of FRAMES) parts[HATCH].push(cone(add(f.c, mul(f.n, -0.06)), add(f.c, mul(f.n, 0.07)), f.r, f.r - 0.03));
  // Parachute hatch on top: a small dark disc
  parts[DARK].push(ellipsoid(podUp(POD_H_M - 0.01), [0.18, 0.18, 0.04]));
  // The cabin, seen through the open hatch. From above only the part just inside the doorway is in
  // view, so that's where things are: a console by the sill, the pilot seat behind it
  parts[CABIN].push(cone(podUp(0.05), podUp(0.14), POD_R - 0.1, POD_R - 0.1)); // floor
  parts[CABIN].push(ellipsoid([0, 0.62, 0.3], [0.28, 0.1, 0.16])); // console
  parts[SEAT].push(ellipsoid([0, 0.3, 0.36], [0.28, 0.2, 0.1])); // seat cushion
  parts[SEAT].push(ellipsoid([0, 0.08, 0.68], [0.28, 0.09, 0.32])); // backrest
  parts[CABIN].push(capsule([0, 0.25, 0.14], [0, 0.25, 0.28], 0.06)); // seat post
  // Burning debris: a crumpled panel of hull plating and a chunk of heat shield in each fire,
  // red-hot along the edges, embers around
  const r = rng(91);
  for (const [fx, fy] of FIRES) {
    const a = r() * Math.PI;
    const dx = Math.cos(a), dy = Math.sin(a);
    parts[CHAR].push(ellipsoid([fx, fy, 0.08], [0.32, 0.2, 0.06])); // bent panel, propped on one edge
    parts[CHAR].push(ellipsoid([fx + dx * 0.22, fy + dy * 0.22, 0.12], [0.16, 0.12, 0.1])); // crumpled end
    parts[CHAR].push(ellipsoid([fx - dx * 0.25, fy + dy * 0.18, 0.05], [0.14, 0.12, 0.05])); // heat shield chunk
    for (let i = 0; i < 6; i++) {
      const t = r() * Math.PI * 2, d = 0.15 + r() * 0.3;
      parts[HOT].push(ellipsoid([fx + Math.cos(t) * d, fy + Math.sin(t) * d * 0.8, 0.03], [0.035, 0.035, 0.03]));
    }
    parts[HOT].push(ellipsoid([fx + dx * 0.05, fy + dy * 0.05, 0.13], [0.14, 0.08, 0.035])); // glowing seam
  }
  const sdfs = parts.map((prims) => (prims.length ? bodySdf([{ k: 0.04, prims }], 0.04) : () => 1e9));

  // Hollow hull: a 7 cm shell with the doorway cut through it (and through the hatch frame)
  const WALL = 0.07, hatch = FRAMES[0];
  const hole = bodySdf([{ k: 0.01, prims: [cone(add(hatch.c, mul(hatch.n, -0.4)), add(hatch.c, mul(hatch.n, 0.3)), 0.36, 0.36)] }], 0.01);
  const solidHull = sdfs[HULL], frames = sdfs[HATCH];
  sdfs[HULL] = (x, y, z) => { const h = solidHull(x, y, z); return Math.max(h, -(h + WALL), -hole(x, y, z)); };
  sdfs[HATCH] = (x, y, z) => Math.max(frames(x, y, z), -hole(x, y, z));

  // The capsule sat down on uneven ground, its top tipped away from the hatch (-y): that turns the
  // wall with the hatch up towards the camera, which then looks in through the doorway
  const tip = -0.42, ct = Math.cos(tip), st = Math.sin(tip);
  const untip = (x, y, z) => [x, ct * y - st * z, st * y + ct * z];
  const onGround = new Set([CHAR, HOT]); // debris lies on the ground, it isn't tipped with the capsule
  const fields = sdfs.map((f, i) => (onGround.has(i) ? f : (x, y, z) => f(...untip(x, y, z))));
  const raw = (x, y, z) => Math.min(...fields.map((f) => f(x, y, z)));
  return {
    sdf: (x, y, z) => Math.max(raw(x, y, z), -z), // the ground cuts away whatever is below it
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x, y, z) < d) { d = f(x, y, z); best = i; } });
      const m = untip(x, y, z);
      // Inside of the shell and the cut edge of the doorway are cabin walls, not white hull
      if (best === HULL && (solidHull(...m) < -WALL * 0.5 || hole(...m) < 0.02)) return CABIN;
      return best === HATCH ? hatchPaint(...m) : best;
    },
  };
}

// Round frames on the wall facing +y (the camera side): the entry hatch (about a meter across) and a
// window on each side. c: center on the hull surface, n: outward normal, r: outer radius.
function wallFrame(phi, h, r, kind) {
  const n = [Math.sin(phi), Math.cos(phi), 0];
  const wallR = POD_R - 0.1 * (h / POD_WALL) - 0.02;
  return { kind, r, n, c: add([Math.sin(POD_LEAN) * h, 0, Math.cos(POD_LEAN) * h], mul(n, wallR)) };
}
const FRAMES = [wallFrame(0, 0.55, 0.5, 'hatch'), wallFrame(-0.95, 0.62, 0.2, 'window'), wallFrame(0.95, 0.62, 0.2, 'window')];

// Details painted onto the frames: bolts around the doorway's rim, window glass
function hatchPaint(x, y, z) {
  // The nearest frame, and the distance from its center within its plane
  let best = null, bd = 1e9;
  for (const f of FRAMES) {
    const p = [x - f.c[0], y - f.c[1], z - f.c[2]];
    const along = p[0] * f.n[0] + p[1] * f.n[1] + p[2] * f.n[2];
    const d = Math.hypot(p[0] - f.n[0] * along, p[1] - f.n[1] * along, p[2] - f.n[2] * along);
    if (d - f.r < bd) { bd = d - f.r; best = { f, d, p }; }
  }
  const { f, d, p } = best;
  if (f.kind === 'window') return d < f.r - 0.07 ? GLASS : HATCH;
  const a = Math.atan2(p[2], p[0]);
  if (d < 0.38) return SOOT; // inner edge of the frame around the doorway
  if (d > 0.42 && d < 0.47 && Math.abs(((a / (Math.PI / 5)) % 1 + 1) % 1 - 0.5) > 0.38) return DARK; // bolts
  return HATCH;
}

// Scorched landing spot: sand blown bare under the capsule, a blast ring of scorched sand around it
function podDecal() {
  const c = new Uint8ClampedArray(DECAL_W * DECAL_H * 4);
  const se = Math.sin(ELEV);
  const smooth = (e0, e1, v) => Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  for (let py = 0; py < DECAL_H; py++)
    for (let px = 0; px < DECAL_W; px++) {
      const gx = (px + 0.5 - DECAL_ANCHOR[0]) / PX_PER_M / POD_SCALE, gy = (py + 0.5 - DECAL_ANCHOR[1]) / (PX_PER_M * se) / POD_SCALE; // model meters
      const n = hash(px, py), n2 = hash(px >> 2, py >> 2);
      const d = Math.hypot(gx, gy) + (n2 - 0.5) * 0.25; // ragged edges
      let col = null;
      // Under each burning pile: a black patch of charcoal with glowing specks
      const cyw = Math.cos(POD.yaw), syw = Math.sin(POD.yaw);
      const mx = gx * cyw + gy * syw, my = -gx * syw + gy * cyw; // ground point in pod model space
      const ash = Math.min(...FIRES.map(([fx, fy]) => Math.hypot(mx - fx, my - fy))) + (n2 - 0.5) * 0.15;
      if (ash < 0.55) {
        col = n > 0.94 && ash < 0.4 ? [210, 84, 28] : [12 + n * 6, 10 + n * 5, 9 + n * 4];
        c.set([...col, 255], (py * DECAL_W + px) * 4);
        continue;
      }
      // The blast blew the sand away from the capsule: smooth packed sand under it (the ripples are
      // gone), heaped into a low rim; soot sprayed out in ragged rays beyond, thin enough that the
      // ripples show through. Sand colors match public/render/ground.js.
      const SOOT = [14, 13, 18];
      const ray = hash(Math.floor(((Math.atan2(gy, gx) + Math.PI) / (2 * Math.PI)) * 56), 3);
      const reach = 1.7 + ray * 1.6 + (n2 - 0.5) * 0.3;
      const soot = Math.round(Math.max(0, Math.min(1, 1 - (d - 1.3) / (reach - 1.3))) * (0.3 + 0.55 * ray) * 6) / 6;
      const mix = (c0, k) => c0.map((v, i) => Math.round(v + (SOOT[i] - v) * k));
      if (d < 1.35) col = [...mix(n > 0.5 ? [60, 55, 57] : [54, 50, 53], 0.25 + 0.35 * (1 - d / 1.35)), 255];
      else if (d < 1.6) col = [...mix(n > 0.3 ? [84, 77, 73] : [74, 68, 66], 0.15), 255];
      else if (soot > 0) col = [...SOOT, Math.round(soot * 230)];
      if (col) c.set(col, (py * DECAL_W + px) * 4);
    }
  return c;
}

function makePod() {
  const model = podModel(), S = POD_SCALE;
  const sdf = (x, y, z) => S * model.sdf(x / S, y / S, z / S), material = (x, y, z) => model.material(x / S, y / S, z / S);
  const common = { pxPerM: PX_PER_M, elev: ELEV, yaw: POD.yaw, camDist: 5.5, focusZ: 0.9 };
  const img = renderBody(sdf, { ...common, W: POD_W, H: POD_H, anchor: POD_ANCHOR, ramps: POD_RAMPS, material, outline: [8, 9, 10], bound: [0.6 * S, 3.2 * S] });
  const sheet = (data, w, h, name) => { const sh = new Sheet(w, h); sh.blit(data, w, h, 0, 0); save(sh, name); };
  sheet(img, POD_W, POD_H, 'pod.png');
  sheet(podDecal(), DECAL_W, DECAL_H, 'pod_decal.png');
  return {
    image: 'pod.png', frame: [POD_W, POD_H], anchor: POD_ANCHOR,
    decal: { image: 'pod_decal.png', frame: [DECAL_W, DECAL_H], anchor: DECAL_ANCHOR },
    // Smoke sources on the model (meters, model space): dust and smoke rolling around the base
    // from the landing burn, and a thin trail from the parachute hatch on top
    // (only behind and beside it: smoke is drawn over everything, so it must not veil the windows)
    smoke: [...[1.7, 2.4, 3.1, 3.8, 4.5].map((phi) => podAt(0.08, phi, POD_R, 0.15)), podUp(POD_H_M + 0.05)].map((p) => mul(p, S)),
    // Fires burning on the debris (meters, at the top of each pile)
    fires: FIRES.map(([x, y]) => mul([x, y, 0.15], S)),
  };
}

// ---------- The hero's backpack, lying on its back in the sand where it fell ----------

const PACK_W = 48, PACK_H = 40, PACK_ANCHOR = [24, 22];
const PACK_RAMPS = [
  ramp('#1d0f07', '#2f190c', '#452411', '#5b3016', '#713d1c', '#874b23', '#9c5b2c', '#b06c37'), // faded orange canvas
  ramp('#060608', '#0c0c10', '#131318', '#1b1b22', '#25252e', '#30303b', '#3d3d4a', '#4c4c5c'), // black webbing straps
  ramp('#1d2024', '#2e3237', '#454a50', '#5f656b', '#7c8288', '#9aa0a5', '#b9bdc1', '#d6d9db'), // metal buckles
  ramp('#05090c', '#0a1117', '#101a22', '#17242e', '#1f2f3b', '#283b49', '#334858', '#405769'), // rolled-up sleeping mat
  ramp('#120804', '#1e1008', '#2c170a', '#3b1f0d', '#4b2811', '#5c3216', '#6e3d1c', '#814923'), // lid pocket: the canvas, darker
];
const [CANVAS, STRAP, BUCKLE, MAT, POCKET] = [0, 1, 2, 3, 4];

// Model space, meters: the pack lies on its back with its top towards +y, the front pocket up
function backpackModel() {
  const parts = PACK_RAMPS.map(() => []);
  parts[CANVAS].push(
    ellipsoid([0, 0, 0.13], [0.17, 0.27, 0.12]), // main bag
    ellipsoid([0, 0.23, 0.17], [0.165, 0.09, 0.07]), // top flap
    ellipsoid([0, -0.06, 0.23], [0.12, 0.13, 0.045]), // front pocket
    ellipsoid([-0.17, -0.04, 0.11], [0.045, 0.1, 0.07]), // side pockets
    ellipsoid([0.17, -0.04, 0.11], [0.045, 0.1, 0.07]),
  );
  parts[MAT].push(capsule([-0.21, -0.32, 0.09], [0.21, -0.32, 0.09], 0.085)); // strapped under the bag
  for (const sx of [-1, 1]) parts[STRAP].push(ellipsoid([sx * 0.12, -0.32, 0.09], [0.016, 0.092, 0.092])); // around the mat
  // The lid pocket on the flap, shut with a strap down its middle and a big buckle
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  parts[POCKET].push(box([0, 0.19, 0.245], axes, [0.12, 0.075, 0.035], 0.02));
  parts[STRAP].push(capsule([0, 0.28, 0.25], [0, 0.11, 0.287], 0.014));
  parts[BUCKLE].push(box([0, 0.15, 0.29], axes, [0.032, 0.022, 0.009], 0.004));
  // A shoulder strap slipped out from under the bag, lying loose on the sand
  parts[STRAP].push(capsule([0.15, 0.14, 0.03], [0.3, 0.02, 0.018], 0.018), capsule([0.3, 0.02, 0.018], [0.2, -0.17, 0.018], 0.018));
  const fields = parts.map((prims) => bodySdf([{ k: 0.025, prims }], 0.02));
  return {
    sdf: (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x, y, z) < d) { d = f(x, y, z); best = i; } });
      return best;
    },
  };
}

function makeBackpack() {
  const { sdf, material } = backpackModel();
  const img = renderBody(sdf, {
    W: PACK_W, H: PACK_H, anchor: PACK_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: BACKPACK.yaw,
    camDist: 5.5, focusZ: 0.9, ramps: PACK_RAMPS, material, outline: [10, 7, 5], bound: [0.15, 0.6],
  });
  const sh = new Sheet(PACK_W, PACK_H);
  sh.blit(img, PACK_W, PACK_H, 0, 0);
  save(sh, 'backpack.png');
  return { image: 'backpack.png', frame: [PACK_W, PACK_H], anchor: PACK_ANCHOR };
}

// ---------- A wrecked army bed, thrown out of the capsule along with the backpack ----------

// A steel barracks bed: square-tube frame, headboard and footboard as frames with bars, a sprung
// wire mesh; worn brown-grey paint, rust where it's chipped
const BED_W = 130, BED_H = 110, BED_ANCHOR = [65, 62];
const BED_RAMPS = [
  ramp('#100e0c', '#1c1916', '#292521', '#37322d', '#46403a', '#565048', '#676057', '#797167'), // worn brown-grey paint
  ramp('#160904', '#241007', '#36180a', '#49200d', '#5c2a12', '#703517', '#84411d', '#984e24'), // rust
  ramp('#0a0a0b', '#131315', '#1d1d20', '#28282c', '#343439', '#414147', '#4f4f56', '#5e5e66'), // the wire mesh
];
const [PAINT, RUST, WIRE] = [0, 1, 2];

// Model space, meters: the bed along x, the headboard at -x. Built standing, then turned upside down
// as it landed: it lies on the tops of its headboard (0.85 m) and footboard (0.6 m), so a little
// askew, the mesh underneath, the legs in the air; the mesh torn in one place, a wire hanging.
function bedModel() {
  const parts = BED_RAMPS.map(() => []);
  // A square tube from a to b, s half its thickness
  const bar = (list, a, b, s = 0.02) => {
    const d = add(b, mul(a, -1)), len = Math.hypot(...d), u = mul(d, 1 / len);
    let v = cross([0, 0, 1], u);
    v = Math.hypot(...v) < 0.1 ? [0, 1, 0] : norm(v);
    list.push(box(lerp(a, b, 0.5), [u, v, cross(u, v)], [len / 2, s, s], 0.004));
  };
  const L = 0.95, Wd = 0.37, railZ = 0.42, HEAD = 0.85, FOOT = 0.6;
  // The boards: posts down to the floor (the legs), a top bar, one under it, a low bar
  for (const [x, top] of [[-L, HEAD], [L, FOOT]]) {
    for (const y of [-Wd, Wd]) bar(parts[PAINT], [x, y, 0], [x, y, top]);
    bar(parts[PAINT], [x, -Wd, top], [x, Wd, top]);
    bar(parts[PAINT], [x, -Wd, top - 0.13], [x, Wd, top - 0.13], 0.015);
    bar(parts[PAINT], [x, -Wd, 0.18], [x, Wd, 0.18], 0.015);
    for (const y of [-Wd, Wd]) parts[RUST].push(ellipsoid([x, y, top], [0.03, 0.03, 0.03]), ellipsoid([x, y, 0.01], [0.028, 0.028, 0.03]));
  }
  for (const y of [-Wd, Wd]) bar(parts[PAINT], [-L, y, railZ], [L, y, railZ], 0.022); // side rails
  parts[RUST].push(capsule([0.1, -Wd, railZ], [0.32, -Wd, railZ], 0.026)); // a rusty stretch of rail
  // The mesh: diagonal wires both ways between the rails, torn open in one place
  const torn = (x, y) => Math.hypot((x - 0.35) / 0.28, (y - 0.08) / 0.2) < 1 + 0.25 * Math.sin(x * 31 + y * 17);
  for (let k = -L - 2 * Wd; k < L; k += 0.09)
    for (const dir of [1, -1]) {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const x = k + (2 * Wd * i) / 8, y = dir * (-Wd + (2 * Wd * i) / 8) * 0.95;
        pts.push(x < -L + 0.03 || x > L - 0.03 || torn(x, y) ? null : [x, y, railZ]);
      }
      for (let i = 0; i < 8; i++) if (pts[i] && pts[i + 1]) parts[WIRE].push(capsule(pts[i], pts[i + 1], 0.006));
    }
  // A torn-loose wire, which upside down hangs to the sand (built standing: up from the mesh)
  parts[WIRE].push(capsule([0.3, 0.05, railZ], [0.36, 0.1, railZ + 0.4], 0.006));
  const fields = parts.map((prims) => bodySdf([{ k: 0.005, prims }], 0.005));
  // Upside down: z from the top of the boards down, y mirrored; resting on both tops along x
  const top = (x) => HEAD + ((x + L) / (2 * L)) * (FOOT - HEAD);
  const flip = (f) => (x, y, z) => f(x, -y, top(x) - z);
  const flipped = fields.map(flip);
  return {
    sdf: (x, y, z) => Math.max(Math.min(...flipped.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      flipped.forEach((f, i) => { if (f(x, y, z) < d) { d = f(x, y, z); best = i; } });
      return best;
    },
  };
}

function makeBed() {
  const { sdf, material } = bedModel();
  const img = renderBody(sdf, {
    W: BED_W, H: BED_H, anchor: BED_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: BED.yaw,
    camDist: 5.5, focusZ: 0.9, ramps: BED_RAMPS, material, outline: [9, 8, 7], bound: [0.4, 2.1],
  });
  const sh = new Sheet(BED_W, BED_H);
  sh.blit(img, BED_W, BED_H, 0, 0);
  save(sh, 'bed.png');
  return { image: 'bed.png', frame: [BED_W, BED_H], anchor: BED_ANCHOR };
}

// ---------- A wrecked wooden bedside table, by the crate of bottles ----------

const STAND_W = 70, STAND_H = 60, STAND_ANCHOR = [35, 32];
const STAND_RAMPS = [
  ramp('#120905', '#1f1009', '#2f190e', '#402213', '#532d18', '#67391e', '#7b4625', '#90542d'), // varnished wood
  ramp('#0c0805', '#160f09', '#22170e', '#2e2014', '#3b2a1a', '#493421', '#573f28', '#664a30'), // raw wood: inside, splinters
  ramp('#1f1405', '#352309', '#4e350e', '#6a4a14', '#87611b', '#a37a26', '#bd9535', '#d6b04c'), // brass knob
];
const [VARNISH, RAW, BRASS] = [0, 1, 2];

// Model space, meters: a 0.55 m tall bedside table, tipped onto its back, its open front up (the shelf
// inside shows); one side broken off and lying beside it, the door torn off the hinges, splinters
function standModel() {
  const parts = STAND_RAMPS.map(() => []);
  const flat = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const ax = flat(0);
  parts[VARNISH].push(box([0, 0, 0.012], ax, [0.275, 0.225, 0.012], 0.004)); // the back, on the sand
  parts[VARNISH].push(box([0, -0.215, 0.2], ax, [0.275, 0.012, 0.2], 0.004)); // the side still on
  parts[VARNISH].push(box([-0.12, 0.215, 0.2], ax, [0.155, 0.012, 0.2], 0.004)); // what's left of the other
  parts[VARNISH].push(box([-0.265, 0, 0.2], ax, [0.012, 0.225, 0.2], 0.004)); // top and bottom
  parts[VARNISH].push(box([0.265, 0, 0.2], ax, [0.012, 0.225, 0.2], 0.004));
  parts[RAW].push(box([0.05, -0.01, 0.19], ax, [0.01, 0.2, 0.18], 0.003)); // the shelf inside
  parts[RAW].push(box([0.03, 0.215, 0.2], flat(0.6), [0.02, 0.012, 0.18], 0.003)); // the break, raw
  parts[VARNISH].push(box([0.25, 0.5, 0.012], flat(0.35), [0.13, 0.2, 0.012], 0.004)); // the broken-off side
  parts[VARNISH].push(box([0.62, -0.28, 0.012], flat(-0.45), [0.25, 0.2, 0.012], 0.004)); // the door ...
  parts[BRASS].push(ellipsoid([0.72, -0.4, 0.03], [0.022, 0.022, 0.02])); // ... and its knob
  for (const [x, y, a, l] of [[-0.45, 0.25, 1.1, 0.13], [0.45, 0.2, -0.4, 0.1], [-0.38, -0.42, 0.3, 0.15], [0.05, 0.5, 2.2, 0.09]])
    parts[RAW].push(box([x, y, 0.008], flat(a), [l, 0.018, 0.008], 0.003)); // splinters
  const fields = parts.map((prims) => bodySdf([{ k: 0.004, prims }], 0.004));
  return {
    sdf: (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x, y, z) < d) { d = f(x, y, z); best = i; } });
      return best;
    },
  };
}

function makeStand() {
  const { sdf, material } = standModel();
  const img = renderBody(sdf, {
    W: STAND_W, H: STAND_H, anchor: STAND_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: STAND.yaw,
    camDist: 5.5, focusZ: 0.9, ramps: STAND_RAMPS, material, outline: [10, 7, 5], bound: [0.2, 1.1],
  });
  const sh = new Sheet(STAND_W, STAND_H);
  sh.blit(img, STAND_W, STAND_H, 0, 0);
  save(sh, 'stand.png');
  return { image: 'stand.png', frame: [STAND_W, STAND_H], anchor: STAND_ANCHOR };
}

// ---------- The safe space's campfire: logs burning in a ring of stones ----------

const CAMPFIRE_W = 80, CAMPFIRE_H = 72, CAMPFIRE_ANCHOR = [40, 42];
const CAMPFIRE_DECAL_W = 96, CAMPFIRE_DECAL_H = 80, CAMPFIRE_DECAL_ANCHOR = [48, 40];
const CAMPFIRE_RAMPS = [
  ramp('#0f0f10', '#1b1b1d', '#29292b', '#38383a', '#48474a', '#59585a', '#6b696b', '#7e7b7c'), // stones: grey
  ramp('#0e0805', '#190e08', '#25160c', '#321e10', '#402715', '#4f311a', '#5e3b20', '#6e4626'), // bark
  ramp('#060505', '#0b0908', '#110e0c', '#181411', '#201a16', '#28211b', '#312821', '#3a3027'), // char
  ramp('#8a1e08', '#a72a0c', '#c33a10', '#da4e16', '#ea661e', '#f58028', '#fb9c38', '#ffbb52'), // embers
  ramp('#1c1a18', '#2b2825', '#3b3733', '#4c4742', '#5d5852', '#6f6963', '#817b74', '#948d86'), // ash
];
const [C_STONE, C_BARK, C_CHAR, C_EMBER, C_ASH] = [0, 1, 2, 3, 4];

// Model space, meters, its middle at the origin: a ring of rough stones round a bed of ash and embers;
// firewood stacked over it in a square crib, layer across layer, the lower ones charred and glowing;
// two more logs lying by it, ready to go on
function campfireModel() {
  const parts = CAMPFIRE_RAMPS.map(() => []);
  const r = rng(7);
  for (let i = 0; i < 11; i++) { // the stones, each its own size and turn
    const a = (i / 11) * Math.PI * 2 + (r() - 0.5) * 0.2, d = 0.48 + (r() - 0.5) * 0.04, s = 0.09 + r() * 0.04;
    parts[C_STONE].push(ellipsoid([Math.cos(a) * d, Math.sin(a) * d, s * 0.45], [s * 1.25, s, s * 0.8]));
  }
  parts[C_ASH].push(ellipsoid([0, 0, 0], [0.4, 0.4, 0.05])); // the ash bed
  for (const [x, y, s] of [[0.08, 0.05, 0.07], [-0.1, 0.02, 0.06], [0.02, -0.12, 0.065], [-0.04, 0.13, 0.05], [0.15, -0.06, 0.05]])
    parts[C_EMBER].push(ellipsoid([x, y, 0.04], [s, s * 0.9, s * 0.55])); // embers on it
  for (let layer = 0; layer < 4; layer++) { // the logs, stacked in a square crib, each layer across the last
    const z = 0.07 + layer * 0.11, across = layer % 2;
    for (const off of [-0.19, 0.19]) {
      const from = across ? [off, -0.32, z] : [-0.32, off, z], to = across ? [off, 0.32, z] : [0.32, off, z];
      const mid = from.map((v, k) => (v + to[k]) / 2);
      parts[layer < 2 ? C_CHAR : C_BARK].push(capsule(from, to, 0.06)); // (burnt black low down, where the fire's at them)
      if (layer < 2) parts[C_EMBER].push(ellipsoid([mid[0] * 0.8, mid[1] * 0.8, z], [0.06, 0.06, 0.03])); // glowing where they're burning
    }
  }
  parts[C_BARK].push(capsule([0.62, 0.32, 0.05], [1.05, 0.12, 0.05], 0.05)); // the spare logs, by it
  parts[C_BARK].push(capsule([0.66, 0.45, 0.05], [1.02, 0.36, 0.06], 0.045));
  const fields = parts.map((prims) => bodySdf([{ k: 0.01, prims }], 0.004));
  return {
    sdf: (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x, y, z) < d) { d = f(x, y, z); best = i; } });
      return best;
    },
  };
}

// The ground round it scorched: a dark, dithered ring of soot, thinning out (the sand shows through)
function campfireDecal() {
  const c = new Uint8ClampedArray(CAMPFIRE_DECAL_W * CAMPFIRE_DECAL_H * 4);
  const se = Math.sin(ELEV), R = 0.95;
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let py = 0; py < CAMPFIRE_DECAL_H; py++)
    for (let px = 0; px < CAMPFIRE_DECAL_W; px++) {
      const gx = (px + 0.5 - CAMPFIRE_DECAL_ANCHOR[0]) / PX_PER_M, gy = (py + 0.5 - CAMPFIRE_DECAL_ANCHOR[1]) / (PX_PER_M * se);
      const a = Math.atan2(gy, gx), d = Math.hypot(gx, gy) / (R * (1 + 0.08 * Math.sin(a * 5 + 2))) + (hash(px >> 1, py >> 1) - 0.5) * 0.1;
      if (d >= 1) continue;
      const k = Math.min(1, (1 - d) / 0.5), th = (BAYER4[(py % 4) * 4 + (px % 4)] + 0.5) / 16;
      if (k > th * 0.8) c.set([14, 11, 10, Math.round(150 * k)], (py * CAMPFIRE_DECAL_W + px) * 4);
    }
  return c;
}

function makeCampfire() {
  const { sdf, material } = campfireModel();
  const img = renderBody(sdf, {
    W: CAMPFIRE_W, H: CAMPFIRE_H, anchor: CAMPFIRE_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
    camDist: 5.5, focusZ: 0.3, ramps: CAMPFIRE_RAMPS, material, outline: [8, 7, 6], bound: [0.3, 1.2],
  });
  const sh = new Sheet(CAMPFIRE_W, CAMPFIRE_H);
  sh.blit(img, CAMPFIRE_W, CAMPFIRE_H, 0, 0);
  save(sh, 'campfire.png');
  const decal = new Sheet(CAMPFIRE_DECAL_W, CAMPFIRE_DECAL_H);
  decal.blit(campfireDecal(), CAMPFIRE_DECAL_W, CAMPFIRE_DECAL_H, 0, 0);
  save(decal, 'campfire_decal.png');
  return {
    image: 'campfire.png', frame: [CAMPFIRE_W, CAMPFIRE_H], anchor: CAMPFIRE_ANCHOR,
    decal: { image: 'campfire_decal.png', frame: [CAMPFIRE_DECAL_W, CAMPFIRE_DECAL_H], anchor: CAMPFIRE_DECAL_ANCHOR },
    // It burns in the middle, among the logs (meters, model space), and smokes over them
    fires: [[0, 0, 0.15], [0.08, 0.06, 0.12], [-0.07, -0.06, 0.12]],
    smoke: [[0, 0, 0.55]],
  };
}

// ---------- By the campfire: an automatic turret, a machine gun on a tripod, turning to its target ----------

const TURRET_W = 110, TURRET_H = 120, TURRET_ANCHOR = [55, 84];
const TURRET_SCALE = 0.975; // drawn this much bigger than its model: a heavy gun, as big as it should look by him
const TURRET_SHADOW_W = 140, TURRET_SHADOW_H = 100, TURRET_SHADOW_ANCHOR = [70, 55];
const TURRET_RAMPS = [
  ramp('#101113', '#1b1d21', '#272a2f', '#34383e', '#43474e', '#555a61', '#6b7077', '#868b91'), // gunmetal: the gun, the belt
  ramp('#0e0f09', '#181a10', '#232518', '#2e3120', '#3a3d28', '#474a31', '#55583b', '#646746'), // armour: dark khaki olive
  ramp('#0e110a', '#161b0f', '#1f2614', '#29321a', '#333f20', '#3e4c27', '#4a592f', '#566737'), // the base: dark olive
  ramp('#050505', '#0a0a0a', '#101010', '#161616', '#1d1d1d', '#252525', '#2d2d2d', '#363636'), // black: the muzzle, the visor, the camera
  ramp('#06121a', '#0b1f2b', '#11303f', '#184254', '#21576b', '#2e6f85', '#4a8ea3', '#7fb8c9'), // the camera's lens: glass
  ramp('#2a0302', '#4a0604', '#6e0a06', '#930f08', '#b8160b', '#d8220f', '#f03a1a', '#ff6a40'), // its light, red
];
const [T_METAL, T_ARMOUR, T_BASE, T_BLACK, T_GLASS, T_LIGHT] = [0, 1, 2, 3, 4, 5];

// Model space, meters, its pivot over the origin: a round column on a round foot plate (fixed),
// and on it the head, turned a (radians, from +x, as the game's world turns: x right, y down the
// screen): a squared-off armoured housing, a flat plate on top, a dark visor slit across its front;
// a camera on top looking where the gun does (a glass lens, a red light); a short heavy gun out of the
// middle of its front; a box on its right shoulder
function turretModel(a) {
  const parts = TURRET_RAMPS.map(() => []);
  const flat = (t) => [[Math.cos(t), Math.sin(t), 0], [-Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  const at = (fwd, side, z) => [Math.cos(a) * fwd - Math.sin(a) * side, Math.sin(a) * fwd + Math.cos(a) * side, z]; // (on the head: forward, to its left, up)
  parts[T_METAL].push(ellipsoid([0, 0, 0.02], [0.26, 0.26, 0.03])); // the foot plate, round
  parts[T_BASE].push(capsule([0, 0, 0.05], [0, 0, 0.55], 0.1)); // the column, round
  parts[T_METAL].push(ellipsoid([0, 0, 0.6], [0.15, 0.15, 0.03])); // the ring it turns on
  parts[T_ARMOUR].push(box(at(-0.02, 0, 0.78), flat(a), [0.22, 0.19, 0.16], 0.02)); // the housing...
  parts[T_ARMOUR].push(box(at(-0.05, 0, 0.96), flat(a), [0.16, 0.14, 0.02], 0.01)); // ...its top plate
  parts[T_BLACK].push(box(at(0.2, -0.03, 0.84), flat(a), [0.03, 0.1, 0.03], 0.005)); // the visor, across its front
  parts[T_ARMOUR].push(box(at(-0.03, -0.24, 0.76), flat(a), [0.1, 0.055, 0.1], 0.012)); // the shoulder box
  parts[T_BLACK].push(box(at(0.02, -0.05, 1.03), flat(a), [0.075, 0.05, 0.045], 0.01)); // the camera...
  parts[T_GLASS].push(capsule(at(0.085, -0.05, 1.03), at(0.12, -0.05, 1.03), 0.033)); // ...its lens...
  parts[T_LIGHT].push(ellipsoid(at(-0.03, -0.05, 1.08), [0.015, 0.015, 0.013])); // ...its light
  parts[T_METAL].push(box(at(0.24, 0, 0.72), flat(a), [0.1, 0.055, 0.055], 0.015)); // the gun, out of its front in the middle: its body...
  parts[T_METAL].push(capsule(at(0.32, 0, 0.72), at(0.46, 0, 0.72), 0.022)); // ...a short, thin barrel...
  parts[T_BLACK].push(capsule(at(0.46, 0, 0.72), at(0.51, 0, 0.72), 0.016)); // ...muzzle
  const fields = parts.map((prims) => bodySdf([{ k: 0.008, prims }], 0.003));
  const K = TURRET_SCALE, sdf = (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x / K, y / K, z / K))), -z / K) * K; // (scaled up)
  return {
    sdf, shape: sdf,
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x / K, y / K, z / K) < d) { d = f(x / K, y / K, z / K); best = i; } });
      return best;
    },
  };
}

function makeTurret() {
  const sh = new Sheet(TURRET_W * TURRET_FRAMES, TURRET_H);
  for (let i = 0; i < TURRET_FRAMES; i++) { // a frame for each way the gun points, round from +x
    const { sdf, material } = turretModel((i / TURRET_FRAMES) * Math.PI * 2);
    const img = renderBody(sdf, {
      W: TURRET_W, H: TURRET_H, anchor: TURRET_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
      camDist: 5.5, focusZ: 0.7, ramps: TURRET_RAMPS, material, outline: [8, 7, 6], innerOutline: true, bound: [0.7, 1.4], // (its parts kept apart by black lines)
    });
    sh.blit(img, TURRET_W, TURRET_H, i * TURRET_W, 0);
  }
  save(sh, 'turret.png');
  const shadow = renderShadow(turretModel(0).shape, {
    W: TURRET_SHADOW_W, H: TURRET_SHADOW_H, anchor: TURRET_SHADOW_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
    camDist: 5.5, focusZ: 0.6, light: SHADOW_LIGHT, alpha: 0.5,
  });
  const ss = new Sheet(TURRET_SHADOW_W, TURRET_SHADOW_H);
  ss.blit(shadow, TURRET_SHADOW_W, TURRET_SHADOW_H, 0, 0);
  save(ss, 'turret_shadow.png');
  return {
    image: 'turret.png', frame: [TURRET_W, TURRET_H], anchor: TURRET_ANCHOR, frames: TURRET_FRAMES,
    shadow: { image: 'turret_shadow.png', frame: [TURRET_SHADOW_W, TURRET_SHADOW_H], anchor: TURRET_SHADOW_ANCHOR },
  };
}

// ---------- Over the safe space: a garage, the Soviet kind: a box of sandstone blocks, a slate roof, steel gates ----------

const GARAGE_W = 280, GARAGE_H = 330, GARAGE_ANCHOR = [140, 165];
const GARAGE_SHADOW_W = 260, GARAGE_SHADOW_H = 300, GARAGE_SHADOW_ANCHOR = [130, 150];
const GARAGE_RAMPS = [
  ramp('#2a2014', '#3e301e', '#544229', '#6b5535', '#836942', '#9b7e51', '#b39462', '#c9aa76'), // blocks: sandstone
  ramp('#1a140d', '#271e14', '#35291c', '#443525', '#53412e', '#634e38', '#735b42', '#83684d'), // the joints between them, darker
  ramp('#1a1b1b', '#292a2a', '#3a3b3b', '#4c4d4c', '#5f605e', '#737371', '#878784', '#9c9b97'), // the roof: asbestos slate, grey
  ramp('#0a120d', '#122017', '#1a2e21', '#223d2b', '#2b4c36', '#355c41', '#406c4d', '#4c7c5a'), // the gates: faded green paint
  ramp('#1a0d06', '#2c160a', '#40200e', '#552b13', '#6b3718', '#82441e', '#995226', '#b0612f'), // rust
  ramp('#08080a', '#0f0f12', '#17171b', '#202025', '#2b2a2f', '#37353a', '#444146', '#524e52'), // black: rubber, the lock
  ramp('#1d2024', '#2e3237', '#454a50', '#5f656b', '#7c8288', '#9aa0a5', '#b9bdc1', '#d6d9db'), // steel: the barrel, hinges
  ramp('#14140f', '#1f1f17', '#2b2a20', '#37362a', '#444234', '#524f3e', '#605c48', '#6e6953'), // the slate's stains: grime, lichen
  ramp('#2a2a2c', '#404043', '#58585c', '#717176', '#8b8b90', '#a6a6aa', '#c1c1c4', '#dcdcde'), // the satellite dish: white, gone grey
];
const [G_BRICK, G_MORTAR, G_ROOF, G_GATE, G_RUST, G_BLACK, G_STEEL, G_PATCH, G_DISH] = [0, 1, 2, 3, 4, 5, 6, 7, 8]; // (G_PATCH: the slate's stains)

// Model space, meters, its middle at the origin: a garage of big sandstone blocks, longer than it's wide (its depth
// along y), its gates in the +y end (the camera's); its walls up past the roof in a low parapet; the
// roof sheets of corrugated asbestos slate, grimy, a few blocks lying on them to hold them down, a
// satellite dish up on a post, a rusty vent pipe up through them; two steel gate leaves, painted green long ago, rusting at
// their feet and seams, a wicket door in the left one; the right one torn off, leant against the side
// wall, the dark inside showing through where it was
function garageModel() {
  const [A, B, H] = GARAGE_SIZE;
  const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const parts = GARAGE_RAMPS.map(() => []);
  parts[G_BRICK].push(box([0, 0, H / 2], ax, [A, B, H / 2], 0.01)); // the walls...
  for (const [x, y, a, b] of [[0, B - 0.06, A, 0.06], [0, -B + 0.06, A, 0.06], [A - 0.06, 0, 0.06, B], [-A + 0.06, 0, 0.06, B]])
    parts[G_BRICK].push(box([x, y, H + 0.12], ax, [a, b, 0.12], 0.008)); // ...up past the roof in a low parapet round it
  // On the roof: a satellite dish on a post, a few blocks along its edges, a rusty vent pipe
  const TOP = H + 0.11;
  const DISH = [-0.6, -0.9, TOP + 0.75], FACE = [0.25, 0.65, 0.72].map((v, _, w) => v / Math.hypot(...w)); // (where it is; which way it looks: south and up)
  parts[G_STEEL].push(capsule([DISH[0] - FACE[0] * 0.1, DISH[1] - FACE[1] * 0.1, TOP], DISH.map((v, k) => v - FACE[k] * 0.1), 0.035)); // its post
  parts[G_STEEL].push(capsule(DISH.map((v, k) => v - FACE[k] * 0.3 + (k === 2 ? -0.28 : 0)), DISH.map((v, k) => v + FACE[k] * 0.38), 0.015)); // the arm out in front of it...
  parts[G_BLACK].push(box(DISH.map((v, k) => v + FACE[k] * 0.4), ax, [0.04, 0.04, 0.04], 0.012)); // ...the head on it
  for (const [x, y, a] of [[-1.35, -2.2, 0.2], [1.3, -0.4, -0.3], [-1.3, 1.6, 0.1], [0.2, -2.55, 1.4]])
    parts[G_BRICK].push(box([x, y, TOP + 0.06], [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]], [0.2, 0.1, 0.06], 0.01));
  parts[G_RUST].push(capsule([0.95, -1.9, TOP - 0.05], [0.95, -1.9, TOP + 0.55], 0.07));
  parts[G_STEEL].push(ellipsoid([0.95, -1.9, TOP + 0.6], [0.13, 0.13, 0.04])); // (its cap)
  parts[G_GATE].push(box([-0.66, B + 0.02, 1.5], ax, [0.64, 0.04, 1.5], 0.005)); // the gate leaves: the left one shut...
  // ...the right one torn off its hinges, leant against the side wall by the doorway (LEAF: where its
  // middle is, how far its top leans in to the wall)
  const LEAN = 0.42, LEAF = [...GARAGE_LEAF, 1.38], up = [-Math.sin(LEAN), 0, Math.cos(LEAN)], out = [Math.cos(LEAN), 0, Math.sin(LEAN)];
  parts[G_GATE].push(box(LEAF, [[0, 1, 0], out, up], [0.64, 0.04, 1.5], 0.005));
  for (const h of [-1.0, 1.0]) parts[G_STEEL].push(box(LEAF.map((v, k) => v + up[k] * h + out[k] * 0.04 + (k === 1 ? 0.6 : 0)), [[0, 1, 0], out, up], [0.06, 0.02, 0.07], 0.005)); // its hinges, torn
  parts[G_BLACK].push(box([-0.04, B + 0.07, 1.5], ax, [0.03, 0.03, 0.06], 0.005)); // the padlock, hanging open on its hasp
  for (const x of [-1.32, 1.32]) for (const z of [0.5, 1.5, 2.5]) parts[G_STEEL].push(box([x, B + 0.07, z], ax, [0.05, 0.03, 0.06], 0.005)); // hinges
  const fields = parts.map((prims) => (prims.length ? bodySdf([{ k: 0.004, prims }], 0.003) : () => 1e9));
  // The roof: sheets of corrugated slate, its waves running front to back, inside the parapet
  const slate = (x, y, z) => Math.max(Math.abs(x) - (A - 0.1), Math.abs(y) - (B - 0.1), Math.abs(z - (H + 0.04)) - 0.04 - 0.025 * Math.sin((x / 0.18) * Math.PI * 2));
  const dish = (x, y, z) => { // a round dish, thin, cupped a little
    const p = [x - DISH[0], y - DISH[1], z - DISH[2]], along = p[0] * FACE[0] + p[1] * FACE[1] + p[2] * FACE[2];
    const across = Math.hypot(p[0] - FACE[0] * along, p[1] - FACE[1] * along, p[2] - FACE[2] * along);
    return Math.max(Math.abs(along + 0.12 * (across / 0.38) ** 2) - 0.018, across - 0.38);
  };
  fields[G_ROOF] = slate;
  const walls = fields[G_BRICK], doorway = (x, y, z) => Math.max(Math.abs(x - 0.66) - 0.64, Math.abs(y - B) - 0.35, Math.abs(z - 1.5) - 1.5);
  fields[G_BRICK] = (x, y, z) => Math.max(walls(x, y, z), -doorway(x, y, z)); // (the open half: its way in, dark inside)
  const sdf = (x, y, z) => Math.max(Math.min(dish(x, y, z), ...fields.map((f) => f(x, y, z))), -z);
  const frac = (v) => ((v % 1) + 1) % 1;
  return {
    sdf, shape: sdf,
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x, y, z) < d) { d = f(x, y, z); best = i; } });
      if (dish(x, y, z) < d) return G_DISH;
      if (best === G_ROOF) { // the slate sheets: their overlaps dark, grime and lichen in blotches
        if (frac(y / 1.15) < 0.035 || frac((x + 0.05) / 1.15) < 0.02) return G_BLACK;
        const n = hash(Math.floor(x / 0.25), Math.floor(y / 0.25)) + 0.5 * hash(Math.floor(x / 0.7) + 7, Math.floor(y / 0.7));
        return n > 1.15 ? G_PATCH : G_ROOF;
      }
      if (best === G_BRICK && doorway(x, y, z) < 0.02) return G_BLACK; // (in through the open leaf: the dark inside)
      if (best === G_BRICK && z > H + 0.1 && Math.abs(x) < A - 0.13 && Math.abs(y) < B - 0.13) return G_BRICK; // (the blocks lying on the roof: plain)
      if (best === G_BRICK) { // courses of big sandstone blocks, every other one shifted half a block, joints between
        const along = Math.abs(Math.abs(x) - A) < Math.abs(Math.abs(y) - B) ? y : x; // (along whichever wall it's on)
        if (z > H + 0.18) { // the parapet's top: blocks laid across it
          const u = frac((Math.abs(x) - A < -0.1 ? x : y) / 0.4);
          return u < 0.06 ? G_MORTAR : G_BRICK;
        }
        const row = Math.floor(z / 0.2), u = frac((along + (row % 2) * 0.2) / 0.4), v = frac(z / 0.2); // (big blocks: 0.4 by 0.2 m)
        return u < 0.04 || v < 0.07 ? G_MORTAR : G_BRICK;
      }
      if (best === G_GATE && x > A) { // the torn-off leaf: its frame round it, stiffening ribs across, rust in specks
        const w = y - LEAF[1], h = (x - LEAF[0]) * up[0] + (z - LEAF[2]) * up[2];
        if (Math.abs(w) > 0.57 || Math.abs(h) > 1.43 || Math.abs(Math.abs(h) - 0.5) < 0.03) return G_BLACK;
        return hash(Math.floor(w * 18), Math.floor(h * 18)) > 0.83 || h < -1.25 ? G_RUST : G_GATE;
      }
      if (best === G_GATE) { // rust at its feet and in patches; the wicket's outline in the left leaf
        const n = hash(Math.floor(x * 9), Math.floor(z * 9));
        if (z < 0.18 + 0.12 * n || (n > 0.86 && z < 2.4)) return G_RUST;
        if (x < -0.15 && x > -1.1 && z < 2.1 && (Math.abs(x + 0.2) < 0.02 || Math.abs(x + 1.05) < 0.02 || Math.abs(z - 2.08) < 0.02)) return G_BLACK;
        return G_GATE;
      }
      return best;
    },
  };
}

function makeGarage() {
  const { sdf, material, shape } = garageModel();
  const view = { pxPerM: PX_PER_M, elev: ELEV, yaw: GARAGE.yaw, camDist: 40, focusZ: 0.9 };
  const img = renderBody(sdf, { W: GARAGE_W, H: GARAGE_H, anchor: GARAGE_ANCHOR, ...view, ramps: GARAGE_RAMPS, material, outline: [6, 7, 6], bound: [1.4, 5.8] });
  const sh = new Sheet(GARAGE_W, GARAGE_H);
  sh.blit(img, GARAGE_W, GARAGE_H, 0, 0);
  save(sh, 'garage.png');
  const shadow = renderShadow(shape, { W: GARAGE_SHADOW_W, H: GARAGE_SHADOW_H, anchor: GARAGE_SHADOW_ANCHOR, ...view, light: SHADOW_LIGHT, alpha: 0.55, reach: 6 });
  const ss = new Sheet(GARAGE_SHADOW_W, GARAGE_SHADOW_H);
  ss.blit(shadow, GARAGE_SHADOW_W, GARAGE_SHADOW_H, 0, 0);
  save(ss, 'garage_shadow.png');
  return {
    image: 'garage.png', frame: [GARAGE_W, GARAGE_H], anchor: GARAGE_ANCHOR,
    smoke: [[0.95, -1.9, GARAGE_SIZE[2] + 0.75]], // (out of its vent pipe, meters, model space)
    shadow: { image: 'garage_shadow.png', frame: [GARAGE_SHADOW_W, GARAGE_SHADOW_H], anchor: GARAGE_SHADOW_ANCHOR },
  };
}

// ---------- The fellow: an old scientist, stooped, in a long white lab coat, by the garage ----------

const FELLOW_W = 96, FELLOW_H = 120, FELLOW_ANCHOR = [48, 94], FELLOW_FRAMES = 4; // (frames: his breathing, in and out)
const FELLOW_SCALE = 1.3; // drawn this much bigger than his model: as the hero is, a little shorter than him
const FELLOW_SHADOW_W = 120, FELLOW_SHADOW_H = 90, FELLOW_SHADOW_ANCHOR = [60, 50];
const FELLOW_RAMPS = [
  ramp('#1a0e0b', '#341c15', '#53301f', '#73452e', '#935e41', '#b27a57', '#cc9873', '#e4b894'), // skin
  ramp('#26272a', '#3a3b3f', '#505156', '#68696e', '#818287', '#9b9ca0', '#b8b8bb', '#d6d6d6'), // the lab coat: white, gone grey
  ramp('#0d1219', '#152030', '#1e2e44', '#283d59', '#344e6e', '#426084', '#53739a', '#6688b0'), // his shirt: blue
  ramp('#110e0b', '#1d1813', '#2a231b', '#383023', '#463c2c', '#554936', '#645640', '#73634b'), // trousers: brown
  ramp('#060608', '#0c0c10', '#131318', '#1b1b22', '#25252e', '#30303b', '#3d3d4a', '#4c4c5c'), // shoes, the glasses' frames
  ramp('#3a3a3c', '#505052', '#68686a', '#808082', '#99999b', '#b3b3b4', '#cdcdce', '#e8e8e8'), // his hair, his beard: white
  ramp('#1c2a33', '#2a3e4b', '#3a5464', '#4c6b7e', '#628498', '#7c9eb1', '#9cbac9', '#c2d6e0'), // the glasses' lenses
];
const [F_SKIN, F_COAT, F_SHIRT, F_TROUSERS, F_BLACK, F_HAIR, F_GLASS] = [0, 1, 2, 3, 4, 5, 6];

// Model space, meters, his feet over the origin, facing +y (the camera): a stout old man, stooped,
// his head craned forward; a white lab coat to his knees over a blue shirt, his trousers and shoes
// under it (his feet together); bald on top, wild white hair round the sides and back, a white beard and moustache, round
// glasses; his hands clasped behind his back. b (0..1): how far through a breath (the
// chest, the shoulders and the head up a little)
function fellowModel(b = 0) {
  const parts = FELLOW_RAMPS.map(() => []);
  const up = 0.012 * b, E = (c, r) => ellipsoid(c, r), C = (a, c, r0, r1 = r0) => capsule(a, c, r0, r1);
  for (const sx of [-1, 1]) {
    parts[F_BLACK].push(C([sx * 0.05, -0.03, 0.04], [sx * 0.065, 0.11, 0.035], 0.042, 0.035)); // shoes, together
    parts[F_TROUSERS].push(C([sx * 0.05, 0, 0.07], [sx * 0.06, 0.01, 0.5], 0.05, 0.056)); // legs, standing close together
  }
  // The coat: flaring a little to its hem, the chest stooped forward
  parts[F_COAT].push(E([0, 0, 0.72], [0.23, 0.18, 0.27]), E([0, 0.02, 1.0], [0.24, 0.19, 0.21]), E([0, 0.04, 1.2 + up], [0.22, 0.15, 0.15]));
  parts[F_COAT].push(E([0, 0.09, 0.95 + up * 0.5], [0.2, 0.15, 0.17])); // his belly, round under the coat (a stout old man)
  parts[F_COAT].push(E([0, 0.05, 1.32 + up], [0.23, 0.11, 0.07])); // its shoulders
  parts[F_SHIRT].push(E([0, 0.17, 1.22 + up], [0.05, 0.03, 0.1])); // the shirt, in its open front
  for (const sx of [-1, 1]) { // the arms in their sleeves, behind his back, the hands clasped there
    const sh = [sx * 0.23, 0.03, 1.31 + up], el = [sx * 0.25, -0.1, 1.07 + up * 0.5], wr = [sx * 0.07, -0.21, 0.93];
    parts[F_COAT].push(C(sh, el, 0.05, 0.046), C(el, wr, 0.046, 0.04));
  }
  parts[F_SKIN].push(E([0, -0.225, 0.92], [0.055, 0.035, 0.04])); // the hands, clasped
  // The neck and the head, craned forward
  parts[F_SKIN].push(C([0, 0.05, 1.35 + up], [0, 0.1, 1.44 + up], 0.042, 0.038));
  const H = [0, 0.12, 1.53 + up]; // (the head's middle)
  const at = (x, y, z) => [H[0] + x, H[1] + y, H[2] + z];
  parts[F_SKIN].push(E(at(0, 0, 0), [0.074, 0.083, 0.094])); // the skull, bald on top
  parts[F_SKIN].push(C(at(0, 0.08, 0.0), at(0, 0.095, -0.03), 0.014, 0.018)); // the nose
  for (const sx of [-1, 1]) parts[F_SKIN].push(E(at(sx * 0.074, 0, -0.005), [0.012, 0.02, 0.026])); // the ears
  for (const [x, y, z, r] of [[-0.075, -0.02, 0.02, 0.05], [0.075, -0.02, 0.02, 0.05], [-0.06, -0.06, 0.04, 0.045], [0.06, -0.06, 0.04, 0.045], [0, -0.075, 0.02, 0.055], [-0.085, 0.01, 0.06, 0.03], [0.085, 0.01, 0.06, 0.03]])
    parts[F_HAIR].push(E(at(x, y, z), [r, r * 0.9, r * 0.85])); // his hair: bald on top, white and wild round the sides and back
  parts[F_HAIR].push(E(at(0, 0.06, -0.085), [0.052, 0.042, 0.055]), E(at(0, 0.085, -0.035), [0.04, 0.016, 0.013])); // the beard, the moustache
  for (const sx of [-1, 1]) parts[F_GLASS].push(E(at(sx * 0.03, 0.082, 0.01), [0.022, 0.006, 0.019])); // the glasses' lenses...
  parts[F_BLACK].push(C(at(-0.01, 0.086, 0.012), at(0.01, 0.086, 0.012), 0.004)); // ...the bridge between them
  const fields = parts.map((prims) => (prims.length ? bodySdf([{ k: 0.012, prims }], 0.004) : () => 1e9));
  const K = FELLOW_SCALE, sdf = (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x / K, y / K, z / K))), -z / K) * K; // (scaled up)
  return {
    sdf, shape: sdf,
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { if (f(x / K, y / K, z / K) < d) { d = f(x / K, y / K, z / K); best = i; } });
      return best;
    },
  };
}

function makeFellow() {
  const sh = new Sheet(FELLOW_W * FELLOW_FRAMES, FELLOW_H);
  for (let i = 0; i < FELLOW_FRAMES; i++) {
    const { sdf, material } = fellowModel((1 - Math.cos((i / FELLOW_FRAMES) * Math.PI * 2)) / 2);
    const img = renderBody(sdf, {
      W: FELLOW_W, H: FELLOW_H, anchor: FELLOW_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
      camDist: 5.5, focusZ: 1.1, ramps: FELLOW_RAMPS, material, outline: [8, 7, 6], bound: [1.1, 1.35],
    });
    sh.blit(img, FELLOW_W, FELLOW_H, i * FELLOW_W, 0);
  }
  save(sh, 'fellow.png');
  const shadow = renderShadow(fellowModel(0).shape, {
    W: FELLOW_SHADOW_W, H: FELLOW_SHADOW_H, anchor: FELLOW_SHADOW_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
    camDist: 5.5, focusZ: 1.1, light: SHADOW_LIGHT, alpha: 0.55,
  });
  const ss = new Sheet(FELLOW_SHADOW_W, FELLOW_SHADOW_H);
  ss.blit(shadow, FELLOW_SHADOW_W, FELLOW_SHADOW_H, 0, 0);
  save(ss, 'fellow_shadow.png');
  return {
    image: 'fellow.png', frame: [FELLOW_W, FELLOW_H], anchor: FELLOW_ANCHOR, frames: FELLOW_FRAMES,
    shadow: { image: 'fellow_shadow.png', frame: [FELLOW_SHADOW_W, FELLOW_SHADOW_H], anchor: FELLOW_SHADOW_ANCHOR },
  };
}

// ---------- The strike: a small rocket flying in, and the crater its blast leaves ----------

const ROCKET_W = 60, ROCKET_H = 70, ROCKET_ANCHOR = [30, 50]; // the anchor at its nose
const CRATER_W = 240, CRATER_H = 210, CRATER_ANCHOR = [120, 105]; // the scorched bowl, a decal
const ROCKET_RAMPS = [
  ramp('#1d2024', '#2e3237', '#454a50', '#5f656b', '#7c8288', '#9aa0a5', '#b9bdc1', '#d6d9db'), // white body, like the capsule's hull
  ramp('#2a0504', '#470a07', '#66100b', '#86170f', '#a51f14', '#c22b1b', '#da3c25', '#ee5434'), // red nose and fins
  ramp('#08080a', '#0f0f12', '#17171b', '#202025', '#2b2a2f', '#37353a', '#444146', '#524e52'), // the nozzle
];
const [ROCKET_BODY, ROCKET_RED, NOZZLE] = [0, 1, 2];
const ROCKET_R = 0.065, ROCKET_LEN = 0.78, ROCKET_NOSE = 0.18; // meters
// Its axis, from the nose back to the tail: back the way it came, STRIKE_SLANT off the vertical
const ROCKET_BACK = [-STRIKE_WAY.x * Math.sin(STRIKE_SLANT), -STRIKE_WAY.y * Math.sin(STRIKE_SLANT), Math.cos(STRIKE_SLANT)];

// The rocket, its nose at the origin: a pointed red nose, a slim white body, four red fins at the
// tail round a dark nozzle
function rocketModel() {
  const parts = ROCKET_RAMPS.map(() => []);
  const at = (s) => mul(ROCKET_BACK, s);
  parts[ROCKET_RED].push(cone(at(0), at(ROCKET_NOSE), 0.015, ROCKET_R));
  parts[ROCKET_BODY].push(cone(at(ROCKET_NOSE), at(ROCKET_LEN), ROCKET_R, ROCKET_R));
  parts[NOZZLE].push(cone(at(ROCKET_LEN), at(ROCKET_LEN + 0.045), ROCKET_R * 0.8, ROCKET_R * 0.65));
  // Fins: thin plates along the axis, sticking out four ways
  const side = norm([ROCKET_BACK[1], -ROCKET_BACK[0], 0]), other = norm([
    ROCKET_BACK[1] * side[2] - ROCKET_BACK[2] * side[1], ROCKET_BACK[2] * side[0] - ROCKET_BACK[0] * side[2], ROCKET_BACK[0] * side[1] - ROCKET_BACK[1] * side[0],
  ]);
  for (const out of [side, mul(side, -1), other, mul(other, -1)]) {
    const thin = norm([out[1] * ROCKET_BACK[2] - out[2] * ROCKET_BACK[1], out[2] * ROCKET_BACK[0] - out[0] * ROCKET_BACK[2], out[0] * ROCKET_BACK[1] - out[1] * ROCKET_BACK[0]]);
    parts[ROCKET_RED].push(box(add(at(ROCKET_LEN - 0.085), mul(out, ROCKET_R + 0.045)), [ROCKET_BACK, out, thin], [0.085, 0.05, 0.007], 0.003));
  }
  const fields = parts.map((prims) => bodySdf([{ k: 0.004, prims }], 0.004));
  return {
    sdf: (x, y, z) => Math.min(...fields.map((f) => f(x, y, z))),
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { const v = f(x, y, z); if (v < d) { d = v; best = i; } });
      return best;
    },
  };
}

function makeRocket() {
  const { sdf, material } = rocketModel();
  const img = renderBody(sdf, {
    W: ROCKET_W, H: ROCKET_H, anchor: ROCKET_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
    camDist: 5.5, focusZ: 0.9, ramps: ROCKET_RAMPS, material, outline: [8, 9, 10], bound: [0.5, 0.75],
  });
  const sh = new Sheet(ROCKET_W, ROCKET_H);
  sh.blit(img, ROCKET_W, ROCKET_H, 0, 0);
  save(sh, 'rocket.png');
  // tail: where its exhaust comes out (meters from the nose, model space), for the flame and smoke
  return { image: 'rocket.png', frame: [ROCKET_W, ROCKET_H], anchor: ROCKET_ANCHOR, tail: mul(ROCKET_BACK, ROCKET_LEN + 0.045) };
}

// The crater, a decal: the ground as a height field, a bowl with a lip of sand thrown up round it,
// shaded by the same moonlight as the bodies (sand colors match public/render/ground.js), sooty
// towards the bottom; scorched sand blown out in rays beyond, fading into the ground
// R: the bowl's radius (meters); the rest scales with it (W x H px, anchor: the decal's frame)
function craterDecal(R = CRATER_R, W = CRATER_W, H = CRATER_H, anchor = CRATER_ANCHOR) {
  const c = new Uint8ClampedArray(W * H * 4), k = R / CRATER_R;
  const se = Math.sin(ELEV), L = (([x, y, z]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })([-0.7, 0.15, 0.85]);
  const DEPTH = 0.5 * k, LIP = 0.16 * k, LIP_W = 0.3 * k;
  const height = (x, y) => {
    const d = Math.hypot(x, y) * (1 + 0.03 * Math.sin(Math.atan2(y, x) * 3 + 1) + 0.02 * Math.sin(Math.atan2(y, x) * 7)); // a little out of round
    return (d < R ? -DEPTH * (1 - (d / R) ** 2) : 0) + LIP * Math.exp(-(((d - R) / LIP_W) ** 2));
  };
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const gx = (px + 0.5 - anchor[0]) / PX_PER_M, gy = (py + 0.5 - anchor[1]) / (PX_PER_M * se);
      const n = hash(px, py), d = Math.hypot(gx, gy);
      const e = 0.02, hx = (height(gx + e, gy) - height(gx - e, gy)) / (2 * e), hy = (height(gx, gy + e) - height(gx, gy - e)) / (2 * e);
      const nl = Math.hypot(hx, hy, 1), lit = Math.max(0, (-hx * L[0] - hy * L[1] + L[2]) / nl);
      const flat = L[2]; // how lit flat ground is: the decal fades into the ground where it's flat
      const soot = Math.max(0, 1 - d / R); // blacker towards the bottom
      const shade = Math.round(((lit / flat) * (1 - 0.65 * soot)) * 5) / 5; // banded, like the bodies' ramps
      const sand = n > 0.5 ? [60, 55, 57] : [54, 50, 53];
      const fade = d < R + LIP_W * 2 ? 1 : Math.max(0, 1 - (d - R - LIP_W * 2) / 0.3);
      // In the bowl, burnt black patches of charcoal glowing with embers, like the capsule's fires'
      const n2 = hash(px >> 2, py >> 2), ash = d / R + (n2 - 0.5) * 0.35;
      if (ash < 0.8) {
        c.set(n > 0.93 && ash < 0.7 ? [215, 90 + Math.round(n * 30), 28, 255] : [12 + n * 6, 10 + n * 5, 9 + n * 4, 255], (py * W + px) * 4);
        continue;
      }
      if (fade > 0) {
        c.set([...sand.map((v) => Math.min(255, Math.round(v * shade))), Math.round(255 * fade)], (py * W + px) * 4);
        continue;
      }
      const ray = hash(Math.floor(((Math.atan2(gy, gx) + Math.PI) / (2 * Math.PI)) * 90), 7);
      const reach = R + LIP_W * 2 + (0.2 + ray * 0.8) * k;
      const sootOut = Math.round(Math.max(0, Math.min(1, 1 - (d - R - LIP_W * 2) / (reach - R - LIP_W * 2))) * (0.3 + 0.45 * ray) * (0.7 + 0.3 * n) * 6) / 6;
      if (sootOut > 0) c.set([14, 13, 18, Math.round(sootOut * 220)], (py * W + px) * 4);
    }
  return c;
}

function makeCrater() {
  const sh = new Sheet(CRATER_W, CRATER_H);
  sh.blit(craterDecal(), CRATER_W, CRATER_H, 0, 0);
  save(sh, 'crater.png');
  return { image: 'crater.png', frame: [CRATER_W, CRATER_H], anchor: CRATER_ANCHOR }; // flat on the ground: the game draws it with the decals
}

// A small one: where the crate of bottles blew up (see client.js)
const SMALL_CRATER_R = 0.4, SMALL_CRATER_W = 80, SMALL_CRATER_H = 72, SMALL_CRATER_ANCHOR = [40, 36];
function makeSmallCrater() {
  const sh = new Sheet(SMALL_CRATER_W, SMALL_CRATER_H);
  sh.blit(craterDecal(SMALL_CRATER_R, SMALL_CRATER_W, SMALL_CRATER_H, SMALL_CRATER_ANCHOR), SMALL_CRATER_W, SMALL_CRATER_H, 0, 0);
  save(sh, 'crater_small.png');
  return { image: 'crater_small.png', frame: [SMALL_CRATER_W, SMALL_CRATER_H], anchor: SMALL_CRATER_ANCHOR };
}

// ---------- A free-standing punching bag by the backpack: a red leather bag on a heavy black base ----------

const BAG_W = 60, BAG_H = 80, BAG_ANCHOR = [30, 58];
const BAG_RAMPS = [
  ramp('#1f0505', '#360908', '#4f0d0b', '#69130f', '#831a14', '#9c221a', '#b42c22', '#ca382c'), // red leather
  ramp('#060608', '#0c0c10', '#131318', '#1b1b22', '#25252e', '#30303b', '#3d3d4a', '#4c4c5c'), // black base, cap, straps
];
const [BAG_LEATHER, BAG_BLACK] = [0, 1];
const BAG_R = 0.2, BAG_TOP = 1.45; // meters

// piece: 'stand' (the base and its spring: it stays put) or 'bag' (on it: it rocks, and is cut to bits)
function bagModel(piece) {
  const parts = BAG_RAMPS.map(() => []);
  const up = (z) => [0, 0, z];
  if (piece === 'stand') {
    parts[BAG_BLACK].push(cone(up(0), up(0.16), 0.34, 0.3)); // the base, filled with sand
    parts[BAG_BLACK].push(cone(up(0.16), up(0.3), 0.14, 0.1)); // the neck, a stiff spring
  } else {
    parts[BAG_LEATHER].push(cone(up(0.3), up(BAG_TOP - 0.12), BAG_R - 0.02, BAG_R)); // the bag
    parts[BAG_LEATHER].push(ellipsoid(up(BAG_TOP - 0.12), [BAG_R, BAG_R, 0.12])); // its rounded top
    parts[BAG_BLACK].push(ellipsoid(up(BAG_TOP - 0.04), [0.12, 0.12, 0.06])); // the black cap
    for (const z of [0.55, 1.1]) parts[BAG_BLACK].push(cone(up(z), up(z + 0.05), BAG_R + 0.008, BAG_R + 0.008)); // straps round it
  }
  const fields = parts.map((prims) => (prims.length ? bodySdf([{ k: 0.01, prims }], 0.01) : () => 1e9));
  return {
    sdf: (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => (fields[BAG_BLACK](x, y, z) < fields[BAG_LEATHER](x, y, z) ? BAG_BLACK : BAG_LEATHER),
  };
}

// name: 'bag' or 'bag_stand' (see bagModel), drawn in the same frame, one over the other
function makeBag(name = 'bag') {
  const { sdf, material } = bagModel(name === 'bag' ? 'bag' : 'stand');
  const img = renderBody(sdf, {
    W: BAG_W, H: BAG_H, anchor: BAG_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
    camDist: 5.5, focusZ: 0.9, ramps: BAG_RAMPS, material, outline: [10, 7, 7], bound: [0.75, 0.9],
  });
  const sh = new Sheet(BAG_W, BAG_H);
  sh.blit(img, BAG_W, BAG_H, 0, 0);
  save(sh, `${name}.png`);
  return { image: `${name}.png`, frame: [BAG_W, BAG_H], anchor: BAG_ANCHOR };
}

// ---------- A bug: the first of the planet's creatures to come for the hero ----------

// A fat grub (drawn BUG_SCALE of this): a long body of swollen segments, fattest in the middle,
// crawling low on a fringe of tiny legs down both its sides, many of them, rippling in a wave; a dark
// head with short jaws. Mottled dark brown, darker between the segments. Model space like the
// hero's: meters, +x its left, +y forward, z up.
const BUG_SCALE = 0.65; // the model's drawn at this size: a small, quick thing, knee-high to him
const BUG = 72, BUG_ANCHOR = [36, 48];
const BUG_SHADOW_W = 96, BUG_SHADOW_H = 72, BUG_SHADOW_ANCHOR = [48, 40];
const BUG_WALK = 8, BUG_IDLE = 4, BUG_BITE_FRAMES = 8; // frames
export const BUG_WALK_CYCLE = 0.4; // seconds a wave of its legs takes, head to tail
const BUG_RAMPS = [
  ramp('#0f0905', '#1a1009', '#26180d', '#332012', '#412917', '#50331d', '#5f3d23', '#6f482a'), // its hide, dark brown
  ramp('#120806', '#1f0d09', '#2d130c', '#3c1a10', '#4b2214', '#5b2a18', '#6b331d', '#7c3d22'), // red-brown: patches
  ramp('#080504', '#0f0a07', '#17100b', '#1f160f', '#281c13', '#312318', '#3b2a1d', '#453222'), // near black: between its segments, its head
  ramp('#050405', '#0b0a0c', '#121114', '#1a191d', '#232227', '#2d2c32', '#38373e', '#44434b'), // dark: its legs, its jaws
];
const [BUG_HIDE, BUG_RUST, BUG_BLACK, BUG_DARK] = [0, 1, 2, 3];
// Its segments, head to tail: [y, half width, half length, half height] (meters)
const BUG_SEGMENTS = [[0.5, 0.13, 0.09, 0.1], [0.36, 0.2, 0.1, 0.15], [0.19, 0.26, 0.11, 0.2], [0.0, 0.3, 0.12, 0.23], [-0.2, 0.31, 0.12, 0.24],
  [-0.4, 0.28, 0.11, 0.21], [-0.57, 0.22, 0.1, 0.17], [-0.71, 0.14, 0.08, 0.11]];

// A bite (0..1 through it, or null): how far its front is reared up and back (rear), thrown forward
// and down at him (lunge), and its jaws open (gape): up and back, jaws wide, then a snap forward
// at BUG_BITE_SNAP, jaws shut, and back down
function bugBite(t) {
  const up = smoothstep(0, BUG_BITE_SNAP - 0.1, t) * (1 - smoothstep(BUG_BITE_SNAP - 0.1, BUG_BITE_SNAP, t));
  const lunge = smoothstep(BUG_BITE_SNAP - 0.12, BUG_BITE_SNAP, t) * (1 - smoothstep(BUG_BITE_SNAP + 0.1, 1, t));
  const gape = smoothstep(0, BUG_BITE_SNAP - 0.15, t) * (1 - smoothstep(BUG_BITE_SNAP - 0.04, BUG_BITE_SNAP, t));
  return { rear: up, lunge, gape };
}

// phase: the crawl's (radians, 0 still); twitch: its jaws stirring (0..1); bite: bugBite's, or null
function bugModel(phase = 0, twitch = 0, bite = null) {
  const parts = BUG_RAMPS.map(() => []);
  const { rear = 0, lunge = 0, gape = 0 } = bite ?? {};
  BUG_SEGMENTS.forEach(([y0, rx, ry, rz], k) => {
    // It sways a little side to side and humps along as it crawls, the wave going head to tail
    const sway = phase ? 0.03 * Math.sin(phase - k * 0.8) : 0, hump = phase ? 0.015 * Math.max(0, Math.sin(phase - k * 0.8)) : 0;
    // Biting, its front (the head most, fading out down the first few segments) goes up and back,
    // then forward and down
    const w = Math.max(0, 1 - k / 5), by = w * (0.3 * lunge - 0.12 * rear) + 0.05 * lunge, bz = w * (0.34 * rear - 0.04 * lunge);
    const y = y0 + by, z = rz + 0.03 + hump + bz;
    parts[k === 0 ? BUG_BLACK : BUG_HIDE].push(ellipsoid([sway, y, z], [rx, ry * 1.25, rz]));
    if (k === 0) { // the head: short jaws (wide and reaching out as it bites, its red-brown mouth showing between them)
      for (const sx of [-1, 1]) parts[BUG_DARK].push(capsule([sx * 0.05, y + 0.07, z - 0.04], [sx * (0.02 + 0.03 * twitch + 0.15 * gape), y + 0.15 + 0.1 * gape, z - 0.06], 0.016 + 0.01 * gape));
      if (gape > 0.05) parts[BUG_RUST].push(ellipsoid([0, y + 0.08, z - 0.02], [0.07 * gape, 0.05 * gape, 0.06 * gape]));
      return;
    }
    // Two pairs of tiny legs on it, one each side front and back, stepping in a wave (reared up,
    // the front ones up off the ground, clawing in the air)
    for (const sx of [-1, 1]) for (const [dy, off] of [[ry * 0.5, 0], [-ry * 0.5, Math.PI]]) {
      const a = phase - k * 0.8 + off + (sx > 0 ? 0 : Math.PI / 2), swing = phase ? 0.035 * Math.sin(a) : 0, lift = phase ? 0.02 * Math.max(0, Math.cos(a)) : 0;
      parts[BUG_DARK].push(capsule([sx * (rx - 0.04) + sway, y + dy, 0.08 + bz], [sx * (rx + 0.09) + sway, y + dy + swing + 0.04 * w * rear, lift + 0.7 * bz], 0.016));
    }
  });
  const fields = parts.map((prims) => (prims.length ? bodySdf([{ k: 0.02, prims }], 0.01) : () => 1e9));
  return {
    shape: (x, y, zz) => Math.min(...fields.map((f) => f(x, y, zz))),
    sdf: (x, y, zz) => Math.max(Math.min(...fields.map((f) => f(x, y, zz))), -zz),
    material: (x, y, zz) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { const v = f(x, y, zz); if (v < d) { d = v; best = i; } });
      if (best !== BUG_HIDE) return best;
      // Darker where one segment meets the next; its hide mottled red-brown and near black
      if (BUG_SEGMENTS.some(([sy, , ry], k) => k > 0 && Math.abs(y - (sy + ry * 1.25 * 0.85)) < 0.018)) return BUG_BLACK;
      const n = hash(Math.floor(x * 30 + 50), Math.floor(y * 30 + zz * 20 + 50)), m = Math.sin(x * 21 + y * 17) + Math.sin(y * 29 - zz * 23);
      if (m > 0.8) return BUG_RUST;
      if (m < -0.9 || n < 0.12) return BUG_BLACK;
      return best;
    },
  };
}

function makeBug() {
  const cycle = (i, n) => (i / n) * Math.PI * 2;
  const anims = [ // [name, frames, fps, (frame) => model]
    ['idle', BUG_IDLE, 6, (i) => bugModel(0, (1 - Math.cos(cycle(i, BUG_IDLE))) / 2)],
    ['walk', BUG_WALK, BUG_WALK / BUG_WALK_CYCLE, (i) => bugModel(cycle(i, BUG_WALK) || 1e-6)],
    ['bite', BUG_BITE_FRAMES, BUG_BITE_FRAMES / BUG_BITE_TIME, (i) => bugModel(0, 0, bugBite((i + 0.5) / BUG_BITE_FRAMES))], // (played once)
  ];
  const cols = anims.reduce((n, a) => n + a[1], 0);
  const color = new Sheet(cols * BUG, DIRS.length * BUG), shadows = new Sheet(cols * BUG_SHADOW_W, DIRS.length * BUG_SHADOW_H);
  const animations = {};
  let col = 0;
  for (const [anim, frames, fps, model] of anims) {
    animations[anim] = { start: col, frames, fps };
    for (let i = 0; i < frames; i++, col++) {
      const m = model(i), k = BUG_SCALE, sdf = (x, y, z) => k * m.sdf(x / k, y / k, z / k), shape = (x, y, z) => k * m.shape(x / k, y / k, z / k);
      const material = (x, y, z) => m.material(x / k, y / k, z / k);
      DIRS.forEach((_, row) => {
        const yaw = (row * Math.PI) / 4;
        const img = renderBody(sdf, {
          W: BUG, H: BUG, anchor: BUG_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw,
          camDist: 5.5, focusZ: 0.9, ramps: BUG_RAMPS, material, outline: [4, 3, 3], bound: [0.3, 0.8], // (low: it's small)
        });
        color.blit(img, BUG, BUG, col * BUG, row * BUG);
        const shadow = renderShadow(shape, {
          W: BUG_SHADOW_W, H: BUG_SHADOW_H, anchor: BUG_SHADOW_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw,
          camDist: 5.5, focusZ: 0.9, light: SHADOW_LIGHT, alpha: 0.55,
        });
        shadows.blit(shadow, BUG_SHADOW_W, BUG_SHADOW_H, col * BUG_SHADOW_W, row * BUG_SHADOW_H);
      });
    }
  }
  save(color, 'bug.png');
  save(shadows, 'bug_shadow.png');
  return {
    image: 'bug.png', frame: [BUG, BUG], anchor: BUG_ANCHOR, rows: DIRS, animations,
    shadow: { image: 'bug_shadow.png', frame: [BUG_SHADOW_W, BUG_SHADOW_H], anchor: BUG_SHADOW_ANCHOR },
  };
}

// ---------- Bottles to shoot: a row of them standing in the straw of an old wooden crate ----------

const BOTTLES_W = 70, BOTTLES_H = 80, BOTTLES_ANCHOR = [35, 58];
const BOTTLES_RAMPS = [
  ramp('#160d08', '#26150c', '#381f10', '#4c2a15', '#61361b', '#774322', '#8e512b', '#a66136'), // the crate's slats
  ramp('#060504', '#0c0a08', '#13100c', '#1a1610', '#221c15', '#2a231a', '#332a20', '#3c3226'), // the gaps between the slats
  ramp('#05140a', '#0a2412', '#10361b', '#164a25', '#1e5f30', '#28763d', '#358e4c', '#46a85f'), // green glass
  ramp('#1e0c03', '#331505', '#4a2008', '#622c0c', '#7a3a11', '#934a18', '#ab5c22', '#c3712e'), // brown glass
  ramp('#26302e', '#344240', '#445654', '#566b69', '#6b8280', '#839a98', '#9db3b1', '#bacdcb'), // clear glass
  ramp('#2a2418', '#41382a', '#5a4f3c', '#736650', '#8c7e66', '#a5967c', '#bdae92', '#d4c6a9'), // labels, paper
  ramp('#2a1f08', '#45330d', '#614914', '#7e611c', '#9b7a27', '#b69434', '#cdad46', '#e0c45e'), // straw
];
const [B_SLAT, B_GAP, B_GREEN, B_BROWN, B_CLEAR, B_PAPER, B_STRAW] = [0, 1, 2, 3, 4, 5, 6];
const BOTTLE_SPOTS = [[-0.36, 0.01], [-0.12, -0.01], [0.12, 0.01], [0.36, -0.01]]; // meters in the straw, left to right, each apart
const CRATE_TOP = 0.32, CRATE_L = 0.48, CRATE_D = 0.2; // its walls' height; half its length and depth
const BOTTLE_FRAMES = 1 << BOTTLE_SPOTS.length; // one per set of bottles still standing
const BOTTLE_COLORS = [B_GREEN, B_BROWN, B_CLEAR, B_GREEN];
const flatTurn = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

// Straw: wisps (x, y on the ground or the straw's top, z, a heading, a length), each a thin straw
function straws(seed, n, at) {
  const r = rng(seed);
  return Array.from({ length: n }, () => {
    const [x, y, z, a, l] = at(r);
    return capsule([x, y, z], [x + Math.cos(a) * l, y + Math.sin(a) * l, Math.max(0.01, z - l * 0.3 * r())], 0.012);
  });
}

// mask: which bottles still stand (bit i: BOTTLE_SPOTS[i])
function bottlesModel(mask) {
  const parts = BOTTLES_RAMPS.map(() => []);
  const ax = flatTurn(0);
  // The crate: four walls of slats round an open top, on the sand; posts in its corners
  for (const sy of [-1, 1]) parts[B_SLAT].push(box([0, sy * CRATE_D, CRATE_TOP / 2], ax, [CRATE_L, 0.02, CRATE_TOP / 2], 0.006));
  for (const sx of [-1, 1]) parts[B_SLAT].push(box([sx * CRATE_L, 0, CRATE_TOP / 2], ax, [0.02, CRATE_D, CRATE_TOP / 2], 0.006));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) parts[B_SLAT].push(box([sx * (CRATE_L - 0.01), sy * (CRATE_D - 0.01), CRATE_TOP / 2 + 0.01], ax, [0.03, 0.03, CRATE_TOP / 2 + 0.01], 0.006));
  // Straw filling it to the brim, heaped up a little in lumps, wisps hanging out over its edges
  parts[B_STRAW].push(box([0, 0, CRATE_TOP - 0.04], ax, [CRATE_L - 0.02, CRATE_D - 0.02, 0.04], 0.02));
  for (const [x, y, rx] of [[-0.3, 0.03, 0.14], [0.02, -0.04, 0.16], [0.3, 0.04, 0.13], [-0.05, 0.06, 0.1]]) // (inside its walls)
    parts[B_STRAW].push(ellipsoid([x, y, CRATE_TOP], [rx, 0.1, 0.035]));
  parts[B_STRAW].push(...straws(5, 16, (r) => {
    const side = r() < 0.5 ? -1 : 1, along = r() < 0.6; // over a long side mostly, or an end
    const x = along ? (r() * 2 - 1) * (CRATE_L - 0.05) : side * (CRATE_L - 0.05), y = along ? side * (CRATE_D - 0.04) : (r() * 2 - 1) * (CRATE_D - 0.05);
    const a = along ? side * Math.PI / 2 + (r() - 0.5) * 1.2 : (side < 0 ? Math.PI : 0) + (r() - 0.5) * 1.2;
    return [x, y, CRATE_TOP + 0.02, a, 0.08 + 0.06 * r()];
  }));
  BOTTLE_SPOTS.forEach(([x, y], i) => {
    if (!(mask & (1 << i))) return;
    // (drawn tall and stout, beyond life: from so high up a real one would be a dot; set in the straw a little)
    const z0 = CRATE_TOP - 0.03, t = 1.8 * (i === 1 ? 1.12 : i === 3 ? 0.92 : 1), r = 0.065, c = BOTTLE_COLORS[i];
    parts[c].push(cone([x, y, z0], [x, y, z0 + 0.3 * t], r, r)); // the body
    parts[c].push(cone([x, y, z0 + 0.3 * t], [x, y, z0 + 0.4 * t], r, 0.022)); // the shoulder
    parts[c].push(cone([x, y, z0 + 0.4 * t], [x, y, z0 + 0.56 * t], 0.022, 0.02)); // the neck
    parts[B_PAPER].push(cone([x, y, z0 + 0.12 * t], [x, y, z0 + 0.22 * t], r + 0.003, r + 0.003)); // a label round it
  });
  const fields = parts.map((prims) => (prims.length ? bodySdf([{ k: 0.004, prims }], 0.004) : () => 1e9));
  return {
    shape: (x, y, z) => Math.min(...fields.map((f) => f(x, y, z))),
    sdf: (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => {
      let best = 0, d = 1e9;
      fields.forEach((f, i) => { const v = f(x, y, z); if (v < d) { d = v; best = i; } });
      if (best === B_SLAT && z < CRATE_TOP - 0.02 && Math.abs(((z + 0.2) % 0.11) - 0.055) > 0.047) return B_GAP; // between the slats
      if (best === B_STRAW && hash(Math.floor(x * 90), Math.floor(y * 90 + z * 40)) < 0.3) return B_SLAT; // darker stalks in it
      return best;
    },
  };
}

const B_SHADOW_W = 90, B_SHADOW_H = 70, B_SHADOW_ANCHOR = [45, 48];

function makeBottles() {
  const sh = new Sheet(BOTTLES_W * BOTTLE_FRAMES, BOTTLES_H);
  for (let mask = 0; mask < BOTTLE_FRAMES; mask++) {
    const { sdf, material } = bottlesModel(mask);
    const img = renderBody(sdf, {
      W: BOTTLES_W, H: BOTTLES_H, anchor: BOTTLES_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
      camDist: 5.5, focusZ: 0.9, ramps: BOTTLES_RAMPS, material, outline: [10, 7, 5], bound: [0.7, 1.0],
    });
    sh.blit(img, BOTTLES_W, BOTTLES_H, mask * BOTTLES_W, 0);
  }
  save(sh, 'bottles.png');
  const shadow = renderShadow(bottlesModel(BOTTLE_FRAMES - 1).shape, {
    W: B_SHADOW_W, H: B_SHADOW_H, anchor: B_SHADOW_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: 0,
    camDist: 5.5, focusZ: 0.9, light: SHADOW_LIGHT, alpha: 0.55,
  });
  const ss = new Sheet(B_SHADOW_W, B_SHADOW_H);
  ss.blit(shadow, B_SHADOW_W, B_SHADOW_H, 0, 0);
  save(ss, 'bottles_shadow.png');
  return {
    image: 'bottles.png', frame: [BOTTLES_W, BOTTLES_H], anchor: BOTTLES_ANCHOR, frames: BOTTLE_FRAMES, spots: BOTTLE_SPOTS, top: CRATE_TOP,
    shadow: { image: 'bottles_shadow.png', frame: [B_SHADOW_W, B_SHADOW_H], anchor: B_SHADOW_ANCHOR },
  };
}


// ---------- The bedding thrown out with the bed: a burning mattress, a pillow, a plaid blanket ----------

const BEDDING_W = 260, BEDDING_H = 230, BEDDING_ANCHOR = [130, 115];
const GLADE_W = 250, GLADE_H = 230, GLADE_ANCHOR = [125, 115];
const BEDDING_RAMPS = [
  ramp('#16151a', '#26252b', '#38363d', '#4b4950', '#5f5d64', '#74717a', '#88858e', '#9d9aa2'), // ticking: dirty off-white
  ramp('#090c13', '#10151f', '#18202d', '#212b3b', '#2b374a', '#36445a', '#42516a', '#4f5f7b'), // ticking: faded blue stripes
  ramp('#060505', '#0b0908', '#110e0c', '#181411', '#201a16', '#28211b', '#312821', '#3a3027'), // char
  ramp('#8a1e08', '#a72a0c', '#c33a10', '#da4e16', '#ea661e', '#f58028', '#fb9c38', '#ffbb52'), // embers
  ramp('#232228', '#37363c', '#4d4b52', '#646269', '#7c7a81', '#95929a', '#aeabb3', '#c8c5cc'), // pillowcase: off-white
  ramp('#1a0606', '#2b0a09', '#3e0f0d', '#521411', '#671a15', '#7d211a', '#93281f', '#a93025'), // plaid: red
  ramp('#050c08', '#09140e', '#0e1d14', '#14271b', '#1a3122', '#203c2a', '#274732', '#2e533a'), // plaid: dark green
  ramp('#2a2418', '#41382a', '#5a4f3c', '#736650', '#8c7e66', '#a5967c', '#bdae92', '#d4c6a9'), // plaid: cream lines, fringe
];
const [TICK, STRIPE, CHAR_B, EMBER, COTTON, PLAID_RED, PLAID_GREEN, PLAID_CREAM] = [0, 1, 2, 3, 4, 5, 6, 7];

// Model space, meters, the backpack at its origin: the pieces lie scattered around it, each at its
// place in MATTRESS, PILLOW, BLANKET (shared/world.js). The mattress, along its x, is burnt away at
// its +x end (a ragged edge, char and embers beyond it, fires on the edge); the blanket lies spread out.
function beddingModel() {
  // A piece built in its own frame, placed at { x, y, yaw } in the model
  const placed = (at, f) => (x, y, z) => {
    const dx = x - at.x, dy = y - at.y, c = Math.cos(at.yaw), sn = Math.sin(at.yaw);
    return f(dx * c + dy * sn, -dx * sn + dy * c, z);
  };
  const flat = (a) => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
  const edge = (y) => 0.45 + 0.07 * Math.sin(y * 11) + 0.04 * Math.sin(y * 23 + 1); // where the fire has eaten to
  const mattressBox = bodySdf([{ k: 0.01, prims: [box([0, 0, 0.065], flat(0), [0.95, 0.4, 0.065], 0.04)] }], 0.01);
  // Bent: its unburnt end curling up off the sand, the burnt end flat (where its fires are)
  const bend = (x) => (x < 0 ? 0.42 * (-x / 0.95) ** 2 : 0);
  const mattress = (x, y, z) => 0.85 * Math.max(mattressBox(x, y, z - bend(x)), x - edge(y)); // what's left of it
  const char0 = bodySdf([{ k: 0.03, prims: [
    box([0.68, 0, 0.012], flat(0), [0.24, 0.38, 0.012], 0.01), // burnt to a crust beyond the edge
    ellipsoid([0.62, -0.2, 0.03], [0.1, 0.08, 0.03]), ellipsoid([0.75, 0.15, 0.025], [0.12, 0.09, 0.025]),
  ] }], 0.03);
  const embers0 = bodySdf([{ k: 0.005, prims: [[0.6, -0.05], [0.7, 0.25], [0.78, -0.25], [0.55, 0.32], [0.82, 0.05]]
    .map(([x, y]) => ellipsoid([x, y, 0.028], [0.025, 0.025, 0.012])) }], 0.005);
  // The pillow, so it reads as one: plump in the middle with a dent where a head lay, flat pointed
  // corners, an off-white case with a blue piping round its edge
  const pillowBody = bodySdf([{ k: 0.06, prims: [
    box([0, 0, 0.025], flat(0), [0.33, 0.23, 0.025], 0.02), ellipsoid([0, 0, 0.06], [0.28, 0.18, 0.085]),
    ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sy]) => capsule([sx * 0.24, sy * 0.15, 0.03], [sx * 0.35, sy * 0.25, 0.012], 0.02)),
  ] }], 0.06);
  const dent = ellipsoid([0.03, 0, 0.15], [0.13, 0.09, 0.055]);
  const pillow0 = (x, y, z) => Math.max(pillowBody(x, y, z), -bodySdf([{ k: 0.01, prims: [dent] }], 0.01)(x, y, z));
  // The blanket, so it reads as one: a big rectangle (1.5 x 1.1 m) lying spread out in soft waves,
  // a lump in it, one long edge rolled up, a fringe on its short ends; its tartan runs along its
  // edges (see material)
  const BW = 0.75, BH = 0.55; // half sizes
  // Crumpled a little: its outline wavy (warp: from the model to the cloth as it was laid flat),
  // soft waves, a lump, and a few creases running across it
  const warp = (x, y) => [x + 0.035 * Math.sin(y * 6 + 0.4), y + 0.04 * Math.sin(x * 5 + 1.2)];
  const crease = (x, y, a, c, h) => h * Math.exp(-((x * Math.cos(a) + y * Math.sin(a) - c) ** 2) / 0.003);
  const wave = (x, y) => 0.045 + 0.025 * Math.sin(x * 6 + 0.5) + 0.018 * Math.sin(y * 8 + 1) + 0.05 * Math.exp(-((x + 0.2) ** 2 / 0.08 + (y - 0.05) ** 2 / 0.05))
    + crease(x, y, 0.7, 0.25, 0.04) + crease(x, y, 2.3, -0.1, 0.035) + crease(x, y, 0.2, -0.45, 0.03) + 0.012 * Math.sin(x * 13 + y * 9);
  const sheet0 = bodySdf([{ k: 0.008, prims: [box([0, 0.03, 0.012], flat(0), [BW, BH - 0.03, 0.012], 0.008)] }], 0.008);
  const sheet = (x, y, z) => 0.8 * sheet0(...warp(x, y), z - wave(x, y));
  const roll = bodySdf([{ k: 0.02, prims: [capsule([-BW + 0.03, -BH + 0.02, 0.07], [BW - 0.03, -BH + 0.05, 0.07], 0.06)] }], 0.02);
  const fringe = bodySdf([{ k: 0.002, prims: [-1, 1].flatMap((side) => Array.from({ length: 13 }, (_, k) => {
    const y = -BH + 0.08 + k * 0.075;
    const x = side * BW - 0.035 * Math.sin(y * 6 + 0.4); // on the wavy edge
    return capsule([x, y, 0.03 + wave(x, y) - 0.045], [x + side * 0.06, y + 0.01 * Math.sin(k * 2.3), 0.008], 0.009);
  })) }], 0.002);
  const blanket0 = (x, y, z) => Math.min(sheet(x, y, z), roll(x, y, z), fringe(x, y, z));
  const fields = [placed(MATTRESS, mattress), placed(MATTRESS, char0), placed(MATTRESS, embers0), placed(PILLOW, pillow0), placed(BLANKET, blanket0)];
  const inFrame = (at, x, y) => { // a model point in a piece's own frame (for its patterns)
    const dx = x - at.x, dy = y - at.y, c = Math.cos(at.yaw), sn = Math.sin(at.yaw);
    return [dx * c + dy * sn, -dx * sn + dy * c];
  };
  const frac = (v) => v - Math.floor(v);
  return {
    sdf: (x, y, z) => Math.max(Math.min(...fields.map((f) => f(x, y, z))), -z),
    material: (x, y, z) => {
      const d = fields.map((f) => f(x, y, z)), i = d.indexOf(Math.min(...d));
      if (i === 0) { // ticking stripes along the mattress, sooted near the burnt edge
        const [mx, my] = inFrame(MATTRESS, x, y);
        if (edge(my) - mx < 0.06 + 0.04 * Math.sin(my * 17)) return CHAR_B;
        return frac(my * 8) < 0.28 ? STRIPE : TICK;
      }
      if (i === 1) return CHAR_B;
      if (i === 2) return EMBER;
      if (i === 3) { // the case, its piping round the edge
        const [px, py] = inFrame(PILLOW, x, y);
        return Math.abs(px) > 0.29 || Math.abs(py) > 0.19 ? STRIPE : COTTON;
      }
      // Tartan along its edges: red, dark green bands both ways, thin cream lines in the red; the
      // fringe cream
      const [bx, by] = inFrame(BLANKET, x, y);
      if (fringe(bx, by, z) < 0.003) return PLAID_CREAM;
      const [wx, wy] = warp(bx, by), u = frac(wx / 0.42), v = frac(wy / 0.42); // (bent with the cloth)
      if (Math.abs(u - 0.62) < 0.035 || Math.abs(v - 0.62) < 0.035) return PLAID_CREAM;
      return u < 0.22 || v < 0.22 ? PLAID_GREEN : PLAID_RED;
    },
  };
}

// The clearing under it all: the sand trampled and scuffed where things came down, a ragged patch a
// little wider than their ring, with furrows where they skidded in. A dark, dithered tint: the
// ground's own sand and ripples show through.
function gladeDecal() {
  const c = new Uint8ClampedArray(GLADE_W * GLADE_H * 4);
  const se = Math.sin(ELEV), R = GLADE_R + 0.8;
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let py = 0; py < GLADE_H; py++)
    for (let px = 0; px < GLADE_W; px++) {
      const gx = (px + 0.5 - GLADE_ANCHOR[0]) / PX_PER_M, gy = (py + 0.5 - GLADE_ANCHOR[1]) / (PX_PER_M * se);
      const a = Math.atan2(gy, gx), n2 = hash(px >> 2, py >> 2);
      const d = Math.hypot(gx, gy) / (R * (1 + 0.1 * Math.sin(a * 5 + 1) + 0.06 * Math.sin(a * 11))) + (n2 - 0.5) * 0.08;
      if (d >= 1) continue;
      // Furrows: streaks out along a few directions, where things skidded to a stop
      const furrow = [250, 20, 100, 180].some((deg) => {
        const da = Math.abs(((a - (deg * Math.PI) / 180 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        return da < 0.05 && d > 0.25 && d < 0.85;
      });
      const k = furrow ? 0.5 : 0.28 * Math.min(1, (1 - d) / 0.25); // denser inside, thinning at the edge
      const th = (BAYER4[(py % 4) * 4 + (px % 4)] + 0.5) / 16;
      if (k > th * 0.6) c.set([22, 19, 18, Math.round((furrow ? 120 : 75) * Math.min(1, k * 3))], (py * GLADE_W + px) * 4);
    }
  return c;
}

function makeBedding() {
  const { sdf, material } = beddingModel();
  const img = renderBody(sdf, {
    W: BEDDING_W, H: BEDDING_H, anchor: BEDDING_ANCHOR, pxPerM: PX_PER_M, elev: ELEV, yaw: BEDDING.yaw,
    camDist: 5.5, focusZ: 0.9, ramps: BEDDING_RAMPS, material, outline: [8, 7, 6], bound: [0.1, 3.4],
  });
  const sh = new Sheet(BEDDING_W, BEDDING_H);
  sh.blit(img, BEDDING_W, BEDDING_H, 0, 0);
  save(sh, 'bedding.png');
  const decal = new Sheet(GLADE_W, GLADE_H);
  decal.blit(gladeDecal(), GLADE_W, GLADE_H, 0, 0);
  save(decal, 'bedding_decal.png');
  return {
    image: 'bedding.png', frame: [BEDDING_W, BEDDING_H], anchor: BEDDING_ANCHOR,
    decal: { image: 'bedding_decal.png', frame: [GLADE_W, GLADE_H], anchor: GLADE_ANCHOR },
    // The mattress burns at its torn end (meters, model space), and smokes
    fires: BEDDING_FIRES.map(([x, y]) => [x, y, 0.1]),
    smoke: BEDDING_FIRES.map(([x, y]) => [x + 0.1, y, 0.2]),
  };
}

// A worker: draws its share of a hero's frames, handing each back as it's done
if (!isMainThread) {
  const anims = heroAnims(workerData.packed);
  for (const job of workerData.jobs) {
    const { img, shadow, muzzle } = heroFrame(anims, job.a, job.i, job.row);
    parentPort.postMessage({ ...job, img, shadow, muzzle }, [img.buffer, shadow.buffer]);
  }
} else {
// ONLY=hero,hero_pack,pod,backpack,bed,stand,bedding regenerates just those parts and keeps the rest of the existing art
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const want = (name) => !only || only.includes(name);
fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'sprites.json');
if (!only) for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT, f)); // drop old art
// Makes a part if it's wanted (false if not), saying when it's done (the heroes their progress too)
async function part(name, make) {
  if (!want(name)) return false;
  const start = Date.now();
  const made = await make();
  console.log(`${name}: done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  return made;
}
const characters = {
  hero: await part('hero', () => makeHero('hero')),
  hero_pack: await part('hero_pack', () => makeHero('hero_pack', true)), // after finding the backpack
  bug: await part('bug', makeBug), // the creatures that come for him
};
const objects = {
  pod: await part('pod', makePod), backpack: await part('backpack', makeBackpack), bed: await part('bed', makeBed),
  stand: await part('stand', makeStand), bedding: await part('bedding', makeBedding), bag: await part('bag', () => makeBag()), bag_stand: await part('bag_stand', () => makeBag('bag_stand')), bottles: await part('bottles', makeBottles),
  campfire: await part('campfire', makeCampfire), // the safe space's
  turret: await part('turret', makeTurret), // by its campfire
  garage: await part('garage', makeGarage), // over them
  fellow: await part('fellow', makeFellow), // by it
  rocket: await part('rocket', makeRocket), crater: await part('crater', makeCrater), crater_small: await part('crater_small', makeSmallCrater),
};
// The rest comes from the existing manifest, read only now: runs for other parts (ONLY=hero and
// ONLY=hero_pack side by side) may have updated it in the meantime
const old = only && fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
// (entries this run doesn't know about stay too: a run started before they were added mustn't drop them)
const keep = (made, prev = {}) => ({ ...prev, ...Object.fromEntries(Object.entries(made).filter(([, v]) => v)) });
const manifest = { scale: 2, view: 'topdown', characters: keep(characters, old.characters), objects: keep(objects, old.objects) };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Art written to', OUT);
}
