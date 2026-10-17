import * as THREE from 'three';
import { buildTrack, N, CHECKPOINTS } from './track.js';
import { MAPS, MAP_IDS, MAP_BY_ID } from './maps.js';
import { Car, syncMesh, REF_TOP } from './car.js';
import { VEHICLES, VEHICLE_IDS, makeVehicleMesh } from './vehicles.js';
import { Particles, Sound, Weather } from './fx.js';

// ---------- Settings ----------
const APP_ID = 'jasonphe-crash-circuit';
const MAX_CARS = 8;
const STEP = 1 / 60;                  // physics step
const SEND_EVERY = 1 / 15;            // car state broadcasts per second
const COUNTDOWN_MS = 4200;
const BOX_BACK_MS = 4000;             // item boxes respawn after this
const FINISH_GRACE = 30;              // seconds the race keeps going after the first finisher
const BOT_GRACE = 8;                  // ...or after the last human finishes, for bots to come in
const COLORS = ['#e03131', '#1c7ed6', '#fab005', '#2f9e44', '#7048e8', '#f06595', '#12b886', '#fd7e14', '#e9ecef', '#343a40'];
const BOT_NAMES = ['Rusty', 'Blitz', 'Nitro', 'Dozer', 'Vex', 'Sparky', 'Moxie'];
const ITEMS = {
  missile: { icon: '🚀', name: 'Missile' },
  mine: { icon: '💣', name: 'Mine' },
  shield: { icon: '🛡️', name: 'Shield' },
  boost: { icon: '⚡', name: 'Nitro' },
  repair: { icon: '🔧', name: 'Repair kit' },
  wave: { icon: '💥', name: 'Shockwave' },
};
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
const cleanVehicle = v => VEHICLES[v] ? v : 'racer';
const dev = { auto: params.has('auto') };   // ?dev&auto: my car drives itself

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};
const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanColor = c => /^#[0-9a-f]{6}$/i.test(c) ? c : COLORS[0];
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const r2 = v => Math.round(v * 100) / 100;
const now = () => performance.now();
const ordinal = n => ['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th';
const fmtTime = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
const texts = new Map();
function setText(id, v) { if (texts.get(id) !== v) { texts.set(id, v); $(id).innerHTML = v; } }

// ---------- Scene ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc7e0f7, 160, 1100);
const camera = new THREE.PerspectiveCamera(68, 1, 0.3, 4000);

// Sky colors are passed as raw sRGB values so the horizon matches the fog exactly.
const rawRGB = hex => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const skyU = { top: { value: rawRGB(0x4d8ce6) }, horizon: { value: rawRGB(0xc7e0f7) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: 0 }, stars: { value: 0 } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform vec3 top, horizon, sunDir; uniform float glow, stars; varying vec3 vP;
    float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vP);
      vec3 c = mix(horizon, top, pow(max(d.y, 0.0), 0.55));
      float s = max(dot(d, normalize(sunDir)), 0.0);
      c += glow * (pow(s, 6.0) * vec3(1.0, 0.5, 0.2) * 0.4 + pow(s, 600.0) * vec3(1.0, 0.9, 0.7));
      if (stars > 0.0 && d.y > 0.04) { vec3 cell = floor(d * 260.0); c += step(0.997, hash(cell)) * stars * (0.4 + 0.6 * hash(cell + 3.1)); }
      gl_FragColor = vec4(c, 1.0);
    }`,
}));
scene.add(sky);
const hemi = new THREE.HemisphereLight(0xdcecff, 0x4b6a3a, 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-60, 120, -45);

let track = null;          // the loaded map's track (loadMap)
let boxes = [];
const fx = new Particles(scene);
const weather = new Weather(scene);
const sound = new Sound();
const P = {}, MQ = {}, SHM = { pen: 0 };   // scratch for ground probes and solid checks

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  fx.resize(h * renderer.getPixelRatio(), camera.fov);
}
addEventListener('resize', resize);
resize();

// Item boxes
const qTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 128, 128);
  gr.addColorStop(0, '#ff922b'); gr.addColorStop(0.5, '#f06595'); gr.addColorStop(1, '#4dabf7');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(5, 5, 118, 118);
  g.font = '900 90px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.4)'; g.strokeText('?', 64, 70);
  g.fillStyle = '#fff'; g.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const boxGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
const boxMat = new THREE.MeshStandardMaterial({ map: qTex, emissive: 0x332211, transparent: true, opacity: 0.9, roughness: 0.3 });

// ---------- Maps ----------
// Build a map and apply its theme. Everything the old map made is torn down first.
let curMap = null;
function loadMap(id) {
  const map = MAP_BY_ID[id] || MAPS[0];
  if (curMap === map.id) return;
  curMap = map.id;
  track?.dispose();
  for (const b of boxes) scene.remove(b.m);
  track = buildTrack(scene, map);
  const th = map.theme;
  skyU.top.value = rawRGB(th.sky[0]);
  skyU.horizon.value = rawRGB(th.sky[1]);
  skyU.stars.value = th.stars ? 1 : 0;
  skyU.glow.value = th.sunGlow ? 1 : 0;
  skyU.sunDir.value.set(...th.sun.dir);
  scene.fog.color.setHex(th.sky[1]);
  scene.fog.near = th.fogNear;
  scene.fog.far = th.fogFar;
  hemi.color.setHex(th.hemi[0]);
  hemi.groundColor.setHex(th.hemi[1]);
  hemi.intensity = th.hemi[2];
  sun.color.setHex(th.sun.color);
  sun.intensity = th.sun.intensity;
  SUN_OFF.set(...th.sun.dir).normalize().multiplyScalar(160);
  renderer.toneMappingExposure = th.exposure ?? 1;
  boxes = track.boxSpots.map(s => {
    const p = track.pointAt(s.i, s.lat, s.path);
    const m = new THREE.Mesh(boxGeo, boxMat);
    m.castShadow = true;
    m.position.set(p.x, p.y + 1.4, p.z);
    scene.add(m);
    return { x: p.x, y: p.y, z: p.z, m, back: 0, spin: Math.random() * 6 };
  });
  weather.set(th.weather);
  buildMapPath();
  camState.snap = true;
}

// Projectile models
const missileParts = {
  body: new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8).rotateX(Math.PI / 2),
  nose: new THREE.ConeGeometry(0.2, 0.5, 8).rotateX(Math.PI / 2).translate(0, 0, 0.9),
  fin: new THREE.BoxGeometry(0.9, 0.06, 0.3).translate(0, 0, -0.5),
  white: new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.4 }),
  red: new THREE.MeshStandardMaterial({ color: 0xe03131, roughness: 0.4 }),
};
function makeMissileMesh() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(missileParts.body, missileParts.white), new THREE.Mesh(missileParts.nose, missileParts.red));
  const f1 = new THREE.Mesh(missileParts.fin, missileParts.red), f2 = f1.clone();
  f2.rotation.z = Math.PI / 2;
  g.add(f1, f2);
  return g;
}
const mineGeo = new THREE.CylinderGeometry(0.7, 0.85, 0.32, 14);
const mineMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.5 });
const mineLightGeo = new THREE.SphereGeometry(0.18, 10, 8);
function makeMineMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(mineGeo, mineMat);
  base.position.y = 0.16;
  base.castShadow = true;
  const light = new THREE.Mesh(mineLightGeo, new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 }));
  light.position.y = 0.38;
  g.add(base, light);
  g.userData.light = light;
  return g;
}
const ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);

function makeLabel(name, color, y) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '800 34px Rubik, system-ui, sans-serif';
  const w = Math.min(244, g.measureText(name).width + 34);
  g.fillStyle = 'rgba(0,0,0,.55)';
  g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 48, 14); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.arc((256 - w) / 2 + 16, 32, 7, 0, 7); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128 + 8, 33, w - 36);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(5, 1.25, 1);
  s.position.y = y;
  return s;
}

// ---------- State ----------
const cars = new Map();       // id -> Car (players by peer id, bots by 'botN')
const missiles = new Map();
const mines = new Map();
const rings = [];
// Shared race state, owned by the host: phase p is 'menu' | 'lobby' | 'race' | 'res'.
let G = { p: 'menu', laps: 3, bots: 3, grid: [], res: null, race: 0, map: 'random', cur: pick(MAP_IDS) };
let goAt = 0;                 // local time the lights go green
let me = null;                // my car, when I'm racing
let seq = 0;
let sendT = 0, hostT = 0, resetCD = 0;
const pairCD = new Map();     // car pair -> time their next bump can hurt
const peers = new Map();      // id -> { n, c, t } (includes me)
const lastPh = new Map();     // last race state each peer sent, in case they become host
let selfId = 'me', hostId = 'me', room = null, roomCode = '';
const act = {};
const isHost = () => hostId === selfId;
const raceTime = () => (now() - goAt) / 1000;
const racing = () => G.p === 'race' && now() >= goAt;
const nameOf = id => cars.get(id)?.name ?? peers.get(id)?.n ?? 'Someone';

// Finished cars by time, then everyone else by how far round they are.
function ranking() {
  return [...cars.values()].filter(c => c.inRace).sort((a, b) =>
    (a.fin != null) !== (b.fin != null) ? (a.fin != null ? -1 : 1)
      : a.fin != null ? a.fin - b.fin : b.prog - a.prog);
}

// ---------- Networking ----------
// Trystero lets whichever peer has the smaller id start each connection, but a page
// that has been open a while can't start one anymore (its pooled offers go stale).
// Starting each id with a countdown from the join time gives newer pages smaller ids,
// so the newcomer always goes first. Trystero builds its id from the first 20
// Math.random() calls when it loads. (Same trick as ../ScribbleParty.)
async function loadNet() {
  const idPrefix = String(9999999999 - Math.floor(Date.now() / 1000)).padStart(10, '0');
  const realRandom = Math.random;
  let idChars = 0;
  Math.random = () => idChars < idPrefix.length ? (Number(idPrefix[idChars++]) + 0.5) / 62 : realRandom();
  try { return await import('https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm'); }
  finally { Math.random = realRandom; }
}

function send(name, data, target) {
  if (!room) return;
  try { act[name].send(data, target ? { target } : undefined); } catch (e) { console.warn(name, e); }
}
const hello = () => ({ n: peers.get(selfId).n, c: peers.get(selfId).c, t: peers.get(selfId).t, v: peers.get(selfId).v });

// The host is whoever has been in the room longest.
function electHost() {
  let best = null;
  for (const [id, p] of peers) if (!best || p.t < best.t || (p.t === best.t && id < best.id)) best = { id, t: p.t };
  const prev = hostId;
  hostId = best.id;
  if (hostId !== prev && hostId !== selfId && lastPh.has(hostId)) applyPh(lastPh.get(hostId));
}

async function connect(name) {
  peers.set(selfId, { n: name, c: myColor, t: Date.now(), v: myVehicle });
  try {
    if (params.has('offline')) throw new Error('offline');
    const { joinRoom, selfId: id } = await loadNet();
    peers.delete(selfId);
    selfId = hostId = id;
    peers.set(selfId, { n: name, c: myColor, t: Date.now(), v: myVehicle });
    room = joinRoom({ appId: APP_ID }, roomCode);
    for (const a of ['hello', 'ph', 'car', 'fx']) {
      act[a] = room.makeAction(a);
      act[a].onMessage = (data, meta) => {
        const from = typeof meta === 'string' ? meta : meta?.peerId;
        if (from) try { handlers[a](data, from); } catch (e) { console.warn(a, e); }
      };
    }
    room.onPeerJoin = id => send('hello', hello(), id);
    room.onPeerLeave = id => {
      const p = peers.get(id), wasHost = id === hostId;
      peers.delete(id);
      electHost();
      const c = cars.get(id);
      if (c && !c.bot) removeCar(c);
      if (p) feed(`${p.n} left`);
      if (isHost() && wasHost) takeOver();
      renderUI();
    };
  } catch (e) {
    console.warn('Offline', e);
    toast("Couldn't reach the internet. Racing offline with bots.");
  }
}

const handlers = {
  hello(d, from) {
    const isNew = !peers.has(from);
    peers.set(from, { n: cleanText(d?.n, 16) || 'Racer', c: cleanColor(d?.c), t: num(d?.t, Date.now()), v: cleanVehicle(d?.v) });
    const wasHost = isHost();
    electHost();
    if (isNew) feed(`${peers.get(from).n} joined`);
    if (isHost()) {
      if (!wasHost) takeOver();
      send('ph', phMsg(), from);
    }
    renderUI();
  },
  ph(d, from) {
    lastPh.set(from, d);
    if (from === hostId) applyPh(d);
  },
  car(d, from) {
    if (!Array.isArray(d)) return;
    const t = now();
    for (const e of d) {
      const c = Array.isArray(e) && cars.get(e[0]);
      if (!c || c.local || (c.bot ? from !== hostId : from !== c.id)) continue;
      const first = !c.net;
      c.net = { x: num(e[1]), y: num(e[2]), z: num(e[3]), h: num(e[4]), vx: num(e[5]), vz: num(e[6]), at: t };
      if (first) Object.assign(c, { x: c.net.x, y: c.net.y, z: c.net.z, h: c.net.h });
      c.hp = num(e[7], c.maxHp);
      const f = num(e[8]);
      c.boost = f & 1; c.shield = f & 2 ? 1 : 0; c.ghost = f & 8 ? 1 : 0; c.spin = f & 16 ? 1 : 0;
      c.dead = f & 4 ? 1 : 0;
      c.lap = num(e[9], -1); c.idx = clamp(num(e[10]) | 0, 0, N - 1);
      c.vy = num(e[11]); c.steer = num(e[12]); c.next = clamp(num(e[13]) | 0, 0, CHECKPOINTS - 1);
      c.air = !!(f & 32); c.offroad = !!(f & 64);
    }
  },
  fx(d, from) {
    if (!d || typeof d !== 'object') return;
    switch (d.k) {
      case 'fire': if (!missiles.has(d.id)) spawnMissile({ id: String(d.id), o: String(d.o), x: num(d.x), y: num(d.y), z: num(d.z), h: num(d.h), tg: d.tg ? String(d.tg) : null, sp: num(d.sp, 90), idx: clamp(num(d.idx) | 0, 0, N - 1) }); break;
      case 'drop': if (!mines.has(d.id)) spawnMine({ id: String(d.id), o: String(d.o), x: num(d.x), y: num(d.y), z: num(d.z) }); break;
      case 'boom': removeProjectile(d.id); explodeAt(num(d.x), num(d.y), num(d.z), 0.7); break;
      case 'wave': waveAt(String(d.o), num(d.x), num(d.y), num(d.z)); break;
      case 'pick': if (boxes[d.b]) breakBox(boxes[d.b]); break;
      case 'pop': { const c = cars.get(d.id); if (c) fx.sparkle(c.x, c.y + 1, c.z, [0.4, 0.85, 1]); break; }
      case 'ko': onKo({ v: String(d.v), by: d.by ? String(d.by) : null, x: num(d.x), y: num(d.y), z: num(d.z) }); break;
      case 'fin': { const c = cars.get(d.id); if (c && c.fin == null) onFinish(c, num(d.t)); break; }
    }
  },
};

// ---------- Host ----------
const phMsg = (s = G) => ({ p: s.p, laps: s.laps, bots: s.bots, grid: s.grid, res: s.res, race: s.race, map: s.map, cur: s.cur, go: goAt - now() });
// The host changes the race state only through here, so it goes through applyPh like everyone else's.
function hostBroadcast(next = G) {
  const m = phMsg(next);
  send('ph', m);
  applyPh(m);
}
function hostStart() {
  if (!isHost()) return;
  const humans = [...peers].sort((a, b) => a[1].t - b[1].t).slice(0, MAX_CARS);
  const grid = humans.map(([id, p]) => ({ id, n: p.n, c: p.c, v: p.v }));
  const free = COLORS.filter(c => !grid.some(g => g.c === c));
  const nb = Math.min(G.bots, MAX_CARS - grid.length);
  const rides = shuffle(VEHICLE_IDS);   // bots get different vehicles
  for (let k = 0; k < nb; k++) grid.push({ id: `bot${k}`, n: BOT_NAMES[k % BOT_NAMES.length], c: free[k % free.length] || pick(COLORS), v: rides[k % rides.length], bot: 1 });
  goAt = now() + COUNTDOWN_MS;
  const cur = G.map === 'random' ? pick(MAP_IDS) : G.map;
  hostBroadcast({ ...G, p: 'race', grid: shuffle(grid), res: null, race: G.race + 1, cur });
}
function hostTick() {
  if (G.p !== 'race' || !racing()) return;
  const order = ranking();
  // Bots well behind the leading human get a little help.
  const leadHuman = order.find(c => !c.bot);
  for (const c of cars.values()) {
    if (!c.bot || !c.local) continue;
    c.skill = c.baseSkill + (leadHuman && c.prog < leadHuman.prog - 0.2 ? 0.08 : 0);
  }
  const humans = G.grid.filter(g => !g.bot && peers.has(g.id) && cars.has(g.id)).map(g => cars.get(g.id));
  const fins = order.filter(c => c.fin != null).map(c => c.fin);
  const rt = raceTime();
  const humansDone = humans.every(c => c.fin != null);
  if (!humans.length || fins.length === order.length || (fins.length && rt - Math.min(...fins) > FINISH_GRACE)
    || (humansDone && rt - Math.max(...humans.map(c => c.fin)) > BOT_GRACE)) {
    const res = ranking().map(c => ({ id: c.id, n: c.name, c: c.color, v: c.type, bot: c.bot ? 1 : 0, fin: c.fin, kos: c.kos }));
    for (const g of G.grid) if (!res.some(r => r.id === g.id)) res.push({ id: g.id, n: g.n, c: g.c, bot: g.bot ? 1 : 0, fin: null, kos: 0, left: 1 });
    hostBroadcast({ ...G, p: 'res', res });
  }
}
// I just became host: drive the bots from wherever they are now.
function takeOver() {
  for (const c of cars.values()) {
    if (c.bot && !c.local) {
      c.local = true;
      if (c.net) { c.vx = c.net.vx; c.vz = c.net.vz; }
      c.baseSkill = c.skill = 0.9;
    }
  }
  if (G.p !== 'menu') hostBroadcast();
}

function applyPh(d) {
  if (!d || !['lobby', 'race', 'res'].includes(d.p)) return;
  const prev = G;
  G = {
    p: d.p,
    laps: clamp(num(d.laps, 3) | 0, 1, 9),
    bots: clamp(num(d.bots, 3) | 0, 0, MAX_CARS - 1),
    grid: (Array.isArray(d.grid) ? d.grid : []).slice(0, MAX_CARS).map(g => ({ id: String(g.id), n: cleanText(g.n, 16) || 'Racer', c: cleanColor(g.c), v: cleanVehicle(g.v), bot: g.bot ? 1 : 0 })),
    res: Array.isArray(d.res) ? d.res : null,
    race: num(d.race) | 0,
    map: d.map === 'random' || MAP_IDS.includes(d.map) ? d.map : 'random',
    cur: MAP_IDS.includes(d.cur) ? d.cur : prev.cur,
  };
  loadMap(G.cur);
  if (G.p === 'race' && (prev.p !== 'race' || prev.race !== G.race)) setupRace(num(d.go));
  if (G.p === 'lobby' && prev.p !== 'lobby') clearRace();
  if (G.p === 'res' && prev.p !== 'res' && me) sound.beep(true);
  renderUI();
}

// ---------- Race setup ----------
function removeCar(c) {
  scene.remove(c.mesh);
  cars.delete(c.id);
  if (c === me) me = null;
}
function clearRace() {
  for (const c of [...cars.values()]) removeCar(c);
  for (const id of [...missiles.keys(), ...mines.keys()]) removeProjectile(id);
  for (const b of boxes) b.back = 0;
  me = null;
}
function setupRace(go) {
  clearRace();
  G.grid.forEach((g, j) => {
    const local = g.id === selfId || (g.bot && isHost());
    const c = new Car(g.id, g.n, g.c, { local, bot: !!g.bot, type: g.v });
    c.inRace = true;
    c.baseSkill = c.skill = g.bot ? 0.86 + (j * 37 % 10) / 100 : 1;
    // Two staggered columns behind the line.
    // Rows are 12 m apart so even the bus fits.
    const back = 4 + c.spec.l / 2 + Math.floor(j / 2) * 12 + (j % 2) * 5;
    c.place(track, N - Math.round(back / track.step), j % 2 ? -4.5 : 4.5);
    c.lap = -1;
    if (g.id !== selfId) c.mesh.add(c.label = makeLabel(g.n, g.c, c.spec.h + 1.5));
    scene.add(c.mesh);
    cars.set(c.id, c);
  });
  me = cars.get(selfId) || null;
  goAt = now() + go;
  sub(`${track.map.icon} ${track.map.name}`);
  countdownShown = null;
  camState.snap = true;
}

// ---------- Items ----------
function rollItem(c) {
  const order = ranking(), n = order.length;
  const r = n > 1 ? order.indexOf(c) / (n - 1) : 0.5;     // 0 = leading, 1 = last
  const w = { missile: 3 + 2 * r, mine: 3 - 1.5 * r, shield: 2, boost: 1 + 3 * r, repair: c.health < 0.6 ? 3 : 0.6 + r, wave: 1.5 };
  let x = Math.random() * Object.values(w).reduce((a, b) => a + b);
  for (const [k, v] of Object.entries(w)) if ((x -= v) <= 0) return k;
  return 'boost';
}
function breakBox(b) {
  if (b.back > now()) return;
  b.back = now() + BOX_BACK_MS;
  fx.sparkle(b.x, b.y + 1.4, b.z, [1, 0.85, 0.4]);
}
function pickups(c) {
  const t = now();
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (b.back > t || !c.near(b.x, b.z, 1.3)) continue;
    breakBox(b);
    send('fx', { k: 'pick', b: i });
    if (!c.item) {
      c.item = rollItem(c);
      c.rollT = c.bot ? 0 : 0.9;
      c.heldT = 0;
      if (c === me) sound.pickup();
    }
  }
}
function useItem(c) {
  if (!c || !c.item || c.rollT > 0 || c.dead > 0 || !racing()) return;
  const it = c.item;
  c.item = null;
  const near = c === me;
  if (it === 'missile') fireMissile(c);
  else if (it === 'mine') dropMine(c);
  else if (it === 'shield') { c.shield = 6; if (near) sound.zap(); }
  else if (it === 'boost') { c.boost = 2.4 * c.spec.boostLen; if (near) sound.whoosh(); }
  else if (it === 'repair') { c.hp = Math.min(c.maxHp, c.hp + 45 * c.spec.heal); fx.sparkle(c.x, c.y + 0.5, c.z, [0.4, 1, 0.5]); if (near) sound.heal(); }
  else if (it === 'wave') { waveAt(c.id, c.x, c.y, c.z); send('fx', { k: 'wave', o: c.id, x: r2(c.x), y: r2(c.y), z: r2(c.z) }); }
}
// The nearest car in front of c, within range, roughly where it's pointing.
function targetAhead(c, range) {
  let best = null, bd = range;
  for (const o of cars.values()) {
    if (o === c || !o.inRace || o.dead > 0) continue;
    const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz);
    if (d < 4 || d >= bd || Math.abs(wrap(Math.atan2(dx, dz) - c.h)) > 0.7) continue;
    best = o; bd = d;
  }
  return best;
}
function fireMissile(c) {
  const tg = targetAhead(c, 170);
  const m = { id: `${c.id}#${++seq}`, o: c.id, x: r2(c.x + Math.sin(c.h) * (c.spec.l / 2 + 1)), y: r2(c.y + 0.9), z: r2(c.z + Math.cos(c.h) * (c.spec.l / 2 + 1)), h: r2(c.h), tg: tg?.id ?? null, sp: Math.round(Math.max(85, c.fwd + 45)), idx: c.idx };
  send('fx', { k: 'fire', ...m });
  spawnMissile(m);
  sound.launch();
}
function spawnMissile(m) {
  m.t = 0;
  m.mesh = makeMissileMesh();
  scene.add(m.mesh);
  missiles.set(m.id, m);
}
function dropMine(c) {
  const m = { id: `${c.id}#${++seq}`, o: c.id, x: r2(c.x - Math.sin(c.h) * (c.spec.l / 2 + 1.5)), y: r2(c.y), z: r2(c.z - Math.cos(c.h) * (c.spec.l / 2 + 1.5)) };
  send('fx', { k: 'drop', ...m });
  spawnMine(m);
}
function spawnMine(m) {
  m.t = 0;
  m.mesh = makeMineMesh();
  m.y = track.groundAt(m.x, m.z);
  m.mesh.position.set(m.x, m.y, m.z);
  scene.add(m.mesh);
  mines.set(m.id, m);
}
function removeProjectile(id) {
  const m = missiles.get(id) || mines.get(id);
  if (!m) return;
  scene.remove(m.mesh);
  missiles.delete(id);
  mines.delete(id);
}
function explodeAt(x, y, z, big = 1) {
  fx.explosion(x, y, z, big);
  const d = camera.position.distanceTo(new THREE.Vector3(x, y, z));
  sound.boom(clamp(1 - d / 180, 0.08, 1) * Math.min(1, big + 0.2));
  camState.shake = Math.max(camState.shake, clamp(1 - d / 40, 0, 1) * big);
}
// Shockwave from car o: knocks back and damages every car this page drives nearby.
function waveAt(o, x, y, z) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, y + 0.6, z);
  scene.add(m);
  rings.push({ m, t: 0 });
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2;
    fx.emit(x, y + 0.6, z, Math.cos(a) * 30, 1, Math.sin(a) * 30, { life: 0.5, size: 1.2, grow: 2, color: [1, 0.9, 0.5], alpha: 0.8, drag: 3 });
  }
  sound.zap();
  for (const c of cars.values()) {
    if (!c.local || c.id === o || c.dead > 0 || c.ghost > 0) continue;
    const dx = c.x - x, dz = c.z - z, d = Math.hypot(dx, dz);
    if (d > 16 || c.shield > 0) continue;
    const f = 1 - d / 16;
    hurt(c, 8 + 20 * f, o);
    if (c.dead > 0) continue;
    const k = 26 * f / c.spec.mass;
    c.vx += dx / (d || 1) * k; c.vz += dz / (d || 1) * k;
    c.vy = 7 * f / Math.sqrt(c.spec.mass);
    if (f > 0.4 && !c.spec.spinProof) { c.spin = 0.6; c.spinDir = Math.random() < 0.5 ? -1 : 1; }
  }
}

