// A car: arcade driving physics with stats from its vehicle type. Cars drive on the road
// or the terrain around it (slower off-road), fly off ramps and drops, bounce off solid
// scenery, and count laps through checkpoints.
// Heading h: forward is (sin h, cos h) in x/z, and turning left increases h.
import * as THREE from 'three';
import { N, CHECKPOINTS } from './track.js';
import { VEHICLES, makeVehicleMesh } from './vehicles.js';

export const REF_TOP = 62;    // the Racer's top speed, for camera scaling
const GRAV = 30;              // a bit more than real gravity: arcade jumps
const STICK = 14;             // the ground can fall away this fast (m/s) before we take off
const CP_WINDOW = 90;         // samples past a checkpoint that still count as passing it
const NEAR_ROAD = 35;         // checkpoints only count within this distance of a road

const SH = { pen: 0, nx: 0, nz: 0 };
const PF = {}, PB = {};

export class Car {
  constructor(id, name, color, { local = false, bot = false, type = 'racer' } = {}) {
    Object.assign(this, { id, name, color, local, bot });
    this.spec = VEHICLES[type] || VEHICLES.racer;
    this.type = this.spec.id;
    this.maxHp = this.spec.hp;
    this.mesh = makeVehicleMesh(this.type, color);
    this.skill = 1;
    this.q = { path: 0, i: 0, idx: 0, onRoad: true, dist: 0, ground: 0, lat: 0 };   // last ground probe
    this.reset();
  }

  reset() {
    Object.assign(this, {
      x: 0, y: 0, z: 0, h: 0, vx: 0, vz: 0, vy: 0, steer: 0, hp: this.maxHp,
      item: null, rollT: 0, boost: 0, shield: 0, spin: 0, spinDir: 1, ghost: 0, dead: 0,
      air: false, offroad: false, gPrev: 0, pitch: 0,
      lap: -1, next: 0, idx: 0, fin: null, kos: 0, lastHit: null, wheelRot: 0, missed: false,
    });
  }

  // How far round the race this car is, for ranking: laps plus the fraction of the current
  // lap, held back to the stretch before the next checkpoint it still has to pass.
  get prog() {
    let f = this.idx / N;
    if (this.next > 0) {
      const lo = (this.next - 1) / CHECKPOINTS - 0.03, hi = this.next / CHECKPOINTS + 0.03;
      if (f < lo || f > hi) f = Math.max(lo, 0);
    }
    return this.lap + f;
  }
  get fwd() { return this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get health() { return this.hp / this.maxHp; }

  // Put the car on a road path at sample i, facing along it.
  place(track, i, lat = 0, path = 0) {
    const p = track.pointAt(i, lat, path);
    this.x = p.x; this.z = p.z;
    this.h = track.headingAt(i, path);
    track.probe(this.x, this.z, this.q);
    this.y = this.gPrev = this.q.ground;
    if (this.q.path >= 0) this.idx = this.q.idx;
    this.vx = this.vz = this.vy = 0;
    this.air = false;
  }

  // Is (x, z) within r of any of this car's collision circles?
  near(x, z, r) {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), rr = (r + this.spec.rad) ** 2;
    for (const o of this.spec.circles) if ((this.x + fx * o - x) ** 2 + (this.z + fz * o - z) ** 2 < rr) return true;
    return false;
  }

