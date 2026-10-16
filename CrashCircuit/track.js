// A circuit built from a map (see maps.js). Roads are paths: the main loop plus optional
// branches that split off and rejoin it. Around them is a terrain height map that blends
// into the roads, so cars can leave the road anywhere. Also here: ramps, solid scenery
// (trees, buildings...), checkpoints, and the map's decorations. Everything goes in one
// group so a map can be torn down and another built.
import * as THREE from 'three';
import { rng, canvasTex, speckleTex, signTex, PROPS, noise2 } from './scenery.js';

export const HALF_W = 11;            // half the road width, in meters
export const EDGE = HALF_W + 1.2;    // road plus rumble strips: on-road out to here
export const N = 1200;               // samples around the main loop
export const CHECKPOINTS = 8;        // gates around the lap (0 is the line), passed in order
const FLAT = HALF_W + 9;             // terrain sits just under the road out to here
const CELL = 20;                     // spatial hash cell for road samples, m
const GRID = 5;                      // terrain mesh spacing, m
const MARGIN = 380;                  // terrain extends this far past the roads
const SCELL = 12;                    // spatial hash cell for solids

const V3 = THREE.Vector3;
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);

// A road path from evenly spaced points (x, y = height, z).
function makePath(id, pts, closed) {
  const n = pts.length;
  const p = {
    id, closed, n, px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
    tx: new Float32Array(n), tz: new Float32Array(n), nx: new Float32Array(n), nz: new Float32Array(n),
    slope: new Float32Array(n), prog: new Float32Array(n),
  };
  pts.forEach((v, i) => { p.px[i] = v.x; p.py[i] = v.y; p.pz[i] = v.z; });
  let length = 0;
  for (let i = 0; i < n; i++) {
    const a = closed ? (i - 1 + n) % n : Math.max(0, i - 1), b = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    const dx = p.px[b] - p.px[a], dz = p.pz[b] - p.pz[a], d = Math.hypot(dx, dz) || 1;
    p.tx[i] = dx / d; p.tz[i] = dz / d;
    p.nx[i] = p.tz[i]; p.nz[i] = -p.tx[i];       // points left of the direction of travel
    p.slope[i] = (p.py[b] - p.py[a]) / d;
    if (closed || i < n - 1) { const c = (i + 1) % n; length += Math.hypot(p.px[c] - p.px[i], p.pz[c] - p.pz[i]); }
  }
  p.length = length;
  p.step = length / (closed ? n : n - 1);
  return p;
}

