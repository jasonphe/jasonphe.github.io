// Building blocks for map scenery: geometry helpers, low-poly props (as parts for
// instancing), procedural textures, and a few one-off builders (buildings, clouds).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Small seeded RNG so every player gets the same scenery.
export function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), eu = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
// Bake a transform into a geometry (scale, then rotate, then move).
export function xf(geo, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1, sx = s, sy = s, sz = s } = {}) {
  return geo.applyMatrix4(m4.compose(v3.set(x, y, z), q.setFromEuler(eu.set(rx, ry, rz)), s3.set(sx, sy, sz)));
}
export const merge = geos => mergeGeometries(geos.map(g => g.index ? g.toNonIndexed() : g));
export const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...o });

const C = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);

// Props are lists of parts: [geometry, material, tinted]. A tinted part is drawn white
// and takes each instance's color, so one prop can come in many shades.
export const PROPS = {
  pine: () => [
    [xf(C(0.35, 0.5, 3, 6), { y: 1.5 }), mat(0x7a5232)],
    [merge([xf(new THREE.ConeGeometry(2.6, 5, 7), { y: 4.6 }), xf(new THREE.ConeGeometry(2, 4, 7), { y: 7.2 })]), mat(0xffffff), true],
  ],
  snowPine: () => [
    [xf(C(0.35, 0.5, 3, 6), { y: 1.5 }), mat(0x6b4a2e)],
    [merge([xf(new THREE.ConeGeometry(2.8, 5, 7), { y: 4.6 }), xf(new THREE.ConeGeometry(2.1, 4, 7), { y: 7.2 })]), mat(0xffffff), true],
    [merge([xf(new THREE.ConeGeometry(1.5, 2.4, 7), { y: 8.6 }), xf(new THREE.ConeGeometry(2.85, 1, 7), { y: 4.2 })]), mat(0xf4f8ff)],
  ],
  oak: () => [
    [xf(C(0.3, 0.48, 3.4, 6), { y: 1.7 }), mat(0x6e4b2d)],
    [merge([xf(Ico(2.5), { y: 5.2 }), xf(Ico(1.9), { x: 1.3, y: 4.5, z: 0.5 }), xf(Ico(1.7), { x: -1.1, y: 4.8, z: -0.6 })]), mat(0xffffff), true],
  ],
  palm: () => {
    const trunk = [];
    for (let k = 0; k < 4; k++) trunk.push(xf(C(0.3 - k * 0.03, 0.36 - k * 0.03, 2.3, 7), { x: k * k * 0.14, y: 1.1 + k * 2.1, rz: -k * 0.06 }));
    const fronds = [];
    for (let k = 0; k < 7; k++) {
      const f = xf(B(0.75, 0.06, 3.8), { z: 1.9 });
      xf(f, { rx: 0.45 + (k % 2) * 0.2 });
      fronds.push(xf(f, { ry: k / 7 * Math.PI * 2, x: 1.26, y: 8.5 }));
    }
    return [
      [merge(trunk), mat(0x8d6e4a)],
      [merge(fronds), mat(0xffffff), true],
      [merge([0, 1, 2].map(k => xf(new THREE.SphereGeometry(0.24, 6, 5), { x: 1.26 + Math.cos(k * 2.1) * 0.35, y: 8.2, z: Math.sin(k * 2.1) * 0.35 }))), mat(0x5c3b1e)],
    ];
  },
  jungleTree: () => [
    [merge([xf(C(0.6, 1.0, 15, 7), { y: 7.5 }),
      ...[0, 1, 2, 3].map(k => xf(B(0.3, 2.2, 1.6), { y: 1.1, z: 0.9, ry: k * Math.PI / 2 + 0.4 }))]), mat(0x5e4630)],
    [merge([xf(Ico(4.2), { y: 15.5, sy: 0.7 }), xf(Ico(3.4), { x: 3, y: 14.5, z: 1, sy: 0.7 }), xf(Ico(3.2), { x: -2.6, y: 14.8, z: -1.4, sy: 0.7 }), xf(Ico(2.8), { x: 0.5, y: 17, z: -2.4, sy: 0.7 })]), mat(0xffffff), true],
    [merge([[2.2, 1], [-2, -1.6], [0.6, 2.6]].map(([x, z]) => xf(C(0.05, 0.05, 7, 3), { x, y: 10.5, z }))), mat(0x3d6b2f)],
  ],
  fern: () => [[merge(Array.from({ length: 8 }, (_, k) => xf(xf(B(0.4, 0.04, 2), { z: 1 }), { rx: -0.55 - (k % 2) * 0.25, ry: k / 8 * Math.PI * 2, y: 0.2 }))), mat(0xffffff, { side: THREE.DoubleSide }), true]],
  bush: () => [[merge([xf(Ico(1.3), { y: 0.8, sy: 0.75 }), xf(Ico(0.9), { x: 0.9, y: 0.6, z: 0.3, sy: 0.75 })]), mat(0xffffff), true]],
  rock: () => [[xf(new THREE.DodecahedronGeometry(1.6, 0), { y: 0.5, sy: 0.7 }), mat(0xffffff), true]],
  cactus: () => [[merge([
    xf(C(0.42, 0.48, 6, 8), { y: 3 }),
    xf(C(0.28, 0.28, 2.4, 7), { x: 1.15, y: 4.3 }), xf(C(0.26, 0.26, 1.2, 7), { x: 0.6, y: 3.15, rz: Math.PI / 2 }),
    xf(C(0.26, 0.26, 1.8, 7), { x: -1.0, y: 3.3 }), xf(C(0.24, 0.24, 1.0, 7), { x: -0.5, y: 2.45, rz: Math.PI / 2 }),
  ]), mat(0xffffff), true]],
  hay: () => [[xf(C(1.1, 1.1, 1.7, 12), { y: 1.1, rz: Math.PI / 2 }), mat(0xd9b35b)]],
  umbrella: () => [
    [xf(C(0.05, 0.05, 2.6, 5), { y: 1.3 }), mat(0xf1f3f5)],
    [xf(new THREE.ConeGeometry(1.7, 0.7, 8), { y: 2.65 }), mat(0xffffff), true],
  ],
  // A street lamp; local +z is toward the road.
  lamp: (glow = 0xffe8a3) => [
    [merge([xf(C(0.12, 0.17, 7.4, 6), { y: 3.7 }), xf(B(0.14, 0.14, 2.4), { y: 7.3, z: 1.1 })]), mat(0x30343b, { metalness: 0.4, roughness: 0.5 })],
    [xf(B(0.6, 0.16, 0.9), { y: 7.2, z: 2.2 }), new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 2.2 })],
  ],
  // One fence segment, 6 m along local z.
  fence: (color = 0x9c7349) => [[merge([xf(B(0.2, 1.3, 0.2), { y: 0.65 }), xf(B(0.08, 0.14, 6), { y: 1.0, z: 3 }), xf(B(0.08, 0.14, 6), { y: 0.55, z: 3 })]), mat(color)]],
  cone: () => [[merge([xf(new THREE.ConeGeometry(0.3, 0.8, 8), { y: 0.45 }), xf(B(0.6, 0.06, 0.6), { y: 0.03 })]), mat(0xff6b1a)]],
  cow: () => [
    [merge([xf(B(1.0, 0.9, 2.0), { y: 1.2 }), xf(B(0.6, 0.6, 0.7), { y: 1.5, z: 1.25 }),
      ...[[0.35, 0.7], [-0.35, 0.7], [0.35, -0.7], [-0.35, -0.7]].map(([x, z]) => xf(B(0.2, 0.75, 0.2), { x, y: 0.38, z }))]), mat(0xffffff), true],
    [merge([xf(B(1.02, 0.5, 0.6), { y: 1.35, z: -0.3 }), xf(B(0.5, 0.4, 0.5), { x: 0.26, y: 1.2, z: 0.6 })]), mat(0x2b2b2b)],
  ],
  snowman: () => [
    [merge([xf(new THREE.SphereGeometry(1, 10, 8), { y: 1 }), xf(new THREE.SphereGeometry(0.7, 10, 8), { y: 2.4 }), xf(new THREE.SphereGeometry(0.48, 10, 8), { y: 3.4 })]), mat(0xf8fbff, { flatShading: false })],
    [xf(new THREE.ConeGeometry(0.1, 0.5, 6), { y: 3.4, z: 0.6, rx: Math.PI / 2 }), mat(0xff8c1a)],
    [merge([xf(C(0.45, 0.45, 0.1, 10), { y: 3.8 }), xf(C(0.3, 0.3, 0.55, 10), { y: 4.1 })]), mat(0x222222)],
  ],
  column: () => [[merge([xf(C(0.7, 0.8, 6, 8), { y: 3 }), xf(B(2, 0.5, 2), { y: 0.25 }), xf(B(1.9, 0.4, 1.9), { y: 6.2 })]), mat(0xffffff), true]],
};