function updateMissiles(dt) {
  for (const m of missiles.values()) {
    m.t += dt;
    const T = m.tg && cars.get(m.tg);
    if (T && T.dead <= 0 && m.t > 0.15) {
      // Turns harder the closer it gets, so it doesn't orbit a target on a bend.
      const turn = (3.5 + 40 / Math.max(5, Math.hypot(T.x - m.x, T.z - m.z))) * dt;
      m.h += clamp(wrap(Math.atan2(T.x - m.x, T.z - m.z) - m.h), -turn, turn);
    }
    else if (track.probe(m.x, m.z, MQ).path >= 0 && MQ.dist < 30) {
      m.h += clamp(wrap(track.headingAt(MQ.i + 10, MQ.path) - m.h), -1.4 * dt, 1.4 * dt);   // follow the road
    }
    m.x += Math.sin(m.h) * m.sp * dt;
    m.z += Math.cos(m.h) * m.sp * dt;
    m.y = track.groundAt(m.x, m.z) + 0.9;
    if (m.t > 5 || track.solidHit(m.x, m.z, 0.3, m.y, SHM)) {
      explodeAt(m.x, m.y, m.z, 0.5);
      removeProjectile(m.id);
      continue;
    }
    for (const c of cars.values()) {
      if (!c.local || c.id === m.o || c.dead > 0 || c.ghost > 0) continue;
      if (!c.near(m.x, m.z, 1.3) || Math.abs(c.y + 0.8 - m.y) > 2.5) continue;
      hitBy(c, m.o, 34, Math.sin(m.h) * 10, Math.cos(m.h) * 10, 9);
      send('fx', { k: 'boom', id: m.id, x: r2(m.x), y: r2(m.y), z: r2(m.z) });
      explodeAt(m.x, m.y, m.z, 0.7);
      removeProjectile(m.id);
      break;
    }
  }
}
function updateMines(dt) {
  for (const m of mines.values()) {
    m.t += dt;
    if (m.t > 45) { removeProjectile(m.id); continue; }
    if (m.t < 0.8) continue;  // arming
    for (const c of cars.values()) {
      if (!c.local || c.dead > 0 || c.ghost > 0 || c.spec.mineProof) continue;
      if (!c.near(m.x, m.z, 1.0) || c.y > m.y + 1.2) continue;   // jumped over it
      c.vx *= 0.45; c.vz *= 0.45;
      hitBy(c, m.o, 28, 0, 0, 12);
      send('fx', { k: 'boom', id: m.id, x: r2(m.x), y: r2(m.y), z: r2(m.z) });
      explodeAt(m.x, m.y, m.z, 0.8);
      removeProjectile(m.id);
      break;
    }
  }
}