export function buildTrack(scene, map) {
  const th = map.theme;
  const group = new THREE.Group();
  scene.add(group);

  // ---------- Paths ----------
  const curve = new THREE.CatmullRomCurve3(map.ctrl.map(([x, z, y]) => new V3(x, y, z)), true, 'centripetal');
  const main = makePath(0, curve.getSpacedPoints(N).slice(0, N), true);
  for (let i = 0; i < N; i++) main.prog[i] = i;
  const paths = [main];
  const nearestMain = (x, z) => {
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i++) { const d = (x - main.px[i]) ** 2 + (z - main.pz[i]) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  const mainPt = i => { i = ((i % N) + N) % N; return new V3(main.px[i], main.py[i], main.pz[i]); };
  // Branches: leave the main loop near `from`, pass through `via`, rejoin near `to`.
  // The spline runs through main points either side so the joins are smooth.
  for (const spec of map.branches ?? []) {
    const i0 = nearestMain(...spec.from), i1 = nearestMain(...spec.to);
    const ctrl = [mainPt(i0 - 30), mainPt(i0), ...spec.via.map(([x, z, y]) => new V3(x, y, z)), mainPt(i1), mainPt(i1 + 30)];
    const dense = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getSpacedPoints(4000);
    const closest = (pt, lo, hi) => { let b = lo, bd = Infinity; for (let k = lo; k < hi; k++) { const d = dense[k].distanceToSquared(pt); if (d < bd) { bd = d; b = k; } } return b; };
    const a = closest(ctrl[1], 0, 2000), b = closest(ctrl[ctrl.length - 2], 2000, 4001);
    const seg = dense.slice(a, b + 1), cum = [0];
    for (let k = 1; k < seg.length; k++) cum.push(cum[k - 1] + Math.hypot(seg[k].x - seg[k - 1].x, seg[k].z - seg[k - 1].z));
    const total = cum[cum.length - 1], n = Math.max(2, Math.round(total / main.step) + 1), pts = [];
    for (let k = 0, j = 0; k < n; k++) {
      const want = total * k / (n - 1);
      while (j < seg.length - 2 && cum[j + 1] < want) j++;
      const t = (want - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      pts.push(seg[j].clone().lerp(seg[j + 1], Math.min(1, t)));
    }
    const p = makePath(paths.length, pts, false);
    p.from = i0; p.to = i1; p.name = spec.name;
    const span = ((i1 - i0) % N + N) % N;
    for (let k = 0; k < n; k++) p.prog[k] = (i0 + span * k / (n - 1)) % N;
    paths.push(p);
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of paths) for (let i = 0; i < p.n; i++) {
    minX = Math.min(minX, p.px[i]); maxX = Math.max(maxX, p.px[i]);
    minZ = Math.min(minZ, p.pz[i]); maxZ = Math.max(maxZ, p.pz[i]);
  }
  const bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) };

  // ---------- Nearest road sample, via a spatial hash ----------
  const cells = new Map();
  const ckey = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  for (const p of paths) for (let i = 0; i < p.n; i++) {
    const k = ckey(Math.floor(p.px[i] / CELL), Math.floor(p.pz[i] / CELL));
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(p.id * 65536 + i);
  }
  const NB = { p: -1, i: 0, d2: 0 };
  function nearest(x, z, maxR = 170) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    let best = Infinity, bp = -1, bi = 0;
    for (let ring = 0; ring * CELL <= maxR + CELL; ring++) {
      if (bp >= 0 && (ring - 1) * CELL > Math.sqrt(best)) break;
      for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const list = cells.get(ckey(cx + dx, cz + dz));
        if (!list) continue;
        for (const v of list) {
          const p = paths[v >> 16], i = v & 65535, d = (x - p.px[i]) ** 2 + (z - p.pz[i]) ** 2;
          if (d < best) { best = d; bp = p.id; bi = i; }
        }
      }
    }
    NB.p = bp; NB.i = bi; NB.d2 = best;
    return bp >= 0 && best <= maxR * maxR;
  }

  // ---------- Terrain ----------
  const noise = noise2(map.seed);
  const tt = th.terrain ?? {};
  const base = tt.base ?? 0;
  const nat = tt.height ? (x, z) => tt.height(x, z, noise) : (x, z) => base + (tt.amp ?? 10) * noise(x / (tt.scale ?? 150), z / (tt.scale ?? 150));
  const flats = [];
  const gx0 = minX - MARGIN, gz0 = minZ - MARGIN;
  const gnx = Math.ceil((maxX - minX + 2 * MARGIN) / GRID) + 1, gnz = Math.ceil((maxZ - minZ + 2 * MARGIN) / GRID) + 1;
  const heights = new Float32Array(gnx * gnz);
  function gridH(x, z) {
    let fx = (x - gx0) / GRID, fz = (z - gz0) / GRID;
    fx = Math.min(gnx - 1.001, Math.max(0, fx)); fz = Math.min(gnz - 1.001, Math.max(0, fz));
    const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz, k = iz * gnx + ix;
    const a = heights[k], b = heights[k + 1], c = heights[k + gnx], d = heights[k + gnx + 1];
    // Match the mesh's triangle split (a-c-b, b-c-d).
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }

  // ---------- Ramps ----------
  const ramps = [];
  function rampAt(x, z) {
    for (const r of ramps) {
      const dx = x - r.ox, dz = z - r.oz, u = dx * r.fx + dz * r.fz;
      if (u < 0 || u > r.len) continue;
      if (Math.abs(dx * r.rx + dz * r.rz) > r.w / 2) continue;
      return r.h * u / r.len;
    }
    return 0;
  }

  // ---------- Solids ----------
  const solids = new Map();
  function addSolid(s) {
    const x0 = Math.floor((s.x - s.br) / SCELL), x1 = Math.floor((s.x + s.br) / SCELL);
    const z0 = Math.floor((s.z - s.br) / SCELL), z1 = Math.floor((s.z + s.br) / SCELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = ckey(cx, cz);
      if (!solids.has(k)) solids.set(k, []);
      solids.get(k).push(s);
    }
  }

  const T = {
    N, paths, main, step: main.step, length: main.length, map, bounds, group, ramps,
    px: main.px, py: main.py, pz: main.pz, tx: main.tx, tz: main.tz, nx: main.nx, nz: main.nz, slope: main.slope,
    grip: th.grip ?? 1,
    off: { top: 0.62, grip: 0.75, drag: 0.5, dust: [0.55, 0.45, 0.3], ...th.offroad },   // off-road handling
    waterY: th.waterY ?? null,
    anims: [],
    boxSpots: [],
    checkpoints: Array.from({ length: CHECKPOINTS }, (_, k) => Math.round(k * N / CHECKPOINTS)),
    nearest,
    // Everything about the ground at (x, z): nearest road (path, sample i, main-loop index
    // `idx`, lateral offset `lat`, distance `dist`), whether it's on the road, and the
    // height to drive on (`ground`, including ramps).
    probe(x, z, out) {
      if (!nearest(x, z)) {
        out.path = -1; out.onRoad = false; out.dist = Infinity; out.ground = gridH(x, z); out.ramp = 0;
        return out;
      }
      const p = paths[NB.p], n = p.n, i = NB.i;
      let a = i;
      if ((x - p.px[i]) * p.tx[i] + (z - p.pz[i]) * p.tz[i] < 0) a = p.closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      const b = p.closed ? (a + 1) % n : Math.min(n - 1, a + 1);
      const segL = Math.hypot(p.px[b] - p.px[a], p.pz[b] - p.pz[a]) || 1;
      const u = Math.min(1, Math.max(0, ((x - p.px[a]) * p.tx[a] + (z - p.pz[a]) * p.tz[a]) / segL));
      out.path = p.id; out.i = i;
      out.lat = (x - p.px[a]) * p.nx[a] + (z - p.pz[a]) * p.nz[a];
      out.roadY = p.py[a] + (p.py[b] - p.py[a]) * u;
      out.dist = Math.sqrt(NB.d2);
      out.idx = Math.round(p.prog[i]) % N;
      out.onRoad = Math.abs(out.lat) <= EDGE;
      out.ramp = out.onRoad ? rampAt(x, z) : 0;
      out.ground = out.onRoad ? out.roadY + out.ramp : gridH(x, z);
      return out;
    },
    groundAt(x, z) { return T.probe(x, z, GQ).ground; },
    terrainAt: gridH,
    pointAt(i, lat = 0, path = 0) {
      const p = paths[path];
      i = p.closed ? ((i % p.n) + p.n) % p.n : Math.max(0, Math.min(p.n - 1, i));
      return { x: p.px[i] + p.nx[i] * lat, y: p.py[i], z: p.pz[i] + p.nz[i] * lat };
    },
    headingAt(i, path = 0) {
      const p = paths[path];
      i = p.closed ? ((i % p.n) + p.n) % p.n : Math.max(0, Math.min(p.n - 1, i));
      return Math.atan2(p.tx[i], p.tz[i]);
    },
    // Push a circle (x, z, r) at height y out of any solid it overlaps. Returns the
    // deepest overlap in `out` ({ pen, nx, nz }), or false.
    solidHit(x, z, r, y, out) {
      const list = solids.get(ckey(Math.floor(x / SCELL), Math.floor(z / SCELL)));
      out.pen = 0;
      if (!list) return false;
      for (const s of list) {
        if (y > s.top) continue;       // jumped over it
        const dx = x - s.x, dz = z - s.z;
        let pen, nx, nz;
        if (s.k === 0) {
          const d = Math.hypot(dx, dz) || 0.001;
          pen = r + s.r - d; nx = dx / d; nz = dz / d;
        } else {
          const lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
          const qx = Math.max(-s.hw, Math.min(s.hw, lx)), qz = Math.max(-s.hd, Math.min(s.hd, lz));
          let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          if (d < 1e-4) {   // center inside the box: push out the nearest side
            const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz);
            if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; d = -px; } else { ex = 0; ez = Math.sign(lz) || 1; d = -pz; }
            pen = r - d;
          } else { pen = r - d; ex /= d; ez /= d; }
          nx = ex * s.c + ez * s.s; nz = -ex * s.s + ez * s.c;
        }
        if (pen > out.pen) { out.pen = pen; out.nx = nx; out.nz = nz; }
      }
      return out.pen > 0;
    },
    // Remove everything this map built and free its GPU memory.
    dispose() {
      scene.remove(group);
      group.traverse(o => {
        o.geometry?.dispose();
        for (const m of [o.material].flat()) {
          if (!m) continue;
          for (const k of ['map', 'emissiveMap']) m[k]?.dispose();
          m.dispose();
        }
      });
    },
  };
  const GQ = {};

  // ---------- Scenery helpers (ctx) ----------
  const r = rng(map.seed);
  const v = new V3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new V3(), m4 = new THREE.Matrix4(), col = new THREE.Color();
  let terrainReady = false;
  const ctx = {
    T, r, th, bounds, spots: {}, PROPS, nat,
    add(...objs) { group.add(...objs); return objs[0]; },
    animate(fn) { T.anims.push(fn); },
    // Height of the ground at (x, z). Before the terrain is built (in layout) it's the
    // natural terrain.
    ground(x, z) { return terrainReady ? T.groundAt(x, z) : nat(x, z); },
    // Flatten the terrain in a circle (for lakes, buildings). Only in layout. h defaults
    // to the natural height at the center.
    flatten(x, z, rad, h = nat(x, z), edge = rad * 0.8) { flats.push({ x, z, r: rad, h, edge }); return h; },
    // How far (x, z) is from the edge of the nearest road.
    clearance(x, z) { return nearest(x, z, 200) ? Math.sqrt(NB.d2) - EDGE : 200; },
    // Try random spots; call fn(x, z) for ones at least `clear` and at most `near` m from a road.
    scatter(n, fn, { clear = 3, near = Infinity, area, test } = {}) {
      const pad = Math.min(MARGIN - 30, near + 20);
      const a = area ?? { x0: minX - pad, x1: maxX + pad, z0: minZ - pad, z1: maxZ + pad };
      let placed = 0;
      for (let tries = 0; placed < n && tries < n * 40; tries++) {
        const x = a.x0 + r() * (a.x1 - a.x0), z = a.z0 + r() * (a.z1 - a.z0);
        const cl = ctx.clearance(x, z);
        if (cl < clear || cl > near || (test && !test(x, z))) continue;
        fn(x, z, placed++);
      }
    },
    solidCircle(x, z, rad, height = 12, y = ctx.ground(x, z)) { addSolid({ k: 0, x, z, r: rad, br: rad, top: y + height }); },
    solidBox(x, z, w, d, ry = 0, height = 12, y = ctx.ground(x, z)) {
      addSolid({ k: 1, x, z, hw: w / 2, hd: d / 2, c: Math.cos(ry), s: Math.sin(ry), br: Math.hypot(w, d) / 2, top: y + height });
    },
    // Instance a prop: one InstancedMesh per part. Items: { x, z, y (above ground) | abs,
    // s | sx sy sz, rx, ry, rz, color }. `solid: { r, h }` makes each one block cars
    // (radius r and height h, scaled by the item's size).
    inst(parts, items, { shadow = true, solid = null } = {}) {
      if (!items.length) return;
      for (const o of items) {
        o.gy = o.abs ? o.y : ctx.ground(o.x, o.z) + (o.y ?? 0);
        if (solid) ctx.solidCircle(o.x, o.z, solid.r * (o.s ?? o.sx ?? 1), solid.h * (o.s ?? o.sy ?? 1), o.gy);
      }
      for (const [geo, material, tinted] of parts) {
        const im = new THREE.InstancedMesh(geo, material, items.length);
        items.forEach((o, k) => {
          const sc = o.s ?? 1;
          m4.compose(v.set(o.x, o.gy, o.z), q.setFromEuler(e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)), s3.set(o.sx ?? sc, o.sy ?? sc, o.sz ?? sc));
          im.setMatrixAt(k, m4);
          if (tinted) im.setColorAt(k, col.set(o.color ?? 0xffffff));
        });
        im.castShadow = shadow;
        im.receiveShadow = true;
        group.add(im);
      }
    },
    // Walk a path every `every` samples: fn(i, x, y, z, heading).
    along(every, fn, from = 0, path = 0) {
      const p = paths[path];
      for (let i = from; i < p.n; i += every) fn(i, p.px[i], p.py[i], p.pz[i], Math.atan2(p.tx[i], p.tz[i]));
    },
    // A point on the ground `off` m past the road's edge at sample i, on side s (+1 left).
    edge(i, s, off, path = 0) {
      const p = T.pointAt(i, s * (EDGE + off), path);
      return { x: p.x, z: p.z, y: ctx.ground(p.x, p.z) };
    },
    // The nearest spot to (x0, z0) at least `need` m from any road.
    findSpot(x0, z0, need) {
      for (let rad = 0; rad < 600; rad += 6) {
        const steps = Math.max(1, Math.round(rad / 6));
        for (let k = 0; k < steps; k++) {
          const a = k / steps * Math.PI * 2, x = x0 + Math.cos(a) * rad, z = z0 + Math.sin(a) * rad;
          if (ctx.clearance(x, z) >= need) return { x, z };
        }
      }
      return { x: x0, z: z0 };
    },
    // A ring of big shapes far away (mountains, mesas, skyline).
    ring(count, dist, fn) {
      for (let k = 0; k < count; k++) {
        const a = k / count * Math.PI * 2 + r() * 0.2, d = dist + r() * dist * 0.3;
        fn(bounds.cx + Math.cos(a) * d, bounds.cz + Math.sin(a) * d, k);
      }
    },
    // Stepped grandstands beside the start straight, on side s.
    grandstand(i = 30, s = -1, len = 80) {
      const crowdTex = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#596170'; g.fillRect(0, 0, w, h);
        const rr = rng(11), cols = ['#e03131', '#1c7ed6', '#fcc419', '#f1f3f5', '#2f9e44', '#e64980'];
        for (let k = 0; k < 900; k++) { g.fillStyle = cols[rr() * cols.length | 0]; g.fillRect(rr() * w, rr() * h, 3, 3); }
      });
      const side = new THREE.MeshStandardMaterial({ color: 0x8a92a0 });
      const front = new THREE.MeshStandardMaterial({ map: crowdTex });
      const stand = new THREE.Group();
      for (let t = 0; t < 5; t++) {
        const hgt = 3 + t * 1.2;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(4, hgt, len), s < 0 ? [front, side, side, side, side, side] : [side, front, side, side, side, side]);
        tier.position.set(s * (t * 4), hgt / 2 - 2, 0);
        tier.castShadow = tier.receiveShadow = true;
        stand.add(tier);
      }
      const off = 14, p = T.pointAt(i, s * (EDGE + off + 10));
      const y = ctx.ground(p.x, p.z), hd = T.headingAt(i);
      stand.position.set(p.x, y, p.z);
      stand.rotation.y = hd;
      group.add(stand);
      ctx.solidBox(p.x, p.z, 22, len, hd, 9, y);
    },
    sign(text, bg, fg, w, h, glow = false) {
      const tex = signTex(text, bg, fg);
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: glow ? 0xffffff : 0, emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 1.4 : 0, side: THREE.DoubleSide }));
    },
  };

  // Layout runs before the terrain is built, so it can flatten ground for lakes and buildings.
  map.layout?.(ctx);

  // Terrain heights: natural terrain, blended down (or up) to the roads, then flattened zones,
  // then eased to the base height at the far edges.
  for (let iz = 0; iz < gnz; iz++) for (let ix = 0; ix < gnx; ix++) {
    const x = gx0 + ix * GRID, z = gz0 + iz * GRID;
    let h = nat(x, z);
    if (nearest(x, z, 90)) {
      const d = Math.sqrt(NB.d2), ry = paths[NB.p].py[NB.i] - 0.08;
      if (d <= FLAT) h = ry;
      else {
        const bw = Math.min(60, Math.max(16, Math.abs(h - ry) * 2.4)), t = (d - FLAT) / bw;
        if (t < 1) h = ry + (h - ry) * smooth(t);
      }
    }
    for (const f of flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) h = f.h;
      else if (d < f.r + f.edge) h = f.h + (h - f.h) * smooth((d - f.r) / f.edge);
    }
    const edgeD = Math.min(ix, iz, gnx - 1 - ix, gnz - 1 - iz) * GRID;
    if (edgeD < 150) h = base + (h - base) * smooth(edgeD / 150);
    heights[iz * gnx + ix] = h;
  }
  {
    const pos = new Float32Array(gnx * gnz * 3), uv = new Float32Array(gnx * gnz * 2), idx = [];
    for (let iz = 0; iz < gnz; iz++) for (let ix = 0; ix < gnx; ix++) {
      const k = iz * gnx + ix, x = gx0 + ix * GRID, z = gz0 + iz * GRID;
      pos.set([x, heights[k], z], k * 3);
      uv.set([x / 7, z / 7], k * 2);
      if (ix < gnx - 1 && iz < gnz - 1) idx.push(k, k + gnx, k + 1, k + 1, k + gnx, k + gnx + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // Color by height and steepness: theme palette, steep slopes show rock or dirt.
    const pal = tt.colors ?? {};
    const cGround = new THREE.Color(th.ground), cSteep = new THREE.Color(pal.steep ?? '#7d7266');
    const cLow = pal.low ? new THREE.Color(pal.low) : null, cHigh = pal.high ? new THREE.Color(pal.high) : null;
    const nrm = g.attributes.normal.array, colors = new Float32Array(gnx * gnz * 3), c = new THREE.Color();
    for (let k = 0; k < gnx * gnz; k++) {
      const h = heights[k], ny = nrm[k * 3 + 1], x = pos[k * 3], z = pos[k * 3 + 2];
      c.copy(cGround);
      const wob = noise(x / 23, z / 23, 2);
      c.offsetHSL(0, 0, wob * 0.05);
      if (cLow && h < pal.lowY) c.lerp(cLow, smooth((pal.lowY - h) / 1.5));
      if (cHigh && h > pal.highY) c.lerp(cHigh, smooth((h - pal.highY) / 6));
      c.lerp(cSteep, smooth((0.93 - ny) / 0.2));
      colors.set([c.r, c.g, c.b], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const tex = speckleTex('#bdbdbd', ['rgba(90,90,90,.35)', 'rgba(255,255,255,.35)'], 5000, 2, 3);
    const terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 1 }));
    terrain.receiveShadow = true;
    group.add(terrain);
    // Flat ground beyond the terrain, out to the horizon.
    const far = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: cGround.clone().multiplyScalar(0.9), roughness: 1 }));
    far.rotation.x = -Math.PI / 2;
    // Below the lowest terrain, so it can never cover a road that dips under the base height.
    let lowest = base;
    for (let k = 0; k < heights.length; k++) lowest = Math.min(lowest, heights[k]);
    far.position.set(bounds.cx, lowest - 1.5, bounds.cz);
    group.add(far);
  }
  terrainReady = true;

  // ---------- Roads ----------
  function ribbon(p, edge, vScale, mat, shadows = true) {
    const pos = [], uv = [], index = [], n = p.n, count = p.closed ? n + 1 : n;
    for (let k = 0; k < count; k++) {
      const [l, rr] = edge(k % n);
      pos.push(...l, ...rr);
      const vv = k * p.step / vScale;
      uv.push(0, vv, 1, vv);
      if (k < count - 1) { const j = k * 2; index.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = shadows;
    group.add(m);
    return m;
  }
  const R = th.road;
  const roadTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = R.base; g.fillRect(0, 0, w, h);
    const rr = rng(7);
    for (let k = 0; k < 2500; k++) { g.fillStyle = R.speck[k % R.speck.length]; g.fillRect(rr() * w, rr() * h, 1.5, 1.5); }
    if (R.ruts) { g.fillStyle = R.ruts; for (const x of [0.22, 0.36, 0.64, 0.78]) g.fillRect(w * x - 5, 0, 10, h); }
    if (R.edge) { g.fillStyle = R.edge; g.fillRect(5, 0, 4, h); g.fillRect(w - 9, 0, 4, h); }
    if (R.center) { g.fillStyle = R.center; g.fillRect(w / 2 - 2, 0, 4, R.solid ? h : h * 0.45); }
  });
  const stripes = (a, b) => canvasTex(8, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
  });
  const curbTex = stripes(...th.curb);
  const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(R.base).multiplyScalar(0.7), roughness: 1, side: THREE.DoubleSide });
  for (const p of paths) {
    // Branches draw over the main road where they overlap at the forks.
    const off = p.id ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 } : {};
    const at = (i, lat, dy) => [p.px[i] + p.nx[i] * lat, p.py[i] + dy, p.pz[i] + p.nz[i] * lat];
    ribbon(p, i => [at(i, HALF_W, 0.04), at(i, -HALF_W, 0.04)], 14,
      new THREE.MeshStandardMaterial({ map: roadTex, roughness: R.rough ?? 0.92, side: THREE.DoubleSide, ...off }));
    const curbMat = new THREE.MeshStandardMaterial({ map: curbTex, roughness: 0.8, side: THREE.DoubleSide, ...off });
    for (const s of [1, -1]) {
      ribbon(p, i => [at(i, s * HALF_W, 0.05), at(i, s * EDGE, 0.06)], 4, curbMat);
      ribbon(p, i => [at(i, s * EDGE, 0.06), at(i, s * EDGE, -0.6)], 10, sideMat, false);
    }
  }

  // Ramps from the map: { path, at (0..1 along it), lat, w, len, h }.
  const chevron = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffd43b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1b1b1f';
    for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(0, k * 32 + 32); g.lineTo(w / 2, k * 32); g.lineTo(w, k * 32 + 32); g.lineTo(w, k * 32 + 46); g.lineTo(w / 2, k * 32 + 14); g.lineTo(0, k * 32 + 46); g.fill(); }
  });
  const rampTop = new THREE.MeshStandardMaterial({ map: chevron, roughness: 0.6 });
  const rampSide = new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.8 });
  for (const rs of map.ramps ?? []) {
    const p = paths[rs.path ?? 0];
    if (!p) continue;
    let i = Math.round((rs.at ?? 0) * (p.n - 1));
    if (rs.near) { let bd = Infinity; for (let k = 0; k < p.n; k++) { const d = (p.px[k] - rs.near[0]) ** 2 + (p.pz[k] - rs.near[1]) ** 2; if (d < bd) { bd = d; i = k; } } }
    const lat = rs.lat ?? 0, w = rs.w ?? 10, len = rs.len ?? 12, h = rs.h ?? 2.2;
    const o = T.pointAt(i, lat, p.id), fx = p.tx[i], fz = p.tz[i], rx = p.nx[i], rz = p.nz[i];
    const y0 = p.py[i] + 0.04;
    ramps.push({ ox: o.x, oz: o.z, fx, fz, rx, rz, len, w, h });
    const P = (u, vv, y) => [o.x + fx * u + rx * vv, y0 + y, o.z + fz * u + rz * vv];
    const A = P(0, w / 2, 0), B = P(0, -w / 2, 0), C = P(len, w / 2, 0), D = P(len, -w / 2, 0), E = P(len, w / 2, h), F = P(len, -w / 2, h);
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...E, ...B, ...F, ...E], 3));
    top.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, len / 6, 1, 0, 1, len / 6, 0, len / 6], 2));
    top.computeVertexNormals();
    const sides = new THREE.BufferGeometry();
    sides.setAttribute('position', new THREE.Float32BufferAttribute([...C, ...E, ...F, ...C, ...F, ...D, ...A, ...C, ...E, ...B, ...F, ...D], 3));
    sides.computeVertexNormals();
    const mt = new THREE.Mesh(top, rampTop), ms = new THREE.Mesh(sides, rampSide);
    mt.castShadow = ms.castShadow = true;
    mt.receiveShadow = true;
    ms.material.side = THREE.DoubleSide;
    group.add(mt, ms);
  }

  // Item boxes: three rows on the main loop and one in the middle of each branch.
  for (const f of [0.17, 0.47, 0.76]) for (const lat of [-6, -2, 2, 6]) T.boxSpots.push({ path: 0, i: Math.round(f * N), lat });
  for (const p of paths.slice(1)) for (const lat of [-4, 0, 4]) T.boxSpots.push({ path: p.id, i: Math.round(p.n * 0.5), lat });

  // Checkered start line and a gantry over it.
  const checker = canvasTex(64, 16, (g) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fafafa'; g.fillRect(x * 4, y * 4, 4, 4); }
  }, false);
  checker.magFilter = THREE.NearestFilter;
  const h0 = T.headingAt(0);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 2.5), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  line.rotation.set(-Math.PI / 2, 0, h0);
  line.position.set(main.px[0], main.py[0] + 0.05, main.pz[0]);
  line.receiveShadow = true;
  group.add(line);
  const gantry = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.6, metalness: 0.3 });
  const postX = EDGE + 1.5;
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 12, 0.8), postMat);
    post.position.set(s * postX, 2, 0);
    post.castShadow = true;
    gantry.add(post);
    const pp = T.pointAt(0, s * postX);
    ctx.solidCircle(pp.x, pp.z, 0.6, 9, main.py[0]);
  }
  const bannerTex = canvasTex(1024, 96, (g, w, h) => {
    g.fillStyle = '#16181d'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 24) for (let y = 0; y < 2; y++) {
      g.fillStyle = (x / 24 + y) % 2 ? '#fafafa' : '#16181d';
      g.fillRect(x, y * 12, 24, 12); g.fillRect(x, h - 24 + y * 12, 24, 12);
    }
    g.fillStyle = th.banner ?? '#ffd43b';
    g.font = '900 50px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(map.name.toUpperCase(), w / 2, h / 2 + 2);
  }, false);
  const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTex, emissive: th.night ? 0xffffff : 0x000000, emissiveMap: th.night ? bannerTex : null, emissiveIntensity: 0.6 });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(postX * 2 + 1.6, 2, 0.5), [postMat, postMat, postMat, postMat, bannerMat, bannerMat]);
  banner.position.y = 8;
  banner.castShadow = true;
  gantry.add(banner);
  gantry.rotation.y = h0;
  gantry.position.set(main.px[0], main.py[0], main.pz[0]);
  group.add(gantry);

  map.decorate(ctx);

  // A minimap outline, in 0..1 coordinates. x is flipped so the map matches what you see
  // from the chase camera (+x is to the left).
  const span = bounds.span;
  T.mapXY = (x, z) => [1 - ((x - minX) + (span - (maxX - minX)) / 2) / span, 1 - ((z - minZ) + (span - (maxZ - minZ)) / 2) / span];
  return T;
}
