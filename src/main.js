import Globe from 'globe.gl';
import * as THREE from 'three';
import * as M from './models.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const D = Math.PI / 180;
const status = (t) => { $('status').textContent = t; };
const on = (id) => $(id).checked;

// ------------------------------------------------------------------ globe + imagery
const IMG = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.6/example/img/';
const ESRI = (x, y, l) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${l}/${y}/${x}`;
const nasaDay = () => new Date(Date.now() - 36 * 3600e3).toISOString().slice(0, 10);
const NASA = (day) => (x, y, l) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${day}/GoogleMapsCompatible_Level9/${l}/${y}/${x}.jpg`;

const el = $('globe');
const globe = new Globe(el, { animateIn: true })
  .backgroundImageUrl(IMG + 'night-sky.png')
  .globeImageUrl(IMG + 'earth-blue-marble.jpg')
  .globeTileEngineUrl(ESRI)
  .globeTileEngineMaxLevel(17)
  .showAtmosphere(true)
  .atmosphereColor('#7cc4ff')
  .atmosphereAltitude(0.16)
  .ringColor((d) => (t) => `rgba(${d.rgb},${(1 - t) * 0.9})`)
  .ringMaxRadius('maxR')
  .ringPropagationSpeed('speed')
  .ringRepeatPeriod('period')
  .ringAltitude(0.0015);

const R = globe.getGlobeRadius();
const scene = globe.scene();
const camera = globe.camera();
const renderer = globe.renderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const controls = globe.controls();
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomSpeed = 0.9;
controls.minDistance = R * 1.004;
globe.pointOfView({ lat: 21.5, lng: 72.5, altitude: 2.3 }, 0);

let userMoved = false;
['pointerdown', 'wheel', 'touchstart'].forEach((ev) => el.addEventListener(ev, () => {
  controls.autoRotate = false;
  userMoved = true;
  if (follow) stopFollow();
}, { passive: true }));
addEventListener('resize', () => globe.width(innerWidth).height(innerHeight));

// Map style dropdown
$('style').onchange = () => {
  const v = $('style').value;
  if (v === 'sat') {
    globe.globeTileEngineUrl(ESRI).globeTileEngineMaxLevel(17);
    status('Sharp satellite photos: zoom all the way in to see streets.');
  } else if (v === 'nasa') {
    const day = nasaDay();
    globe.globeTileEngineUrl(NASA(day)).globeTileEngineMaxLevel(9);
    status(`NASA Terra satellite view of the whole Earth from ${day} (clouds included).`);
  } else {
    globe.globeTileEngineUrl(null);
    status('Classic Blue Marble.');
  }
  globe.globeTileEngineClearCache?.();
  $('credit-img').textContent = v === 'sat' ? 'Esri, Maxar, Earthstar Geographics' : v === 'nasa' ? 'NASA GIBS' : 'NASA Blue Marble';
};

// ------------------------------------------------------------------ instanced 3D fleets
const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.5 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
const ZAXIS = new THREE.Vector3(0, 0, 1);

function instanced(geo, mat, cap) {
  const m = new THREE.InstancedMesh(geo, mat, cap);
  m.count = 0;
  m.frustumCulled = false;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(m);
  return m;
}