// ---------- Damage ----------
function hitBy(c, by, dmg, px, pz, lift) {
  if (c.shield > 0) {
    c.shield = 0;
    fx.sparkle(c.x, c.y + 1, c.z, [0.4, 0.85, 1]);
    send('fx', { k: 'pop', id: c.id });
    return;
  }
  hurt(c, dmg, by);
  if (c.dead > 0) return;
  const m = c.spec.mass;
  c.vx += px / m; c.vz += pz / m;
  c.vy = lift / Math.sqrt(m);
  if (!c.spec.spinProof) { c.spin = 0.9; c.spinDir = Math.random() < 0.5 ? -1 : 1; }
}
function hurt(c, dmg, by) {
  if (c.dead > 0 || c.ghost > 0 || c.shield > 0 || dmg <= 0) return;
  dmg *= c.spec.armor;
  c.hp -= dmg;
  if (by && by !== c.id) c.lastHit = { by, t: now() };
  if (c === me) {
    $('flash').style.transition = 'none';
    $('flash').style.opacity = Math.min(1, 0.3 + dmg / 40);
    requestAnimationFrame(() => { $('flash').style.transition = ''; $('flash').style.opacity = 0; });
    camState.shake = Math.max(camState.shake, Math.min(1, dmg / 30));
  }
  if (c.hp <= 0) wreck(c);
}
function wreck(c, water = false) {
  c.hp = 0;
  c.dead = 2.6;
  c.item = null;
  const by = c.lastHit && now() - c.lastHit.t < 6000 ? c.lastHit.by : null;
  const d = { k: 'ko', v: c.id, by, x: r2(c.x), y: r2(c.y), z: r2(c.z), w: water ? 1 : 0 };
  send('fx', d);
  onKo(d);
}
function onKo(d) {
  if (d.w) splashAt(d.x, d.z); else explodeAt(d.x, d.y, d.z, 1.3);
  const v = cars.get(d.v), k = d.by && cars.get(d.by);
  if (v && !v.local) v.dead = 1;
  if (k) k.kos++;
  feed(d.w ? (k ? [b(k), ' knocked ', b(v), ' into the sea'] : [b(v), ' went for a swim']) : k ? [b(k), ' wrecked ', b(v)] : [b(v), ' crashed out']);
  if (v === me) flashBig(d.w ? 'SPLASH' : 'WRECKED', d.w ? '#4dabf7' : '#ff6b6b');
  else if (k === me) sub(`You wrecked ${v?.name ?? 'them'}!`);
}
function splashAt(x, z) {
  for (let k = 0; k < 60; k++) {
    fx.emit(x + (Math.random() - 0.5) * 3, 0.2, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 8, 6 + Math.random() * 10, (Math.random() - 0.5) * 8,
      { life: 0.9 + Math.random() * 0.5, size: 0.8, grow: 1, color: [0.8, 0.92, 1], alpha: 0.85, grav: 20, drag: 0.5 });
  }
  const d = camera.position.distanceTo(new THREE.Vector3(x, 0, z));
  sound.noise(0.8, 700, 0.4 * clamp(1 - d / 150, 0.05, 1), 'lowpass', 200);
}
// Back on the nearest road, facing along it.
function respawn(c) {
  if (track.probe(c.x, c.z, MQ).path >= 0) c.place(track, MQ.i, 0, MQ.path);
  else c.place(track, c.idx, 0);
  Object.assign(c, { hp: c.maxHp, dead: 0, ghost: 2.5, spin: 0, boost: 0, steer: 0, lastHit: null });
  if (c.ai) c.ai.route = null;
}
// Hit something solid (a tree, a building) at speed v.
function onBump(c, v) {
  if (v < 4) return;
  fx.sparks(c.hitX ?? c.x, c.y + 0.6, c.hitZ ?? c.z, Math.min(30, v * 1.5 | 0), 6);
  if (c === me) sound.crash(v);
  if (v > 9) hurt(c, (v - 9) * 1.0, null);
}
// Came down from a jump.
function onLand(c, v) {
  if (v < 5) return;
  const col = track.off.dust;
  for (let k = 0; k < Math.min(30, v * 1.5); k++) {
    const a = Math.random() * 6.3;
    fx.emit(c.x, c.y + 0.3, c.z, Math.cos(a) * 6, 1 + Math.random() * 2, Math.sin(a) * 6, { life: 0.8, size: 1.2, grow: 2.5, color: col, alpha: 0.6, drag: 2 });
  }
  if (c === me) { sound.crash(v * 0.4); camState.shake = Math.max(camState.shake, Math.min(0.8, v / 30)); }
  if (v > 21) hurt(c, (v - 21) * 1.5, null);   // big drops hurt
}

