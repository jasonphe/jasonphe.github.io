// The maps: each one is a track shape (ctrl), a theme (sky, light, road, ground, grip,
// weather) and a decorate(ctx) that places its scenery. See track.js for ctx.
import * as THREE from 'three';
import { PROPS as P, xf, merge, mat, speckleTex, canvasTex, waterMat, windowTex, buildingMeshes, clouds, rng } from './scenery.js';
import { WALL, HALF_W, N } from './track.js';
import { makeVehicleMesh, VEHICLE_IDS } from './vehicles.js';

const pickOf = r => arr => arr[Math.floor(r() * arr.length)];

// Round the corners of a polygon so the spline makes clean arcs of radius r.
// Points are [x, z, height]; nearly straight points are kept as they are.
function rounded(pts, r) {
  const out = [];
  pts.forEach((p, k) => {
    const a = pts[(k - 1 + pts.length) % pts.length], b = pts[(k + 1) % pts.length];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ua = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], ub = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    if (ua[0] * ub[0] + ua[1] * ub[1] < -0.99) { out.push(p); return; }
    const m = 0.293 * r;
    out.push([p[0] + ua[0] * r, p[1] + ua[1] * r, p[2]], [p[0] + (ua[0] + ub[0]) * m, p[1] + (ua[1] + ub[1]) * m, p[2]], [p[0] + ub[0] * r, p[1] + ub[1] * r, p[2]]);
  });
  return out;
}

// Snow-capped or plain mountains in a ring far away.
function mountains(c, color, cap, count = 26, dist = 900) {
  const base = mat(color), snow = mat(cap ?? color);
  c.ring(count, dist, (x, z) => {
    const h = 120 + c.r() * 200;
    const m = new THREE.Mesh(new THREE.ConeGeometry(h * 1.3, h, 6), base);
    m.position.set(x, h / 2 - 5, z);
    m.rotation.y = c.r() * 3;
    c.add(m);
    if (cap) {
      const top = new THREE.Mesh(new THREE.ConeGeometry(h * 1.3 * 0.36, h * 0.36, 6), snow);
      top.position.set(x, h - h * 0.18 - 5 + 0.5, z);
      top.rotation.y = m.rotation.y;
      c.add(top);
    }
  });
}

// A triangular-prism roof, ridge along z, width w, length l, height h.
const roofGeo = (w, l, h) => xf(new THREE.CylinderGeometry(1, 1, l, 3), { rx: -Math.PI / 2, sx: w / 1.732, sy: h / 1.5 });

// A lake: a flat disc of animated water.
function lake(c, x, z, radius, color, y = 0.02) {
  const m = waterMat(color, 0.9);
  m.map.repeat.set(radius / 8, radius / 8);
  const w = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), m);
  w.rotation.x = -Math.PI / 2;
  w.position.set(x, c.th.groundY + y, z);
  w.receiveShadow = true;
  c.add(w);
  c.animate((dt) => { m.map.offset.x += dt * 0.01; m.map.offset.y += dt * 0.006; });
  return w;
}

// Things that face the road from beside it: rotation so local +z points at the track.
const faceRoad = (c, i, s) => Math.atan2(-c.T.nx[i] * s, -c.T.nz[i] * s);

// Street lamps on both barriers, with soft light pools on the road at night.
function lamps(c, every, glow, pools) {
  const items = [], spots = [];
  c.along(every, (i) => {
    for (const s of [1, -1]) {
      const p = c.onWall(i, s);
      items.push({ x: p.x, y: p.y, z: p.z, ry: faceRoad(c, i, s) });
      if (pools) {
        const q = c.T.pointAt(i, s * (HALF_W - 2.6));
        spots.push({ x: q.x, y: q.y + 0.05, z: q.z, rx: -Math.PI / 2 });
      }
    }
  });
  c.inst(P.lamp(glow), items);
  if (pools) {
    const disc = new THREE.CircleGeometry(6, 20);
    c.inst([[disc, new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false })]], spots, { shadow: false });
  }
}

// Big sign on two legs beside the road, facing it.
function billboard(c, i, s, text, bg, fg, glow) {
  const p = c.beside(i, s, 3);
  const g = new THREE.Group();
  const legMat = mat(0x3b3f46);
  for (const x of [-4, 4]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), legMat);
    leg.position.set(x, 4.5, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const sign = c.sign(text, bg, fg, 13, 4.2, glow);
  sign.position.y = 10.5;
  sign.castShadow = true;
  g.add(sign);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = faceRoad(c, i, s);
  c.add(g);
}

const GREENS = [0x2f7a3b, 0x3a8a3f, 0x2a6b35, 0x4a9a45, 0x356f2c];