  // One physics step for a car this page simulates. Returns how hard it hit something
  // solid (m/s); `this.landed` is how hard it landed from a jump.
  step(dt, inp, track) {
    const S = this.spec, off = track.off;
    for (const k of ['boost', 'shield', 'spin', 'ghost']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    if (this.rollT > 0) this.rollT = Math.max(0, this.rollT - dt);
    this.landed = 0;

    const fx = Math.sin(this.h), fz = Math.cos(this.h);
    let vF = this.vx * fx + this.vz * fz;
    let vS = this.vx * fz - this.vz * fx;
    let { steer, throttle, brake } = inp;
    if (this.spin > 0) {
      steer = throttle = brake = 0;
      this.h += this.spinDir * 11 * dt;
      vF *= Math.exp(-1.6 * dt);
    }
    const air = this.air;
    if (air) throttle = brake = 0;
    const rough = this.offroad && !air;
    const top = S.top * this.skill * (this.boost > 0 ? 1.45 : 1) * (this.health < 0.3 ? 0.88 : 1) * (rough ? off.top : 1);
    if (this.boost > 0) throttle = Math.max(throttle, 0.6);

    if (throttle > 0) {
      if (vF < 0) vF += S.brake * dt * throttle;
      else if (vF < top) vF += S.accel * (this.boost > 0 ? 1.8 : 1) * (1 - (vF / top) ** 2) * dt * throttle;
    }
    if (brake > 0) {
      if (vF > 0.5) vF -= S.brake * dt * brake;
      else vF = Math.max(-S.reverse, vF - S.accel * 0.6 * dt * brake);
    }
    if (!throttle && !brake && !air) vF *= Math.exp(-(rough ? 0.45 + off.drag : 0.45) * dt);
    // Over the top speed (off-road, or after nitro) bleeds off; faster on rough ground.
    if (vF > top && !air) vF += (top - vF) * (rough ? 2.2 : 1.2) * dt;
    // Hills: gravity pulls along the slope.
    if (!air) vF -= 9.8 * 0.6 * Math.sin(this.pitch) * dt;

    this.steer += (steer - this.steer) * Math.min(1, dt * 9);
    const sp = Math.abs(vF);
    if (!air) this.h += this.steer * S.turn * Math.min(1, sp / 7) * (1 - 0.42 * Math.min(1, sp / S.top)) * Math.sign(vF) * dt;
    const grip = S.grip * track.grip * (rough ? off.grip : 1);
    vS *= Math.exp(-(air ? 0.3 : this.spin > 0 ? 1.5 : grip) * dt);
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h);
    this.vx = nfx * vF + nfz * vS;
    this.vz = nfz * vF - nfx * vS;
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Solid scenery: push every collision circle out and bounce.
    let impact = 0;
    for (const o of S.circles) {
      if (!track.solidHit(this.x + nfx * o, this.z + nfz * o, S.rad, this.y + 0.3, SH)) continue;
      this.x += SH.nx * SH.pen; this.z += SH.nz * SH.pen;
      const vn = this.vx * SH.nx + this.vz * SH.nz;
      if (vn < 0) {
        this.vx -= SH.nx * vn * 1.35; this.vz -= SH.nz * vn * 1.35;
        const scrub = Math.exp(vn * 0.012);
        this.vx *= scrub; this.vz *= scrub;
        impact = Math.max(impact, -vn);
        this.hitX = this.x + nfx * o - SH.nx * S.rad; this.hitZ = this.z + nfz * o - SH.nz * S.rad;
      }
    }

    // Ground: follow it while it's there; take off when it falls away faster than STICK
    // (ramp lips, cliffs) or something launched us; land when we come back down.
    const q = track.probe(this.x, this.z, this.q);
    const g = q.ground, rise = (g - this.gPrev) / dt;
    this.gPrev = g;
    this.offroad = !q.onRoad;
    if (!this.air && (rise < -STICK || this.vy > rise + 0.5)) this.air = true;
    if (this.air) {
      this.vy -= GRAV * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.landed = Math.max(0, -this.vy + Math.min(0, rise));
        this.air = false;
      }
    }
    if (!this.air) { this.y = g; this.vy = Math.max(-25, Math.min(25, rise)); }

    // Tilt to match the ground under the front and back wheels; in the air, nose follows the arc.
    if (!this.air) {
      const half = S.l * 0.4;
      const gf = track.probe(this.x + nfx * half, this.z + nfz * half, PF).ground, gb = track.probe(this.x - nfx * half, this.z - nfz * half, PB).ground;
      this.pitch = Math.atan2(gf - gb, half * 2);
    } else this.pitch += (Math.atan2(this.vy, Math.max(8, Math.abs(vF))) * 0.5 - this.pitch) * Math.min(1, dt * 3);

    // Laps: pass the checkpoints in order, then the line. Shortcuts across the grass skip
    // checkpoints, so they don't count.
    if (q.path >= 0 && q.dist < NEAR_ROAD) {
      const prev = this.idx, idx = q.idx;
      this.idx = idx;
      if (this.next === 0) {
        if (prev > N * 0.75 && idx < N * 0.25) { this.lap++; this.next = 1; this.missed = false; }
      } else {
        const c = this.next * N / CHECKPOINTS;
        if (idx >= c && idx < c + CP_WINDOW) { this.next = (this.next + 1) % CHECKPOINTS; this.missed = false; }
        else if (idx > c + CP_WINDOW && idx < c + CP_WINDOW + 300) this.missed = true;
      }
    }
    return impact;
  }
}

const scorch = new THREE.Color(0x2a2522);
// Copy a car's state onto its model.
export function syncMesh(car, track, dt, t) {
  const m = car.mesh, u = m.userData;
  m.visible = car.dead <= 0;
  if (!m.visible) return;
  m.position.set(car.x, car.y, car.z);
  m.rotation.y = car.h;
  // Remote cars don't run physics, so work out their tilt from the ground here.
  if (!car.local && !car.air) {
    const half = u.spec.l * 0.4, fx = Math.sin(car.h), fz = Math.cos(car.h);
    car.pitch = Math.atan2(track.groundAt(car.x + fx * half, car.z + fz * half) - track.groundAt(car.x - fx * half, car.z - fz * half), half * 2);
  }
  m.rotation.x += (-car.pitch - m.rotation.x) * Math.min(1, dt * 10);
  // A bit of body roll in turns, and a tumble while airborne.
  u.g.rotation.z = -car.steer * Math.min(1, car.speed / 40) * (u.spec.mass > 2 ? 0.03 : 0.06);
  u.g.rotation.x = car.air && car.spin > 0 ? Math.sin(t * 9) * 0.15 : 0;
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
