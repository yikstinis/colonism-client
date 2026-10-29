// Renders a smooth, organic 3D body (signed distance field) with a perspective camera and
// per-pixel lighting, then turns it into pixel art: quantized to a hue-shifted ramp with ordered
// dithering, hard edges and a dark outline. Like pre-rendered sprites from a detailed 3D model.

// ---------- SDF primitives (meters; x = right, y = forward, z = up; the model faces +y) ----------

function sdCapsule(px, py, pz, p) {
  const pax = px - p.ax, pay = py - p.ay, paz = pz - p.az;
  const h = Math.max(0, Math.min(1, (pax * p.bx + pay * p.by + paz * p.bz) * p.inv));
  const dx = pax - p.bx * h, dy = pay - p.by * h, dz = paz - p.bz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (p.r0 + (p.r1 - p.r0) * h);
}

function sdEllipsoid(px, py, pz, p) {
  const x = px - p.cx, y = py - p.cy, z = pz - p.cz;
  const k0 = Math.sqrt((x * x) / (p.rx * p.rx) + (y * y) / (p.ry * p.ry) + (z * z) / (p.rz * p.rz));
  const k1 = Math.sqrt((x * x) / p.rx ** 4 + (y * y) / p.ry ** 4 + (z * z) / p.rz ** 4);
  return k1 === 0 ? -Math.min(p.rx, p.ry, p.rz) : (k0 * (k0 - 1)) / k1;
}

// Capped cone with flat ends from a (radius ra) to b (radius rb), after Inigo Quilez
function sdCone(px, py, pz, p) {
  const pax = px - p.ax, pay = py - p.ay, paz = pz - p.az;
  const papa = pax * pax + pay * pay + paz * paz;
  const paba = (pax * p.bx + pay * p.by + paz * p.bz) / p.baba;
  const x = Math.sqrt(Math.max(0, papa - paba * paba * p.baba));
  const cax = Math.max(0, x - (paba < 0.5 ? p.ra : p.rb));
  const cay = Math.abs(paba - 0.5) - 0.5;
  const rba = p.rb - p.ra, k = rba * rba + p.baba;
  const f = Math.max(0, Math.min(1, (rba * (x - p.ra) + paba * p.baba) / k));
  const cbx = x - p.ra - f * rba, cby = paba - f;
  const sgn = cbx < 0 && cay < 0 ? -1 : 1;
  return sgn * Math.sqrt(Math.min(cax * cax + cay * cay * p.baba, cbx * cbx + cby * cby * p.baba));
}

// Rounded box: center c, unit axes u, v, w, half sizes h (rounding included)
function sdBox(px, py, pz, p) {
  const x = px - p.cx, y = py - p.cy, z = pz - p.cz;
  const qx = Math.abs(x * p.ux + y * p.uy + z * p.uz) - p.hx;
  const qy = Math.abs(x * p.vx + y * p.vy + z * p.vz) - p.hy;
  const qz = Math.abs(x * p.wx + y * p.wy + z * p.wz) - p.hz;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.r;
}

function smin(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
}

// Tapered capsule from a to b, radius r0 at a and r1 at b
export const capsule = (a, b, r0, r1 = r0) => {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  return { kind: 0, ax: a[0], ay: a[1], az: a[2], bx, by, bz, inv: 1 / (bx * bx + by * by + bz * bz), r0, r1 };
};
export const ellipsoid = (c, r) => ({ kind: 1, cx: c[0], cy: c[1], cz: c[2], rx: r[0], ry: r[1], rz: r[2] });
// Cone with flat ends from a (radius ra) to b (radius rb)
export const cone = (a, b, ra, rb) => {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  return { kind: 2, ax: a[0], ay: a[1], az: a[2], bx, by, bz, baba: bx * bx + by * by + bz * bz, ra, rb };
};

// Box centered at c along unit axes [u, v, w] (orthogonal), half sizes h, edges rounded by r
export const box = (c, [u, v, w], h, r = 0) => ({
  kind: 3, cx: c[0], cy: c[1], cz: c[2], ux: u[0], uy: u[1], uz: u[2], vx: v[0], vy: v[1], vz: v[2], wx: w[0], wy: w[1], wz: w[2],
  hx: h[0] - r, hy: h[1] - r, hz: h[2] - r, r,
});

// groups: [{ k (blend inside the group), prims }]; groups are blended together with `join`
export function bodySdf(groups, join) {
  return (x, y, z) => {
    let total = 1e9;
    for (const g of groups) {
      let d = 1e9;
      for (const p of g.prims) {
        const di = p.kind === 0 ? sdCapsule(x, y, z, p) : p.kind === 1 ? sdEllipsoid(x, y, z, p) : p.kind === 2 ? sdCone(x, y, z, p) : sdBox(x, y, z, p);
        d = d === 1e9 ? di : smin(d, di, g.k);
      }
      total = total === 1e9 ? d : smin(total, d, join);
    }
    return total;
  };
}