// Car-on-car bumps. Each page resolves the cars it drives against every other car,
// so both sides of a crash feel it. Heavier vehicles shove and hurt lighter ones more,
// and hitting someone nose-first hurts you less.
function collide() {
  const list = [...cars.values()].filter(c => c.inRace && c.dead <= 0 && c.ghost <= 0);
  const t = now();
  for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
    const A = list[a], B = list[b];
    if (!A.local && !B.local) continue;
    const reach = (A.spec.l + B.spec.l) / 2 + 1;
    if (Math.abs(A.x - B.x) > reach || Math.abs(A.z - B.z) > reach) continue;
    let pen = 0, nx = 0, nz = 0;
    const afx = Math.sin(A.h), afz = Math.cos(A.h), bfx = Math.sin(B.h), bfz = Math.cos(B.h);
    const rr = A.spec.rad + B.spec.rad;
    for (const i of A.spec.circles) for (const j of B.spec.circles) {
      const dx = (A.x + afx * i) - (B.x + bfx * j), dz = (A.z + afz * i) - (B.z + bfz * j);
      const d = Math.hypot(dx, dz) || 0.01, p = rr - d;
      if (p > pen) { pen = p; nx = dx / d; nz = dz / d; }
    }
    if (pen <= 0) continue;
    if (Math.abs(A.y - B.y) > 1.8) continue;   // one flew over the other
    const mA = A.spec.mass, mB = B.spec.mass, shareA = mB / (mA + mB), shareB = mA / (mA + mB);
    const both = A.local && B.local;
    if (A.local) { const p = pen * (both ? shareA : Math.min(1, shareA * 1.2)); A.x += nx * p; A.z += nz * p; }
    if (B.local) { const p = pen * (both ? shareB : Math.min(1, shareB * 1.2)); B.x -= nx * p; B.z -= nz * p; }
    const vn = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
    if (vn >= 0) continue;
    const j = -1.5 * vn / (1 / mA + 1 / mB);
    if (A.local) { A.vx += nx * j / mA; A.vz += nz * j / mA; }
    if (B.local) { B.vx -= nx * j / mB; B.vz -= nz * j / mB; }
    const hit = -vn;
    const key = A.id < B.id ? A.id + '|' + B.id : B.id + '|' + A.id;
    if (hit < 5 || (pairCD.get(key) || 0) > t) continue;
    pairCD.set(key, t + 350);
    const base = (hit - 5) * 1.3;
    const aNose = -(afx * nx + afz * nz) > 0.6, bNose = bfx * nx + bfz * nz > 0.6;
    if (A.local) hurt(A, base * 2 * shareA * (aNose ? 0.4 : 1), B.id);
    if (B.local) hurt(B, base * 2 * shareB * (bNose ? 0.4 : 1), A.id);
    fx.sparks((A.x + B.x) / 2, (A.y + B.y) / 2 + 0.6, (A.z + B.z) / 2, Math.min(40, hit * 2 | 0), 7);
    if (A === me || B === me) sound.crash(hit);
  }
}

