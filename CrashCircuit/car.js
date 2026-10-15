// A car: arcade driving physics, wall bounces, and its low-poly model.
// Heading h: forward is (sin h, cos h) in x/z, and turning left increases h.
import * as THREE from 'three';
import { WALL, N } from './track.js';

export const MAX_HP = 100;
export const TOP = 54;        // top speed, m/s
const ACCEL = 26;
const BRAKE = 48;
const REVERSE = 14;
const TURN = 2.5;             // max yaw rate, rad/s
const GRIP = 7;               // how fast sideways slide dies out
export const RAD = 1.15;      // collision circles: two per car, at ±AXLE along its length
export const AXLE = 1.1;

const P = { i: 0, lat: 0, y: 0 };

export class Car {
  constructor(id, name, color, { local = false, bot = false } = {}) {
    Object.assign(this, { id, name, color, local, bot });
    this.mesh = makeCarMesh(color);
    this.skill = 1;
    this.reset();
  }

  reset() {
    Object.assign(this, {
      x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, hp: MAX_HP,
      item: null, rollT: 0, boost: 0, shield: 0, spin: 0, spinDir: 1, ghost: 0, dead: 0,
      yOff: 0, vy: 0, lap: -1, idx: 0, fin: null, kos: 0, lastHit: null, wheelRot: 0,
    });
  }

  get prog() { return this.lap + this.idx / N; }
  get fwd() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  get speed() { return Math.hypot(this.vx, this.vz); }

  place(track, i, lat = 0) {
    const p = track.pointAt(i, lat);
    this.x = p.x; this.y = p.y; this.z = p.z;
    this.h = track.headingAt(i);
    this.idx = ((i % track.N) + track.N) % track.N;
    this.vx = this.vz = this.vy = this.yOff = 0;
  }

  // One physics step for a car this page simulates. Returns how hard it hit a wall (m/s).
  step(dt, inp, track) {
    for (const k of ['boost', 'shield', 'spin', 'ghost']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    if (this.rollT > 0) this.rollT = Math.max(0, this.rollT - dt);

    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    let vF = this.vx * fx + this.vz * fz;
    let vS = this.vx * fz - this.vz * fx;
    let { steer, throttle, brake } = inp;
    if (this.spin > 0) {
      steer = throttle = brake = 0;
      this.h += this.spinDir * 11 * dt;
      vF *= Math.exp(-1.6 * dt);
    }
    const airborne = this.yOff > 0.3;
    if (airborne) throttle = brake = 0;
    const top = TOP * this.skill * (this.boost > 0 ? 1.45 : 1) * (this.hp < 30 ? 0.88 : 1);
    if (this.boost > 0) throttle = Math.max(throttle, 0.6);

    if (throttle > 0) {
      if (vF < 0) vF += BRAKE * dt * throttle;
      else if (vF < top) vF += ACCEL * (this.boost > 0 ? 1.8 : 1) * (1 - (vF / top) ** 2) * dt * throttle;
    }
    if (brake > 0) {
      if (vF > 0.5) vF -= BRAKE * dt * brake;
      else vF = Math.max(-REVERSE, vF - ACCEL * 0.6 * dt * brake);
    }
    if (!throttle && !brake) vF *= Math.exp(-0.45 * dt);
    if (vF > top) vF += (top - vF) * 1.2 * dt;

    this.steer += (steer - this.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(vF);
    if (!airborne) this.h += this.steer * TURN * Math.min(1, sp / 7) * (1 - 0.42 * Math.min(1, sp / TOP)) * Math.sign(vF) * dt;
    vS *= Math.exp(-(airborne ? 0.5 : this.spin > 0 ? 1.5 : GRIP) * dt);
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h);
    this.vx = nfx * vF + nfz * vS;
    this.vz = nfz * vF - nfx * vS;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    if (this.yOff > 0 || this.vy > 0) {
      this.vy -= 30 * dt;
      this.yOff += this.vy * dt;
      if (this.yOff <= 0) this.yOff = this.vy = 0;
    }

    const prev = this.idx;
    track.project(this.x, this.z, this.idx, P);
    this.idx = P.i;
    this.y = P.y;
    const N = track.N;
    if (prev > N * 0.75 && this.idx < N * 0.25) this.lap++;
    else if (prev < N * 0.25 && this.idx > N * 0.75) this.lap--;

    // Barriers: push back inside and bounce off.
    const lim = WALL - 1.2;
    if (Math.abs(P.lat) > lim) {
      const s = Math.sign(P.lat), wx = track.nx[this.idx] * s, wz = track.nz[this.idx] * s;
      const over = Math.abs(P.lat) - lim;
      this.x -= wx * over; this.z -= wz * over;
      const vn = this.vx * wx + this.vz * wz;
      if (vn > 0) {
        this.vx -= wx * vn * 1.4; this.vz -= wz * vn * 1.4;
        const scrub = Math.exp(-vn * 0.012);
        this.vx *= scrub; this.vz *= scrub;
        return vn;
      }
    }
    return 0;
  }
}

// ---------- Model ----------
const shared = {
  glass: new THREE.MeshStandardMaterial({ color: 0x1d2633, roughness: 0.2, metalness: 0.4 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.9 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbfc5cc, roughness: 0.3, metalness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.7 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff2b0, emissiveIntensity: 1.2 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff1010, emissiveIntensity: 1.2 }),
  shield: new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.28, depthWrite: false }),
};
const wheelGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.38, 14).rotateZ(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.4, 8).rotateZ(Math.PI / 2);
const shieldGeo = new THREE.SphereGeometry(1, 20, 14);

