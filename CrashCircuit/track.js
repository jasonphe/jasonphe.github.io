// A circuit built from a map (see maps.js): a closed spline sampled into N evenly spaced
// points, the meshes built along it, the queries the cars use (where am I along the
// track, how far from the middle, how high is the road here), and the map's scenery.
// Everything goes in one group so a map can be torn down and another built.
import * as THREE from 'three';
import { rng, canvasTex, speckleTex, signTex, PROPS } from './scenery.js';

export const HALF_W = 11;            // half the road width, in meters
export const WALL = HALF_W + 1.4;    // inner face of the barriers (curbs sit in between)
export const N = 1200;               // samples around the lap

// Three rows of item boxes across the road: [fraction of the lap, lateral offsets].
const BOX_ROWS = [[0.17, [-6, -2, 2, 6]], [0.47, [-6, -2, 2, 6]], [0.76, [-6, -2, 2, 6]]];
// How far the grassy bank reaches past the barrier at sample i (it slopes to the ground).
const bankOut = h => WALL + 0.7 + 3 + Math.max(0, h) * 2.2;

export function buildTrack(scene, map) {
  const th = map.theme;
  const group = new THREE.Group();
  scene.add(group);
  const curve = new THREE.CatmullRomCurve3(map.ctrl.map(([x, z, y]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
  const sp = curve.getSpacedPoints(N);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const tx = new Float32Array(N), tz = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N);
  const slope = new Float32Array(N);
  for (let i = 0; i < N; i++) { px[i] = sp[i].x; py[i] = sp[i].y; pz[i] = sp[i].z; }
  let length = 0;
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    const dx = px[b] - px[a], dz = pz[b] - pz[a], d = Math.hypot(dx, dz);
    tx[i] = dx / d; tz[i] = dz / d;
    nx[i] = tz[i]; nz[i] = -tx[i];        // points left of the direction of travel
    slope[i] = (py[b] - py[a]) / d;
    length += Math.hypot(px[b] - px[i], pz[b] - pz[i]);
  }
  const step = length / N;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }
  const bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) };

  const T = {
    N, step, length, px, py, pz, tx, tz, nx, nz, slope, map, bounds, group,
    grip: th.grip ?? 1,
    anims: [],                 // (dt, t) => void, for moving scenery
    boxSpots: BOX_ROWS.flatMap(([f, lats]) => lats.map(lat => ({ i: Math.round(f * N), lat }))),
    // Closest sample to (x, z). Searches near `hint` when given, else the whole lap.
    nearest(x, z, hint = -1) {
      let best = 0, bd = Infinity;
      if (hint >= 0) {
        for (let k = -40; k <= 40; k++) {
          const i = (hint + k + N) % N, dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = i; }
        }
        if (bd < 900) return best;
      }
      for (let i = 0; i < N; i++) {
        const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    // Where (x, z) is relative to the road: sample i, lateral offset (+ is left), road height.
    project(x, z, hint, out) {
      const i = T.nearest(x, z, hint);
      let a = i;
      if ((x - px[i]) * tx[i] + (z - pz[i]) * tz[i] < 0) a = (i - 1 + N) % N;
      const b = (a + 1) % N;
      const u = Math.min(1, Math.max(0, ((x - px[a]) * tx[a] + (z - pz[a]) * tz[a]) / step));
      out.i = i;
      out.lat = (x - px[a]) * nx[a] + (z - pz[a]) * nz[a];
      out.y = py[a] + (py[b] - py[a]) * u;
      return out;
    },
    pointAt(i, lat = 0) {
      i = ((i % N) + N) % N;
      return { x: px[i] + nx[i] * lat, y: py[i], z: pz[i] + nz[i] * lat };
    },
    headingAt(i) { i = ((i % N) + N) % N; return Math.atan2(tx[i], tz[i]); },
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

  // ---------- Road, curbs, barriers, banks ----------
  // A strip along the whole lap. `edge(i)` gives the two [x, y, z] edge points at sample i.
  function ribbon(edge, vScale, mat, shadows = true) {
    const pos = [], uv = [], index = [];
    for (let i = 0; i <= N; i++) {
      const [l, r] = edge(i % N);
      pos.push(...l, ...r);
      const v = i * step / vScale;
      uv.push(0, v, 1, v);
      if (i < N) { const k = i * 2; index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
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
  const at = (i, lat, dy) => [px[i] + nx[i] * lat, py[i] + dy, pz[i] + nz[i] * lat];

  const R = th.road;
  const roadTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = R.base; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let k = 0; k < 2500; k++) {
      g.fillStyle = R.speck[k % R.speck.length];
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    if (R.ruts) {   // dirt tracks: darker worn lanes instead of paint
      g.fillStyle = R.ruts;
      for (const x of [0.22, 0.36, 0.64, 0.78]) g.fillRect(w * x - 5, 0, 10, h);
    }
    if (R.edge) { g.fillStyle = R.edge; g.fillRect(5, 0, 4, h); g.fillRect(w - 9, 0, 4, h); }
    if (R.center) { g.fillStyle = R.center; g.fillRect(w / 2 - 2, 0, 4, R.solid ? h : h * 0.45); }
  });
  ribbon(i => [at(i, HALF_W, 0.02), at(i, -HALF_W, 0.02)], 14,
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: R.rough ?? 0.92, side: THREE.DoubleSide }));

  const stripes = (a, b) => canvasTex(8, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
  });
  const curbMat = new THREE.MeshStandardMaterial({ map: stripes(...th.curb), roughness: 0.8, side: THREE.DoubleSide });
  const wallMat = new THREE.MeshStandardMaterial({ map: stripes(...th.wall), roughness: 0.7, side: THREE.DoubleSide });
  const topMat = new THREE.MeshStandardMaterial({ color: th.wallTop, roughness: 0.8, side: THREE.DoubleSide });
  const bankMat = new THREE.MeshStandardMaterial({ map: speckleTex(th.bank, th.groundDots, 3000, 2, 5), roughness: 1, side: THREE.DoubleSide });
  bankMat.map.repeat.set(1, 1);
  for (const s of [1, -1]) {
    ribbon(i => [at(i, s * HALF_W, 0.05), at(i, s * (WALL - 0.05), 0.09)], 4, curbMat);
    // Barrier: inner face, top, then a bank down to the ground.
    ribbon(i => [at(i, s * WALL, -0.3), at(i, s * WALL, 1.1)], 6, wallMat);
    ribbon(i => [at(i, s * WALL, 1.1), at(i, s * (WALL + 0.7), 1.1)], 6, topMat);
    ribbon(i => {
      const a = at(i, s * (WALL + 0.7), 1.1), b = at(i, s * bankOut(py[i]), 0);
      b[1] = th.groundY - 0.02;
      return [a, b];
    }, 10, bankMat);
  }

  // Ground, with a little grain so speed reads.
  const groundTex = speckleTex(th.ground, th.groundDots, 4000, 2, 3);
  groundTex.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(bounds.cx, th.groundY, bounds.cz);
  ground.receiveShadow = true;
  group.add(ground);

  // Checkered start line and a gantry over it.
  const checker = canvasTex(64, 16, (g) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
      g.fillRect(x * 4, y * 4, 4, 4);
    }
  }, false);
  checker.magFilter = THREE.NearestFilter;
  const h0 = T.headingAt(0);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 2.5), new THREE.MeshStandardMaterial({ map: checker, roughness: 0.9 }));
  line.rotation.set(-Math.PI / 2, 0, h0);
  line.position.set(px[0], py[0] + 0.04, pz[0]);
  line.receiveShadow = true;
  group.add(line);

  const gantry = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.6, metalness: 0.3 });
  for (const s of [1, -1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8, 0.8), postMat);
    post.position.set(s * (WALL + 0.4), 4, 0);
    post.castShadow = true;
    gantry.add(post);
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
  const banner = new THREE.Mesh(new THREE.BoxGeometry(WALL * 2 + 1.6, 2, 0.5), [postMat, postMat, postMat, postMat, bannerMat, bannerMat]);
  banner.position.y = 8;
  banner.castShadow = true;
  gantry.add(banner);
  gantry.rotation.y = h0;
  gantry.position.set(px[0], py[0], pz[0]);
  group.add(gantry);

  // ---------- Scenery ----------
  const r = rng(map.seed);
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), col = new THREE.Color();
  const ctx = {
    T, r, th, bounds,
    add(...objs) { group.add(...objs); return objs[0]; },
    animate(fn) { T.anims.push(fn); },
    // How far (x, z) is outside the track's banks. Negative means on or in them.
    clearance(x, z) {
      let bd = Infinity, bi = 0;
      for (let i = 0; i < N; i += 3) {
        const d = (x - px[i]) ** 2 + (z - pz[i]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      return Math.sqrt(bd) - bankOut(py[bi]);
    },
    // Try random spots in an area; call fn(x, z) for ones at least `clear` m off the track
    // (and at most `near` m, to crowd things close to the road).
    scatter(n, fn, { clear = 3, near = Infinity, area, test } = {}) {
      const pad = Math.min(220, near + 20);
      const a = area ?? { x0: minX - pad, x1: maxX + pad, z0: minZ - pad, z1: maxZ + pad };
      let placed = 0;
      for (let tries = 0; placed < n && tries < n * 40; tries++) {
        const x = a.x0 + r() * (a.x1 - a.x0), z = a.z0 + r() * (a.z1 - a.z0);
        const cl = ctx.clearance(x, z);
        if (cl < clear || cl > near || (test && !test(x, z))) continue;
        fn(x, z, placed++);
      }
    },
    // Instance a prop: one InstancedMesh per part. Items: { x, y, z, s | sx sy sz, rx, ry, rz, color }.
    inst(parts, items, { shadow = true } = {}) {
      if (!items.length) return;
      for (const [geo, material, tinted] of parts) {
        const im = new THREE.InstancedMesh(geo, material, items.length);
        items.forEach((o, k) => {
          const sc = o.s ?? 1;
          m4.compose(v.set(o.x, o.y ?? 0, o.z), q.setFromEuler(e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)), s3.set(o.sx ?? sc, o.sy ?? sc, o.sz ?? sc));
          im.setMatrixAt(k, m4);
          if (tinted) im.setColorAt(k, col.set(o.color ?? 0xffffff));
        });
        im.castShadow = shadow;
        im.receiveShadow = true;
        group.add(im);
      }
    },
    // Walk the lap every `every` samples: fn(i, x, y, z, heading).
    along(every, fn, from = 0) {
      for (let i = from; i < N; i += every) fn(i, px[i], py[i], pz[i], Math.atan2(tx[i], tz[i]));
    },
    // A point on the ground `off` m past the foot of the bank at sample i, on side s (+1 left).
    beside(i, s, off) {
      const o = bankOut(py[i]) + off;
      return { x: px[i] + nx[i] * s * o, z: pz[i] + nz[i] * s * o, y: th.groundY };
    },
    // A point on top of the barrier at sample i, on side s.
    onWall(i, s) {
      const o = WALL + 0.35;
      return { x: px[i] + nx[i] * s * o, z: pz[i] + nz[i] * s * o, y: py[i] + 1.1 };
    },
    // The nearest spot to (x0, z0) at least `need` m clear of the track.
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
    grandstand(i = 30, s = -1, len = 90) {
      const crowdTex = canvasTex(256, 64, (g, w, h) => {
        g.fillStyle = '#596170'; g.fillRect(0, 0, w, h);
        const rr = rng(11), cols = ['#e03131', '#1c7ed6', '#fcc419', '#f1f3f5', '#2f9e44', '#e64980'];
        for (let k = 0; k < 900; k++) { g.fillStyle = cols[rr() * cols.length | 0]; g.fillRect(rr() * w, rr() * h, 3, 3); }
      });
      const side = new THREE.MeshStandardMaterial({ color: 0x8a92a0 });
      const front = new THREE.MeshStandardMaterial({ map: crowdTex });
      const stand = new THREE.Group();
      for (let t = 0; t < 5; t++) {
        const hgt = 1.2 + t * 1.2;
        const tier = new THREE.Mesh(new THREE.BoxGeometry(4, hgt, len), s < 0 ? [front, side, side, side, side, side] : [side, front, side, side, side, side]);
        tier.position.set(s * (t * 4), hgt / 2, 0);
        tier.castShadow = tier.receiveShadow = true;
        stand.add(tier);
      }
      const p = T.pointAt(i, s * (bankOut(py[i]) + 4));
      stand.position.set(p.x, th.groundY, p.z);
      stand.rotation.y = T.headingAt(i);
      group.add(stand);
    },
    sign(text, bg, fg, w, h, glow = false) {
      const tex = signTex(text, bg, fg);
      return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: glow ? 0xffffff : 0, emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 1.4 : 0, side: THREE.DoubleSide }));
    },
    PROPS,
  };
  map.decorate(ctx);

  // A minimap outline, in 0..1 coordinates. x is flipped so the map matches what you see
  // from the chase camera (+x is to the left).
  const span = bounds.span;
  T.mapXY = (x, z) => [1 - ((x - minX) + (span - (maxX - minX)) / 2) / span, 1 - ((z - minZ) + (span - (maxZ - minZ)) / 2) / span];
  return T;
}
