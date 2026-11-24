// Low-poly 3D replicas, built from code so they load instantly.
// Convention for every model: length ~1 unit, nose/bow points +Y (north before heading), up is +Z.
// Each model returns { body, glow }: body is lit and solid, glow is additive (lights, wakes, contrails).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const D = Math.PI / 180;

function paint(geo, hex, mul = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex).multiplyScalar(mul);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
const at = (geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) => {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geo.applyMatrix4(m);
};
const merge = (parts) => mergeGeometries(parts, false);
// Cylinder lying along Y (three's default) — handy for fuselages and engines.
const cyl = (r1, r2, h, seg = 14) => new THREE.CylinderGeometry(r1, r2, h, seg, 1);
const box = (w, l, h) => new THREE.BoxGeometry(w, l, h);
const ball = (r, seg = 10) => new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1));

// Flat planform shape (x = span, y = chord) extruded upward by `t`.
function plate(points, t) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  return g;
}
// Vertical shape (u = along Y, v = up Z) extruded across X.
function fin(points, t) {
  const g = plate(points, t);
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
  return g;
}
function lathe(profile, seg = 18) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}
// Soft tapered strip lying flat behind an object (contrail / wake). Bright at the start, fading out.
function streak(x, y0, len, w0, w1, z, hex, power = 1) {
  const g = new THREE.BufferGeometry();
  const steps = 8;
  const pos = [], col = [];
  const c = new THREE.Color(hex);
  for (let i = 0; i < steps; i++) {
    const a = i / steps, b = (i + 1) / steps;
    const ya = y0 - a * len, yb = y0 - b * len;
    const wa = w0 + (w1 - w0) * a, wb = w0 + (w1 - w0) * b;
    const fa = Math.pow(1 - a, 1.6) * power, fb = Math.pow(1 - b, 1.6) * power;
    const quad = [[x - wa, ya, fa], [x + wa, ya, fa], [x + wb, yb, fb], [x - wa, ya, fa], [x + wb, yb, fb], [x - wb, yb, fb]];
    for (const [px, py, f] of quad) { pos.push(px, py, z); col.push(c.r * f, c.g * f, c.b * f); }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- aircraft
export function airliner({ engines = 2, accent = '#ffd400' } = {}) {
  const white = '#f4f6fa', grey = '#b9c0cc', dark = '#2a2f3a';
  const body = [];
  // fuselage: smooth lathe, nose at +Y
  body.push(paint(lathe([[0, -0.5], [0.012, -0.49], [0.028, -0.42], [0.046, -0.3], [0.056, -0.15], [0.058, 0], [0.058, 0.3], [0.054, 0.39], [0.042, 0.45], [0.024, 0.485], [0, 0.5]]), white));
  // cockpit windows + belly
  body.push(paint(at(box(0.07, 0.035, 0.012), { y: 0.43, z: 0.032, rx: -0.5 }), dark));
  body.push(paint(at(cyl(0.0585, 0.0585, 0.62, 18), { y: 0.03, z: -0.004, sz: 0.55 }), grey));
  // swept wings with a little dihedral
  const wing = [[0, 0.1], [0.5, -0.12], [0.5, -0.17], [0.06, -0.12], [0, -0.12]];
  body.push(paint(at(plate(wing, 0.014), { z: -0.02, ry: -4 * D }), grey));
  body.push(paint(at(plate(wing.map(([x, y]) => [-x, y]).reverse(), 0.014), { z: -0.02, ry: 4 * D }), grey));
  // winglets
  body.push(paint(at(box(0.008, 0.05, 0.05), { x: 0.5, y: -0.145, z: 0.02 }), accent));
  body.push(paint(at(box(0.008, 0.05, 0.05), { x: -0.5, y: -0.145, z: 0.02 }), accent));
  // tailplane
  const tp = [[0, -0.33], [0.2, -0.44], [0.2, -0.48], [0, -0.46]];
  body.push(paint(at(plate(tp, 0.01), { z: 0.01 }), grey));
  body.push(paint(at(plate(tp.map(([x, y]) => [-x, y]).reverse(), 0.01), { z: 0.01 }), grey));
  // vertical fin in the accent colour
  body.push(paint(fin([[-0.27, 0.03], [-0.44, 0.24], [-0.5, 0.24], [-0.49, 0.03]], 0.012), accent));
  // engines under the wings
  const engX = engines === 4 ? [0.16, 0.32, -0.16, -0.32] : [0.19, -0.19];
  for (const x of engX) {
    const y = 0.06 - Math.abs(x) * 0.42;
    body.push(paint(at(cyl(0.03, 0.026, 0.15, 16), { x, y, z: -0.055 }), grey));
    body.push(paint(at(cyl(0.024, 0.024, 0.01, 16), { x, y: y + 0.076, z: -0.055 }), dark));
    body.push(paint(at(box(0.008, 0.06, 0.03), { x, y: y - 0.01, z: -0.03 }), grey));
  }
  const glow = [
    paint(at(ball(0.012, 8), { x: -0.5, y: -0.13, z: -0.01 }), '#ff2a2a', 2.2), // port: red
    paint(at(ball(0.012, 8), { x: 0.5, y: -0.13, z: -0.01 }), '#22ff66', 2.2), // starboard: green
    paint(at(ball(0.01, 8), { y: -0.5, z: 0.02 }), '#ffffff', 1.6),
  ];
  for (const x of engX) glow.push(streak(x, 0.06 - Math.abs(x) * 0.42 - 0.08, 1.1, 0.008, 0.05, -0.055, '#cfe3ff', 0.5));
  return { body: merge(body), glow: merge(glow) };
}

export function lightAircraft() {
  const white = '#f3f4f6', blue = '#3b82f6', dark = '#1f2430', grey = '#9aa3b2';
  const body = [
    paint(lathe([[0, -0.5], [0.02, -0.46], [0.04, -0.25], [0.075, 0.05], [0.08, 0.25], [0.06, 0.4], [0.03, 0.46], [0, 0.47]]), white),
    paint(at(box(0.11, 0.1, 0.05), { y: 0.18, z: 0.06 }), dark), // cabin glass
    paint(at(box(1.0, 0.16, 0.016), { y: 0.13, z: 0.09 }), white), // high wing
    paint(at(box(0.02, 0.06, 0.12), { x: 0.13, y: 0.12, z: 0.03, ry: -0.5 }), grey), // struts
    paint(at(box(0.02, 0.06, 0.12), { x: -0.13, y: 0.12, z: 0.03, ry: 0.5 }), grey),
    paint(at(box(0.34, 0.08, 0.01), { y: -0.44, z: 0.02 }), white),
    paint(fin([[-0.32, 0.02], [-0.44, 0.17], [-0.5, 0.17], [-0.5, 0.02]], 0.01), blue),
    paint(at(box(1.0, 0.03, 0.004), { y: 0.13, z: 0.1 }), blue), // stripe on the wing
    paint(at(ball(0.026, 8), { y: 0.48 }), dark), // spinner
    paint(at(box(0.012, 0.012, 0.09), { x: 0.07, y: 0.08, z: -0.09 }), dark), // gear
    paint(at(box(0.012, 0.012, 0.09), { x: -0.07, y: 0.08, z: -0.09 }), dark),
  ];
  const glow = [
    paint(at(new THREE.CircleGeometry(0.16, 24), { y: 0.49, rx: Math.PI / 2 }), '#ffffff', 0.18), // spinning prop disc
    paint(at(ball(0.012, 8), { x: -0.5, y: 0.13, z: 0.09 }), '#ff2a2a', 2.2),
    paint(at(ball(0.012, 8), { x: 0.5, y: 0.13, z: 0.09 }), '#22ff66', 2.2),
  ];
  return { body: merge(body), glow: merge(glow) };
}

export function helicopter() {
  const red = '#e23d3d', dark = '#1c2029', grey = '#8f97a6';
  const body = [
    paint(at(ball(0.16, 14), { y: 0.14, sx: 0.85, sy: 1.25, sz: 0.85 }), red),
    paint(at(ball(0.1, 12), { y: 0.26, z: 0.03, sx: 0.9, sy: 0.8, sz: 0.8 }), dark), // canopy
    paint(at(cyl(0.035, 0.018, 0.55), { y: -0.28, z: 0.04 }), red), // tail boom
    paint(fin([[-0.5, 0.0], [-0.56, 0.16], [-0.6, 0.16], [-0.58, 0.0]], 0.012), red),
    paint(at(box(0.16, 0.02, 0.008), { y: -0.46, z: 0.04 }), grey),
    paint(at(cyl(0.02, 0.02, 0.08), { z: 0.17, rx: Math.PI / 2 }), grey), // mast
    paint(at(box(0.012, 0.42, 0.012), { x: 0.1, y: 0.12, z: -0.16 }), grey), // skids
    paint(at(box(0.012, 0.42, 0.012), { x: -0.1, y: 0.12, z: -0.16 }), grey),
    paint(at(box(0.012, 0.012, 0.08), { x: 0.09, y: 0.22, z: -0.12 }), grey),
    paint(at(box(0.012, 0.012, 0.08), { x: -0.09, y: 0.04, z: -0.12 }), grey),
    paint(at(box(0.012, 0.012, 0.08), { x: -0.09, y: 0.22, z: -0.12 }), grey),
    paint(at(box(0.012, 0.012, 0.08), { x: 0.09, y: 0.04, z: -0.12 }), grey),
  ];
  const glow = [
    paint(at(ball(0.012, 8), { y: -0.6, z: 0.16 }), '#ff2a2a', 2.2),
    paint(at(new THREE.CircleGeometry(0.06, 20), { x: 0.02, y: -0.58, z: 0.08, ry: Math.PI / 2 }), '#ffffff', 0.15), // tail rotor disc
  ];
  // main rotor: own instanced mesh so it can spin
  const rotor = merge([
    paint(at(box(0.96, 0.03, 0.006), { z: 0.215 }), dark),
    paint(at(box(0.03, 0.96, 0.006), { z: 0.215 }), dark),
  ]);
  const blur = paint(at(new THREE.CircleGeometry(0.48, 32), { z: 0.218 }), '#ffffff', 0.08);
  return { body: merge(body), glow: merge([...glow, blur]), rotor };
}

// ---------------------------------------------------------------- ships
function hull(len, beam, lowHex, highHex, bow = 0.22) {
  const h = len / 2, b = beam / 2;
  const plan = [[-b * 0.92, -h], [b * 0.92, -h], [b, -h + 0.08], [b, h - bow], [b * 0.55, h - bow * 0.35], [0, h], [-b * 0.55, h - bow * 0.35], [-b, h - bow], [-b, -h + 0.08]];
  return [paint(at(plate(plan, 0.035), { z: 0.0 }), lowHex), paint(at(plate(plan, 0.03), { z: 0.032 }), highHex)];
}
function wake(len = 1.3, beam = 0.16) {
  return merge([
    streak(0, -0.5, len, beam * 0.45, beam * 1.6, 0.005, '#ffffff', 0.55),
    streak(beam * 0.4, 0.42, 0.35, 0.01, 0.06, 0.004, '#ffffff', 0.35),
    streak(-beam * 0.4, 0.42, 0.35, 0.01, 0.06, 0.004, '#ffffff', 0.35),
    paint(at(ball(0.012, 8), { y: -0.38, z: 0.24 }), '#ffffff', 2),
    paint(at(ball(0.01, 8), { y: 0.3, z: 0.1 }), '#fff3c4', 2),
  ]);
}
export function containerShip() {
  const body = hull(1, 0.16, '#a3262b', '#1d2a44');
  const colors = ['#e3522f', '#2f7de3', '#f2b705', '#2fa36b', '#d9dde3', '#8b5cf6', '#c2410c', '#0e7490'];
  let k = 0;
  for (let y = -0.22; y < 0.28; y += 0.075) {
    for (let x = -0.05; x <= 0.051; x += 0.05) {
      const tiers = 1 + ((k * 7) % 3);
      body.push(paint(at(box(0.046, 0.068, 0.022 * tiers), { x, y, z: 0.05 + 0.011 * tiers + 0.006 }), colors[(k * 5) % colors.length]));
      k++;
    }
  }
  body.push(paint(at(box(0.14, 0.07, 0.12), { y: -0.37, z: 0.12 }), '#f1f3f6')); // bridge
  body.push(paint(at(box(0.15, 0.012, 0.025), { y: -0.335, z: 0.15 }), '#1a1f29')); // bridge windows
  body.push(paint(at(box(0.05, 0.05, 0.07), { y: -0.43, z: 0.15 }), '#e3522f')); // funnel
  return { body: merge(body), glow: wake() };
}
export function tanker() {
  const body = hull(1, 0.17, '#8f1d1d', '#7a1f1f');
  body.push(paint(at(box(0.15, 0.62, 0.012), { y: 0.04, z: 0.068 }), '#6b7a3a')); // green deck
  body.push(paint(at(box(0.02, 0.6, 0.02), { y: 0.04, z: 0.085 }), '#d9dde3')); // pipe rack
  for (let y = -0.2; y < 0.3; y += 0.12) body.push(paint(at(box(0.1, 0.012, 0.03), { y, z: 0.085 }), '#d9dde3'));
  body.push(paint(at(box(0.15, 0.09, 0.14), { y: -0.36, z: 0.13 }), '#f1f3f6'));
  body.push(paint(at(box(0.16, 0.012, 0.025), { y: -0.315, z: 0.17 }), '#1a1f29'));
  body.push(paint(at(box(0.05, 0.05, 0.08), { y: -0.44, z: 0.16 }), '#1d1d1d'));
  return { body: merge(body), glow: wake() };
}
export function passengerShip() {
  const body = hull(1, 0.17, '#1d3b6b', '#f4f6fa', 0.26);
  const deck = [[0.075, 0.62], [0.07, 0.56], [0.064, 0.48], [0.056, 0.38], [0.046, 0.26]];
  deck.forEach(([w, l], i) => {
    body.push(paint(at(box(w * 2, l, 0.03), { y: -0.07 + i * 0.012, z: 0.08 + i * 0.03 }), '#f4f6fa'));
    body.push(paint(at(box(w * 2 + 0.003, l * 0.92, 0.008), { y: -0.07 + i * 0.012, z: 0.08 + i * 0.03 }), '#25466e')); // window band
  });
  body.push(paint(at(box(0.06, 0.08, 0.06), { y: -0.3, z: 0.25 }), '#1d3b6b')); // funnel
  body.push(paint(at(box(0.08, 0.08, 0.004), { y: 0.05, z: 0.235 }), '#38bdf8')); // pool
  return { body: merge(body), glow: wake(1.3, 0.17) };
}
export function smallBoat() {
  const body = hull(1, 0.28, '#e9edf2', '#e9edf2', 0.35);
  body.push(paint(at(box(0.18, 0.28, 0.12), { y: 0.02, z: 0.12 }), '#f8fafc'));
  body.push(paint(at(box(0.19, 0.05, 0.04), { y: 0.13, z: 0.14 }), '#1a1f29'));
  body.push(paint(at(cyl(0.008, 0.008, 0.24), { y: -0.05, z: 0.3, rx: Math.PI / 2 }), '#9aa3b2'));
  body.push(paint(at(box(0.3, 0.012, 0.012), { y: -0.05, z: 0.36 }), '#9aa3b2'));
  body.push(paint(at(box(0.3, 0.3, 0.01), { y: -0.28, z: 0.07 }), '#c2410c')); // working deck
  return { body: merge(body), glow: wake(0.9, 0.28) };
}

// ---------------------------------------------------------------- webcam on a mast
export function webcam() {
  const body = [
    paint(at(cyl(0.035, 0.05, 0.8), { z: 0.4, rx: Math.PI / 2 }), '#c9ced8'),
    paint(at(cyl(0.09, 0.11, 0.04), { z: 0.02, rx: Math.PI / 2 }), '#6b7280'),
    paint(at(box(0.04, 0.2, 0.04), { y: 0.08, z: 0.8 }), '#c9ced8'), // arm
    paint(at(box(0.16, 0.34, 0.15), { y: 0.2, z: 0.9, rx: -0.25 }), '#f4f6fa'), // housing
    paint(at(box(0.18, 0.38, 0.02), { y: 0.21, z: 0.985, rx: -0.25 }), '#d7dbe3'), // sun hood
    paint(at(cyl(0.05, 0.055, 0.05, 18), { y: 0.39, z: 0.855, rx: -0.25 }), '#111318'), // lens barrel
  ];
  const glow = [
    paint(at(cyl(0.035, 0.035, 0.006, 18), { y: 0.418, z: 0.848, rx: -0.25 }), '#8b9cff', 1.4), // lens glass
    paint(at(ball(0.018, 8), { x: 0.05, y: 0.32, z: 0.95 }), '#ff3030', 2.4), // recording light
    paint(at(new THREE.RingGeometry(0.16, 0.24, 40), { z: 0.004 }), '#8b9cff', 0.9), // ground halo
  ];
  return { body: merge(body), glow: merge(glow) };
}

// ---------------------------------------------------------------- earthquake beacon
export function quakeBeam() {
  // Open cylinder: bright at the base, fading to nothing at the top (additive).
  const g = new THREE.CylinderGeometry(0.06, 0.28, 1, 24, 6, true);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, 0.5);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.pow(1 - pos.getZ(i), 2.2);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export function quakeDisc() {
  const g = new THREE.CircleGeometry(1, 48, 0, Math.PI * 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    const f = Math.pow(1 - Math.min(1, r), 1.8);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = f;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.translate(0, 0, 0.002);
  return g;
}