// ---------- Bots ----------
const BOT_LAT = 20;   // how much sideways grip (m/s²) bots assume they have, before scaling
// Each bot decides, once per lap, whether it takes each branch.
function botTakes(c, bi) {
  const take = c.ai.take ??= {};
  if (take[bi] === undefined) take[bi] = Math.random() < 0.5;
  return take[bi];
}
// One sample further along this bot's route: through a branch if it chose to take it.
function stepRoute(c, r) {
  const paths = track.paths;
  if (r.p === 0) {
    const i = (r.i + 1) % N;
    for (let bi = 1; bi < paths.length; bi++) if (paths[bi].from === i && botTakes(c, bi)) return { p: bi, i: 0 };
    return { p: 0, i };
  }
  return r.i + 1 >= paths[r.p].n - 1 ? { p: 0, i: paths[r.p].to } : { p: r.p, i: r.i + 1 };
}
// Keep track of where the bot is along its own route. Near forks the nearest road can be
// either one, so bots follow their route instead of whichever road happens to be closest.
function followRoute(c) {
  const b = c.ai, P2 = track.paths;
  const d2 = r => (P2[r.p].px[r.i] - c.x) ** 2 + (P2[r.p].pz[r.i] - c.z) ** 2;
  let r = b.route;
  if (!r || d2(r) > 45 * 45) r = { p: Math.max(0, c.q.path), i: c.q.i };   // lost it: start from the nearest road
  for (let k = 0; k < 60; k++) {
    const nx = stepRoute(c, r);
    if (d2(nx) < d2(r)) r = nx; else break;
  }
  b.route = r;
}
// Where `steps` samples ahead lands along the route this bot is taking.
function routeAhead(c, steps) {
  let r = c.ai.route ?? { p: Math.max(0, c.q.path), i: c.q.i };
  for (let k = 0; k < steps; k++) r = stepRoute(c, r);
  return r;
}
function botDrive(c, dt) {
  const b = c.ai || (c.ai = { lane: (Math.random() * 2 - 1) * 5, laneT: 0, stuck: 0, rev: 0, revSteer: 1, think: Math.random() });
  const sp = c.fwd;
  if (b.rev > 0) { b.rev -= dt; return { steer: b.revSteer, throttle: 0, brake: 1 }; }
  if (sp < 3 && c.spin <= 0 && !c.air) {
    if ((b.stuck += dt) > 1.2) {
      b.stuck = 0; b.rev = 1.1;
      b.revSteer = (c.q.lat ?? 0) > 0 ? -1 : 1;
    }
  } else b.stuck = 0;
  followRoute(c);
  // Forget branch choices once well past them, so next lap is a fresh coin flip.
  if (b.take && b.route.p === 0) for (const bi in b.take) if ((track.paths[bi].from - b.route.i + N) % N > 400) delete b.take[bi];
  if ((b.laneT -= dt) <= 0) { b.lane = (Math.random() * 2 - 1) * 6; b.laneT = 3 + Math.random() * 4; }
  const ahead = Math.round((7 + Math.max(0, sp) * 0.45) / track.step);
  const at = routeAhead(c, ahead);
  let lane = b.lane;
  const tp = track.pointAt(at.i, lane, at.p);
  for (const m of mines.values()) {
    if ((m.x - tp.x) ** 2 + (m.z - tp.z) ** 2 < 36 && track.probe(m.x, m.z, MQ).path >= 0) {
      lane = MQ.lat > lane ? MQ.lat - 5 : MQ.lat + 5;
    }
  }
  const p = lane === b.lane ? tp : track.pointAt(at.i, clamp(lane, -8, 8), at.p);
  const steer = clamp(wrap(Math.atan2(p.x - c.x, p.z - c.z) - c.h) * 2.2, -1, 1);
  // Corner speed: how far the road turns over the next stretches gives each corner's
  // radius, and so how fast the car can take it; brake early enough to get there.
  const here = b.route, h0 = track.headingAt(here.i, here.p);
  const lat = BOT_LAT * Math.sqrt(clamp(c.spec.grip / 7, 0.3, 1.4) * track.grip) * (c.offroad ? track.off.grip : 1);
  let target = Infinity;
  for (const d of [12, 25, 40, 60, 85, 115]) {
    const a = routeAhead(c, Math.round(d / track.step));
    const turn = Math.abs(wrap(track.headingAt(a.i, a.p) - h0));
    if (turn < 0.08) continue;
    const vCorner = Math.sqrt(lat * d / turn);
    target = Math.min(target, Math.sqrt(vCorner * vCorner + 2 * c.spec.brake * 0.7 * Math.max(0, d - 8)));
  }
  let throttle = 1, brake = 0;
  if (sp > target) { throttle = 0; brake = Math.min(1, (sp - target) / 6); }
  else if (sp > target * 0.94) throttle = 0.35;
  if ((b.think -= dt) <= 0) { b.think = 0.4; botItem(c); }
  return { steer, throttle, brake };
}
function botItem(c) {
  if (!c.item) return;
  c.heldT = (c.heldT || 0) + 0.4;
  const others = [...cars.values()].filter(o => o !== c && o.inRace && o.dead <= 0);
  const dist = o => Math.hypot(o.x - c.x, o.z - c.z);
  let go = c.heldT > 14;
  switch (c.item) {
    case 'missile': go ||= !!targetAhead(c, 110); break;
    case 'mine': go ||= others.some(o => dist(o) < 35 && (o.x - c.x) * Math.sin(c.h) + (o.z - c.z) * Math.cos(c.h) < 0); break;
    case 'shield': go ||= [...missiles.values()].some(m => m.tg === c.id && Math.hypot(m.x - c.x, m.z - c.z) < 60) || c.heldT > 8; break;
    case 'boost': { const a = routeAhead(c, 45); go ||= !c.offroad && Math.abs(wrap(track.headingAt(a.i, a.p) - c.h)) < 0.25; break; }
    case 'repair': go ||= c.health < 0.6; break;
    case 'wave': go ||= others.some(o => dist(o) < 11); break;
  }
  if (go) useItem(c);
}

