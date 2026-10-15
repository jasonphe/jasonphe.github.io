// Every vehicle: its stats, its perk, and its model. Models face +z with the ground at y = 0.
import * as THREE from 'three';

// top: top speed (m/s). accel, brake: m/s². turn: max yaw rate (rad/s). grip: how fast
// sideways slide dies out. hp: max health. mass: bumps, knockback and who hurts whom.
// w, l, h: size in meters (collisions, camera, labels).
// Perks: armor (damage taken ×), boostLen (nitro length ×), heal (repair kit ×),
// mineProof, spinProof (hits don't spin it out), startItem (holds this item at the start).
export const VEHICLES = {
  racer: {
    name: 'Racer', perk: 'The all-rounder. Good at everything.',
    top: 54, accel: 26, turn: 2.5, grip: 7, hp: 100, mass: 1, w: 2.15, l: 4.35, h: 1.6,
  },
  f1: {
    name: 'Formula', perk: 'Fastest thing on the track. Folds like paper.',
    top: 60, accel: 30, turn: 2.75, grip: 10, hp: 65, mass: 0.75, w: 2.6, l: 5.4, h: 1.25,
  },
  muscle: {
    name: 'Muscle Car', perk: 'Big engine, loose tail. Loves to drift.',
    top: 58, accel: 29, turn: 2.3, grip: 4, hp: 115, mass: 1.25, w: 2.25, l: 4.7, h: 1.6,
  },
  kart: {
    name: 'Go-Kart', perk: 'Tiny, twitchy, launches off the line.',
    top: 49, accel: 36, turn: 3.3, grip: 9, hp: 60, mass: 0.5, w: 1.6, l: 2.6, h: 1.6,
  },
  police: {
    name: 'Cop Car', perk: 'Starts every race with a missile.',
    top: 55, accel: 26, turn: 2.5, grip: 7, hp: 110, mass: 1.15, w: 2.15, l: 4.6, h: 1.75, startItem: 'missile',
  },
  bat: {
    name: 'Night Bat', perk: 'Jet engine. Nitro lasts 60% longer.',
    top: 60, accel: 28, turn: 2.35, grip: 7, hp: 105, mass: 1.25, w: 2.5, l: 5.6, h: 1.7, boostLen: 1.6,
  },
  monster: {
    name: 'Monster Truck', perk: 'Too heavy to spin out. Rolls over the little guys.',
    top: 53, accel: 25, turn: 2.2, grip: 6, hp: 165, mass: 1.9, w: 3.6, l: 4.9, h: 3.2, spinProof: true,
  },
  bus: {
    name: 'School Bus', perk: 'Slow. Enormous. Ramming things is a lifestyle.',
    top: 49, accel: 20, turn: 1.8, grip: 6, hp: 250, mass: 3.4, w: 2.7, l: 10.4, h: 3.0, spinProof: true,
  },
  icecream: {
    name: 'Ice Cream Truck', perk: 'Repair kits heal double.',
    top: 51, accel: 22, turn: 2.1, grip: 6, hp: 150, mass: 1.8, w: 2.5, l: 6, h: 3.6, heal: 2,
  },
  tank: {
    name: 'Tank', perk: 'Armor plating: takes 40% less damage. Never spins.',
    top: 47, accel: 21, turn: 2.0, grip: 10, hp: 190, mass: 3, w: 3.1, l: 6.6, h: 2.4, armor: 0.6, spinProof: true,
  },
  hover: {
    name: 'Hovercraft', perk: 'Floats over mines. Steering is a suggestion.',
    top: 56, accel: 24, turn: 2.7, grip: 1.6, hp: 90, mass: 0.9, w: 2.8, l: 4.8, h: 2.1, mineProof: true,
  },
  couch: {
    name: 'Rocket Couch', perk: 'Someone strapped a rocket to a sofa. Starts with nitro.',
    top: 52, accel: 38, turn: 2.2, grip: 5, hp: 80, mass: 0.9, w: 2.4, l: 3.1, h: 2.0, startItem: 'boost',
  },
};
export const VEHICLE_IDS = Object.keys(VEHICLES);
for (const [id, v] of Object.entries(VEHICLES)) {
  v.id = id;
  Object.assign(v, { armor: 1, boostLen: 1, heal: 1, ...v });
  v.brake = 48;
  v.reverse = 14;
  // Collision circles along the length, enough to cover long vehicles like the bus.
  v.rad = v.w / 2 + 0.05;
  const n = Math.max(2, Math.ceil(v.l / (2 * v.rad * 0.9)));
  const span = Math.max(0, v.l / 2 - v.rad);
  v.circles = Array.from({ length: n }, (_, k) => -span + 2 * span * k / (n - 1));
  // Chase camera distance and height.
  v.cam = { back: 5.2 + v.l * 0.75, up: 1.9 + v.h * 0.85 };
}

