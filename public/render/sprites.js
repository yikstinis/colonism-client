// Loads PNG sprite sheets described by assets/sprites.json and draws them.
//
// Characters have one row per screen direction; missing east-side rows are drawn as mirrored
// west-side rows; a character may have a cast shadow sheet with the same layout. Objects are single
// images with an optional shadow and a ground decal.

// Our facing index (shared/world.js) -> compass direction on screen (top-down: world +y is south)
const DIR_NAMES = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
const MIRROR = { E: 'W', SE: 'SW', NE: 'NW', W: 'E', SW: 'SE', NW: 'NE' };

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function loadSprites(manifestUrl) {
  const manifest = await (await fetch(manifestUrl)).json();
  const base = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  const scale = manifest.scale ?? 1;

  async function sheet(def) {
    return {
      ...def,
      image: await loadImage(base + def.image),
      fw: def.frame[0],
      fh: def.frame[1],
      anchor: def.anchor ?? [def.frame[0] / 2, def.frame[1]],
      shadow: def.shadow && (await sheet(def.shadow)),
      decal: def.decal && (await sheet(def.decal)),
    };
  }
  const loadGroup = async (group = {}) =>
    Object.fromEntries(await Promise.all(Object.entries(group).map(async ([k, v]) => [k, await sheet(v)])));
  const [characters, objects] = await Promise.all([loadGroup(manifest.characters), loadGroup(manifest.objects)]);

  // The part of an object's image that's drawn (alpha > 0) in any of its frames, in art pixels from
  // a frame's corner: frames leave room around the thing
  function inkOf(s) {
    const n = s.frames ?? 1;
    const c = document.createElement('canvas');
    c.width = s.fw * n;
    c.height = s.fh;
    const g = c.getContext('2d');
    g.drawImage(s.image, 0, 0);
    const a = g.getImageData(0, 0, s.fw * n, s.fh).data;
    let x0 = s.fw, y0 = s.fh, x1 = 0, y1 = 0;
    for (let y = 0; y < s.fh; y++)
      for (let x = 0; x < s.fw * n; x++)
        if (a[(y * s.fw * n + x) * 4 + 3]) {
          const fx = x % s.fw;
          x0 = Math.min(x0, fx); y0 = Math.min(y0, y); x1 = Math.max(x1, fx + 1); y1 = Math.max(y1, y + 1);
        }
    return { x0, y0, x1, y1 };
  }
  for (const s of Object.values(objects)) s.ink = inkOf(s);

  // k: screen px per art px (a sheet may override the manifest's scale)
  function blit(g, image, sx, sy, sw, sh, dx, dy, flip, k = scale) {
    const w = sw * k, h = sh * k;
    if (!flip) return g.drawImage(image, sx, sy, sw, sh, dx, dy, w, h);
    g.save();
    g.translate(dx + w, dy);
    g.scale(-1, 1);
    g.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
    g.restore();
  }

  // Draws frame (col, row) of sheet s with its anchor at screen (x, y), snapped to the art pixel grid
  function drawFrame(ctx, s, col, row, flip, x, y) {
    const k = s.scale ?? scale;
    const ax = flip ? s.fw - s.anchor[0] : s.anchor[0];
    const dx = Math.round((x - ax * k) / k) * k;
    const dy = Math.round((y - s.anchor[1] * k) / k) * k;
    blit(ctx, s.image, col * s.fw, row * s.fh, s.fw, s.fh, dx, dy, flip, k);
  }

  function frameOf(s, { dir, anim, time }) {
    const a = s.animations[anim] ?? s.animations.idle;
    const col = a.start + (Math.floor((time / 1000) * a.fps) % a.frames);
    const compass = DIR_NAMES[dir ?? 0];
    let row = s.rows.indexOf(compass), flip = false;
    if (row < 0) {
      row = Math.max(0, s.rows.indexOf(MIRROR[compass]));
      flip = true;
    }
    return { col, row, flip };
  }

  return {
    scale,

    // Draws a character frame with its feet (anchor) at screen (x, y)
    drawCharacter(ctx, name, opts) {
      const s = characters[name];
      const { col, row, flip } = frameOf(s, opts);
      drawFrame(ctx, s, col, row, flip, opts.x, opts.y);
    },

    // The character's cast shadow on the ground (same frame as drawCharacter); returns false if none
    drawCharacterShadow(ctx, name, opts) {
      const s = characters[name];
      if (!s.shadow) return false;
      const { col, row, flip } = frameOf(s, opts);
      drawFrame(ctx, s.shadow, col, row, flip, opts.x, opts.y);
      return true;
    },

    object: (name) => objects[name],

    // An object's layers, each with its anchor at screen (x, y): 'decal' (on the ground, under
    // everything), 'shadow' (under bodies) or 'body' (its frame-th frame, if it has several)
    drawObject(ctx, name, layer, x, y, alpha = 1, frame = 0) {
      const s = objects[name];
      const sheet = layer === 'body' ? s : s[layer];
      if (!sheet) return;
      ctx.globalAlpha = alpha;
      drawFrame(ctx, sheet, layer === 'body' ? frame : 0, 0, false, x, y);
      ctx.globalAlpha = 1;
    },

    // Screen rectangle an object's body covers when its anchor is at (x, y)
    // Screen rectangle an object's drawn pixels cover when its anchor is at (x, y)
    // A character's animation as the manifest has it ({ start, frames, fps, ... }), or undefined
    animation: (name, anim) => characters[name].animations[anim],

    // How high a character stands on screen (px over its feet): the top of what's drawn of it standing
    // still facing the camera (its idle frames, the first row): so what's stacked over it goes as over a
    // thing (see objectInk), steady whatever it does
    characterTop(name) {
      const s = characters[name];
      if (s.top === undefined) {
        const a = s.animations.idle, c = document.createElement('canvas');
        c.width = s.fw * a.frames;
        c.height = s.fh;
        const g = c.getContext('2d');
        g.drawImage(s.image, a.start * s.fw, 0, s.fw * a.frames, s.fh, 0, 0, s.fw * a.frames, s.fh);
        const px = g.getImageData(0, 0, c.width, c.height).data;
        let y0 = s.fh;
        for (let y = 0; y < s.fh && y0 === s.fh; y++)
          for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3]) { y0 = y; break; }
        s.top = (s.anchor[1] - y0) * (s.scale ?? scale);
      }
      return s.top;
    },

    objectInk(name, x, y) {
      const s = objects[name], k = s.scale ?? scale, i = s.ink;
      return { x0: x + (i.x0 - s.anchor[0]) * k, y0: y + (i.y0 - s.anchor[1]) * k, x1: x + (i.x1 - s.anchor[0]) * k, y1: y + (i.y1 - s.anchor[1]) * k };
    },

    objectBounds(name, x, y) {
      const s = objects[name], k = s.scale ?? scale;
      return { x0: x - s.anchor[0] * k, y0: y - s.anchor[1] * k, x1: x + (s.fw - s.anchor[0]) * k, y1: y + (s.fh - s.anchor[1]) * k };
    },
  };
}