class Fleet {
  constructor(model, cap, size) {
    this.items = [];
    this.size = size;
    this.parts = [instanced(model.body, bodyMat, cap), instanced(model.glow, glowMat, cap)];
    this.rotor = model.rotor ? instanced(model.rotor, bodyMat, cap) : null;
  }
  set visible(v) { this.parts.forEach((p) => { p.visible = v; }); if (this.rotor) this.rotor.visible = v; }
  draw(scaleBase, t) {
    const n = Math.min(this.items.length, this.parts[0].instanceMatrix.count);
    const s = scaleBase * this.size;
    for (let i = 0; i < n; i++) {
      const d = this.items[i];
      const c = globe.getCoords(d.dlat, d.dlng, d.altR + (s * 0.08) / R);
      tmpP.set(c.x, c.y, c.z);
      tmpE.set(-d.dlat * D, d.dlng * D, 0, 'YXZ');
      tmpQ.setFromEuler(tmpE);
      tmpQ2.setFromAxisAngle(ZAXIS, -(d.heading || 0) * D);
      tmpQ.multiply(tmpQ2);
      tmpS.set(s, s, s);
      tmpM.compose(tmpP, tmpQ, tmpS);
      d.pos = d.pos || new THREE.Vector3();
      d.pos.copy(tmpP);
      for (const p of this.parts) p.setMatrixAt(i, tmpM);
      if (this.rotor) {
        tmpQ2.setFromAxisAngle(ZAXIS, t * 0.03 + i);
        tmpQ.multiply(tmpQ2);
        tmpM.compose(tmpP, tmpQ, tmpS);
        this.rotor.setMatrixAt(i, tmpM);
      }
    }
    for (const p of this.parts) { p.count = n; p.instanceMatrix.needsUpdate = true; }
    if (this.rotor) { this.rotor.count = n; this.rotor.instanceMatrix.needsUpdate = true; }
  }
}

const fleets = {
  jet: new Fleet(M.airliner(), 600, 1),
  heavy: new Fleet(M.airliner({ engines: 4, accent: '#ff9f5a' }), 200, 1.35),
  light: new Fleet(M.lightAircraft(), 300, 0.55),
  heli: new Fleet(M.helicopter(), 150, 0.6),
  cargo: new Fleet(M.containerShip(), 400, 1.15),
  tanker: new Fleet(M.tanker(), 200, 1.15),
  passenger: new Fleet(M.passengerShip(), 100, 1.15),
  small: new Fleet(M.smallBoat(), 300, 0.55),
  cam: new Fleet(M.webcam(), 100, 0.9),
};
const FLIGHT_FLEETS = ['jet', 'heavy', 'light', 'heli'];
const SHIP_FLEETS = ['cargo', 'tanker', 'passenger', 'small'];

// Earthquake beacons: a glowing disc on the ground + a fading light beam, coloured by magnitude.
const quakeBeam = instanced(M.quakeBeam(), beamMat, 2000);
const quakeDisc = instanced(M.quakeDisc(), beamMat, 2000);
const quakeColor = (m) => (m >= 6 ? '#ff2d2d' : m >= 4.5 ? '#ff7a3c' : m >= 3.5 ? '#ffb238' : '#ffe066');

// ------------------------------------------------------------------ aircraft names
const TYPES = {
  A20N: 'Airbus A320neo', A21N: 'Airbus A321neo', A319: 'Airbus A319', A320: 'Airbus A320', A321: 'Airbus A321', A332: 'Airbus A330-200',
  A333: 'Airbus A330-300', A339: 'Airbus A330-900neo', A359: 'Airbus A350-900', A35K: 'Airbus A350-1000', A388: 'Airbus A380', A306: 'Airbus A300',
  B737: 'Boeing 737-700', B738: 'Boeing 737-800', B739: 'Boeing 737-900', B38M: 'Boeing 737 MAX 8', B39M: 'Boeing 737 MAX 9', B744: 'Boeing 747-400',
  B748: 'Boeing 747-8', B752: 'Boeing 757-200', B763: 'Boeing 767-300', B772: 'Boeing 777-200', B77W: 'Boeing 777-300ER', B77L: 'Boeing 777-200LR',
  B788: 'Boeing 787-8', B789: 'Boeing 787-9', B78X: 'Boeing 787-10', AT72: 'ATR 72', AT76: 'ATR 72-600', DH8D: 'Dash 8 Q400', E190: 'Embraer E190',
  E195: 'Embraer E195', CRJ9: 'Bombardier CRJ900', C172: 'Cessna 172', C208: 'Cessna Caravan', P28A: 'Piper Cherokee', DA40: 'Diamond DA40',
  PC12: 'Pilatus PC-12', C17: 'Boeing C-17', C130: 'Lockheed C-130', A400: 'Airbus A400M', AS50: 'Airbus H125', EC35: 'Airbus H135', B06: 'Bell 206', R44: 'Robinson R44',
};
const HEAVY = /^(A33|A34|A35|A38|B74|B76|B77|B78|IL96|A400|C17|AN12|AN22|AN24|MD11)/;
const LIGHT = /^(C1[5-9]|C2[0-9]|P28|PA|DA[24]|SR2|BE[0-9]|M20|TB|PC6|PC12|C208|DR4|G1|ULAC|GLID)/;
const HELI = /^(AS|EC|H1|H6|B0|B4|R22|R44|R66|S76|A109|A139|MI8|MI17|AW1|UH|CH|H160)/;
function flightKind(f) {
  const c = f.cat || '', t = f.type || '';
  if (c === 'A7' || HELI.test(t)) return 'heli';
  if (c === 'A5' || HEAVY.test(t)) return 'heavy';
  if (c === 'A1' || c === 'B1' || c === 'B4' || LIGHT.test(t)) return 'light';
  return 'jet';
}