// ---------- Models ----------
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const M = {
  glass: std(0x1d2633, { roughness: 0.2, metalness: 0.4 }),
  tire: std(0x1b1b1e, { roughness: 0.9 }),
  rim: std(0xbfc5cc, { roughness: 0.3, metalness: 0.7 }),
  chrome: std(0xdfe4ea, { roughness: 0.15, metalness: 0.9 }),
  dark: std(0x24272c, { roughness: 0.7 }),
  black: std(0x15161a, { roughness: 0.35, metalness: 0.5 }),
  white: std(0xf1f3f5, { roughness: 0.5 }),
  yellow: std(0xffd43b, { roughness: 0.4 }),
  red: std(0xe03131, { roughness: 0.4 }),
  wood: std(0x8b5a2b, { roughness: 0.8 }),
  head: std(0xfff6d0, { emissive: 0xfff2b0, emissiveIntensity: 1.2 }),
  tail: std(0xff3030, { emissive: 0xff1010, emissiveIntensity: 1.2 }),
  amber: std(0xffc078, { emissive: 0xffa94d, emissiveIntensity: 1.5 }),
  shield: new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.28, depthWrite: false }),
};
const shieldGeo = new THREE.SphereGeometry(1, 20, 14);
const flameGeo = new THREE.ConeGeometry(0.32, 1.4, 12).rotateX(-Math.PI / 2).translate(0, 0, -0.7);

function kit(color) {
  const g = new THREE.Group();
  const paint = std(color, { roughness: 0.35, metalness: 0.25, transparent: true });
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
  const k = {
    g, paint, add, box, wheels: [], wheelR: 0.44, blink: [], spin: [], flames: [], hover: false,
    // A wheel on a steering pivot; the inner group rolls.
    wheel(r, wd, x, z, front = z > 0, rim = M.rim) {
      const pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      const roll = new THREE.Group();
      add(new THREE.CylinderGeometry(r, r, wd, 16).rotateZ(Math.PI / 2), M.tire, 0, 0, 0, roll);
      add(new THREE.CylinderGeometry(r * 0.6, r * 0.6, wd + 0.04, 10).rotateZ(Math.PI / 2), rim, 0, 0, 0, roll);
      pivot.add(roll);
      g.add(pivot);
      k.wheels.push({ pivot, spin: roll, front });
      k.wheelR = r;
    },
    lights(w, y, zf, zb, sep = 0.65) {
      for (const s of [-sep, sep]) {
        if (zf != null) box(0.4, 0.15, 0.06, M.head, s * w / 2.1, y, zf);
        if (zb != null) box(0.45, 0.15, 0.06, M.tail, s * w / 2.1, y, zb);
      }
    },
    flame(x, y, z, scale = 1) {
      const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.85, depthWrite: false }));
      m.position.set(x, y, z);
      m.scale.setScalar(scale);
      g.add(m);
      k.flames.push(m);
    },
    group(x = 0, y = 0, z = 0) { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; },
  };
  return k;
}