// ---------- Input ----------
const keys = new Set();
const touchKeys = { left: false, right: false, gas: false, brake: false };
const IDLE = { steer: 0, throttle: 0, brake: 0 };
const isTyping = () => document.activeElement?.tagName === 'INPUT';
addEventListener('keydown', e => {
  if (isTyping()) return;
  keys.add(e.code);
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  sound.unlock();
  if (e.code === 'Space' || e.code === 'KeyE') useItem(me);
  if (e.code === 'KeyR') resetMe();
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
for (const btn of document.querySelectorAll('#touch button')) {
  const k = btn.dataset.k;
  const on = v => e => { e.preventDefault(); touchKeys[k] = v; btn.classList.toggle('on', v); if (v) sound.unlock(); };
  btn.addEventListener('pointerdown', on(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, on(false));
}
$('itemSlot').addEventListener('pointerdown', e => { e.preventDefault(); useItem(me); });
let padItem = false;
function playerInput() {
  const k = c => keys.has(c);
  let steer = (k('ArrowLeft') || k('KeyA') || touchKeys.left ? 1 : 0) - (k('ArrowRight') || k('KeyD') || touchKeys.right ? 1 : 0);
  let throttle = k('ArrowUp') || k('KeyW') || touchKeys.gas ? 1 : 0;
  let brake = k('ArrowDown') || k('KeyS') || touchKeys.brake ? 1 : 0;
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const ax = pad.axes[0] || 0;
    if (Math.abs(ax) > 0.15) steer = -ax;
    throttle = Math.max(throttle, pad.buttons[7]?.value || 0, pad.buttons[0]?.pressed ? 1 : 0);
    brake = Math.max(brake, pad.buttons[6]?.value || 0);
    const it = pad.buttons[2]?.pressed || pad.buttons[5]?.pressed;
    if (it && !padItem) useItem(me);
    padItem = it;
  }
  return { steer, throttle, brake };
}
function resetMe() {
  if (!me || me.dead > 0 || resetCD > 0 || !racing()) return;
  if (track.probe(me.x, me.z, MQ).path >= 0) me.place(track, MQ.i, 0, MQ.path); else me.place(track, me.idx, 0);
  me.ghost = 1.5;
  resetCD = 3;
}

// ---------- Simulation ----------
function simStep(dt) {
  if (G.p !== 'race' && G.p !== 'res') return;
  const go = racing();
  resetCD = Math.max(0, resetCD - dt);
  for (const c of cars.values()) {
    if (!c.local) continue;
    if (c.dead > 0) {
      if ((c.dead -= dt) <= 0) respawn(c);
      continue;
    }
    if (go && !c.started) {
      c.started = true;
      if (c.spec.startItem && !c.item) c.item = c.spec.startItem;
    }
    const inp = !go ? IDLE : c.bot || (DEV && c === me && dev.auto) ? botDrive(c, dt) : playerInput();
    const lap = c.lap;
    onBump(c, c.step(dt, inp, track));
    if (c.landed) onLand(c, c.landed);
    if (c.dead > 0) continue;
    if (track.waterY != null && c.y < track.waterY - 0.7) { wreck(c, true); continue; }    // in the sea
    if (c.q.path < 0 || c.q.dist > 160) { respawn(c); continue; }                        // lost in the wilderness
    if (c.lap > lap && G.p === 'race') onLap(c);
    if (go) pickups(c);
  }
  if (go) collide();
  updateMissiles(dt);
  updateMines(dt);
  if ((sendT -= dt) <= 0) { sendT = SEND_EVERY; sendCars(); }
  if (isHost() && (hostT -= dt) <= 0) { hostT = 0.5; hostTick(); }
}
function onLap(c) {
  if (c.lap <= (c.maxLap ?? 0)) return;
  c.maxLap = c.lap;
  if (c.lap >= G.laps && c.fin == null) {
    const t = r2(raceTime());
    send('fx', { k: 'fin', id: c.id, t });
    onFinish(c, t);
  } else if (c === me && c.lap > 0) {
    if (c.lap === G.laps - 1) flashBig('FINAL LAP', '#ffd43b', 1500); else sub(`Lap ${c.lap + 1}`);
    sound.beep(false);
  }
}
function onFinish(c, t) {
  c.fin = t;
  const place = ranking().filter(o => o.fin != null).length;
  feed([b(c), ` finished ${place}${ordinal(place)}`]);
  if (c === me) { flashBig(`${place}${ordinal(place)}!`, '#ffd43b', 2500); sub(`Finished in ${fmtTime(t)}`); sound.beep(true); }
}
function sendCars() {
  const out = [];
  for (const c of cars.values()) {
    if (!c.local) continue;
    const f = (c.boost > 0 ? 1 : 0) | (c.shield > 0 ? 2 : 0) | (c.dead > 0 ? 4 : 0) | (c.ghost > 0 ? 8 : 0) | (c.spin > 0 ? 16 : 0) | (c.air ? 32 : 0) | (c.offroad ? 64 : 0);
    out.push([c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.h), r2(c.vx), r2(c.vz), Math.round(c.hp), f, c.lap, c.idx, r2(c.vy), r2(c.steer), c.next]);
  }
  if (out.length) send('car', out);
}

// ---------- Visuals ----------
const camState = { h: 0, y: 0, shake: 0, orbit: 0, snap: true };
const tmpV = new THREE.Vector3();
// Remote cars: predict from the last state and the velocity, and glide toward it.
function smoothRemote(c, dt) {
  const n = c.net, age = Math.min(0.3, (now() - n.at) / 1000);
  const tx = n.x + n.vx * age, tz = n.z + n.vz * age;
  const dx = tx - c.x, dz = tz - c.z;
  if (dx * dx + dz * dz > 400) { c.x = tx; c.z = tz; c.h = n.h; c.y = n.y; }
  else {
    const k = 1 - Math.exp(-12 * dt);
    c.x += dx * k; c.z += dz * k; c.y += (n.y - c.y) * k;
    c.h += wrap(n.h - c.h) * k;
  }
  c.vx = n.vx; c.vz = n.vz;
}
function updateCamera(dt) {
  let t = me;
  if (!t && (G.p === 'race' || G.p === 'res')) t = ranking()[0];
  if (!t || G.p === 'menu' || G.p === 'lobby') {
    camState.orbit += dt * 0.07;
    const a = camState.orbit;
    const cx = track.px[0] + track.tx[0] * 12, cz = track.pz[0] + track.tz[0] * 12, cy = track.py[0];
    camera.position.set(cx + Math.cos(a) * 46, cy + 13 + Math.sin(a * 0.7) * 3, cz + Math.sin(a) * 46);
    camera.lookAt(cx, cy + 3, cz);
    camState.snap = true;
  } else {
    const k = 1 - Math.exp(-5 * dt);
    if (camState.snap) Object.assign(camState, { h: t.h, y: t.y, x: t.x, z: t.z, snap: false });
    if (t.dead <= 0) {
      camState.h += wrap(t.h - camState.h) * (t.spin > 0 ? 0.3 * k : k);
      camState.y += (t.y - camState.y) * (t.air ? 0.6 * k : k);
      camState.x = t.x; camState.z = t.z;
    }
    const sp = Math.min(1, Math.abs(t.fwd) / REF_TOP);
    const back = t.spec.cam.back + sp * 1.4, up = t.spec.cam.up;
    const fx_ = Math.sin(camState.h), fz = Math.cos(camState.h);
    camera.position.set(camState.x - fx_ * back, camState.y + up, camState.z - fz * back);
    camera.position.y = Math.max(camera.position.y, track.groundAt(camera.position.x, camera.position.z) + 1.5);
    camera.lookAt(camState.x + fx_ * 6, camState.y + 0.5 + t.spec.h * 0.5, camState.z + fz * 6);
    // Portrait screens get a taller view so the road ahead isn't cropped.
    const base = camera.aspect < 1 ? Math.min(92, 66 + (1 - camera.aspect) * 48) : 66;
    const fov = base + sp * 9 + (t.boost > 0 ? 7 : 0);
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
      camera.updateProjectionMatrix();
      fx.resize(innerHeight * renderer.getPixelRatio(), camera.fov);
    }
  }
  if (camState.shake > 0) {
    const s = camState.shake * 0.5;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camState.shake = Math.max(0, camState.shake - dt * 2.5);
  }
  sky.position.copy(camera.position);
  const f = t && t.inRace ? tmpV.set(t.x, t.y, t.z) : tmpV.set(track.px[0], track.py[0], track.pz[0]);
  sun.position.copy(f).add(SUN_OFF);
  sun.target.position.copy(f);
}

function frame(dt) {
  const t = now(), ts = t / 1000;
  for (const c of cars.values()) {
    if (!c.local && c.net) smoothRemote(c, dt);
    syncMesh(c, track, dt, ts);
    if (c.dead > 0) continue;
    // Name tags right next to the camera would cover the screen.
    if (c.label) c.label.visible = camera.position.distanceToSquared(c.mesh.position) > 18 * 18;
    const fx_ = Math.sin(c.h), fz = Math.cos(c.h);
    const hl = c.health, front = c.spec.l * 0.35, top = c.spec.h * 0.65, rear = c.spec.l / 2 + 0.1;
    if (hl < 0.55 && Math.random() < dt * (hl < 0.3 ? 35 : 14)) fx.smoke(c.x + fx_ * front, c.y + top, c.z + fz * front, hl < 0.3 ? 0.9 : 0.4);
    if (hl < 0.28 && Math.random() < dt * 30) fx.fire(c.x + fx_ * front, c.y + top, c.z + fz * front);
    // Off-road, the wheels throw up dirt, sand or snow.
    if (c.offroad && !c.air && c.speed > 8 && Math.random() < dt * 40) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      fx.emit(c.x - fx_ * rear * 0.8 + fz * sd * c.spec.w * 0.45, c.y + 0.3, c.z - fz * rear * 0.8 - fx_ * sd * c.spec.w * 0.45,
        -c.vx * 0.15 + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2, -c.vz * 0.15 + (Math.random() - 0.5) * 2,
        { life: 0.9, size: 0.9, grow: 2.2, color: track.off.dust, alpha: 0.55, drag: 1.5, grav: 3 });
    }
    if (c.boost > 0) for (const s of [-0.6, 0.6]) {
      fx.emit(c.x - fx_ * rear + fz * s, c.y + 0.55, c.z - fz * rear - fx_ * s, c.vx * 0.5 - fx_ * 6, 0.5, c.vz * 0.5 - fz * 6,
        { life: 0.22, size: 0.7, grow: -1.5, color: [0.5, 0.75, 1], alpha: 0.9 });
    }
  }
  for (const m of missiles.values()) {
    m.mesh.position.set(m.x, m.y, m.z);
    m.mesh.rotation.y = m.h;
    m.mesh.rotation.z += dt * 8;
    fx.emit(m.x - Math.sin(m.h) * 0.9, m.y, m.z - Math.cos(m.h) * 0.9, 0, 0.6, 0, { life: 0.7, size: 0.5, grow: 1.5, color: [0.85, 0.85, 0.85], alpha: 0.6 });
    fx.emit(m.x - Math.sin(m.h) * 0.9, m.y, m.z - Math.cos(m.h) * 0.9, 0, 0, 0, { life: 0.08, size: 0.6, color: [1, 0.6, 0.2] });
  }
  for (const m of mines.values()) m.mesh.userData.light.material.emissiveIntensity = Math.sin(ts * (m.t < 0.8 ? 30 : 8)) > 0 ? 3 : 0.2;
  for (const b of boxes) {
    const on = b.back <= t;
    b.m.visible = on;
    if (!on) continue;
    const grow = Math.min(1, (t - b.back) / 400);
    b.m.scale.setScalar(grow);
    b.m.rotation.set(0.5, ts * 1.4 + b.spin, 0.3);
    b.m.position.y = b.y + 1.4 + Math.sin(ts * 2.5 + b.spin) * 0.2;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.t += dt;
    r.m.scale.setScalar(1 + r.t / 0.45 * 15);
    r.m.material.opacity = Math.max(0, 0.9 * (1 - r.t / 0.45));
    if (r.t > 0.45) { scene.remove(r.m); rings.splice(i, 1); }
  }
  fx.update(dt);
  for (const a of track.anims) a(dt, ts);
  weather.update(dt, ts, camera.position);
  updateCamera(dt);
  updateHud();
  const driving = me && me.dead <= 0 && (G.p === 'race' || G.p === 'res');
  sound.engine(driving ? Math.abs(me.fwd) / me.spec.top : 0, driving, me?.boost > 0,
    me ? clamp(1.15 - 0.15 * me.spec.mass, 0.65, 1.1) : 1);
}