// ------------------------------------------------------------------ movement: smooth dead reckoning
// Each object keeps its last real fix and moves forward with its own speed and heading,
// so planes and ships glide smoothly instead of jumping every refresh.
function predict(d, now) {
  const dt = Math.min(now - d.t0, 120e3) / 1000;
  const nm = (d.speed || 0) * dt / 3600;
  const h = (d.heading || 0) * D;
  const lat = d.lat0 + (nm * Math.cos(h)) / 60;
  const lng = d.lng0 + (nm * Math.sin(h)) / (60 * Math.max(0.05, Math.cos(lat * D)));
  return [lat, lng];
}
function merge(list, incoming, now, extra) {
  const old = new Map(list.map((d) => [d.id, d]));
  return incoming.map((n) => {
    const o = old.get(n.id);
    const d = { ...n, ...extra(n), lat0: n.lat, lng0: n.lng, t0: now - (n.age || 0) * 1000, offLat: 0, offLng: 0, tc: now };
    if (o) {
      const [plat, plng] = predict(d, now);
      d.offLat = o.dlat - plat;
      d.offLng = o.dlng - plng;
      if (Math.abs(d.offLat) > 1 || Math.abs(d.offLng) > 1) { d.offLat = 0; d.offLng = 0; }
      d.pos = o.pos;
    }
    [d.dlat, d.dlng] = predict(d, now);
    d.dlat += d.offLat; d.dlng += d.offLng;
    return d;
  });
}
function step(list, now) {
  for (const d of list) {
    const [lat, lng] = predict(d, now);
    const k = Math.exp(-(now - d.tc) / 1500);
    d.dlat = lat + d.offLat * k;
    d.dlng = lng + d.offLng * k;
  }
}

// ------------------------------------------------------------------ data
const state = { quakes: [], flights: [], ships: [], cams: [], center: { lat: 21.5, lng: 72.5 }, updated: 0 };