// ---------- Renderer ----------

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Key light (towards the light, world space): moonlight from the left and above
export const KEY_LIGHT = [-0.7, 0.15, 0.85];
// Light for the cast shadow: the moon high above and slightly behind, so the shadow stays short,
// peeks out in front of the feet and keeps
// the shape of the pose
export const SHADOW_LIGHT = [-0.1, -0.13, 1];
const norm3 = (x, y, z) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; };

// opts: W, H, anchor [x, y] (screen point of the model origin on the ground), pxPerM (scale at
// the focus point), elev (camera elevation, radians), yaw (model rotation), camDist (meters,
// smaller = stronger perspective), focusZ, ramps (dark -> light colors per material),
// material(x, y, z) -> index into ramps (model space), outline color, bound [z, radius] (meters,
// a sphere around the model; defaults fit a standing person)
export function renderBody(sdf, o) {
  const { W, H, anchor, pxPerM, elev, yaw, camDist, focusZ, ramps } = o;
  const material = o.material ?? (() => 0);
  const ce = Math.cos(elev), se = Math.sin(elev), cy = Math.cos(yaw), sy = Math.sin(yaw);
  // World <-> model: the model is rotated by yaw around z
  const map = (x, y, z) => sdf(x * cy + y * sy, -x * sy + y * cy, z);
  // Camera looks at the focus point from the south (+y) and above
  const [fx, fy, fz] = [0, 0, focusZ];
  const [cx, cyy, cz] = [fx, fy + ce * camDist, fz + se * camDist];
  const focusSy = anchor[1] - focusZ * ce * pxPerM; // screen y of the focus point
  const L = norm3(...KEY_LIGHT);
  const R = norm3(0.4, -0.7, 0.35); // cool rim light from behind
  const V = [0, ce, se]; // towards the camera

  const normal = (x, y, z) => {
    const e = 0.002;
    return norm3(
      map(x + e, y, z) - map(x - e, y, z),
      map(x, y + e, z) - map(x, y - e, z),
      map(x, y, z + e) - map(x, y, z - e),
    );
  };

  function march(px, py) {
    // Point on the focus plane under this pixel, then a ray from the camera through it
    const dx = (px - anchor[0]) / pxPerM, dy = (py - focusSy) / pxPerM;
    const tx = fx + dx, ty = fy + se * dy, tz = fz - ce * dy; // screen down = (0, sin e, -cos e)
    let [rx, ry, rz] = norm3(tx - cx, ty - cyy, tz - cz);
    // Bounding sphere around the model
    const [bz, br] = o.bound ?? [0.95, 1.15];
    const ox = cx, oy = cyy, oz = cz - bz;
    const b = ox * rx + oy * ry + oz * rz, c = ox * ox + oy * oy + oz * oz - br * br;
    const disc = b * b - c;
    if (disc < 0) return null;
    let t = -b - Math.sqrt(disc);
    const tEnd = -b + Math.sqrt(disc);
    for (let i = 0; i < 90 && t < tEnd; i++) {
      const x = cx + rx * t, y = cyy + ry * t, z = cz + rz * t;
      const d = map(x, y, z);
      if (d < 0.0015) return [x, y, z, t];
      t += d * 0.9;
    }
    return null;
  }

  function shade(x, y, z) {
    const [nx, ny, nz] = normal(x, y, z);
    // Soft shadow towards the key light
    let sh = 1, t = 0.02;
    for (let i = 0; i < 20 && t < 0.8; i++) {
      const h = map(x + L[0] * t, y + L[1] * t, z + L[2] * t);
      sh = Math.min(sh, (10 * h) / t);
      if (sh < 0.05) break;
      t += Math.max(0.01, h);
    }
    sh = Math.max(0, Math.min(1, sh));
    // Ambient occlusion
    let ao = 0;
    for (let i = 1; i <= 4; i++) {
      const h = 0.015 * i;
      ao += (h - map(x + nx * h, y + ny * h, z + nz * h)) / (i * i);
    }
    ao = Math.max(0, Math.min(1, 1 - ao * 18));
    const dif = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]) * sh;
    const rim = Math.max(0, nx * R[0] + ny * R[1] + nz * R[2]) * (1 - Math.max(0, nx * V[0] + ny * V[1] + nz * V[2]));
    const hx = L[0] + V[0], hy = L[1] + V[1], hz = L[2] + V[2], hl = Math.hypot(hx, hy, hz);
    const spec = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl) ** 24 * sh;
    return 0.16 * ao + 0.62 * dif + 0.12 * (0.5 + 0.5 * nz) * ao + 0.35 * rim + 0.25 * spec;
  }

  const out = new Uint8ClampedArray(W * H * 4);
  const mats = new Uint8Array(W * H);
  const level = new Float32Array(W * H).fill(-1);
  const depth = new Float32Array(W * H).fill(1e9);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      // 4 rays for crisp coverage; shade the first hit
      let cover = 0, hit = null;
      for (let s = 0; s < 4; s++) {
        const h = march(px + 0.25 + 0.5 * (s & 1), py + 0.25 + 0.5 * (s >> 1));
        if (h) { cover++; hit = hit ?? h; }
      }
      if (cover < 2) continue;
      level[py * W + px] = shade(hit[0], hit[1], hit[2]);
      depth[py * W + px] = hit[3];
      mats[py * W + px] = material(hit[0] * cy + hit[1] * sy, -hit[0] * sy + hit[1] * cy, hit[2]);
    }

  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (level[i] < 0) continue;
      const ramp = ramps[mats[i]], n = ramp.length;
      let v = level[i] * (n - 1);
      // A different material next to this pixel: draw a seam (cloth edge, waistband)
      if ([[1, 0], [0, 1]].some(([ox, oy]) => level[i + oy * W + ox] >= 0 && mats[i + oy * W + ox] !== mats[i])) v -= 1;
      // Depth edges (an arm in front of the torso) get a darker contour on the far side (o.innerOutline:
      // drawn in the outline's color, as the silhouette is: parts kept apart, a hard-edged thing's)
      let edge = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (py + oy) * W + px + ox;
        if (level[j] >= 0 && depth[i] - depth[j] > 0.12) { v -= 1.6; edge = true; break; }
      }
      if (edge && o.innerOutline) {
        out.set([...o.outline, 255], i * 4);
        continue;
      }
      const th = (BAYER[(py % 4) * 4 + (px % 4)] + 0.5) / 16;
      const idx = Math.max(0, Math.min(n - 1, Math.floor(v + th)));
      out.set([...ramp[idx], 255], i * 4);
    }
  // Dark outline around the silhouette
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (level[i] >= 0) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oy]) => {
        const x = px + ox, y = py + oy;
        return x >= 0 && y >= 0 && x < W && y < H && level[y * W + x] >= 0;
      });
      if (near) out.set([...o.outline, 255], i * 4);
    }
  return out;
}

