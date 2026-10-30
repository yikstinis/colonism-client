# Colonism

Single-player top-down pixel game prototype: a night desert and a character to run around. The first task,
"Look around", is to find your backpack, lost somewhere in the dark after the crash. Quests live in `public/quests.js`.

```bash
npm install
npm run dev        # http://localhost:8787, restarts on server changes
```

Controls: WASD / arrows to run, hold Shift to crouch (and sneak, slower), Space to dodge roll, E to use things (hold it to pick something up), click to slash with the knife, hold the right button to fire the submachine gun in bursts (once armed); the hero looks at the mouse cursor (moving away from it
he backpedals, sideways he sidesteps, both slower than running).

The world is a small planet (300 m in radius, ~1.9 km round), a desert ball with no edges; the minimap in the bottom left
shows it as a globe turning under the hero, the capsule marked on it.

## Layout

- `shared/world.js` — world rules: the planet and where things are on it, collisions, movement, 8-direction facing.
- `shared/sphere.js` — sphere math: the flat chart of the planet the game plays on, re-centered on the hero.
- `public/render/globe.js` — the minimap globe.
- `server/index.js` — static file server (browsers need http for ES modules).
- `public/client.js` — the game: input, movement, top-down rendering of the world and the character.
- `public/render/ground.js` — the desert ground: a WebGL shader (dunes, wind ripples, pebbles) drawn in art pixels.
- `public/render/sprites.js` — loads PNG sprite sheets from `public/assets/sprites.json` and draws them.
- `public/render/labels.js` — names over things and the pick-up prompt (hold-E key).
- `public/render/guide.js` — the arrow on the ground around the hero pointing at the current quest's target, with the distance to it.
- `public/render/reach.js` — the knife's reach on the ground in front of the armed hero, flaring in a slash.
- `public/render/life.js` — health, the hero's and the bugs' (and the bottles' and the bag's) alike: a short red bar for each point, in rows (rings round the hero) that fade the farther out they go.
  A unit's health should ideally go no higher than **375**: that's 15 rows over it, the last just visible; past that the rows can't be seen and hits stop showing.
  The gun's magazine is shown the same way (`MAG` in `public/client.js`): a bar for each round, in arcs to the right of the aim, fading faster than health's.
  A gun's magazine should ideally hold no more than **140** rounds: that's 9 arcs, the last just visible; past about 305 (17 arcs) the rounds aren't drawn at all.
- `public/render/shots.js` — a round's muzzle flash and tracer.
- `public/sounds.js` — the sounds, made on the fly with Web Audio (no files): the gun's shots, the knife, steps and rolls, the desert's wind, fires crackling.
- `public/render/speech.js` — what the hero says, typed out over his head.
- `public/render/view.js` — top-down camera (70 degrees, same as `ELEV` in the art generator).
- `tools/make-art.mjs` — generates the art and `sprites.json` (`npm run art`, ~1.5 min):
  the hero is a smooth 3D body (`tools/lib/sdf-body.mjs`) rendered into pixel art, and so are the landing capsule,
  the backpack, the wrecked army bed by it, a crate of bottles to shoot, past it a smashed bedside table and a punching bag to try the knife on.
  Out in the West (sector D2) lies the fellow's equipment: a waist-high wooden crate with test tubes and flasks packed in it, a stone desert well by it, in a safe zone of their own; hold E to pick the crate up.

Env: `PORT`.

## Art format

All art lives in `public/assets/` and is described by `sprites.json`. Art is drawn at 1x and shown at `scale` (2x).

- **Characters** (`hero.png`, and `hero_pack.png` with the backpack, a submachine gun and a knife; both in the uniform's gold buckle and epaulettes): frames of `frame` size. One row per screen direction listed in `rows`
  (`S, SW, W, NW, N, NE, E, SE`; missing east-side rows are mirrored from the west side). Columns hold animations:
  `idle` (breathing loop), `walk` (the run), `back`, `strafeL` / `strafeR` (sidestepping to the character's left /
  right), `crouch` and `sneak`, `sneakBack`, `sneakL`, `sneakR` (crouched, still and on the move), `roll`, `pick` (squatting to pick something up) and, armed only, `slash` (a knife slash) with `slashRun`, `slashBack`, `slashL`, `slashR` (the same on the move, the legs in that gait), `aimIn` / `aimOut` (bringing the gun up and down; these played once), firing loops `fire`, `fireRun`, `fireBack`, `fireStrafeL`, `fireStrafeR` each with `-` and `+` versions aimed a little off the facing, with the gun's `muzzle` (model space); all the armed ones also crouched, with a `c` before the name (`cslash`, `cfireRun+`, ...) (`start` column, `frames`, `fps`). `anchor` is the character's position on the ground.
- **Creatures** (`bug.png`, a fat many-legged grub that crawls for the hero out of the safe zones): a character sheet like the hero's (same `rows`), with `idle` and `walk`.
- **Objects** (`pod.png`, `backpack.png`, `bed.png`, `stand.png`, ...): a single image with an `anchor`, an optional `shadow` and a ground `decal`; `bottles.png` (a crate of straw with bottles in it) has a frame for each set of its bottles still standing (`frames`, bit i of the frame: `spots[i]` stands).

To swap in real art, replace the PNGs and adjust `sprites.json` (or the generator) if sizes differ.