async function getJSON(url) {
  const r = await fetch(url);
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, d };
}
async function loadQuakes() {
  try {
    const { d } = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson');
    state.quakes = (d.features || []).map((f) => {
      const [lng, lat, depth] = f.geometry.coordinates;
      const p = f.properties;
      const mag = p.mag || 0;
      const col = new THREE.Color(quakeColor(mag));
      return {
        id: f.id, kind: 'quake', lat, lng, dlat: lat, dlng: lng, mag, depth, place: p.place, time: p.time, url: p.url, tsunami: p.tsunami, felt: p.felt,
        color: col, rgb: `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`,
        maxR: 1 + mag * 0.9, speed: 1.2 + mag * 0.25, period: 2600 - mag * 180,
        label: `M${mag.toFixed(1)} · ${p.place || ''}`,
      };
    });
    globe.ringsData(on('l-quake') ? state.quakes.filter((q) => q.mag >= 4) : []);
    $('c-quake').textContent = state.quakes.length;
  } catch {
    status('Earthquake feed did not answer. Retrying in 5 minutes.');
  }
}
function sortFlights() {
  for (const k of FLIGHT_FLEETS) fleets[k].items = [];
  for (const f of state.flights) fleets[f.model].items.push(f);
}
function sortShips() {
  for (const k of SHIP_FLEETS) fleets[k].items = [];
  for (const s of state.ships) (fleets[s.kind2] || fleets.cargo).items.push(s);
}
async function loadFlights(c) {
  const { ok, d } = await getJSON(`/api/flights?lat=${c.lat}&lon=${c.lng}&nm=250`);
  if (!ok) return d.error || 'flights unavailable';
  const now = performance.now();
  state.flights = merge(state.flights.filter((f) => near(f, c)), d.flights || [], now, (f) => ({
    kind: 'flight', model: flightKind(f),
    altR: f.ground ? 0.00002 : 0.0003 + (Math.min(Math.max(f.alt, 0), 45000) / 45000) * 0.0045,
    label: f.call,
  }));
  sortFlights();
  $('c-flight').textContent = state.flights.length;
  return `${state.flights.length} flights`;
}
async function loadShips(c) {
  const { ok, d } = await getJSON(`/api/ships?lat=${c.lat}&lon=${c.lng}`);
  if (!ok) return d.error || 'ships unavailable';
  const now = performance.now();
  state.ships = merge(state.ships.filter((s) => near(s, c)), d.ships || [], now, (s) => ({ kind: 'ship', kind2: s.kind || 'cargo', altR: 0.00001, label: s.name }));
  sortShips();
  $('c-ship').textContent = state.ships.length;
  return state.ships.length || !d.error ? `${state.ships.length} ships` : d.error;
}
async function loadCams(c) {
  const { ok, d } = await getJSON(`/api/webcams?lat=${c.lat}&lon=${c.lng}`);
  if (!ok) return d.error || 'webcams unavailable';
  const seen = new Set(state.cams.map((w) => w.id));
  for (const w of d.webcams || []) if (!seen.has(w.id)) state.cams.push({ ...w, kind: 'cam', dlat: w.lat, dlng: w.lng, altR: 0.000005, heading: 0, label: w.title });
  state.cams = state.cams.slice(-100);
  fleets.cam.items = state.cams;
  $('c-cam').textContent = state.cams.length;
  return `${(d.webcams || []).length} webcams`;
}
const near = (o, c) => Math.abs(o.lat - c.lat) < 6 && Math.abs(o.lng - c.lng) < 8;
function viewCenter() {
  const pov = globe.pointOfView();
  return { lat: +pov.lat.toFixed(3), lng: +((((pov.lng + 540) % 360) - 180).toFixed(3)), alt: pov.altitude };
}
let loading = false;
async function loadHere(reason) {
  if (loading) return;
  loading = true;
  const c = viewCenter();
  state.center = c;
  status(reason === 'auto' ? 'Updating this area…' : `Looking around ${c.lat}, ${c.lng}…`);
  const jobs = [];
  if (on('l-flight')) jobs.push(loadFlights(c));
  if (on('l-ship')) jobs.push(loadShips(c));
  if (on('l-cam')) jobs.push(loadCams(c));
  const out = await Promise.allSettled(jobs);
  loading = false;
  state.updated = Date.now();
  status(out.map((o) => (o.status === 'fulfilled' ? o.value : 'one feed failed')).join(' · ') || 'Turn on a layer first.');
}

// Auto-load when the user settles on an area.
let settleTimer = 0;
globe.onZoom(() => {
  updateHud();
  if (!$('auto').checked || !userMoved) return;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const c = viewCenter();
    if (c.alt > 1.3) return;
    if (Math.abs(c.lat - state.center.lat) > 1.5 || Math.abs(c.lng - state.center.lng) > 2 || !state.updated) loadHere('auto');
  }, 900);
});
setInterval(() => {
  if (!state.updated || document.hidden) return;
  if (on('l-flight')) loadFlights(state.center).catch(() => {});
}, 15e3);
setInterval(() => { if (!document.hidden) loadQuakes(); }, 5 * 60e3);