// ---------- HUD ----------
const mini = $('mini'), mg = mini.getContext('2d');
const MAP_PAD = 18, MAP_S = mini.width - MAP_PAD * 2;
let mapPath = new Path2D();
function buildMapPath() {
  mapPath = new Path2D();
  for (const p of track.paths) {
    for (let i = 0; i < p.n; i += 4) {
      const [u, v] = track.mapXY(p.px[i], p.pz[i]);
      mapPath[i ? 'lineTo' : 'moveTo'](MAP_PAD + u * MAP_S, MAP_PAD + v * MAP_S);
    }
    if (p.closed) mapPath.closePath();
    else { const [u, v] = track.mapXY(p.px[p.n - 1], p.pz[p.n - 1]); mapPath.lineTo(MAP_PAD + u * MAP_S, MAP_PAD + v * MAP_S); }
  }
}
function drawMinimap() {
  mg.clearRect(0, 0, mini.width, mini.height);
  mg.lineJoin = 'round';
  mg.strokeStyle = 'rgba(0,0,0,.45)'; mg.lineWidth = 16; mg.stroke(mapPath);
  mg.strokeStyle = 'rgba(255,255,255,.85)'; mg.lineWidth = 8; mg.stroke(mapPath);
  const [su, sv] = track.mapXY(track.px[0], track.pz[0]);
  mg.fillStyle = '#111'; mg.fillRect(MAP_PAD + su * MAP_S - 9, MAP_PAD + sv * MAP_S - 2, 18, 4);
  const dot = (x, z, r, color, ring) => {
    const [u, v] = track.mapXY(x, z);
    mg.beginPath(); mg.arc(MAP_PAD + u * MAP_S, MAP_PAD + v * MAP_S, r, 0, 7);
    mg.fillStyle = color; mg.fill();
    if (ring) { mg.lineWidth = 3; mg.strokeStyle = ring; mg.stroke(); }
  };
  for (const m of missiles.values()) dot(m.x, m.z, 4, '#ff3b3b');
  if (me && G.p === 'race' && me.fin == null) {
    const ci = track.checkpoints[me.next];
    dot(track.px[ci], track.pz[ci], 7, 'rgba(255,212,59,.35)', '#ffd43b');
  }
  for (const c of cars.values()) if (c !== me && c.dead <= 0) dot(c.x, c.z, 8, c.color, '#000');
  if (me && me.dead <= 0) dot(me.x, me.z, 11, me.color, '#fff');
}
let countdownShown = null;
let missedT = 0;
function flashBig(text, color = '#ffd43b', ms = 1100) {
  const e = $('big');
  e.textContent = text;
  e.style.color = color;
  e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
  clearTimeout(flashBig.t);
  flashBig.t = setTimeout(() => { e.textContent = ''; }, ms);
}
function sub(text) {
  $('sub').textContent = text;
  clearTimeout(sub.t);
  sub.t = setTimeout(() => { $('sub').textContent = ''; }, 2500);
}
const b = c => el('b', { textContent: c?.name ?? 'Someone', style: `color:${c?.color ?? '#fff'}` });
function feed(parts) {
  const line = el('div', {}, ...(Array.isArray(parts) ? parts : [parts]));
  const box = $('feed');
  box.append(line);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { line.style.opacity = 0; setTimeout(() => line.remove(), 600); }, 4000);
}
function updateHud() {
  const inRace = G.p === 'race';
  if (!inRace) return;
  const t = now();
  // Countdown
  if (t < goAt + 900) {
    const left = Math.ceil((goAt - t) / 1000);
    const show = left > 3 ? '' : left > 0 ? String(left) : 'GO!';
    if (show !== countdownShown) {
      countdownShown = show;
      if (show) { flashBig(show, show === 'GO!' ? '#69db7c' : '#ffd43b', show === 'GO!' ? 900 : 1100); sound.beep(show === 'GO!'); }
    }
  }
  drawMinimap();
  $('spectate').classList.toggle('hidden', !!me);
  if (!me) return;
  const order = ranking(), place = order.indexOf(me) + 1;
  setText('pos', `${place}<sup>${ordinal(place)}</sup>`);
  setText('posOf', `of ${order.length}`);
  setText('lap', me.fin != null ? 'FINISHED' : `LAP ${clamp(me.lap + 1, 1, G.laps)}/${G.laps}`);
  setText('time', fmtTime(Math.max(0, me.fin ?? raceTime())));
  if (me.missed && me.fin == null && t > missedT) { sub('Missed a checkpoint! Turn back (yellow dot on the map).'); missedT = t + 3500; }
  const hp = Math.max(0, Math.round(me.hp)), hl = Math.max(0, me.health);
  $('hpFill').style.width = hl * 100 + '%';
  $('hpFill').className = hl < 0.3 ? 'low' : hl < 0.6 ? 'mid' : '';
  setText('hpText', me.dead > 0 ? 'WRECKED' : String(hp));
  setText('speed', `${Math.round(Math.abs(me.fwd) * 3.6)}<small> km/h</small>`);
  const icons = Object.values(ITEMS).map(i => i.icon);
  setText('itemIcon', me.rollT > 0 ? icons[Math.floor(t / 70) % icons.length] : me.item ? ITEMS[me.item].icon : '');
  $('itemSlot').classList.toggle('has', !!me.item && me.rollT <= 0);
  $('itemSlot').classList.toggle('rolling', me.rollT > 0);
}

// ---------- Screens ----------
let myColor = store.get('crash-color');
if (!COLORS.includes(myColor)) myColor = pick(COLORS.slice(0, 8));
let myVehicle = cleanVehicle(store.get('crash-vehicle'));
if (DEV && params.get('veh')) myVehicle = cleanVehicle(params.get('veh'));   // ?dev&veh=bus
function renderSwatches() {
  $('swatches').replaceChildren(...COLORS.map(c => el('button', {
    className: c === myColor ? 'on' : '', style: `background:${c}`, ariaLabel: `Color ${c}`,
    onclick: () => { myColor = c; store.set('crash-color', c); renderSwatches(); renderThumbs(); rideChanged(); },
  })));
}
renderSwatches();