export function makeCarMesh(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25, transparent: true });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const body = box(2.1, 0.6, 4.3, paint, 0, 0.62, 0);
  box(2.15, 0.25, 4.35, shared.dark, 0, 0.38, 0);              // skirt
  const hood = box(1.9, 0.18, 1.3, paint, 0, 0.98, 1.35);
  box(1.7, 0.55, 1.9, shared.glass, 0, 1.18, -0.35);           // cabin
  box(1.62, 0.1, 1.6, paint, 0, 1.5, -0.4);                    // roof
  const spoiler = new THREE.Group();
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.55), paint);
  wing.position.set(0, 1.45, -1.95);
  wing.castShadow = true;
  for (const s of [-0.7, 0.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.2), shared.dark);
    post.position.set(s, 1.15, -1.95);
    spoiler.add(post);
  }
  spoiler.add(wing);
  g.add(spoiler);
  for (const s of [-0.65, 0.65]) {
    box(0.4, 0.14, 0.05, shared.head, s, 0.7, 2.16);
    box(0.45, 0.14, 0.05, shared.tail, s, 0.72, -2.16);
  }
  box(1.2, 0.18, 0.06, shared.dark, 0, 0.55, 2.17);            // grille

  const wheels = [];
  for (const [x, z] of [[1.0, 1.35], [-1.0, 1.35], [1.0, -1.35], [-1.0, -1.35]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.44, z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, shared.tire);
    tire.castShadow = true;
    spin.add(tire, new THREE.Mesh(rimGeo, shared.rim));
    pivot.add(spin);
    g.add(pivot);
    wheels.push({ pivot, spin, front: z > 0 });
  }
  const shield = new THREE.Mesh(shieldGeo, shared.shield);
  shield.scale.set(2.2, 1.6, 3.2);
  shield.position.y = 0.9;
  shield.visible = false;
  g.add(shield);

  // The body sits on a pivot so hops and slopes tilt it around the car's middle.
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.add(g);
  root.userData = { paint, base: new THREE.Color(color), body, hood, spoiler, wheels, shield, g };
  return root;
}

const scorch = new THREE.Color(0x2a2522);
// Copy a car's state onto its model.
export function syncMesh(car, track, dt, t) {
  const m = car.mesh, u = m.userData;
  m.visible = car.dead <= 0;
  if (!m.visible) return;
  m.position.set(car.x, car.y + car.yOff, car.z);
  m.rotation.y = car.h;
  const i = car.idx;
  const along = track.tx[i] * Math.sin(car.h) + track.tz[i] * Math.cos(car.h);
  const pitch = -Math.atan(track.slope[i] * along);
  m.rotation.x += (pitch - m.rotation.x) * Math.min(1, dt * 10);
  // A bit of body roll in turns, and a tumble while airborne.
  u.g.rotation.z = -car.steer * Math.min(1, car.speed / 40) * 0.06;
  u.g.rotation.x = car.yOff > 0.3 ? Math.sin(t * 9) * 0.15 : 0;

  const fwd = car.fwd;
  car.wheelRot += fwd * dt / 0.44;
  for (const w of u.wheels) {
    w.spin.rotation.x = car.wheelRot;
    if (w.front) w.pivot.rotation.y = car.steer * 0.45;
  }
  const dmg = 1 - car.hp / MAX_HP;
  u.paint.color.copy(u.base).lerp(scorch, dmg * 0.65);
  u.body.scale.set(1 - dmg * 0.04, 1 - dmg * 0.1, 1 - dmg * 0.06);
  u.hood.rotation.x = dmg > 0.5 ? -0.25 * (dmg - 0.5) * 2 : 0;
  u.spoiler.visible = car.hp > 45;
  u.shield.visible = car.shield > 0;
  if (car.shield > 0) u.shield.material.opacity = 0.2 + Math.sin(t * 12) * 0.08;
  u.paint.opacity = car.ghost > 0 ? 0.45 + Math.sin(t * 20) * 0.2 : 1;
}