const BUILD = {
  racer(k, spoiler = true) {
    const body = k.box(2.1, 0.6, 4.3, k.paint, 0, 0.62, 0);
    k.box(2.15, 0.25, 4.35, M.dark, 0, 0.38, 0);
    k.box(1.9, 0.18, 1.3, k.paint, 0, 0.98, 1.35);
    k.box(1.7, 0.55, 1.9, M.glass, 0, 1.18, -0.35);
    k.box(1.62, 0.1, 1.6, k.paint, 0, 1.5, -0.4);
    const part = k.group();
    if (spoiler) {
      k.box(2.1, 0.08, 0.55, k.paint, 0, 1.45, -1.95, part);
      for (const s of [-0.7, 0.7]) k.box(0.08, 0.5, 0.2, M.dark, s, 1.15, -1.95, part);
    }
    k.lights(2.1, 0.7, 2.16, -2.16);
    k.box(1.2, 0.18, 0.06, M.dark, 0, 0.55, 2.17);
    for (const [x, z] of [[1, 1.35], [-1, 1.35], [1, -1.35], [-1, -1.35]]) k.wheel(0.44, 0.38, x, z);
    return { body, part };
  },
  f1(k) {
    const body = k.box(0.95, 0.45, 2.8, k.paint, 0, 0.5, -0.4);
    k.box(0.6, 0.3, 2.1, k.paint, 0, 0.42, 1.9);
    k.box(1.6, 0.35, 1.6, k.paint, 0, 0.42, -0.5);
    k.box(2.3, 0.06, 0.55, M.dark, 0, 0.2, 2.8);
    for (const s of [-1.12, 1.12]) k.box(0.05, 0.3, 0.55, k.paint, s, 0.3, 2.8);
    k.add(new THREE.SphereGeometry(0.28, 14, 10), M.yellow, 0, 0.92, -0.05);
    k.box(0.35, 0.12, 0.3, M.glass, 0, 0.95, 0.15);
    k.box(0.4, 0.45, 0.9, k.paint, 0, 0.95, -0.75);
    const part = k.group();
    k.box(1.9, 0.08, 0.55, k.paint, 0, 1.2, -2.3, part);
    k.box(1.9, 0.06, 0.4, M.dark, 0, 1.0, -2.3, part);
    for (const s of [-0.95, 0.95]) k.box(0.05, 0.5, 0.65, M.dark, s, 1.05, -2.3, part);
    k.box(0.3, 0.12, 0.06, M.tail, 0, 0.55, -2.62);
    for (const [x, z] of [[1.05, 1.6], [-1.05, 1.6], [1.05, -1.65], [-1.05, -1.65]]) k.wheel(0.5, 0.55, x, z, z > 0, M.dark);
    return { body, part };
  },
  muscle(k) {
    const body = k.box(2.2, 0.65, 4.6, k.paint, 0, 0.65, 0);
    k.box(2.24, 0.22, 4.64, M.dark, 0, 0.38, 0);
    k.box(1.7, 0.2, 1.7, k.paint, 0, 1.06, 1.35);
    k.box(0.7, 0.22, 0.7, M.chrome, 0, 1.24, 1.3);
    k.box(1.75, 0.55, 1.7, M.glass, 0, 1.24, -0.55);
    k.box(1.67, 0.1, 1.45, k.paint, 0, 1.56, -0.6);
    for (const s of [-0.3, 0.3]) {
      k.box(0.24, 0.02, 4.62, M.white, s, 0.985, 0);
      k.box(0.24, 0.02, 1.47, M.white, s, 1.62, -0.6);
    }
    for (const z of [2.36, -2.36]) k.box(2.25, 0.2, 0.15, M.chrome, 0, 0.45, z);
    const part = k.box(2.0, 0.16, 0.45, k.paint, 0, 1.05, -2.15);
    k.lights(2.2, 0.75, 2.31, -2.31);
    for (const [x, z, r] of [[1.05, 1.5, 0.46], [-1.05, 1.5, 0.46], [1.07, -1.45, 0.52], [-1.07, -1.45, 0.52]]) k.wheel(r, 0.45, x, z);
    return { body, part };
  },
  kart(k) {
    k.box(1.3, 0.12, 2.3, M.dark, 0, 0.26, 0);
    const body = k.box(1.0, 0.3, 1.1, k.paint, 0, 0.45, 0.6);
    k.box(1.6, 0.15, 0.18, k.paint, 0, 0.3, 1.3);
    k.box(0.65, 0.55, 0.15, M.dark, 0, 0.62, -0.45);
    k.add(new THREE.CylinderGeometry(0.24, 0.3, 0.6, 10), k.paint, 0, 0.85, -0.2);
    k.add(new THREE.SphereGeometry(0.27, 14, 10), M.white, 0, 1.33, -0.2);
    k.box(0.36, 0.12, 0.08, M.glass, 0, 1.35, 0.06);
    const sw = k.add(new THREE.TorusGeometry(0.17, 0.035, 6, 16), M.dark, 0, 0.9, 0.2);
    sw.rotation.x = -0.9;
    const part = k.group();
    k.box(0.6, 0.35, 0.5, M.chrome, 0, 0.5, -0.95, part);
    k.add(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8).rotateX(Math.PI / 2.5), M.dark, 0.25, 0.55, -1.25, part);
    for (const [x, z] of [[0.75, 0.85], [-0.75, 0.85], [0.78, -0.85], [-0.78, -0.85]]) k.wheel(0.3, 0.36, x, z);
    return { body, part };
  },
  police(k) {
    const body = BUILD.racer(k, false).body;
    k.box(2.13, 0.32, 1.9, M.white, 0, 0.66, -0.1);
    k.box(1.7, 0.42, 0.14, M.dark, 0, 0.62, 2.3);
    const part = k.group();
    k.box(1.3, 0.12, 0.35, M.dark, 0, 1.6, -0.4, part);
    const red = std(0xff2b2b, { emissive: 0xff0000, emissiveIntensity: 2 });
    const blue = std(0x2b6bff, { emissive: 0x0044ff, emissiveIntensity: 2 });
    k.box(0.55, 0.18, 0.3, red, -0.33, 1.73, -0.4, part);
    k.box(0.55, 0.18, 0.3, blue, 0.33, 1.73, -0.4, part);
    k.blink.push(red, blue);
    return { body, part };
  },
  bat(k) {
    k.paint.emissive = k.paint.color.clone().multiplyScalar(0.35);
    const body = k.box(2.3, 0.5, 5.0, M.black, 0, 0.62, -0.1);
    const nose = k.box(1.8, 0.3, 1.5, M.black, 0, 0.55, 2.7);
    nose.rotation.x = 0.12;
    k.box(2.34, 0.06, 4.8, k.paint, 0, 0.7, -0.1);
    k.box(0.12, 0.05, 1.4, k.paint, 0, 0.71, 2.7);
    const dome = k.add(new THREE.SphereGeometry(1, 18, 12), M.glass, 0, 0.95, 0.1);
    dome.scale.set(0.75, 0.42, 1.35);
    for (const s of [-1, 1]) k.box(0.4, 0.35, 1.2, M.black, s * 1.05, 0.75, 0.9);
    const part = k.group();
    for (const s of [-1, 1]) {
      const fin = k.box(0.1, 1.1, 2.0, M.black, s * 0.85, 1.3, -1.85, part);
      fin.rotation.set(-0.45, 0, s * 0.2);
      const edge = k.box(0.12, 0.08, 2.0, k.paint, s * 0.95, 1.83, -2.05, part);
      edge.rotation.set(-0.45, 0, s * 0.2);
    }
    k.add(new THREE.CylinderGeometry(0.4, 0.48, 0.6, 16).rotateX(Math.PI / 2), M.chrome, 0, 0.75, -2.85);
    k.flame(0, 0.75, -3.15, 1.2);
    k.lights(2.0, 0.55, 3.42, null, 0.5);
    k.wheel(0.45, 0.4, 1.12, 1.9);
    k.wheel(0.45, 0.4, -1.12, 1.9);
    k.wheel(0.6, 0.6, 1.2, -1.75);
    k.wheel(0.6, 0.6, -1.2, -1.75);
    return { body, part };
  },
  monster(k) {
    for (const [x, z] of [[1.4, 1.55], [-1.4, 1.55], [1.4, -1.55], [-1.4, -1.55]]) k.wheel(1.0, 0.85, x, z, z > 0, M.chrome);
    k.box(1.6, 0.3, 3.8, M.dark, 0, 1.05, 0);
    for (const [x, z] of [[0.7, 1.55], [-0.7, 1.55], [0.7, -1.55], [-0.7, -1.55]]) k.add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), M.chrome, x, 1.35, z);
    const body = k.box(2.5, 0.8, 4.2, k.paint, 0, 1.9, 0);
    k.box(2.1, 0.65, 1.7, M.glass, 0, 2.62, -0.3);
    k.box(2.15, 0.1, 1.75, k.paint, 0, 2.98, -0.3);
    for (const z of [2.2, -2.2]) k.box(2.6, 0.3, 0.2, M.chrome, 0, 1.55, z);
    const part = k.group();
    k.box(1.9, 0.14, 0.25, M.dark, 0, 3.1, 0.2, part);
    for (const x of [-0.66, -0.22, 0.22, 0.66]) k.box(0.3, 0.2, 0.12, M.amber, x, 3.22, 0.28, part);
    k.lights(2.5, 1.95, 2.11, -2.11);
    return { body, part };
  },
  bus(k) {
    const body = k.box(2.6, 2.1, 8.6, k.paint, 0, 1.65, -0.6);
    k.box(2.35, 1.0, 1.4, k.paint, 0, 1.1, 4.4);
    k.box(2.63, 0.75, 7.6, M.glass, 0, 2.15, -0.5);
    k.box(2.3, 0.9, 0.08, M.glass, 0, 2.2, 3.72);
    for (const y of [1.15, 1.45]) k.box(2.62, 0.08, 8.62, M.dark, 0, y, -0.6);
    k.box(2.5, 0.1, 8.5, M.white, 0, 2.75, -0.6);
    for (const z of [5.12, -4.92]) k.box(2.65, 0.3, 0.2, M.dark, 0, 0.6, z);
    for (const x of [-0.9, 0.9]) for (const z of [3.6, -4.8]) k.box(0.3, 0.2, 0.08, M.amber, x, 2.62, z + Math.sign(z) * 0.12);
    const part = k.group(-1.38, 1.9, 2.4);
    k.box(0.05, 0.08, 0.5, M.dark, 0, 0, 0.2, part);
    const sign = k.add(new THREE.CylinderGeometry(0.36, 0.36, 0.05, 8).rotateZ(Math.PI / 2), M.red, -0.03, 0, 0.6, part);
    sign.rotation.x = Math.PI / 8;
    k.lights(2.35, 0.9, 5.11, -4.91, 0.7);
    k.wheel(0.58, 0.45, 1.15, 3.7);
    k.wheel(0.58, 0.45, -1.15, 3.7);
    for (const z of [-2.7, -3.9]) { k.wheel(0.58, 0.5, 1.12, z, false); k.wheel(0.58, 0.5, -1.12, z, false); }
    return { body, part };
  },
  icecream(k) {
    const body = k.box(2.4, 1.0, 5.8, k.paint, 0, 1.0, 0);
    k.box(2.4, 1.4, 4.0, M.white, 0, 2.2, -0.9);
    k.box(2.25, 0.75, 1.5, M.glass, 0, 1.88, 1.85);
    k.box(2.27, 0.1, 1.55, k.paint, 0, 2.3, 1.85);
    k.box(2.44, 0.75, 1.9, M.dark, 0, 2.25, -0.6);
    const awn = k.box(0.6, 0.06, 2.1, std(0xf783ac), 1.5, 2.72, -0.6);
    awn.rotation.z = -0.35;
    k.box(0.6, 0.06, 2.1, std(0xf783ac), -1.5, 2.72, -0.6).rotation.z = 0.35;
    const part = k.group(0, 2.9, -0.9);
    k.add(new THREE.ConeGeometry(0.55, 1.4, 12).rotateX(Math.PI), std(0xd9a05b), 0, 0.7, 0, part);
    k.add(new THREE.SphereGeometry(0.62, 14, 10), std(0xffa8c5), 0, 1.5, 0, part);
    k.add(new THREE.SphereGeometry(0.5, 14, 10), std(0xb2f2bb), 0, 2.1, 0, part);
    k.add(new THREE.SphereGeometry(0.16, 10, 8), M.red, 0, 2.62, 0, part);
    k.lights(2.4, 0.9, 2.91, -2.91);
    for (const [x, z] of [[1.1, 1.9], [-1.1, 1.9], [1.1, -1.9], [-1.1, -1.9]]) k.wheel(0.5, 0.4, x, z);
    return { body, part };
  },
  tank(k) {
    for (const s of [-1, 1]) k.box(0.8, 1.0, 6.4, M.tire, s * 1.2, 0.55, 0);
    for (const s of [-1, 1]) for (const z of [-2.2, -0.75, 0.75, 2.2]) k.wheel(0.42, 0.86, s * 1.2, z, false, M.dark);
    const body = k.box(1.9, 0.8, 5.8, k.paint, 0, 1.0, 0);
    const slope = k.box(1.9, 0.5, 1.0, k.paint, 0, 1.12, 2.95);
    slope.rotation.x = 0.5;
    k.box(1.7, 0.7, 2.5, k.paint, 0, 1.75, -0.5);
    k.add(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 12), M.dark, 0.4, 2.2, -1.0);
    const part = k.group(0, 1.8, 0.7);
    k.add(new THREE.CylinderGeometry(0.15, 0.15, 3.4, 10).rotateX(Math.PI / 2), M.dark, 0, 0, 1.6, part);
    k.add(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10).rotateX(Math.PI / 2), M.dark, 0, 0, 3.3, part);
    k.lights(1.9, 1.15, 2.92, -2.92, 0.7);
    return { body, part };
  },
  hover(k) {
    k.hover = true;
    const skirt = k.add(new THREE.CylinderGeometry(1, 1.06, 0.55, 28), M.dark, 0, 0.35, 0);
    skirt.scale.set(1.35, 1, 2.3);
    const body = k.box(2.2, 0.45, 3.9, k.paint, 0, 0.85, 0.1);
    k.box(1.6, 0.6, 1.6, M.glass, 0, 1.35, 0.7);
    k.box(1.62, 0.1, 1.62, k.paint, 0, 1.69, 0.7);
    const part = k.group(0, 1.55, -1.95);
    k.add(new THREE.TorusGeometry(0.95, 0.1, 8, 28), M.dark, 0, 0, 0, part);
    const blades = new THREE.Group();
    k.box(1.75, 0.22, 0.05, M.chrome, 0, 0, 0, blades);
    k.box(0.22, 1.75, 0.05, M.chrome, 0, 0, 0, blades);
    part.add(blades);
    k.spin.push(blades);
    for (const s of [-0.45, 0.45]) k.box(0.06, 1.3, 0.5, k.paint, s, 0, -0.5, part);
    k.lights(2.0, 0.85, 2.06, -1.86);
    return { body, part };
  },
  couch(k) {
    for (const [x, z] of [[0.95, 0.65], [-0.95, 0.65], [0.95, -0.75], [-0.95, -0.75]]) k.wheel(0.22, 0.2, x, z);
    const body = k.box(2.2, 0.5, 1.5, k.paint, 0, 0.62, 0);
    const cushion = std(k.paint.color.clone().lerp(new THREE.Color(0xffffff), 0.3), { roughness: 0.9 });
    for (const s of [-0.52, 0.52]) k.box(1.0, 0.2, 1.25, cushion, s, 0.96, 0.08);
    k.box(2.2, 1.05, 0.4, k.paint, 0, 1.2, -0.58);
    for (const s of [-1, 1]) k.box(0.35, 0.78, 1.55, k.paint, s * 1.0, 1.0, 0);
    k.add(new THREE.CylinderGeometry(0.34, 0.34, 1.6, 14).rotateX(Math.PI / 2), M.white, 0, 0.75, -1.35);
    k.add(new THREE.ConeGeometry(0.34, 0.5, 14).rotateX(Math.PI / 2), M.red, 0, 0.75, -0.3);
    for (const s of [-1, 1]) k.box(0.05, 0.5, 0.45, M.red, s * 0.38, 0.75, -1.9);
    k.flame(0, 0.75, -2.15, 1.1);
    const part = k.group(1.0, 1.4, 0.4);
    k.add(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), M.dark, 0, 0.4, 0, part);
    k.add(new THREE.CylinderGeometry(0.18, 0.3, 0.35, 12, 1, true), std(0xffe8a3, { emissive: 0xffd36b, emissiveIntensity: 0.6, side: THREE.DoubleSide }), 0, 0.85, 0, part);
    return { body, part };
  },
};

export function makeVehicleMesh(type, color) {
  const spec = VEHICLES[type] || VEHICLES.racer;
  const k = kit(color);
  const { body, part } = BUILD[spec.id](k);
  const shield = new THREE.Mesh(shieldGeo, M.shield);
  shield.scale.set(spec.w * 0.75, spec.h * 0.65 + 0.4, spec.l * 0.68);
  shield.position.y = spec.h * 0.5;
  shield.visible = false;
  k.g.add(shield);
  // The body sits on a pivot so hops and slopes tilt it around the middle.
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  root.add(k.g);
  root.userData = {
    spec, paint: k.paint, base: new THREE.Color(color), body, part, shield, g: k.g,
    wheels: k.wheels, wheelR: k.wheelR, blink: k.blink, spin: k.spin, flames: k.flames, hover: k.hover,
  };
  return root;
}