// Cast shadow of the body on the ground (z = 0) from a directional light, as seen by the same
// camera. Returns RGBA: black with alpha (dithered core + soft penumbra).
// o: W, H, anchor, pxPerM, elev, yaw, camDist, focusZ, light (towards the light, world), alpha,
// reach (meters around the origin where shadow can fall)
export function renderShadow(sdf, o) {
  const { W, H, anchor, pxPerM, elev, yaw, camDist, focusZ } = o;
  const ce = Math.cos(elev), se = Math.sin(elev), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const map = (x, y, z) => sdf(x * cy + y * sy, -x * sy + y * cy, z);
  const [cx, cyy, cz] = [0, ce * camDist, focusZ + se * camDist];
  const focusSy = anchor[1] - focusZ * ce * pxPerM;
  const L = norm3(...o.light);
  const out = new Uint8ClampedArray(W * H * 4);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      // Ray from the camera through this pixel, hitting the ground plane
      const dx = (px + 0.5 - anchor[0]) / pxPerM, dy = (py + 0.5 - focusSy) / pxPerM;
      const [rx, ry, rz] = norm3(dx - cx, se * dy - cyy, focusZ - ce * dy - cz);
      if (rz >= 0) continue;
      const t = -cz / rz;
      const gx = cx + rx * t, gy = cyy + ry * t;
      if (gx * gx + gy * gy > (o.reach ?? 2.45) ** 2) continue;
      // March from the ground towards the light; soft shadow factor (1 = lit)
      let lit = 1, s = 0.02;
      for (let i = 0; i < 48 && s < 3; i++) {
        const h = map(gx + L[0] * s, gy + L[1] * s, L[2] * s);
        lit = Math.min(lit, (8 * h) / s);
        if (lit < 0.02) break;
        s += Math.max(0.012, h);
      }
      const shade = 1 - Math.max(0, Math.min(1, lit));
      if (shade < 0.05) continue;
      // Two tones: core and penumbra, with ordered dithering between them
      const th = (BAYER[(py % 4) * 4 + (px % 4)] + 0.5) / 16;
      const a = shade > 0.6 + th * 0.3 ? 1 : shade > 0.15 + th * 0.4 ? 0.55 : 0;
      if (a) out.set([0, 0, 0, Math.round(a * o.alpha * 255)], (py * W + px) * 4);
    }
  return out;
}