// ------------------------------------------------------------------ render loop
const labelsEl = $('labels');
const labelPool = [];
const v3 = new THREE.Vector3();
function camAlt() { return camera.position.length() / R - 1; }
function visibleOnGlobe(p) { return p.dot(camera.position) > R * R * 0.995; }
function toScreen(p) {
  v3.copy(p).project(camera);
  return { x: (v3.x * 0.5 + 0.5) * innerWidth, y: (-v3.y * 0.5 + 0.5) * innerHeight, front: v3.z < 1 };
}
function allObjects() {
  const out = [];
  if (on('l-flight')) out.push(...state.flights);
  if (on('l-ship')) out.push(...state.ships);
  if (on('l-cam')) out.push(...state.cams);
  if (on('l-quake')) out.push(...state.quakes);
  return out;
}

let hudTick = 0;
function frame(t) {
  const now = performance.now();
  step(state.flights, now);
  step(state.ships, now);
  const a = camAlt();
  const base = 2.6 * Math.pow(Math.max(a, 0.004), 0.82); // model size in globe units, grows less than the zoom
  FLIGHT_FLEETS.forEach((k) => { fleets[k].visible = on('l-flight'); fleets[k].draw(base, t); });
  SHIP_FLEETS.forEach((k) => { fleets[k].visible = on('l-ship'); fleets[k].draw(base, t); });
  fleets.cam.visible = on('l-cam');
  fleets.cam.draw(base, t);
  glowMat.opacity = 0.75 + 0.25 * Math.sin(t * 0.006);

  // quakes
  const qs = on('l-quake') ? state.quakes : [];
  const qb = Math.pow(Math.max(a, 0.004), 0.82);
  quakeBeam.visible = quakeDisc.visible = qs.length > 0;
  qs.forEach((q, i) => {
    const c = globe.getCoords(q.lat, q.lng, 0.0004);
    tmpP.set(c.x, c.y, c.z);
    q.pos = q.pos || new THREE.Vector3();
    q.pos.copy(tmpP);
    tmpE.set(-q.lat * D, q.lng * D, 0, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    const pulse = 1 + 0.08 * Math.sin(t * 0.004 + i);
    const w = qb * (0.5 + q.mag * 0.35) * pulse;
    tmpS.set(w * 0.35, w * 0.35, qb * (1.2 + q.mag * q.mag * 0.32));
    tmpM.compose(tmpP, tmpQ, tmpS);
    quakeBeam.setMatrixAt(i, tmpM);
    quakeBeam.setColorAt(i, q.color);
    tmpS.set(w, w, 1);
    tmpM.compose(tmpP, tmpQ, tmpS);
    quakeDisc.setMatrixAt(i, tmpM);
    quakeDisc.setColorAt(i, q.color);
  });
  quakeBeam.count = quakeDisc.count = qs.length;
  for (const m of [quakeBeam, quakeDisc]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

  if (follow) {
    const d = follow;
    globe.pointOfView({ lat: d.dlat, lng: d.dlng, altitude: Math.min(globe.pointOfView().altitude, 0.25) }, 0);
  }
  drawLabels(a);
  if (++hudTick % 12 === 0) updateHud();
  requestAnimationFrame(frame);
}

function drawLabels(a) {
  let used = 0;
  if (a < 0.9) {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    const cand = [];
    for (const o of allObjects()) {
      if (!o.pos || !visibleOnGlobe(o.pos)) continue;
      const s = toScreen(o.pos);
      if (!s.front || s.x < 0 || s.y < 0 || s.x > innerWidth || s.y > innerHeight) continue;
      cand.push([Math.hypot(s.x - cx, s.y - cy), o, s]);
    }
    cand.sort((x, y) => x[0] - y[0]);
    const max = a < 0.3 ? 40 : 18;
    const placed = [];
    for (const [, o, s] of cand) {
      if (used >= max) break;
      if (placed.some((p) => Math.abs(p.x - s.x) < 92 && Math.abs(p.y - s.y) < 20)) continue;
      placed.push(s);
      let elx = labelPool[used];
      if (!elx) { elx = document.createElement('div'); elx.className = 'lbl'; labelsEl.appendChild(elx); labelPool.push(elx); }
      const text = o.kind === 'flight' ? `${o.call}${o.alt && !o.ground ? ' · ' + Math.round(o.alt / 100) * 100 + ' ft' : ''}` : o.kind === 'quake' ? `M${o.mag.toFixed(1)}` : o.label;
      if (elx.textContent !== text) elx.textContent = text;
      elx.dataset.k = o.kind;
      elx.style.transform = `translate(${Math.round(s.x + 12)}px,${Math.round(s.y - 9)}px)`;
      elx.style.display = 'block';
      used++;
    }
  }
  for (let i = used; i < labelPool.length; i++) labelPool[i].style.display = 'none';
}

// ------------------------------------------------------------------ picking: nearest object on screen
function pick(x, y, radius = 24) {
  let best = null, bd = radius;
  for (const o of allObjects()) {
    if (!o.pos || !visibleOnGlobe(o.pos)) continue;
    const s = toScreen(o.pos);
    const dd = Math.hypot(s.x - x, s.y - y);
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}
let down = null;
el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
el.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
  const o = pick(e.clientX, e.clientY, e.pointerType === 'touch' ? 34 : 24);
  if (o) openDetails(o);
});
const tip = $('tip');
let hoverRaf = 0;
el.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const o = pick(e.clientX, e.clientY);
    el.style.cursor = o ? 'pointer' : '';
    if (!o) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.textContent = o.kind === 'flight' ? `${o.call} · ${TYPES[o.type] || o.type || 'aircraft'}` : o.kind === 'quake' ? `M${o.mag.toFixed(1)} · ${o.place}` : o.label;
    tip.style.transform = `translate(${e.clientX + 14}px,${e.clientY + 14}px)`;
  });
});
el.addEventListener('pointerleave', () => { tip.hidden = true; });

