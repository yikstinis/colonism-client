// Sphere math for a round world. The game plays on a flat chart of the sphere around the hero:
// chart coordinates are world units, x to the screen's right and y down it, centered on the chart's
// origin. A chart is { o (the origin, a unit vector), u (the screen's up there), r (its right) }:
// tangent unit vectors. Charts are azimuthal equidistant: distances and directions from the origin are
// true, so near it the chart is the sphere, flat.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => scale(a, 1 / (Math.hypot(...a) || 1));

// v turned by angle about the unit axis (Rodrigues)
export function rotate(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

// The point on the sphere (radius R, world units) at chart coordinates (x, y)
export function toSphere(chart, x, y, R) {
  const d = Math.hypot(x, y);
  if (d < 1e-9) return chart.o;
  const t = scale(add(scale(chart.r, x), scale(chart.u, -y)), 1 / d); // the way, on the tangent plane
  return add(scale(chart.o, Math.cos(d / R)), scale(t, Math.sin(d / R)));
}

// A point on the sphere in chart coordinates
export function toChart(chart, q, R) {
  const t = add(q, scale(chart.o, -dot(q, chart.o))), len = Math.hypot(...t);
  if (len < 1e-12) return { x: 0, y: 0 }; // the origin (or its antipode, anywhere)
  const d = Math.atan2(len, dot(q, chart.o)) * R;
  return { x: (d * dot(t, chart.r)) / len, y: (-d * dot(t, chart.u)) / len };
}

// The chart at point o with the screen's up towards the pole, north up like a map (at the pole
// itself, up stays fallbackUp)
export function northChart(o, pole, fallbackUp) {
  let u = add(pole, scale(o, -dot(pole, o)));
  if (Math.hypot(...u) < 1e-9) u = fallbackUp;
  u = norm(add(u, scale(o, -dot(u, o))));
  return { o, u, r: cross(u, o) };
}

// The chart re-centered at chart point (x, y): its up and right carried there straight along the great
// circle (then, gone round a loop, the screen has turned against the ground: that's how a sphere is).
// With a pole, then set along the meridian there: north up, or south up if that's nearer to the
// carried up (past the pole, running on over it, the way on stays up the screen)
export function moveChart(chart, x, y, R, pole = null) {
  const o = toSphere(chart, x, y, R), d = Math.hypot(x, y);
  let u = chart.u;
  if (d > 1e-9) u = norm(rotate(chart.u, norm(cross(chart.o, o)), d / R));
  if (!pole) return d > 1e-9 ? { o, u, r: cross(u, o) } : chart;
  const north = northChart(o, pole, u);
  return dot(north.u, u) >= 0 ? north : { o, u: scale(north.u, -1), r: scale(north.r, -1) };
}
