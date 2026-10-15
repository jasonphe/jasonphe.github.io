// The circuit: a closed spline sampled into N evenly spaced points, the meshes built
// along it, and the queries the cars use (where am I along the track, how far from the
// middle, how high is the road here).
import * as THREE from 'three';

export const HALF_W = 11;            // half the road width, in meters
export const WALL = HALF_W + 1.4;    // inner face of the barriers (curbs sit in between)
export const N = 1200;               // samples around the lap

// [x, z, height]. Sample 0 is the start line, on the long straight heading +z.
const CTRL = [
  [0, 0, 0], [0, 120, 2], [40, 200, 4], [130, 220, 6], [210, 170, 8], [220, 80, 6],
  [160, 30, 3], [170, -60, 0], [260, -110, 0], [260, -200, 2], [180, -260, 5],
  [60, -250, 3], [10, -210, 1], [0, -150, 0],
];

// Three rows of item boxes across the road: [fraction of the lap, lateral offsets].
const BOX_ROWS = [[0.17, [-6, -2, 2, 6]], [0.47, [-6, -2, 2, 6]], [0.76, [-6, -2, 2, 6]]];

// Small seeded RNG so every player gets the same scenery.
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function buildTrack(scene) {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z, y]) => new THREE.Vector3(x, y, z)), true, 'centripetal');
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

  const T = {
    N, step, length, px, py, pz, tx, tz, nx, nz, slope,
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
  };

  // ---------- Meshes ----------
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
    scene.add(m);
    return m;
  }
  const at = (i, lat, dy) => [px[i] + nx[i] * lat, py[i] + dy, pz[i] + nz[i] * lat];

  const roadTex = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#44464c'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let k = 0; k < 2500; k++) {
      const c = 58 + r() * 30 | 0;
      g.fillStyle = `rgba(${c},${c},${c + 4},.55)`;
      g.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
    g.fillStyle = '#eceae2';
    g.fillRect(5, 0, 4, h); g.fillRect(w - 9, 0, 4, h);
    g.fillStyle = '#f2d24b';
    g.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  });
  ribbon(i => [at(i, HALF_W, 0.02), at(i, -HALF_W, 0.02)], 14,
    new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.92, side: THREE.DoubleSide }));

  const stripes = (a, b) => canvasTex(8, 64, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = b; g.fillRect(0, h / 2, w, h / 2);
  });
  const curbMat = new THREE.MeshStandardMaterial({ map: stripes('#d9312b', '#f4f1ea'), roughness: 0.8, side: THREE.DoubleSide });
  for (const s of [1, -1]) {
    ribbon(i => [at(i, s * HALF_W, 0.05), at(i, s * (WALL - 0.05), 0.09)], 4, curbMat);
    // Barrier: inner face, top, then a grassy bank down to the ground.
    ribbon(i => [at(i, s * WALL, -0.3), at(i, s * WALL, 1.1)], 6,
      new THREE.MeshStandardMaterial({ map: stripes('#2f6fd6', '#f1f3f5'), roughness: 0.7, side: THREE.DoubleSide }));
    ribbon(i => [at(i, s * WALL, 1.1), at(i, s * (WALL + 0.7), 1.1)], 6,
      new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.8, side: THREE.DoubleSide }));
    ribbon(i => {
      const w = WALL + 0.7, out = w + 3 + py[i] * 2.2;
      const a = at(i, s * w, 1.1), b = at(i, s * out, 0); b[1] = -0.12;
      return [a, b];
    }, 10, new THREE.MeshStandardMaterial({ color: 0x5f8f3e, roughness: 1, side: THREE.DoubleSide }));
  }

  // Ground, with a little grain so speed reads.
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6da84c'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let k = 0; k < 4000; k++) {
      g.fillStyle = r() < 0.5 ? 'rgba(60,110,40,.35)' : 'rgba(140,190,90,.3)';
      g.fillRect(r() * w, r() * h, 2, 2);
    }
  });
  grassTex.repeat.set(160, 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(130, -0.15, -20);
  ground.receiveShadow = true;
  scene.add(ground);

  // Checkered start line and a gantry over it.
  const checker = canvasTex(64, 16, (g, w, h) => {
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
  scene.add(line);

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
    g.fillStyle = '#ffd43b';
    g.font = '900 52px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('CRASH  CIRCUIT', w / 2, h / 2 + 2);
  }, false);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(WALL * 2 + 1.6, 2, 0.5),
    [postMat, postMat, postMat, postMat, new THREE.MeshStandardMaterial({ map: bannerTex }), new THREE.MeshStandardMaterial({ map: bannerTex })]);
  banner.position.y = 8;
  banner.castShadow = true;
  gantry.add(banner);
  gantry.rotation.y = h0;
  gantry.position.set(px[0], py[0], pz[0]);
  scene.add(gantry);

  // Grandstand on the right of the main straight.
  const crowdTex = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#596170'; g.fillRect(0, 0, w, h);
    const r = rng(11), cols = ['#e03131', '#1c7ed6', '#fcc419', '#f1f3f5', '#2f9e44', '#e64980'];
    for (let k = 0; k < 900; k++) { g.fillStyle = cols[r() * cols.length | 0]; g.fillRect(r() * w, r() * h, 3, 3); }
  });
  for (let t = 0; t < 5; t++) {
    const tier = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2 + t * 1.2, 90),
      [new THREE.MeshStandardMaterial({ map: crowdTex, color: 0xffffff }), new THREE.MeshStandardMaterial({ color: 0x8a92a0 }),
        new THREE.MeshStandardMaterial({ map: crowdTex }), new THREE.MeshStandardMaterial({ color: 0x8a92a0 }),
        new THREE.MeshStandardMaterial({ color: 0x8a92a0 }), new THREE.MeshStandardMaterial({ color: 0x8a92a0 })]);
    tier.position.set(-(WALL + 10 + t * 4), (1.2 + t * 1.2) / 2, 30);
    tier.castShadow = tier.receiveShadow = true;
    scene.add(tier);
  }

  // Trees, kept off the road.
  const r = rng(42);
  const spots = [];
  for (let tries = 0; spots.length < 320 && tries < 6000; tries++) {
    const x = -220 + r() * 700, z = -460 + r() * 860;
    let near = Infinity;
    for (let i = 0; i < N; i += 6) near = Math.min(near, (x - px[i]) ** 2 + (z - pz[i]) ** 2);
    if (near < 34 * 34) continue;
    if (x < -15 && x > -60 && z > -25 && z < 80) continue; // grandstand
    spots.push([x, z, 0.8 + r() * 0.8, r() * Math.PI]);
  }
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 1 }), spots.length);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 7, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f7a3b, roughness: 1, flatShading: true }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), v = new THREE.Vector3();
  spots.forEach(([x, z, s, rot], k) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    m4.compose(v.set(x, 1.5 * s, z), q, sc.set(s, s, s)); trunks.setMatrixAt(k, m4);
    m4.compose(v.set(x, 6 * s, z), q, sc.set(s, s, s)); leaves.setMatrixAt(k, m4);
  });
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  // Hazy mountains far away.
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x7d93a8, roughness: 1, flatShading: true });
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * Math.PI * 2 + r() * 0.2, d = 900 + r() * 250, hgt = 120 + r() * 180;
    const m = new THREE.Mesh(new THREE.ConeGeometry(hgt * 1.4, hgt, 6), mtnMat);
    m.position.set(130 + Math.cos(a) * d, hgt / 2 - 5, -20 + Math.sin(a) * d);
    m.rotation.y = r() * 3;
    scene.add(m);
  }

  // A minimap outline, as a path in 0..1 coordinates.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ);
  // Flip x so the map matches what you see from the chase camera (+x is to the left).
  T.mapXY = (x, z) => [1 - ((x - minX) + (span - (maxX - minX)) / 2) / span, 1 - ((z - minZ) + (span - (maxZ - minZ)) / 2) / span];
  return T;
}