// ------------------------------------------------------------------ details card + follow
const card = $('card'), body = $('card-body');
let follow = null;
function stopFollow() { follow = null; const b = $('follow'); if (b) b.textContent = 'Follow'; }
function openCard(html) { body.innerHTML = html; card.classList.add('open'); }
$('close').onclick = () => { card.classList.remove('open'); body.innerHTML = ''; stopFollow(); };
const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
const row = (k, v) => (v == null || v === '' ? '' : `<div><dt>${k}</dt><dd>${v}</dd></div>`);

function openDetails(o) {
  stopFollow();
  if (o.kind === 'flight') {
    openCard(`<p class="kicker">Aircraft · live</p><h2>${esc(o.call)}</h2>
      <div class="photo" id="photo"></div>
      <dl>${row('Type', o.type ? esc(TYPES[o.type] || o.type) : null)}${row('Registration', esc(o.reg))}
      ${row('Altitude', o.ground ? 'On the ground' : Math.round(o.alt).toLocaleString() + ' ft')}
      ${row('Speed', o.speed != null ? Math.round(o.speed) + ' kt' : null)}${row('Heading', o.heading != null ? Math.round(o.heading) + '°' : null)}
      ${row('Climb', o.vrate ? (o.vrate > 0 ? '+' : '') + Math.round(o.vrate) + ' ft/min' : null)}</dl>
      <button class="btn" id="follow" type="button">Follow</button>`);
    loadPhoto(o);
  } else if (o.kind === 'ship') {
    openCard(`<p class="kicker">Ship · live AIS</p><h2>${esc(o.name)}</h2>
      <dl>${row('Type', esc({ cargo: 'Cargo', tanker: 'Tanker', passenger: 'Passenger', small: 'Small vessel' }[o.kind2 || o.kind] || o.kind))}
      ${row('Speed', o.speed != null ? o.speed.toFixed(1) + ' kn' : null)}${row('Heading', o.heading != null ? Math.round(o.heading) + '°' : null)}
      ${row('Length', o.len ? o.len + ' m' : null)}${row('Destination', esc(o.dest))}${row('MMSI', esc(o.id))}</dl>
      <button class="btn" id="follow" type="button">Follow</button>`);
  } else if (o.kind === 'quake') {
    openCard(`<p class="kicker">Earthquake · ${ago(o.time)}</p><h2>M${o.mag.toFixed(1)}</h2>
      <p class="meta">${esc(o.place)}</p>
      <dl>${row('Depth', Math.round(o.depth) + ' km')}${row('Time', new Date(o.time).toLocaleString())}${row('Felt reports', o.felt)}${row('Tsunami alert', o.tsunami ? 'Yes' : null)}</dl>
      <a class="btn ghost" href="${esc(o.url)}" target="_blank" rel="noopener">USGS report</a>`);
    globe.pointOfView({ lat: o.lat, lng: o.lng, altitude: Math.min(globe.pointOfView().altitude, 0.8) }, 1200);
  } else if (o.kind === 'cam') {
    const media = o.player && /^https:\/\//.test(o.player)
      ? `<iframe src="${esc(o.player)}" title="${esc(o.title)}" allow="autoplay; fullscreen" loading="lazy"></iframe>`
      : (o.image ? `<img src="${esc(o.image)}" alt="${esc(o.title)}">` : '');
    openCard(`<p class="kicker">Public webcam</p><h2>${esc(o.title)}</h2><p class="meta">${esc([o.city, o.country].filter(Boolean).join(', '))}</p>${media}`);
    globe.pointOfView({ lat: o.lat, lng: o.lng, altitude: 0.05 }, 1400);
  }
  const fb = $('follow');
  if (fb) fb.onclick = () => {
    if (follow === o) return stopFollow();
    controls.autoRotate = false;
    globe.pointOfView({ lat: o.dlat, lng: o.dlng, altitude: 0.12 }, 1000);
    setTimeout(() => { follow = o; fb.textContent = 'Stop following'; }, 1000);
  };
}
// Real photo of this exact aircraft, by registration (Planespotters.net, credited).
async function loadPhoto(o) {
  const box = $('photo');
  if (!box || !o.id) return;
  try {
    const r = await fetch(`https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(o.id)}`);
    const d = await r.json();
    const p = d.photos && d.photos[0];
    if (!p || $('photo') !== box) return;
    box.innerHTML = `<a href="${esc(p.link)}" target="_blank" rel="noopener"><img src="${esc(p.thumbnail_large.src)}" alt="Photo of ${esc(o.call)}"></a>
      <span>Photo © ${esc(p.photographer)} · Planespotters.net</span>`;
  } catch { /* no photo, that's fine */ }
}