// ---------- Garage ----------
// Thumbnails are rendered once per color with a small separate renderer.
let thumbs = {};
function renderThumbs() {
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1);
    r.setSize(160, 110);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x556070, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(4, 8, 6);
    s.add(d);
    const cam = new THREE.PerspectiveCamera(30, 160 / 110, 0.1, 200);
    for (const id of VEHICLE_IDS) {
      const m = makeVehicleMesh(id, myColor);
      s.add(m);
      const bb = new THREE.Box3().setFromObject(m), mid = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      const size = Math.max(sz.z, sz.x * 1.6, sz.y * 1.9);
      cam.position.set(mid.x + size * 0.95, mid.y + size * 0.6, mid.z + size * 1.2);
      cam.lookAt(mid);
      r.render(s, cam);
      thumbs[id] = r.domElement.toDataURL();
      s.remove(m);
    }
    r.dispose();
    r.forceContextLoss();
  } catch (e) { console.warn('thumbnails', e); }
  renderGarage();
}
const STATS = [
  ['Speed', v => v.top, 50, 70],
  ['Accel', v => v.accel, 18, 42],
  ['Handling', v => v.turn * (0.6 + 0.4 * Math.min(1, v.grip / 8)), 1.4, 3.3],
  ['Toughness', v => v.hp / v.armor, 55, 320],
  ['Weight', v => v.mass, 0.5, 3.4],
];
function renderGarage() {
  $('vehGrid').replaceChildren(...VEHICLE_IDS.map(id => el('button', {
    className: id === myVehicle ? 'on' : '', title: VEHICLES[id].name,
    onclick: () => { myVehicle = id; store.set('crash-vehicle', id); renderGarage(); rideChanged(); },
  }, thumbs[id] ? el('img', { src: thumbs[id], alt: '' }) : '', el('span', { textContent: VEHICLES[id].name }))));
  const v = VEHICLES[myVehicle];
  $('vehName').textContent = v.name;
  $('vehPerk').textContent = v.perk;
  $('vehStats').replaceChildren(...STATS.map(([label, f, lo, hi]) => el('div', { className: 'stat' },
    el('span', { textContent: label }),
    el('i', {}, el('b', { style: `width:${Math.round(8 + 92 * clamp((f(v) - lo) / (hi - lo), 0, 1))}%` })))));
}
// Changing your ride in the waiting room tells everyone, so the next race uses it.
function rideChanged() {
  const p = peers.get(selfId);
  if (!p) return;
  p.v = myVehicle;
  p.c = myColor;
  send('hello', hello());
  renderUI();
}
renderThumbs();
$('nameInput').value = store.get('crash-name') || '';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const codeFromHash = () => location.hash.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const newCode = () => Array.from({ length: 4 }, () => pick(CODE_CHARS)).join('');
const cleanPath = () => location.pathname.replace(/index\.html$/, '');
let hashCode = codeFromHash();
function showJoinMode() {
  $('joinExisting').classList.toggle('hidden', !hashCode);
  $('joinFresh').classList.toggle('hidden', !!hashCode);
  $('joinBtn').textContent = `Join room ${hashCode}`;
}
showJoinMode();
$('newInstead').onclick = () => { hashCode = ''; history.replaceState(null, '', cleanPath() + location.search); showJoinMode(); };
function getName() {
  const n = cleanText($('nameInput').value, 16);
  if (!n) { $('nameInput').focus(); toast('Pick a name first'); return null; }
  store.set('crash-name', n);
  return n;
}
$('createBtn').onclick = () => { const n = getName(); if (n) enter(n, newCode()); };
$('joinBtn').onclick = () => { const n = getName(); if (n) enter(n, hashCode); };
$('joinForm').onsubmit = e => {
  e.preventDefault();
  const n = getName();
  if (!n) return;
  const code = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3) { $('codeInput').focus(); toast('Enter a room code'); return; }
  enter(n, code);
};
async function enter(name, code) {
  sound.unlock();
  roomCode = code;
  history.replaceState(null, '', `${cleanPath()}${location.search}#${code}`);
  addEventListener('hashchange', () => location.reload());
  document.title = `Crash Circuit · ${code}`;
  G = { ...G, p: 'lobby' };
  $('roomCode').textContent = code;
  renderUI();
  $('waitMsg').textContent = 'Connecting…';
  await connect(name);
  renderUI();
}
const inviteUrl = () => `${location.origin}${cleanPath()}#${roomCode}`;
$('inviteBtn').onclick = async () => {
  const url = inviteUrl();
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Crash Circuit', text: `Race me in Crash Circuit, room ${roomCode}`, url }); return; } catch { }
  }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  catch { prompt('Copy this link:', url); }
};
for (const btn of document.querySelectorAll('.stepper button')) {
  btn.onclick = () => {
    if (!isHost()) return;
    const k = btn.dataset.s, d = Number(btn.dataset.d);
    hostBroadcast({ ...G, [k]: k === 'bots' ? clamp(G.bots + d, 0, MAX_CARS - 1) : clamp(G.laps + d, 1, 9) });
  };
}
$('startBtn').onclick = hostStart;
$('againBtn').onclick = hostStart;
$('toLobbyBtn').onclick = () => { if (isHost()) hostBroadcast({ ...G, p: 'lobby', res: null }); };
$('leaveBtn').onclick = () => { history.replaceState(null, '', cleanPath() + location.search); location.reload(); };
function toggleMute() { sound.setMuted(!sound.muted); $('muteBtn').textContent = sound.muted ? '🔇' : '🔊'; }
$('muteBtn').textContent = sound.muted ? '🔇' : '🔊';
$('muteBtn').onclick = () => { sound.unlock(); toggleMute(); };

const coarse = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', coarse);
if (coarse) $('itemKey').textContent = '';

function renderUI() {
  const p = G.p;
  $('menu').classList.toggle('hidden', p !== 'menu');
  $('lobby').classList.toggle('hidden', p !== 'lobby');
  $('results').classList.toggle('hidden', p !== 'res');
  $('hud').classList.toggle('hidden', p !== 'race');
  $('touch').classList.toggle('hidden', !(coarse && p === 'race' && me));
  $('leaveBtn').classList.toggle('hidden', p === 'menu');
  document.body.classList.toggle('racing', p === 'race');
  if (p === 'race') for (const id of ['pos', 'posOf', 'lap', 'time']) $(id).parentElement.classList.toggle('hidden', !me);
  $('hpFill').parentElement.parentElement.classList.toggle('hidden', !me);
  $('itemSlot').classList.toggle('hidden', !me);

  // The color and vehicle picker lives in whichever screen is showing.
  const rideHome = p === 'lobby' ? $('lobbyRide') : $('menuRide');
  if ($('ride').parentElement !== rideHome) rideHome.append($('ride'));

  const host = peers.get(hostId);
  const list = [...peers].sort((a, b) => a[1].t - b[1].t);
  $('players').replaceChildren(...list.map(([id, pl], i) => el('li', {},
    el('span', { className: 'dot', style: `background:${pl.c}` }),
    el('span', { textContent: pl.n + (id === selfId ? ' (you)' : '') }),
    el('small', { textContent: [VEHICLES[pl.v]?.name, id === hostId ? 'host' : i >= MAX_CARS ? 'watching' : ''].filter(Boolean).join(' · ') }))));
  $('hostControls').classList.toggle('hidden', !isHost());
  $('mapPick').replaceChildren(...[...MAPS, { id: 'random', name: 'Random', icon: '🎲' }].map(m => el('button', {
    className: G.map === m.id ? 'on' : '', disabled: !isHost(), title: m.blurb ?? 'A different map every race',
    onclick: () => { if (isHost()) hostBroadcast({ ...G, map: m.id, cur: m.id === 'random' ? G.cur : m.id }); },
  }, el('b', { textContent: m.icon }), el('span', { textContent: m.name }))));
  $('mapBlurb').textContent = MAP_BY_ID[G.map]?.blurb ?? 'A different map every race.';
  $('botsVal').textContent = G.bots;
  $('lapsVal').textContent = G.laps;
  if (room || selfId === 'me') $('waitMsg').textContent = isHost()
    ? (peers.size < 2 ? 'Share the invite link to race friends, or start now against bots.' : '')
    : `Waiting for ${host?.n ?? 'the host'} to start the race…`;

  if (p === 'res' && G.res) {
    $('resMap').textContent = MAP_BY_ID[G.cur]?.name ?? '';
    $('resBody').replaceChildren(...G.res.map((r, i) => el('tr', { className: r.id === selfId ? 'me' : '' },
      el('td', { textContent: r.left ? '–' : `${i + 1}` }),
      el('td', {}, el('span', { className: 'dot', style: `background:${cleanColor(r.c)}` }), `${cleanText(r.n, 16)}${r.bot ? ' 🤖' : ''}`, el('small', { className: 'veh', textContent: VEHICLES[r.v]?.name ?? '' })),
      el('td', { textContent: r.left ? 'Left' : r.fin != null ? fmtTime(num(r.fin)) : 'DNF' }),
      el('td', { textContent: String(num(r.kos)) }))));
    $('resHost').classList.toggle('hidden', !isHost());
    $('resWait').textContent = isHost() ? '' : `Waiting for ${host?.n ?? 'the host'}…`;
  }
}

loadMap(params.get('map') || G.cur);   // ?map=city shows that map in the menu
if (MAP_BY_ID[params.get('map')]) G.map = G.cur = params.get('map');

// ---------- Main loop ----------
let last = now(), acc = 0;
function loop() {
  const t = now();
  const dt = Math.min(document.hidden ? 1 : 0.25, (t - last) / 1000);
  last = t;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n++ < 60) { simStep(STEP); acc -= STEP; }
  if (acc > STEP) acc = 0;
  if (document.hidden && !DEV) return;
  frame(Math.min(dt, 0.1));
  renderer.render(scene, camera);
}
if (DEV) setInterval(loop, 16);
else {
  const raf = () => { loop(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  // Background tabs get no animation frames, so keep the race (and any bots) moving.
  setInterval(() => { if (document.hidden) loop(); }, 250);
}
renderUI();
$('loading').remove();

if (DEV) {
  window.cc = { dev, VEHICLES, MAPS, loadMap, Car, botDrive, get G() { return G; }, cars, get me() { return me; }, get track() { return track; }, get boxes() { return boxes; }, hostStart, missiles, mines, useItem, ranking, camera, renderer, scene };
  if (params.get('bots')) G.bots = clamp(Number(params.get('bots')) | 0, 0, MAX_CARS - 1);
  if (params.has('solo')) {
    $('nameInput').value ||= 'Tester';
    enter(getName(), params.has('offline') ? 'TEST' : newCode()).then(() => setTimeout(hostStart, 300));
  }
}