// A canvas texture of speckles, for ground.
export function speckleTex(base, dots, n = 4000, size = 2, seed = 3) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let k = 0; k < n; k++) {
      g.fillStyle = dots[k % dots.length];
      g.fillRect(r() * w, r() * h, size, size);
    }
  });
}

// Banner or sign text.
export function signTex(text, bg, fg, w = 512, h = 128, font = '900 70px system-ui, sans-serif') {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4, w - 20);
  }, false);
}

// Moving water: a texture of light streaks whose offset the map animates.
export function waterMat(color, opacity = 0.92) {
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let k = 0; k < 260; k++) {
      g.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
      g.fillRect(r() * w, r() * h, 6 + r() * 26, 1.5);
    }
  });
  tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.15, metalness: 0.2, transparent: opacity < 1, opacity });
  return m;
}

// Window texture for buildings: 4 bays by 4 floors. With `lit`, also an emissive map
// where some windows glow.
export function windowTex(wall, glass, litColor, seed, litShare = 0.45) {
  const r = rng(seed), lit = [];
  for (let k = 0; k < 16; k++) lit.push(r() < litShare);
  const draw = glow => (g, w, h) => {
    g.fillStyle = glow ? '#000' : wall; g.fillRect(0, 0, w, h);
    for (let bx = 0; bx < 4; bx++) for (let fy = 0; fy < 4; fy++) {
      const on = lit[bx * 4 + fy];
      if (glow && !on) continue;
      g.fillStyle = glow ? litColor : on && litColor ? litColor : glass;
      g.fillRect(bx * 64 + 10, fy * 64 + 14, 44, 36);
    }
  };
  const map = canvasTex(256, 256, draw(false));
  const emissiveMap = litColor ? canvasTex(256, 256, draw(true)) : null;
  return { map, emissiveMap };
}