// ------------------------------------------------------------------ HUD, search, layers
function updateHud() {
  const c = viewCenter();
  const km = Math.round(c.alt * 6371);
  $('hud').textContent = `${Math.abs(c.lat).toFixed(2)}°${c.lat >= 0 ? 'N' : 'S'}  ${Math.abs(c.lng).toFixed(2)}°${c.lng >= 0 ? 'E' : 'W'}  ·  ${km.toLocaleString()} km up`;
}
$('search').onsubmit = async (e) => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  status(`Finding ${q}…`);
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q));
    const d = await r.json();
    if (!d.length) return status(`No place found for "${q}".`);
    controls.autoRotate = false;
    userMoved = true;
    stopFollow();
    globe.pointOfView({ lat: +d[0].lat, lng: +d[0].lon, altitude: 0.35 }, 1800);
    setTimeout(() => loadHere(), 1900);
  } catch { status('Search failed. Drag the globe there instead.'); }
};
$('here').onclick = () => loadHere();
['l-flight', 'l-ship', 'l-cam'].forEach((id) => { $(id).onchange = () => { if (on(id) && state.updated) loadHere('auto'); }; });
$('l-quake').onchange = () => globe.ringsData(on('l-quake') ? state.quakes.filter((q) => q.mag >= 4) : []);
$('min').onclick = () => {
  const min = $('panel').classList.toggle('min');
  $('min').textContent = min ? 'Show' : 'Hide';
  $('min').setAttribute('aria-expanded', String(!min));
};

loadQuakes();
updateHud();
requestAnimationFrame(frame);
status('Drag to spin, scroll to zoom. Search a city or zoom into a region: flights load on their own.');
window.__gv = { globe, state, fleets };