export const MAPS = [
  // ---------------------------------------------------------------------------------
  {
    id: 'valley', name: 'Green Valley', icon: '🌄', blurb: 'Rolling farmland, a windmill, and cows that have seen things.',
    seed: 42,
    ctrl: [
      [0, 0, 0], [0, 120, 2], [40, 200, 4], [130, 220, 6], [210, 170, 8], [220, 80, 6],
      [160, 30, 3], [170, -60, 0], [260, -110, 0], [260, -200, 2], [180, -260, 5],
      [60, -250, 3], [10, -210, 1], [0, -150, 0],
    ],
    theme: {
      sky: [0x4d8ce6, 0xc7e0f7], fogNear: 160, fogFar: 1100,
      sun: { color: 0xfff1d6, intensity: 2.6, dir: [-0.45, 0.85, -0.35] }, hemi: [0xdcecff, 0x4b6a3a, 1.2], exposure: 1.05,
      ground: '#6da84c', groundDots: ['rgba(60,110,40,.35)', 'rgba(140,190,90,.3)'], groundY: -0.15, bank: '#5f8f3e',
      road: { base: '#44464c', speck: ['rgba(70,70,76,.55)', 'rgba(88,88,94,.55)'], edge: '#eceae2', center: '#f2d24b' },
      curb: ['#d9312b', '#f4f1ea'], wall: ['#2f6fd6', '#f1f3f5'], wallTop: 0xc9ccd2,
    },
    decorate(c) {
      const { r } = c, pick = pickOf(r);
      c.grandstand(30, -1);
      const pines = [], oaks = [], bushes = [], rocks = [], flowers = [];
      c.scatter(330, (x, z) => (r() < 0.55 ? pines : oaks).push({ x, z, s: 0.8 + r() * 0.8, ry: r() * 6, color: pick(GREENS) }), { clear: 8 });
      c.scatter(140, (x, z) => (r() < 0.4 ? pines : oaks).push({ x, z, s: 0.7 + r() * 0.7, ry: r() * 6, color: pick(GREENS) }), { clear: 6, near: 40 });
      c.scatter(200, (x, z) => bushes.push({ x, z, s: 0.7 + r() * 0.8, ry: r() * 6, color: pick(GREENS) }), { clear: 2 });
      c.scatter(70, (x, z) => rocks.push({ x, z, s: 0.5 + r() * 1.3, ry: r() * 6, color: pick([0x8d8f93, 0x9b9d9f, 0x7d8085]) }), { clear: 2 });
      // Flower patches: little colored boxes in clumps.
      c.scatter(40, (x, z) => {
        const col = pick([0xff6b9a, 0xffd43b, 0xffffff, 0xb197fc, 0xff8c42]);
        for (let k = 0; k < 18; k++) flowers.push({ x: x + (r() - 0.5) * 7, y: 0.15, z: z + (r() - 0.5) * 7, s: 0.8 + r() * 0.6, color: col });
      }, { clear: 3 });
      c.inst(P.pine(), pines);
      c.inst(P.oak(), oaks);
      c.inst(P.bush(), bushes);
      c.inst(P.rock(), rocks);
      c.inst([[new THREE.BoxGeometry(0.3, 0.3, 0.3), mat(0xffffff), true]], flowers, { shadow: false });

      // Wooden fences beside the long straights.
      const fence = [];
      for (const [a, b] of [[60, 150], [300, 380], [700, 800]]) {
        for (let i = a; i < b; i += 5) for (const s of [1, -1]) {
          const p = c.beside(i, s, 1.5);
          fence.push({ x: p.x, y: p.y, z: p.z, ry: c.T.headingAt(i) });
        }
      }
      c.inst(P.fence(), fence);

      // A farm in the infield: barn, silo, hay bales, cows.
      const farm = c.findSpot(c.bounds.cx - 10, c.bounds.cz + 30, 26);
      const barn = new THREE.Group();
      const red = mat(0xb3352b), white = mat(0xf1f3f5), roofM = mat(0x5b5f66);
      const body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 14), red);
      body.position.y = 3;
      const roof = new THREE.Mesh(roofGeo(11, 14.6, 4), roofM);
      roof.position.y = 7.3;
      const door = new THREE.Mesh(new THREE.BoxGeometry(4.4, 4.6, 0.2), white);
      door.position.set(0, 2.3, 7.05);
      const doorX = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.2, 0.1), white);
      doorX.position.set(0, 2.3, 7.18);
      doorX.rotation.z = 0.77;
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 13, 14), mat(0xc9ced6, { flatShading: false }));
      silo.position.set(8.5, 6.5, -3);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x8d949e, { flatShading: false }));
      dome.position.set(8.5, 13, -3);
      for (const m of [body, roof, door, doorX, silo, dome]) { m.castShadow = m.receiveShadow = true; barn.add(m); }
      barn.position.set(farm.x, c.th.groundY, farm.z);
      barn.rotation.y = r() * 6;
      c.add(barn);
      const hay = [], cows = [];
      for (let k = 0; k < 10; k++) hay.push({ x: farm.x + (r() - 0.5) * 40, z: farm.z + (r() - 0.5) * 40, ry: r() * 6 });
      for (let k = 0; k < 9; k++) cows.push({ x: farm.x + (r() - 0.5) * 50, z: farm.z + (r() - 0.5) * 50, ry: r() * 6, color: pick([0xf1f3f5, 0xa0703f, 0xf1f3f5]) });
      c.inst(P.hay(), hay.filter(o => c.clearance(o.x, o.z) > 2));
      c.inst(P.cow(), cows.filter(o => c.clearance(o.x, o.z) > 2));

      // A windmill on the far side, blades turning.
      const wm = c.findSpot(c.bounds.maxX + 50, c.bounds.cz, 10);
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3, 18, 8), white);
      tower.position.set(wm.x, 9, wm.z);
      tower.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 8), red);
      cap.position.set(wm.x, 19.5, wm.z);
      const hub = new THREE.Group();
      hub.position.set(wm.x, 18, wm.z);
      hub.rotation.y = Math.atan2(c.bounds.cx - wm.x, c.bounds.cz - wm.z);
      const blades = new THREE.Group();
      blades.position.z = 2.4;
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 9, 0.15), white);
        b.position.y = 4.8;
        const arm = new THREE.Group();
        arm.rotation.z = k * Math.PI / 2;
        arm.add(b);
        blades.add(arm);
        b.castShadow = true;
      }
      hub.add(blades);
      c.add(tower, cap, hub);
      c.animate(dt => { blades.rotation.z += dt * 0.8; });

      const pond = c.findSpot(c.bounds.cx + 60, c.bounds.cz - 90, 18);
      lake(c, pond.x, pond.z, 14, 0x3d7fb8);
      mountains(c, 0x7d93a8, 0xeef3f8);
      c.add(clouds(r, 22, 0xffffff, { x0: -500, x1: 700, z0: -700, z1: 600 }));
    },
  },

  // ---------------------------------------------------------------------------------
  {
    id: 'city', name: 'Neon City', icon: '🌃', blurb: 'Night streets, 90° corners, and a skyline that never sleeps.',
    seed: 7,
    ctrl: rounded([[0, 60, 0], [0, 300, 0], [200, 300, 0], [200, 180, 0], [380, 180, 0], [380, -80, 0], [220, -80, 0], [220, 40, 0], [100, 40, 0], [100, -120, 0], [0, -120, 0]], 34),
    theme: {
      night: true, stars: true,
      sky: [0x070b1c, 0x1d2240], fogNear: 120, fogFar: 900,
      sun: { color: 0x9db4ff, intensity: 1.4, dir: [0.4, 0.8, -0.3] }, hemi: [0x7080c0, 0x2a2a38, 1.6], exposure: 1.2,
      ground: '#2d3038', groundDots: ['rgba(90,94,104,.5)', 'rgba(20,22,26,.5)'], groundY: -0.15, bank: '#5a5f68',
      road: { base: '#2c2e33', speck: ['rgba(60,60,66,.6)', 'rgba(40,40,44,.6)'], edge: '#e9ecef', center: '#ffd43b', rough: 0.6 },
      curb: ['#d0d4da', '#3a3d44'], wall: ['#f5c518', '#202226'], wallTop: 0x8d939c, banner: '#4dd4ff',
    },
    decorate(c) {
      const { r } = c, pick = pickOf(r);
      const styles = [
        windowTex('#3a4150', '#1b2230', '#ffe08a', 1, 0.5),
        windowTex('#4a3f3a', '#1d1a1a', '#fff4d6', 2, 0.4),
        windowTex('#2e4752', '#16252c', '#7ee7ff', 3, 0.45),
        windowTex('#55505e', '#221f28', '#ffb3e6', 4, 0.35),
      ];
      const lists = styles.map(() => []);
      // Fill the blocks with buildings on a 26 m grid, taller away from the road.
      const b = c.bounds;
      for (let x = b.minX - 260; x < b.maxX + 260; x += 26) {
        for (let z = b.minZ - 260; z < b.maxZ + 260; z += 26) {
          const w = 15 + r() * 8, d = 15 + r() * 8;
          const cl = c.clearance(x, z) - Math.hypot(w, d) / 2;
          if (cl < 6) continue;
          const tall = cl > 60 ? 40 + r() * 110 : 14 + r() * 60;
          lists[Math.floor(r() * lists.length)].push({ x: x + (r() - 0.5) * 4, z: z + (r() - 0.5) * 4, w, d, h: tall, uo: Math.floor(r() * 4) * 0.25 });
        }
      }
      const roofMat = mat(0x2a2d33);
      styles.forEach((s, k) => {
        const wall = new THREE.MeshStandardMaterial({ map: s.map, emissive: 0xffffff, emissiveMap: s.emissiveMap, emissiveIntensity: 1.1, roughness: 0.7 });
        c.add(...buildingMeshes(lists[k], wall, roofMat));
      });
      // Rooftop clutter and blinking aircraft lights on the tall ones.
      const all = lists.flat(), boxes = [], beacons = [];
      for (const bd of all) {
        if (r() < 0.5) boxes.push({ x: bd.x + (r() - 0.5) * bd.w * 0.5, y: bd.h + 1, z: bd.z + (r() - 0.5) * bd.d * 0.5, sx: 2 + r() * 3, sy: 2, sz: 2 + r() * 3 });
        if (bd.h > 90) beacons.push({ x: bd.x, y: bd.h + 3, z: bd.z });
      }
      c.inst([[new THREE.BoxGeometry(1, 1, 1), mat(0x4a4f58)]], boxes);
      const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3030 });
      c.inst([[new THREE.SphereGeometry(0.6, 8, 6), beaconMat]], beacons, { shadow: false });
      c.animate((dt, t) => { beaconMat.color.setHex(Math.sin(t * 3) > 0.6 ? 0xff3030 : 0x401010); });

      // Neon signs on buildings near the track.
      const words = ['NITRO', 'HOTEL', 'BAR', 'ARCADE', 'CRASH', 'SUSHI', 'MOTEL', '24/7', 'PIZZA', 'GARAGE'];
      const neons = ['#ff4fd8', '#4dd4ff', '#ffe14d', '#7dff6a', '#ff6b3d'];
      for (const bd of all.filter(bd => c.clearance(bd.x, bd.z) < 50).slice(0, 26)) {
        const sgn = c.sign(pick(words), '#0b0b12', pick(neons), 10, 2.6, true);
        // Face the nearest bit of road.
        const i = c.T.nearest(bd.x, bd.z);
        const dx = c.T.px[i] - bd.x, dz = c.T.pz[i] - bd.z;
        const ax = Math.abs(dx) > Math.abs(dz);
        sgn.position.set(bd.x + (ax ? Math.sign(dx) * (bd.w / 2 + 0.3) : 0), Math.min(bd.h - 3, 10 + r() * 14), bd.z + (ax ? 0 : Math.sign(dz) * (bd.d / 2 + 0.3)));
        sgn.rotation.y = ax ? Math.sign(dx) * Math.PI / 2 : dz > 0 ? 0 : Math.PI;
        c.add(sgn);
      }
      lamps(c, 22, 0xffd9a0, true);
      const ads = [['CRASH COLA', '#e03131', '#fff'], ['NO BRAKES', '#111', '#4dd4ff'], ['BUS LIFE', '#ffd43b', '#111'], ['EAT AT JOE\'S', '#111', '#ff4fd8'], ['MEGA MART', '#1c7ed6', '#fff'], ['NITRO FUEL', '#111', '#7dff6a']];
      ads.forEach((ad, k) => billboard(c, 90 + k * 190, k % 2 ? 1 : -1, ...ad, true));
      // Parked vehicles along the sidewalks.
      c.along(85, (i) => {
        const s = i % 2 ? 1 : -1, p = c.beside(i, s, 2.5);
        const v = makeVehicleMesh(pick(VEHICLE_IDS.filter(id => id !== 'bus')), pick(['#e03131', '#1c7ed6', '#fab005', '#e9ecef', '#343a40', '#2f9e44']));
        v.position.set(p.x, p.y, p.z);
        v.rotation.y = c.T.headingAt(i) + (r() < 0.5 ? Math.PI : 0);
        c.add(v);
      }, 40);
      const cones = [];
      c.scatter(40, (x, z) => cones.push({ x, z, ry: r() * 6 }), { clear: 1, area: { x0: b.minX - 30, x1: b.maxX + 30, z0: b.minZ - 30, z1: b.maxZ + 30 }, test: (x, z) => c.clearance(x, z) < 8 });
      c.inst(P.cone(), cones);
      // Distant skyline.
      const sky = [];
      c.ring(70, 650, (x, z) => sky.push({ x, z, w: 30 + r() * 30, d: 30 + r() * 30, h: 80 + r() * 200, uo: r() }));
      const far = new THREE.MeshStandardMaterial({ map: styles[0].map, emissive: 0xffffff, emissiveMap: styles[0].emissiveMap, emissiveIntensity: 0.9 });
      c.add(...buildingMeshes(sky, far, roofMat));
      const moon = new THREE.Mesh(new THREE.SphereGeometry(30, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf4f1de, fog: false }));
      moon.position.set(b.cx - 900, 520, b.cz - 1100);
      c.add(moon);
    },
  },

  // ---------------------------------------------------------------------------------
  {
    id: 'coast', name: 'Sunset Cliffs', icon: '🏖️', blurb: 'A cliff road along the sea, palms, a lighthouse, and boats bobbing below.',
    seed: 11,
    ctrl: [[0, 0, 6], [0, 140, 8], [60, 240, 12], [170, 280, 14], [270, 250, 10], [300, 150, 6], [290, 40, 4], [300, -80, 5], [250, -190, 9], [140, -230, 12], [40, -200, 10], [-40, -110, 8]],
    theme: {
      sky: [0x34307a, 0xffa877], fogNear: 220, fogFar: 1400, sunGlow: true,
      sun: { color: 0xffb36b, intensity: 2.6, dir: [0.85, 0.32, 0.25] }, hemi: [0xffcfb0, 0x6b5a4a, 1.25], exposure: 1.05,
      ground: '#8ea85a', groundDots: ['rgba(110,120,60,.4)', 'rgba(170,180,100,.35)'], groundY: -0.15, bank: '#a2915e',
      road: { base: '#46464a', speck: ['rgba(80,80,84,.55)', 'rgba(60,60,64,.55)'], edge: '#f1ece2', center: '#f2d24b' },
      curb: ['#e8590c', '#f4f1ea'], wall: ['#f8f9fa', '#1c7ed6'], wallTop: 0xe9ecef, banner: '#ffa94d',
    },
    decorate(c) {
      const { r } = c, pick = pickOf(r);
      const SHORE = 352;   // sea starts east of here
      const sand = new THREE.Mesh(new THREE.PlaneGeometry(90, 2000), new THREE.MeshStandardMaterial({ map: speckleTex('#e6cf9a', ['rgba(200,170,110,.5)', 'rgba(255,240,200,.5)'], 3000, 2, 8), roughness: 1 }));
      sand.material.map.repeat.set(4, 80);
      sand.rotation.x = -Math.PI / 2;
      sand.position.set(SHORE - 30, -0.1, 0);
      sand.receiveShadow = true;
      const seaMat = waterMat(0x1f78b4, 0.95);
      seaMat.map.repeat.set(70, 120);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(2600, 4000), seaMat);
      sea.rotation.x = -Math.PI / 2;
      sea.position.set(SHORE + 1300, 0.05, 0);
      c.add(sand, sea);
      c.animate(dt => { seaMat.map.offset.x -= dt * 0.012; seaMat.map.offset.y += dt * 0.004; });

      // Palms on the beach and around the road; umbrellas and towels on the sand.
      const palms = [], umbrellas = [], towels = [], shrubs = [], rocks = [];
      c.scatter(70, (x, z) => palms.push({ x, z, s: 0.8 + r() * 0.5, ry: r() * 6, color: pick([0x3f8f3a, 0x4fa043, 0x2f7a33]) }), { clear: 3, area: { x0: SHORE - 70, x1: SHORE - 5, z0: -500, z1: 500 } });
      c.scatter(90, (x, z) => palms.push({ x, z, s: 0.7 + r() * 0.6, ry: r() * 6, color: pick([0x3f8f3a, 0x4fa043, 0x2f7a33]) }), { clear: 6, test: x => x < SHORE - 10 });
      c.scatter(30, (x, z) => {
        umbrellas.push({ x, z, ry: r() * 6, color: pick([0xff6b6b, 0x4dabf7, 0xffd43b, 0xf783ac, 0x69db7c]) });
        towels.push({ x: x + 1.5, y: 0.0, z: z + 1, ry: r() * 6, color: pick([0xff8787, 0x74c0fc, 0xffe066, 0xffffff]) });
      }, { clear: 3, area: { x0: SHORE - 40, x1: SHORE - 6, z0: -400, z1: 400 } });
      c.scatter(220, (x, z) => shrubs.push({ x, z, s: 0.6 + r() * 0.8, color: pick([0x6b8f3a, 0x7d9a45, 0x5a7a35]) }), { clear: 2, test: x => x < SHORE - 40 });
      c.scatter(40, (x, z) => rocks.push({ x, z, y: -0.4, s: 1 + r() * 2.5, ry: r() * 6, color: pick([0x8a8278, 0x6f6a63]) }), { clear: 0, area: { x0: SHORE + 5, x1: SHORE + 120, z0: -500, z1: 500 } });
      c.inst(P.palm(), palms);
      c.inst(P.umbrella(), umbrellas);
      c.inst([[new THREE.BoxGeometry(1.2, 0.04, 2.2), mat(0xffffff), true]], towels, { shadow: false });
      c.inst(P.bush(), shrubs);
      c.inst(P.rock(), rocks);

      // Beach houses.
      const housePal = [0xf8f0e3, 0x9ad0ec, 0xffd8a8, 0xffc9c9, 0xb2f2bb];
      c.scatter(9, (x, z) => {
        const g = new THREE.Group(), w = 7 + r() * 3, l = 8 + r() * 3;
        const bodyM = new THREE.Mesh(new THREE.BoxGeometry(w, 4, l), mat(pick(housePal)));
        bodyM.position.y = 2;
        const roofM = new THREE.Mesh(roofGeo(w + 1, l + 1, 2.6), mat(pick([0xc0504d, 0x495057, 0x1c7ed6])));
        roofM.position.y = 5.2;
        for (const m of [bodyM, roofM]) { m.castShadow = m.receiveShadow = true; g.add(m); }
        g.position.set(x, -0.15, z);
        g.rotation.y = r() < 0.5 ? 0 : Math.PI / 2;
        c.add(g);
      }, { clear: 8, area: { x0: SHORE - 120, x1: SHORE - 45, z0: -400, z1: 400 } });

      // A pier on posts.
      const pier = new THREE.Group(), wood = mat(0x9c7349);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(110, 0.5, 6), wood);
      deck.position.set(55, 2.6, 0);
      deck.castShadow = deck.receiveShadow = true;
      pier.add(deck);
      for (let x = 4; x < 110; x += 9) for (const z of [-2.6, 2.6]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 6), wood);
        post.position.set(x, 1, z);
        pier.add(post);
      }
      pier.position.set(SHORE - 10, 0, -150);
      c.add(pier);

      // A lighthouse on a rocky island with a sweeping beam.
      const lh = new THREE.Group();
      const isle = new THREE.Mesh(new THREE.DodecahedronGeometry(14, 0), mat(0x6f6a63));
      isle.scale.set(1, 0.35, 1);
      lh.add(isle);
      const stripeTex = canvasTex(8, 64, (g, w, h) => { for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f8f9fa' : '#d9312b'; g.fillRect(0, k * h / 4, w, h / 4); } }, false);
      const towerM = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 24, 14), new THREE.MeshStandardMaterial({ map: stripeTex }));
      towerM.position.y = 16;
      towerM.castShadow = true;
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 10), new THREE.MeshStandardMaterial({ color: 0xfff3bf, emissive: 0xffe066, emissiveIntensity: 2 }));
      lamp.position.y = 29.5;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3, 10), mat(0x343a40));
      hat.position.y = 32.5;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(5, 80, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff3bf, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.geometry.rotateZ(Math.PI / 2).translate(40, 0, 0);
      const beamPivot = new THREE.Group();
      beamPivot.position.y = 29.5;
      beamPivot.add(beam);
      lh.add(towerM, lamp, hat, beamPivot);
      lh.position.set(SHORE + 110, 0, 40);
      c.add(lh);
      c.animate(dt => { beamPivot.rotation.y += dt * 0.6; });

      // Sailboats bobbing.
      const boats = [];
      for (let k = 0; k < 9; k++) {
        const g = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 7), mat(pick([0xf8f9fa, 0x1c7ed6, 0xe03131])));
        hull.position.y = 0.4;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 5), mat(0xdee2e6));
        mast.position.y = 5;
        const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.4, -2.6), new THREE.Vector3(0, 9.2, 0), new THREE.Vector3(0, 1.4, 0)]), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
        sail.geometry.computeVertexNormals();
        g.add(hull, mast, sail);
        g.position.set(SHORE + 60 + r() * 400, 0, -400 + r() * 800);
        g.rotation.y = r() * 6;
        g.userData.ph = r() * 6;
        c.add(g);
        boats.push(g);
      }
      c.animate((dt, t) => {
        for (const g of boats) {
          g.position.y = Math.sin(t * 1.3 + g.userData.ph) * 0.3;
          g.rotation.z = Math.sin(t * 1.1 + g.userData.ph) * 0.06;
          g.position.x += Math.sin(g.rotation.y) * dt * 1.5;
          g.position.z += Math.cos(g.rotation.y) * dt * 1.5;
        }
      });

      lamps(c, 40, 0xffe8a3, false);
      billboard(c, 150, -1, 'SURF & TURF', '#1c7ed6', '#fff');
      billboard(c, 760, 1, 'FISH TACOS', '#ffd43b', '#c92a2a');
      // Hills inland.
      const hill = mat(0x7a8f4c);
      c.ring(18, 700, (x, z) => {
        if (x > SHORE + 100) return;
        const hgt = 60 + r() * 90;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(hgt * 1.4, 1), hill);
        m.scale.y = 0.45;
        m.position.set(x, -10, z);
        c.add(m);
      });
      c.add(clouds(r, 18, 0xffd0c0, { x0: -600, x1: 900, z0: -700, z1: 700 }));
    },
  },

  // ---------------------------------------------------------------------------------
  {
    id: 'jungle', name: 'Jungle Ruins', icon: '🌴', blurb: 'A muddy track past a lost temple. Dirt roads mean less grip.',
    seed: 23,
    ctrl: [[0, 0, 2], [0, 110, 4], [-50, 200, 8], [-150, 230, 10], [-240, 170, 6], [-230, 60, 3], [-150, 10, 1], [-130, -90, 4], [-200, -170, 7], [-130, -260, 9], [-20, -250, 6], [40, -160, 3], [20, -70, 1]],
    theme: {
      sky: [0x5aa8c4, 0xcfe3bf], fogNear: 60, fogFar: 560, weather: 'fireflies', grip: 0.88,
      sun: { color: 0xfff0c0, intensity: 2.2, dir: [-0.3, 0.9, 0.3] }, hemi: [0xd8f0c8, 0x2e4a22, 1.3], exposure: 1.05,
      ground: '#3d6b2b', groundDots: ['rgba(30,70,25,.5)', 'rgba(90,130,50,.4)', 'rgba(100,80,40,.3)'], groundY: -0.15, bank: '#4a6b30',
      road: { base: '#7a5b3a', speck: ['rgba(100,75,45,.6)', 'rgba(90,65,40,.6)', 'rgba(130,100,70,.5)'], ruts: 'rgba(80,58,35,.55)', rough: 1 },
      curb: ['#6b4f2e', '#8a6a42'], wall: ['#6b4a2b', '#5a3d22'], wallTop: 0x4a3320, banner: '#b2f2bb',
    },
    decorate(c) {
      const { r } = c, pick = pickOf(r);
      const JG = [0x2f6b2a, 0x3d7d2c, 0x255e25, 0x4a8a35, 0x2c7040];
      const trees = [], palms = [], ferns = [], bushes = [];
      c.scatter(260, (x, z) => trees.push({ x, z, s: 0.75 + r() * 0.6, ry: r() * 6, color: pick(JG) }), { clear: 7 });
      c.scatter(420, (x, z) => trees.push({ x, z, s: 0.7 + r() * 0.6, ry: r() * 6, color: pick(JG) }), { clear: 5, near: 45 });
      c.scatter(80, (x, z) => palms.push({ x, z, s: 0.8 + r() * 0.5, ry: r() * 6, color: pick(JG) }), { clear: 4 });
      c.scatter(1100, (x, z) => ferns.push({ x, z, s: 0.8 + r() * 1.3, ry: r() * 6, color: pick([0x3f8f3a, 0x5aa040, 0x2f7a33, 0x6aaa48]) }), { clear: 0.3, near: 35 });
      c.scatter(450, (x, z) => bushes.push({ x, z, s: 0.8 + r() * 1.4, ry: r() * 6, color: pick(JG) }), { clear: 0.5, near: 40 });
      c.inst(P.jungleTree(), trees);
      c.inst(P.palm(), palms);
      c.inst(P.fern(), ferns, { shadow: false });
      c.inst(P.bush(), bushes);

      // A stepped temple in the infield.
      const stone = mat(0x8f9a7a), moss = mat(0x6d7f55);
      const tp = c.findSpot(-120, 120, 34);
      const temple = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const s = 44 - k * 7;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(s, 4.5, s), k % 2 ? moss : stone);
        tier.position.y = 2.25 + k * 4.5;
        tier.castShadow = tier.receiveShadow = true;
        temple.add(tier);
      }
      const stairs = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 40), stone);
      stairs.position.set(0, 13.5, 16);
      stairs.rotation.x = -0.64;
      const shrine = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 8), stone);
      shrine.position.y = 30;
      const shrineRoof = new THREE.Mesh(new THREE.BoxGeometry(10, 1, 10), moss);
      shrineRoof.position.y = 33.5;
      const dark = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 0.2), mat(0x1a1a1a));
      dark.position.set(0, 29, 4.05);
      temple.add(stairs, shrine, shrineRoof, dark);
      temple.position.set(tp.x, c.th.groundY, tp.z);
      temple.rotation.y = Math.atan2(c.T.px[0] - tp.x, c.T.pz[0] - tp.z);
      c.add(temple);

      // Ruins along the road: columns (some broken) and stone heads.
      const cols = [];
      c.along(37, (i) => {
        const s = (i / 37 | 0) % 2 ? 1 : -1, p = c.beside(i, s, 2 + r() * 5);
        cols.push({ x: p.x, z: p.z, y: c.th.groundY, sy: 0.3 + r() * 0.8, ry: r() * 6, rz: r() < 0.3 ? 0.25 : 0, color: pick([0x9aa385, 0x8a9478, 0xa3a88f]) });
      });
      c.inst(P.column(), cols);
      for (const [i, s] of [[240, 1], [610, -1], [980, 1]]) {
        const p = c.beside(i, s, 6), head = new THREE.Group();
        const face = new THREE.Mesh(new THREE.BoxGeometry(6, 9, 5), stone);
        face.position.y = 4.5;
        const brow = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.2, 1.4), moss);
        brow.position.set(0, 6.6, 2.4);
        const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.6, 1.6), stone);
        nose.position.set(0, 4.8, 2.9);
        const mouth = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.4), mat(0x2b2b2b));
        mouth.position.set(0, 2.6, 2.55);
        for (const m of [face, brow, nose, mouth]) { m.castShadow = true; head.add(m); }
        head.position.set(p.x, p.y, p.z);
        head.rotation.y = faceRoad(c, i, s);
        c.add(head);
      }
      // Vines hanging across the road in a few places.
      const vineMat = mat(0x3d6b2f, { flatShading: false });
      for (const i of [120, 420, 700, 1050]) {
        for (let k = 0; k < 3; k++) {
          const a = c.T.pointAt(i + k * 3, WALL + 4), b2 = c.T.pointAt(i + k * 3, -(WALL + 4));
          const top = Math.max(a.y, b2.y) + 13;
          const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, top, a.z), new THREE.Vector3((a.x + b2.x) / 2, top - 4 - k, (a.z + b2.z) / 2), new THREE.Vector3(b2.x, top, b2.z));
          c.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.18, 5), vineMat));
        }
      }
      // Big trees holding up each set of vines.
      const gate = [];
      for (const i of [120, 420, 700, 1050]) for (const s of [1, -1]) {
        const p = c.beside(i + 3, s, 0.5);
        gate.push({ x: p.x, y: p.y, z: p.z, s: 0.9, ry: r() * 6, color: pick(JG) });
      }
      c.inst(P.jungleTree(), gate);
      // A pond with lily pads.
      const pp = c.findSpot(-60, -150, 16);
      lake(c, pp.x, pp.z, 13, 0x3f7d6a);
      const pads = [];
      for (let k = 0; k < 16; k++) { const a = r() * 6.3, d = r() * 11; pads.push({ x: pp.x + Math.cos(a) * d, y: c.th.groundY + 0.06, z: pp.z + Math.sin(a) * d, s: 0.6 + r() * 0.6, ry: r() * 6 }); }
      c.inst([[new THREE.CylinderGeometry(1, 1, 0.05, 10, 1, false, 0, 5.6), mat(0x4caf50)]], pads, { shadow: false });
      // Green hills all around.
      const hill = mat(0x2f5a28);
      c.ring(22, 650, (x, z) => {
        const hgt = 80 + r() * 120;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(hgt, 1), hill);
        m.scale.y = 0.6;
        m.position.set(x, -10, z);
        c.add(m);
      });
    },
  },

  // ---------------------------------------------------------------------------------
  {
    id: 'desert', name: 'Canyon Run', icon: '🏜️', blurb: 'Long, fast sweepers under red mesas and two giant stone arches.',
    seed: 5,
    ctrl: [[0, 0, 0], [0, 200, 0], [40, 330, 3], [160, 380, 6], [300, 340, 8], [360, 220, 5], [300, 110, 2], [340, 0, 0], [420, -100, 3], [380, -230, 6], [250, -270, 4], [130, -210, 2], [60, -110, 0]],
    theme: {
      sky: [0x3d8fd6, 0xf2d9b0], fogNear: 220, fogFar: 1500, weather: 'dust',
      sun: { color: 0xfff1d0, intensity: 3.0, dir: [0.3, 0.9, -0.2] }, hemi: [0xfff3dc, 0xa8754a, 1.2], exposure: 1.0,
      ground: '#d9a86a', groundDots: ['rgba(190,140,80,.45)', 'rgba(240,200,140,.45)'], groundY: -0.15, bank: '#c98f55',
      road: { base: '#5b5550', speck: ['rgba(110,100,90,.5)', 'rgba(80,74,68,.5)'], edge: '#e9e2d0', center: '#f2b33b', solid: true },
      curb: ['#e8590c', '#f4f1ea'], wall: ['#f08c00', '#f4f1ea'], wallTop: 0xd9c6a5, banner: '#ffa94d',
    },
    decorate(c) {
      const { r } = c, pick = pickOf(r);
      // Layered red rock.
      const layers = canvasTex(8, 128, (g, w, h) => {
        const cols = ['#b5552d', '#c8693a', '#a84a28', '#d27d4a', '#9c4224', '#c26035'];
        let y = 0, k = 0;
        while (y < h) { const t = 6 + (k * 7) % 14; g.fillStyle = cols[k % cols.length]; g.fillRect(0, y, w, t); y += t; k++; }
      });
      const rockMat = new THREE.MeshStandardMaterial({ map: layers, roughness: 1, flatShading: true });
      const mesa = (x, z, rad, hgt) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, hgt, 7), rockMat);
        m.position.set(x, hgt / 2 - 0.5, z);
        m.rotation.y = r() * 6;
        m.castShadow = m.receiveShadow = true;
        c.add(m);
      };
      c.ring(24, 750, (x, z) => mesa(x, z, 60 + r() * 90, 60 + r() * 120));
      c.scatter(14, (x, z) => mesa(x, z, 14 + r() * 22, 25 + r() * 45), { clear: 40 });

      // Stone arches spanning the road.
      for (const i of [260, 840]) {
        const p = c.T.pointAt(i), span = WALL + 7;
        const arch = new THREE.Mesh(new THREE.TorusGeometry(span, 3.2, 7, 18, Math.PI), rockMat);
        arch.position.set(p.x, c.th.groundY, p.z);
        arch.rotation.y = c.T.headingAt(i);   // spans across the road
        arch.scale.y = 1.15;
        arch.castShadow = true;
        c.add(arch);
      }
      const cacti = [], bush = [], rocks = [], skulls = [];
      c.scatter(200, (x, z) => cacti.push({ x, z, s: 0.7 + r() * 0.7, ry: r() * 6, color: pick([0x4f8a3a, 0x5d9a45, 0x3f7a32]) }), { clear: 3 });
      c.scatter(320, (x, z) => bush.push({ x, z, s: 0.4 + r() * 0.6, ry: r() * 6, color: pick([0x8a8445, 0x9c8c55, 0x7a6f3f]) }), { clear: 1, near: 60 });
      c.scatter(90, (x, z) => cacti.push({ x, z, s: 0.6 + r() * 0.6, ry: r() * 6, color: pick([0x4f8a3a, 0x5d9a45, 0x3f7a32]) }), { clear: 3, near: 30 });
      c.scatter(140, (x, z) => rocks.push({ x, z, s: 0.5 + r() * 2, ry: r() * 6, color: pick([0xb5653a, 0xa0552f, 0xc27a4a]) }), { clear: 2 });
      c.scatter(8, (x, z) => skulls.push({ x, z, y: 0.3, ry: r() * 6 }), { clear: 2, test: (x, z) => c.clearance(x, z) < 12 });
      c.inst(P.cactus(), cacti);
      c.inst(P.bush(), bush);
      c.inst(P.rock(), rocks);
      c.inst([[merge([xf(new THREE.SphereGeometry(0.5, 8, 6), { sy: 0.8 }), xf(new THREE.BoxGeometry(0.5, 0.35, 0.4), { y: -0.2, z: 0.35 })]), mat(0xf1ead8)]], skulls);

      // A roadside diner with a big sign.
      const dp = c.beside(60, -1, 8), diner = new THREE.Group();
      const dB = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 9), mat(0xf1e3c8));
      dB.position.y = 2.5;
      const dR = new THREE.Mesh(new THREE.BoxGeometry(17, 0.6, 10), mat(0xc92a2a));
      dR.position.y = 5.3;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 6), mat(0x495057));
      pole.position.set(10, 6, 0);
      const sg = c.sign('CRASH STOP', '#c92a2a', '#fff3bf', 10, 3);
      sg.position.set(10, 12.5, 0);
      for (const m of [dB, dR, pole, sg]) { m.castShadow = true; diner.add(m); }
      diner.position.set(dp.x, dp.y, dp.z);
      diner.rotation.y = faceRoad(c, 60, -1) + Math.PI / 2;
      c.add(diner);
      billboard(c, 520, 1, 'NEXT GAS 200 MI', '#f1e3c8', '#5c3b1e');

      // Tumbleweeds rolling across.
      const tw = [], twMat = new THREE.MeshStandardMaterial({ color: 0xa88a55, wireframe: true });
      for (let k = 0; k < 7; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), twMat);
        m.position.set(c.bounds.minX - 100 + r() * 600, 0.8, c.bounds.minZ - 100 + r() * 600);
        m.userData.v = 3 + r() * 4;
        c.add(m);
        tw.push(m);
      }
      c.animate((dt, t) => {
        for (const m of tw) {
          m.position.x += m.userData.v * dt;
          m.position.y = 0.8 + Math.abs(Math.sin(t * 3 + m.userData.v)) * 0.8;
          m.rotation.z -= m.userData.v * dt;
          if (m.position.x > c.bounds.maxX + 150) m.position.x = c.bounds.minX - 150;
        }
      });
    },
  },

  // ---------------------------------------------------------------------------------
  {
    id: 'snow', name: 'Frostbite Peaks', icon: '🏔️', blurb: 'Snowfall, a frozen lake, and an icy road. Brake early, it\'s slippery.',
    seed: 99,
    ctrl: [[0, 0, 4], [0, 130, 6], [50, 220, 10], [150, 240, 14], [230, 180, 12], [220, 80, 8], [140, 50, 5], [120, -40, 3], [180, -130, 6], [120, -220, 9], [10, -230, 7], [-60, -150, 5], [-50, -60, 4]],
    theme: {
      sky: [0x8fa6bd, 0xdfe7ee], fogNear: 110, fogFar: 760, weather: 'snow', grip: 0.7,
      sun: { color: 0xffffff, intensity: 1.8, dir: [-0.4, 0.8, 0.3] }, hemi: [0xe8f0ff, 0x9aa7b5, 1.6], exposure: 1.0,
      ground: '#eef3f8', groundDots: ['rgba(200,212,226,.6)', 'rgba(255,255,255,.7)'], groundY: -0.15, bank: '#e6edf5',
      road: { base: '#4a4d55', speck: ['rgba(110,116,128,.5)', 'rgba(220,228,236,.35)'], edge: '#f1f3f5', center: '#f1f3f5' },
      curb: ['#e03131', '#f8f9fa'], wall: ['#e03131', '#f8f9fa'], wallTop: 0xf4f8ff, banner: '#a5d8ff',
    },
    decorate(c) {
      const { r } = c, pick = pickOf(r);
      const pines = [], rocks = [], snowmen = [], drifts = [];
      c.scatter(400, (x, z) => pines.push({ x, z, s: 0.8 + r() * 0.9, ry: r() * 6, color: pick([0x1f4d2e, 0x2a5a36, 0x234a30]) }), { clear: 6 });
      c.scatter(260, (x, z) => pines.push({ x, z, s: 0.7 + r() * 0.8, ry: r() * 6, color: pick([0x1f4d2e, 0x2a5a36, 0x234a30]) }), { clear: 4, near: 40 });
      c.scatter(70, (x, z) => rocks.push({ x, z, s: 0.6 + r() * 1.6, ry: r() * 6, color: pick([0x7d8590, 0x6c737d]) }), { clear: 2 });
      c.scatter(12, (x, z) => snowmen.push({ x, z, ry: r() * 6, s: 0.8 + r() * 0.4 }), { clear: 2, test: (x, z) => c.clearance(x, z) < 20 });
      c.scatter(160, (x, z) => drifts.push({ x, z, y: -0.4, sx: 2 + r() * 4, sy: 0.6 + r() * 0.6, sz: 2 + r() * 4, ry: r() * 6 }), { clear: 1 });
      c.inst(P.snowPine(), pines);
      c.inst(P.rock(), rocks);
      c.inst(P.snowman(), snowmen);
      c.inst([[new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf8fbff, { flatShading: false })]], drifts, { shadow: false });

      // Frozen lake in the infield.
      const lp = c.findSpot(80, -20, 24);
      const ice = new THREE.Mesh(new THREE.CircleGeometry(22, 40), new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.1, metalness: 0.3 }));
      ice.rotation.x = -Math.PI / 2;
      ice.position.set(lp.x, c.th.groundY + 0.03, lp.z);
      ice.receiveShadow = true;
      c.add(ice);

      // Log cabins with snowy roofs.
      c.scatter(8, (x, z) => {
        const g = new THREE.Group(), w = 7, l = 9;
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4, l), mat(0x7a5232));
        body.position.y = 2;
        const roof = new THREE.Mesh(roofGeo(w + 1.4, l + 1, 3), mat(0xf4f8ff));
        roof.position.y = 5.5;
        const chim = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), mat(0x6c757d));
        chim.position.set(2, 6.5, -2);
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0xffd8a8, emissive: 0xffa94d, emissiveIntensity: 1 }));
        win.position.set(0, 2.4, l / 2 + 0.05);
        for (const m of [body, roof, chim, win]) { m.castShadow = m.receiveShadow = true; g.add(m); }
        g.position.set(x, -0.15, z);
        g.rotation.y = r() * 6;
        c.add(g);
      }, { clear: 10, test: (x, z) => c.clearance(x, z) < 70 });

      // A ski lift climbing toward the mountains, chairs moving.
      const start = c.findSpot(c.bounds.minX - 60, c.bounds.maxZ - 40, 12);
      const dir = new THREE.Vector3(-1, 0, 0.6).normalize();
      const towers = [], tMat = mat(0x868e96);
      for (let k = 0; k < 9; k++) {
        const x = start.x + dir.x * k * 45, z = start.z + dir.z * k * 45, y = k * 12;
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), tMat);
        t.position.set(x, y + 7, z);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 0.4), tMat);
        arm.position.set(x, y + 14, z);
        arm.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
        t.castShadow = true;
        c.add(t, arm);
        towers.push(new THREE.Vector3(x, y + 13.6, z));
        if (k) {
          // A snowy slope under the lift so the towers have ground.
          const hillM = new THREE.Mesh(new THREE.ConeGeometry(30, y + 2, 7), mat(0xf4f8ff));
          hillM.position.set(x, (y + 2) / 2 - 1, z);
          c.add(hillM);
        }
      }
      const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(towers), 64, 0.06, 4), mat(0x343a40));
      c.add(cable);
      const lift = new THREE.CatmullRomCurve3(towers), chairs = [];
      const chairGeo = merge([xf(new THREE.BoxGeometry(0.1, 2, 0.1), { y: -1 }), xf(new THREE.BoxGeometry(1.6, 0.2, 0.8), { y: -2 }), xf(new THREE.BoxGeometry(1.6, 0.8, 0.15), { y: -1.6, z: -0.35 })]);
      const chairMat = mat(0x1c7ed6);
      for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(chairGeo, chairMat); m.userData.u = k / 14; c.add(m); chairs.push(m); }
      c.animate(dt => {
        for (const m of chairs) {
          m.userData.u = (m.userData.u + dt * 0.012) % 1;
          m.position.copy(lift.getPointAt(m.userData.u));
        }
      });
      billboard(c, 400, -1, 'SKI SCHOOL', '#1c7ed6', '#fff');
      billboard(c, 900, 1, 'HOT COCOA', '#862e9c', '#ffe066');
      mountains(c, 0x8c99a8, 0xf8fbff, 28, 820);
      c.add(clouds(r, 16, 0xf1f3f5, { x0: -600, x1: 800, z0: -700, z1: 700 }));
    },
  },
];
export const MAP_IDS = MAPS.map(m => m.id);
export const MAP_BY_ID = Object.fromEntries(MAPS.map(m => [m.id, m]));
