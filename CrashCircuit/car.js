// A car: arcade driving physics and wall bounces, with stats from its vehicle type.
// Heading h: forward is (sin h, cos h) in x/z, and turning left increases h.
import * as THREE from 'three';
import { WALL, N } from './track.js';
import { VEHICLES, makeVehicleMesh } from './vehicles.js';

export const REF_TOP = 54;    // the Racer's top speed, for sound and camera scaling

const P = { i: 0, lat: 0, y: 0 };

export class Car {
  constructor(id, name, color, { local = false, bot = false, type = 'racer' } = {}) {
    Object.assign(this, { id, name, color, local, bot });
    this.spec = VEHICLES[type] || VEHICLES.racer;
    this.type = this.spec.id;
    this.maxHp = this.spec.hp;
    this.mesh = makeVehicleMesh(this.type, color);
    this.skill = 1;
    this.reset();
  }

  reset() {
    Object.assign(this, {
      x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, hp: this.maxHp,
      item: null, rollT: 0, boost: 0, shield: 0, spin: 0, spinDir: 1, ghost: 0, dead: 0,
      yOff: 0, vy: 0, lap: -1, idx: 0, fin: null, kos: 0, lastHit: null, wheelRot: 0,
    });
  }

  get prog() { return this.lap + this.idx / N; }
  get fwd() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get health() { return this.hp / this.maxHp; }

  place(track, i, lat = 0) {
    const p = track.pointAt(i, lat);
    this.x = p.x; this.y = p.y; this.z = p.z;
    this.h = track.headingAt(i);
    this.idx = ((i % track.N) + track.N) % track.N;
    this.vx = this.vz = this.vy = this.yOff = 0;
  }

  // Is (x, z) within r of any of this car's collision circles?
  near(x, z, r) {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rr = (r + this.spec.rad) ** 2;
    for (const o of this.spec.circles) if ((this.x + fx * o - x) ** 2 + (this.z + fz * o - z) ** 2 < rr) return true;
    return false;
  }

  // One physics step for a car this page simulates. Returns how hard it hit a wall (m/s).
  step(dt, inp, track) {
    const S = this.spec;
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
    const top = S.top * this.skill * (this.boost > 0 ? 1.45 : 1) * (this.health < 0.3 ? 0.88 : 1);
    if (this.boost > 0) throttle = Math.max(throttle, 0.6);

    if (throttle > 0) {
      if (vF < 0) vF += S.brake * dt * throttle;
      else if (vF < top) vF += S.accel * (this.boost > 0 ? 1.8 : 1) * (1 - (vF / top) ** 2) * dt * throttle;
    }
    if (brake > 0) {
      if (vF > 0.5) vF -= S.brake * dt * brake;
      else vF = Math.max(-S.reverse, vF - S.accel * 0.6 * dt * brake);
    }
    if (!throttle && !brake) vF *= Math.exp(-0.45 * dt);
    if (vF > top) vF += (top - vF) * 1.2 * dt;

    this.steer += (steer - this.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(vF);
    if (!airborne) this.h += this.steer * S.turn * Math.min(1, sp / 7) * (1 - 0.42 * Math.min(1, sp / S.top)) * Math.sign(vF) * dt;
    vS *= Math.exp(-(airborne ? 0.5 : this.spin > 0 ? 1.5 : S.grip) * dt);
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
    if (prev > N * 0.75 && this.idx < N * 0.25) this.lap++;
    else if (prev < N * 0.25 && this.idx > N * 0.75) this.lap--;

    // Barriers: check every collision circle (a bus is long), push back inside, bounce.
    const i = this.idx, nx = track.nx[i], nz = track.nz[i];
    const lim = WALL - S.rad - 0.1;
    let over = 0, side = 0;
    for (const o of S.circles) {
      const lat = P.lat + (nfx * nx + nfz * nz) * o;
      const d = Math.abs(lat) - lim;
      if (d > over) { over = d; side = Math.sign(lat); }
    }
    if (over > 0) {
      const wx = nx * side, wz = nz * side;
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
  u.g.rotation.z = -car.steer * Math.min(1, car.speed / 40) * (u.spec.mass > 2 ? 0.03 : 0.06);
  u.g.rotation.x = car.yOff > 0.3 ? Math.sin(t * 9) * 0.15 : 0;
  if (u.hover) u.g.position.y = 0.25 + Math.sin(t * 4 + car.x * 0.1) * 0.07;

  const fwd = car.fwd, sp = Math.abs(fwd) / u.spec.top;
  car.wheelRot += fwd * dt / u.wheelR;
  for (const w of u.wheels) {
    w.spin.rotation.x = car.wheelRot;
    if (w.front) w.pivot.rotation.y = car.steer * 0.45;
  }
  for (const s of u.spin) s.rotation.z += dt * (6 + sp * 30);
  for (const f of u.flames) {
    const on = car.boost > 0 ? 1.6 : Math.min(1, sp * 1.2);
    f.visible = on > 0.08;
    f.scale.set(1, 1, on * (0.8 + Math.random() * 0.4));
    f.material.color.setHex(car.boost > 0 ? 0x74c0fc : 0xffa94d);
  }
  if (u.blink.length) {
    const ph = Math.floor(t * 5) % 2;
    u.blink[0].emissiveIntensity = ph ? 3 : 0.15;
    u.blink[1].emissiveIntensity = ph ? 0.15 : 3;
  }
  const dmg = 1 - car.health;
  u.paint.color.copy(u.base).lerp(scorch, dmg * 0.65);
  u.body.scale.set(1 - dmg * 0.04, 1 - dmg * 0.1, 1 - dmg * 0.06);
  u.part.visible = car.health > 0.45;
  u.shield.visible = car.shield > 0;
  if (car.shield > 0) u.shield.material.opacity = 0.2 + Math.sin(t * 12) * 0.08;
  u.paint.opacity = car.ghost > 0 ? 0.45 + Math.sin(t * 20) * 0.2 : 1;
}
