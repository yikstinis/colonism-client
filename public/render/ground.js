// The ground: a night desert drawn by a WebGL fragment shader, one fragment per art pixel (the canvas
// is upscaled with crisp pixels), so it's pixelated like the sprites. A flat sand plain with low swells
// lit by the moon, covered with wind ripples, with patches of gravel; the shade is quantized into a
// ramp of moonlit sand tones.

const VERT = `#version 300 es
in vec2 pos;
void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uCam;      // art pixel of the screen's top-left corner, relative to the world origin
uniform vec2 uOrigin;   // art pixel of the chart's origin (the planet's chart, see shared/world.js)
uniform vec2 uShift;    // the sand's pattern on the chart: where its origin falls in the pattern
uniform float uTurn;    // and how far the pattern is turned there (radians): it stays put on the planet as the chart moves
uniform float uH;       // canvas height in art pixels
uniform float uMPerPx;  // meters per art pixel
out vec4 color;

const float TONES = 12.0;
const vec3 MOON = normalize(vec3(-0.75, -0.3, 0.6)); // low, from the upper left, like the sprites' key light
const float BAYER[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);

// Integer hash of a lattice point (+ a seed), 0..1. Exact on every GPU: a float sin() hash gives
// slightly different values for the same point from neighboring cells on some GPUs, and the noise
// then shows seams along the lattice.
float hash(vec2 p, uint seed) {
  uvec2 v = uvec2(ivec2(floor(p))) + seed * uvec2(0x9E3779B9u, 0x85EBCA6Bu);
  uint h = v.x * 0x27d4eb2du ^ v.y * 0x165667b1u;
  h ^= h >> 15; h *= 0x2c1b3c6du; h ^= h >> 12; h *= 0x297a2d39u; h ^= h >> 15;
  return float(h >> 8) / 16777216.0;
}
float hash(vec2 p) { return hash(p, 0u); }
float noise(vec2 p) {
  vec2 i = floor(p), f = p - i, u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}

// Moonlit sand, t in 0..1: bluish in the shadows, a desaturated pale beige in the light
vec3 sand(float t) {
  vec3 dark = vec3(13, 14, 23), mid = vec3(70, 64, 64), light = vec3(146, 133, 114);
  return (t < 0.5 ? mix(dark, mid, t * 2.0) : mix(mid, light, t * 2.0 - 1.0)) / 255.0;
}

// The plain (meters): broad low swells, a few tens of centimeters over several meters
float ground(vec2 p) { return fbm(p * 0.06) * 1.4 + fbm(p * 0.22 + 7.0) * 0.3; }

void main() {
  vec2 screen = vec2(gl_FragCoord.x - 0.5, uH - gl_FragCoord.y - 0.5); // integer art pixel on the screen
  vec2 c = screen + uCam - uOrigin, ct = vec2(cos(uTurn), sin(uTurn));
  vec2 px = vec2(c.x * ct.x - c.y * ct.y, c.x * ct.y + c.y * ct.x) + uShift; // art pixel of the pattern
  vec2 p = px * uMPerPx;

  // Moonlight on the swells, relative to flat ground
  float e = 0.1, h = ground(p);
  vec2 grad = vec2(ground(p + vec2(e, 0)) - h, ground(p + vec2(0, e)) - h) / e;
  float v = 0.42 + (dot(normalize(vec3(-grad, 1.0)), MOON) - MOON.z) * 1.6;

  // Gravel lag in the hollows, where the wind has blown the fine sand away
  float gravel = smoothstep(0.6, 0.7, fbm(p * 0.09 + 31.0) + (0.5 - h / 1.7) * 0.25);

  // Wind ripples (wind from the west): crests across the wind, about 20 cm apart, bending around the
  // swells, splitting and merging. Each has a long gentle upwind side catching the moon and a short
  // steep lee side in shadow.
  vec2 q = p + vec2(fbm(p * 0.35), fbm(p * 0.35 + 4.7)) * 1.6;
  float phase = (q.x + q.y * 0.25 + h * 0.8) / 0.2 + fbm(p * 1.1) * 2.5;
  float f = fract(phase);
  float amp = (0.55 + 0.45 * fbm(p * 0.5 + 13.0)) * (1.0 - gravel * 0.8);
  v += (f < 0.72 ? 0.02 + 0.03 * f : -0.08) * amp;

  // Darker, coarser sand in long streaks along the wind, and a faint grain
  v -= smoothstep(0.5, 0.8, fbm(p * vec2(0.06, 0.25) + 50.0)) * 0.07;
  v += (hash(px) - 0.5) * 0.035;

  // Few tones; a light ordered dither only right at the steps between them
  float d = (BAYER[int(mod(screen.y, 4.0)) * 4 + int(mod(screen.x, 4.0))] / 16.0 - 0.5) * 0.45;
  vec3 col = sand(clamp(floor(clamp(v, 0.0, 1.0) * TONES + 0.5 + d) / TONES, 0.0, 1.0));

  // Stones: scattered thinly over the sand, packed densely on the gravel; dark rock with a moonlit
  // top-left edge and a shadow on the lower right
  float cs = gravel > 0.5 ? 5.0 : 14.0;
  vec2 cell = floor(px / cs);
  float k = hash(cell);
  if (k < (gravel > 0.5 ? 0.55 : 0.035)) {
    vec2 c = cell * cs + 1.0 + floor(vec2(hash(cell, 1u), hash(cell, 2u)) * (cs - 2.0));
    float rad = 0.6 + hash(cell, 3u) * (gravel > 0.5 ? 1.0 : 1.6);
    vec2 o = px - c;
    float tint = hash(cell, 4u);
    vec3 rock = mix(vec3(34, 31, 36), vec3(54, 46, 44), tint) / 255.0;
    if (dot(o, o) <= rad * rad + 0.3) col = o.x + o.y < -0.5 ? rock * 1.9 : rock;
    else if (dot(o - 1.0, o - 1.0) <= rad * rad + 0.3) col *= 0.65;
  }
  color = vec4(col, 1.0);
}`;

export function createGround(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) return () => {}; // no WebGL 2: the page background shows instead

  const shader = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
  const loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name) => gl.getUniformLocation(prog, name);
  const uCam = u('uCam'), uH = u('uH'), uMPerPx = u('uMPerPx'), uOrigin = u('uOrigin'), uShift = u('uShift'), uTurn = u('uTurn');

  // W, H: screen size in px; px: screen px per art px; camX, camY: screen position of the world
  // origin (a whole number of art pixels); mPerPx: meters per art pixel; ground: { origin (the
  // chart's origin), shift (where it falls in the sand's pattern), both in art pixels, turn }
  return function draw(W, H, px, camX, camY, mPerPx, ground) {
    const w = Math.ceil(W / px), h = Math.ceil(H / px);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w * px}px`;
      canvas.style.height = `${h * px}px`;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uCam, -Math.round(camX / px), -Math.round(camY / px));
    gl.uniform1f(uH, h);
    gl.uniform1f(uMPerPx, mPerPx);
    gl.uniform2f(uOrigin, ground.origin[0], ground.origin[1]);
    gl.uniform2f(uShift, ground.shift[0], ground.shift[1]);
    gl.uniform1f(uTurn, ground.turn);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}