// Box buildings as two merged meshes (walls and roofs), so a whole city is two draw calls
// per style. Each building: { x, z, w, d, h }. Walls are UV'd so windows keep their size.
export function buildingMeshes(list, wallMat, roofMat) {
  const pos = [], nor = [], uv = [], rpos = [], rnor = [], ruv = [];
  const BAY = 12, FLOORS = 13;   // texture spans 4 bays of 3 m and 4 floors of 3.25 m
  for (const b of list) {
    const { x, z, w, d, h } = b, hw = w / 2, hd = d / 2, uo = b.uo ?? 0;
    const sides = [[[-hw, hd], [hw, hd], [0, 0, 1], w], [[hw, hd], [hw, -hd], [1, 0, 0], d], [[hw, -hd], [-hw, -hd], [0, 0, -1], w], [[-hw, -hd], [-hw, hd], [-1, 0, 0], d]];
    for (const [a, c, n, len] of sides) {
      const A = [x + a[0], 0, z + a[1]], Bp = [x + c[0], 0, z + c[1]], Cp = [x + c[0], h, z + c[1]], D = [x + a[0], h, z + a[1]];
      const u1 = uo + len / BAY, v1 = h / FLOORS;
      for (const [p, t] of [[A, [uo, 0]], [Bp, [u1, 0]], [Cp, [u1, v1]], [A, [uo, 0]], [Cp, [u1, v1]], [D, [uo, v1]]]) {
        pos.push(...p); nor.push(...n); uv.push(...t);
      }
    }
    const R = [[x - hw, h, z + hd], [x + hw, h, z + hd], [x + hw, h, z - hd], [x - hw, h, z - hd]];
    for (const k of [0, 1, 2, 0, 2, 3]) { rpos.push(...R[k]); rnor.push(0, 1, 0); ruv.push(R[k][0] / 8, R[k][2] / 8); }
  }
  const geo = (p, n, t) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(t, 2));
    return g;
  };
  const walls = new THREE.Mesh(geo(pos, nor, uv), wallMat);
  const roofs = new THREE.Mesh(geo(rpos, rnor, ruv), roofMat);
  walls.castShadow = roofs.castShadow = true;
  walls.receiveShadow = roofs.receiveShadow = true;
  return [walls, roofs];
}

// Puffy low-poly clouds, merged into one mesh high in the sky.
export function clouds(r, count, color, area) {
  const geos = [];
  for (let k = 0; k < count; k++) {
    const x = area.x0 + r() * (area.x1 - area.x0), z = area.z0 + r() * (area.z1 - area.z0), y = 110 + r() * 70;
    const s = 8 + r() * 10;
    for (let p = 0; p < 5; p++) geos.push(xf(Ico(s * (0.6 + r() * 0.5), 1), { x: x + (p - 2) * s * 0.8, y: y + r() * s * 0.4, z: z + (r() - 0.5) * s, sy: 0.55 }));
  }
  const m = new THREE.Mesh(merge(geos), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 1, flatShading: true, fog: false }));
  return m;
}
