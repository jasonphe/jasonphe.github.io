// Placeholder art, drawn in code: every ingredient in every cut and cooking stage, the plate, and the stations.
// The target photo and the player's plate go through the same drawPlate, so a perfect copy looks identical.
import { INGS } from './data.js';

// ---------- Helpers ----------

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const C = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
const shade = (c, k) => (k > 0 ? mix(c, [255, 255, 255], k) : mix(c, [0, 0, 0], -k));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const GOLD = C('#d6a24a'), BROWN = C('#8a5426'), CHAR = C('#3b2618'), BURNT = C('#1d1814'), PALE = C('#f7f1e1');
const INK = 'rgba(58,34,20,0.55)';
const WARM_DARK = [92, 58, 34];

// ---------- Cooking stages ----------

export function isMelted(st) {
  const m = INGS[st.ing].melt;
  return !!m && st.cook >= m.at && m.preps.includes(st.prep);
}

// The word for how cooked something is. Dry heat (pan, oven) browns; water softens.
export function stageName(st) {
  const d = INGS[st.ing];
  if (d.stages) return d.stages.find(([at]) => st.cook < at)[1];
  if (st.cook < 0.05) return d.rawName || 'raw';
  if (isMelted(st) && (st.dry < 0.5 || st.cook < 1.9)) return INGS[st.ing].melt.name;
  if (st.dry >= 0.5) {
    if (st.cook < 1.15 && d.warmName) return d.warmName;
    if (st.cook < 0.6) return 'barely cooked';
    if (st.cook < 1.15) return 'cooked';
    if (st.cook < 1.5) return 'golden';
    if (st.cook < 2.0) return 'browned';
    if (st.cook < 2.5) return 'charred';
    return 'burnt';
  }
  if (st.cook < 0.6) return 'underdone';
  if (st.cook < 1.25) return 'tender';
  if (st.cook < 1.8) return 'soft';
  return 'mushy';
}
export const isScorched = (st) => st.dry >= 0.5 && st.cook >= 2.0;

// Raw colour to cooked colour, then golden, brown, charred and burnt under dry heat, or pale when boiled too long.
function cookColor(raw, cooked, st) {
  let c = mix(C(raw), C(cooked), clamp01(st.cook));
  const u = st.cook - 1;
  if (u > 0 && st.dry > 0.3) {
    const k = st.dry;
    c = mix(c, GOLD, clamp01(u / 0.4) * 0.42 * k);
    c = mix(c, BROWN, clamp01((u - 0.35) / 0.6) * 0.6 * k);
    c = mix(c, CHAR, clamp01((u - 0.95) / 0.5) * 0.75 * k);
    c = mix(c, BURNT, clamp01((u - 1.45) / 0.5) * 0.85 * k);
  } else if (u > 0.25) {
    c = mix(c, PALE, clamp01((u - 0.25) / 1.0) * 0.45);
  }
  return c;
}

// ---------- Shape helpers (unit space: an item fits in a circle of radius about 1) ----------

function ellipse(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }
function fillStroke(ctx, col, al = 1) { ctx.fillStyle = css(col, al); ctx.fill(); ctx.stroke(); }
function gloss(ctx, x, y, rx, ry, al = 0.35, rot = -0.4) { ellipse(ctx, x, y, rx, ry, rot); ctx.fillStyle = `rgba(255,255,255,${al})`; ctx.fill(); }
function shadow(ctx, rx = 0.8, ry = 0.22, y = 0.62) { ellipse(ctx, 0.05, y, rx, ry); ctx.fillStyle = 'rgba(40,20,8,0.1)'; ctx.fill(); }

// Fill the current path with a ball-like gradient, lit from the top left.
function ball(ctx, col, cx = 0, cy = 0, R = 1) {
  const g = ctx.createRadialGradient(cx - 0.3 * R, cy - 0.35 * R, 0.05 * R, cx, cy, 1.05 * R);
  g.addColorStop(0, css(shade(col, 0.35)));
  g.addColorStop(0.55, css(col));
  g.addColorStop(1, css(mix(col, WARM_DARK, 0.32)));
  ctx.fillStyle = g; ctx.fill(); ctx.stroke();
}

// An irregular closed shape through n jittered points.
function blob(ctx, r, rx, ry, n = 10, j = 0.12, cx = 0, cy = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, k = 1 + (r() * 2 - 1) * j;
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  const mid = (i) => { const p = pts[i % n], q = pts[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
  ctx.beginPath();
  let m = mid(0);
  ctx.moveTo(m[0], m[1]);
  for (let i = 1; i <= n; i++) { const p = pts[i % n]; m = mid(i); ctx.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
  ctx.closePath();
}

// Points for a pile of pieces, back to front.
function scatter(r, n, R, sq = 0.82) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = r() * Math.PI * 2, u = Math.sqrt(r()) * R;
    pts.push([Math.cos(t) * u, Math.sin(t) * u * sq]);
  }
  return pts.sort((a, b) => a[1] - b[1]);
}

function leaf(ctx, x, y, rot, s, A, B) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.beginPath(); ctx.moveTo(0, -s * 1.3);
  ctx.quadraticCurveTo(s, -s * 0.2, 0, s * 1.1);
  ctx.quadraticCurveTo(-s, -s * 0.2, 0, -s * 1.3);
  ctx.closePath(); fillStroke(ctx, A);
  ctx.strokeStyle = css(B, 0.8); ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(0, s * 0.9); ctx.stroke();
  ctx.restore();
}

// ---------- Whole ingredients ----------

function slab(ctx, r, d, A, B, st) {
  shadow(ctx, 0.85, 0.22, 0.6);
  blob(ctx, r, 0.86, 0.6, 9, 0.1); ball(ctx, A);
  const fresh = 1 - clamp01(st.cook) * 0.8;
  ctx.save(); ctx.clip();
  ctx.lineWidth = 0.05;
  if (st.ing === 'steak') {
    ctx.strokeStyle = css(mix(C('#f2d7d0'), A, 0.35), 0.6 * fresh + 0.15);
    for (let i = 0; i < 5; i++) {
      const x = (r() - 0.6) * 1.1, y = (r() - 0.5) * 0.8;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 0.2, y - 0.15, x + 0.3, y + 0.2, x + 0.5, y + 0.05); ctx.stroke();
    }
  } else if (st.ing === 'salmon') {
    ctx.strokeStyle = css(C('#fde5d6'), 0.7);
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * 0.2 - 0.3, -0.7); ctx.quadraticCurveTo(i * 0.2 + 0.1, 0, i * 0.2 - 0.2, 0.7); ctx.stroke(); }
  } else {
    ctx.strokeStyle = css(shade(A, 0.3), 0.5);
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-0.5, -0.2 + i * 0.2); ctx.quadraticCurveTo(0, -0.3 + i * 0.2, 0.5, -0.1 + i * 0.2); ctx.stroke(); }
  }
  // Dry heat browns the edges first.
  if (st.dry > 0.5 && st.cook > 1) {
    const g = ctx.createRadialGradient(0, 0, 0.25, 0, 0, 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, css(BROWN, clamp01((st.cook - 1) / 0.6) * 0.55));
    ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  }
  ctx.restore();
  gloss(ctx, -0.3, -0.25, 0.2, 0.07, 0.25, -0.2);
}

const WHOLE = {
  steak: slab, chicken: slab, salmon: slab,
  tomato(ctx, r, d, A) {
    shadow(ctx); ellipse(ctx, 0, 0, 0.8, 0.74); ball(ctx, A);
    ctx.save(); ctx.strokeStyle = '#3f7a2c'; ctx.lineWidth *= 2.4;
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * Math.PI * 2 - 1.2;
      ctx.beginPath(); ctx.moveTo(0, -0.6); ctx.lineTo(Math.cos(t) * 0.22, -0.6 + Math.sin(t) * 0.12); ctx.stroke();
    }
    ctx.restore(); gloss(ctx, -0.3, -0.3, 0.2, 0.11);
  },
  onion(ctx, r, d, A) {
    shadow(ctx, 0.75);
    ctx.beginPath(); ctx.moveTo(0, -0.95);
    ctx.bezierCurveTo(0.2, -0.7, 0.8, -0.55, 0.78, 0.08); ctx.bezierCurveTo(0.76, 0.6, 0.35, 0.78, 0, 0.78);
    ctx.bezierCurveTo(-0.35, 0.78, -0.76, 0.6, -0.78, 0.08); ctx.bezierCurveTo(-0.8, -0.55, -0.2, -0.7, 0, -0.95);
    ctx.closePath(); ball(ctx, A);
    ctx.strokeStyle = css(shade(A, -0.3), 0.5);
    for (const k of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(0, -0.85); ctx.quadraticCurveTo(k * 1.4, 0, k * 0.7, 0.72); ctx.stroke(); }
  },
  garlic(ctx, r, d, A) {
    shadow(ctx, 0.65);
    ctx.beginPath(); ctx.moveTo(0, -0.9);
    ctx.bezierCurveTo(0.12, -0.6, 0.72, -0.45, 0.7, 0.15); ctx.bezierCurveTo(0.68, 0.62, 0.3, 0.72, 0, 0.72);
    ctx.bezierCurveTo(-0.3, 0.72, -0.68, 0.62, -0.7, 0.15); ctx.bezierCurveTo(-0.72, -0.45, -0.12, -0.6, 0, -0.9);
    ctx.closePath(); ball(ctx, A);
    ctx.strokeStyle = 'rgba(160,120,150,0.45)';
    for (const k of [-0.5, -0.17, 0.17, 0.5]) { ctx.beginPath(); ctx.moveTo(k * 0.3, -0.7); ctx.quadraticCurveTo(k * 1.3, 0.1, k * 0.9, 0.68); ctx.stroke(); }
  },
  bellpepper(ctx, r, d, A) {
    shadow(ctx, 0.8);
    ctx.beginPath(); ctx.moveTo(-0.55, -0.5);
    ctx.bezierCurveTo(-0.2, -0.68, 0.2, -0.68, 0.55, -0.5); ctx.bezierCurveTo(0.85, -0.3, 0.85, 0.4, 0.62, 0.66);
    ctx.bezierCurveTo(0.45, 0.82, 0.2, 0.62, 0, 0.74); ctx.bezierCurveTo(-0.2, 0.62, -0.45, 0.82, -0.62, 0.66);
    ctx.bezierCurveTo(-0.85, 0.4, -0.85, -0.3, -0.55, -0.5); ctx.closePath(); ball(ctx, A);
    ctx.strokeStyle = css(shade(A, -0.35), 0.45);
    for (const k of [-0.25, 0.25]) { ctx.beginPath(); ctx.moveTo(k, -0.55); ctx.quadraticCurveTo(k * 1.3, 0.1, k * 1.1, 0.68); ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.fillStyle = '#4a7f2e';
    ctx.beginPath(); ctx.roundRect(-0.09, -0.85, 0.18, 0.3, 0.05); ctx.fill(); ctx.stroke();
    gloss(ctx, -0.38, -0.15, 0.1, 0.22, 0.3, 0.2);
  },
  carrot(ctx, r, d, A) {
    shadow(ctx, 0.85, 0.2);
    ctx.save(); ctx.rotate(-0.45);
    ctx.save(); ctx.strokeStyle = '#4f8a35'; ctx.lineWidth *= 3;
    for (const k of [-0.18, 0, 0.18]) { ctx.beginPath(); ctx.moveTo(-0.75, 0); ctx.quadraticCurveTo(-0.95, k * 1.5, -1.05, k * 2.2); ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-0.78, -0.22);
    ctx.quadraticCurveTo(0.2, -0.2, 0.95, 0); ctx.quadraticCurveTo(0.2, 0.2, -0.78, 0.22); ctx.quadraticCurveTo(-0.88, 0, -0.78, -0.22);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -0.22, 0, 0.22);
    g.addColorStop(0, css(shade(A, 0.25))); g.addColorStop(1, css(shade(A, -0.2)));
    ctx.fillStyle = g; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = css(shade(A, -0.35), 0.5);
    for (const x of [-0.4, -0.05, 0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(x, -0.12); ctx.lineTo(x + 0.08, -0.03); ctx.stroke(); }
    ctx.restore();
  },
  mushroom(ctx, r, d, A, B) {
    shadow(ctx, 0.7);
    ctx.beginPath(); ctx.roundRect(-0.2, -0.1, 0.4, 0.75, 0.12); fillStroke(ctx, B);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.82, 0.62, 0, Math.PI, 0); ctx.quadraticCurveTo(0, 0.22, -0.82, 0); ctx.closePath(); ball(ctx, A);
    gloss(ctx, -0.3, -0.35, 0.18, 0.08);
  },
  potato(ctx, r, d, A) {
    shadow(ctx, 0.85); blob(ctx, r, 0.88, 0.6, 9, 0.07); ball(ctx, A);
    ctx.fillStyle = css(shade(A, -0.35), 0.7);
    for (let i = 0; i < 4; i++) { ellipse(ctx, (r() - 0.5) * 1.1, (r() - 0.5) * 0.6, 0.05, 0.025, r() * 3); ctx.fill(); }
  },
  lemon(ctx, r, d, A) {
    shadow(ctx, 0.85);
    for (const s of [-1, 1]) { ellipse(ctx, s * 0.8, 0, 0.12, 0.09); fillStroke(ctx, A); }
    ellipse(ctx, 0, 0, 0.78, 0.58); ball(ctx, A);
    gloss(ctx, -0.3, -0.25, 0.22, 0.1);
  },
  basil(ctx, r, d, A, B) {
    ctx.save(); ctx.strokeStyle = css(shade(A, -0.2)); ctx.lineWidth *= 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0.85); ctx.quadraticCurveTo(0.1, 0, 0, -0.6); ctx.stroke();
    ctx.restore();
    for (const [x, y, rot, s] of [[0, -0.62, 0, 0.26], [-0.32, -0.25, -0.9, 0.3], [0.34, -0.2, 0.9, 0.3], [-0.3, 0.25, -1.1, 0.28], [0.32, 0.3, 1.1, 0.28]]) leaf(ctx, x, y, rot, s, A, B);
  },
  cheese(ctx, r, d, A, B) {
    shadow(ctx, 0.85);
    ctx.beginPath(); ctx.rect(-0.8, -0.05, 1.6, 0.55); fillStroke(ctx, A);
    ctx.beginPath(); ctx.moveTo(-0.8, -0.05); ctx.lineTo(0.8, -0.05); ctx.lineTo(0.4, -0.5); ctx.lineTo(-0.5, -0.45); ctx.closePath(); fillStroke(ctx, B);
    ctx.fillStyle = css(shade(A, -0.18));
    for (const [x, y, s] of [[-0.45, 0.2, 0.1], [0.1, 0.32, 0.07], [0.5, 0.15, 0.09], [-0.1, -0.25, 0.08], [0.2, -0.3, 0.05]]) { ellipse(ctx, x, y, s, s * 0.8); ctx.fill(); }
  },
  flour(ctx, r, d, A) {
    shadow(ctx, 0.75, 0.2, 0.72);
    ctx.beginPath(); ctx.moveTo(-0.55, -0.45); ctx.lineTo(0.55, -0.45); ctx.lineTo(0.66, 0.7); ctx.lineTo(-0.66, 0.7); ctx.closePath(); ball(ctx, A);
    ctx.beginPath(); ctx.moveTo(-0.55, -0.45); ctx.lineTo(-0.42, -0.78); ctx.lineTo(0.42, -0.78); ctx.lineTo(0.55, -0.45); ctx.closePath(); fillStroke(ctx, shade(A, -0.06));
    ctx.beginPath(); ctx.rect(-0.6, 0.05, 1.2, 0.2); ctx.fillStyle = '#6f93c4'; ctx.fill();
    ctx.save(); ctx.strokeStyle = '#c9a24a'; ctx.lineWidth *= 2;
    for (const k of [-0.12, 0, 0.12]) { ctx.beginPath(); ctx.moveTo(k * 0.5, -0.05); ctx.quadraticCurveTo(k * 2, -0.3, k * 1.2, -0.38); ctx.stroke(); }
    ctx.restore();
    ellipse(ctx, 0.7, 0.62, 0.25, 0.1); ctx.fillStyle = '#ffffff'; ctx.fill();
  },
  yeast(ctx, r, d, A, B) {
    shadow(ctx, 0.7, 0.18, 0.55);
    ctx.beginPath(); ctx.moveTo(-0.6, -0.45);
    for (let i = 0; i <= 8; i++) ctx.lineTo(-0.6 + i * 0.15, i % 2 ? -0.52 : -0.45);
    ctx.lineTo(0.6, 0.45); ctx.lineTo(-0.6, 0.45); ctx.closePath(); ball(ctx, A);
    ellipse(ctx, 0, 0.02, 0.28, 0.2); ctx.fillStyle = css(shade(A, 0.4)); ctx.fill();
    ctx.fillStyle = css(shade(B, -0.1));
    for (const [x, y] of scatter(r, 14, 0.3)) { ellipse(ctx, x + 0.62, y + 0.55, 0.03, 0.025); ctx.fill(); }
  },
  pastadough(ctx, r, d, A) {
    shadow(ctx, 0.85, 0.2, 0.5);
    blob(ctx, r, 0.85, 0.5, 10, 0.06); ball(ctx, A);
    ctx.save(); ctx.strokeStyle = css(shade(A, 0.3), 0.8); ctx.lineWidth *= 1.5;
    ctx.beginPath(); ctx.moveTo(-0.5, -0.1); ctx.quadraticCurveTo(0, -0.3, 0.5, -0.1); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (const [x, y] of scatter(r, 10, 0.55)) { ellipse(ctx, x, y - 0.05, 0.03, 0.02); ctx.fill(); }
  },
  dough(ctx, r, d, A, B, st) {
    const k = 1 + 0.22 * clamp01(st.cook); // it rises as it bakes
    shadow(ctx, 0.75 * k, 0.2, 0.55);
    blob(ctx, r, 0.7 * k, 0.52 * k, 10, 0.05); ball(ctx, A);
    ctx.save(); ctx.strokeStyle = css(shade(A, -0.2), 0.7); ctx.lineWidth *= 1.6;
    for (const x of [-0.25, 0.05, 0.35]) { ctx.beginPath(); ctx.moveTo((x - 0.1) * k, -0.25 * k); ctx.lineTo((x + 0.08) * k, 0.05 * k); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const [x, y] of scatter(r, 12, 0.5)) { ellipse(ctx, x * k, y * k - 0.1, 0.03, 0.02); ctx.fill(); }
  },
  butter(ctx, r, d, A, B) {
    shadow(ctx, 0.85);
    ctx.beginPath(); ctx.rect(-0.75, -0.05, 1.5, 0.42); fillStroke(ctx, A);
    ctx.beginPath(); ctx.moveTo(-0.75, -0.05); ctx.lineTo(0.75, -0.05); ctx.lineTo(0.55, -0.38); ctx.lineTo(-0.55, -0.38); ctx.closePath(); fillStroke(ctx, B);
    gloss(ctx, -0.2, -0.22, 0.3, 0.05, 0.45, 0);
  },
};

// ---------- Ingredients that handle their own cuts ----------

function breadSlicePath(ctx, k) {
  ctx.beginPath(); ctx.moveTo(-0.62 * k, 0.68 * k); ctx.lineTo(-0.62 * k, -0.3 * k);
  ctx.bezierCurveTo(-0.95 * k, -0.95 * k, 0.95 * k, -0.95 * k, 0.62 * k, -0.3 * k);
  ctx.lineTo(0.62 * k, 0.68 * k); ctx.closePath();
}

const SPECIAL = {
  egg(ctx, r, d, A, B, st) {
    if (st.prep === 'whole') {
      shadow(ctx, 0.55, 0.18, 0.7); ellipse(ctx, 0, 0, 0.55, 0.72, 0.15); ball(ctx, A);
      gloss(ctx, -0.18, -0.35, 0.12, 0.2); return;
    }
    if (st.prep === 'crack') {
      const white = cookColor('#fbf9f2', '#fbf9f2', st);
      blob(ctx, r, 0.92, 0.74, 11, 0.16);
      ctx.fillStyle = css(white, 0.45 + 0.55 * clamp01(st.cook)); ctx.fill(); ctx.stroke();
      if (st.dry > 0.5 && st.cook > 0.9) { // lacy browned edge
        ctx.save(); ctx.lineWidth = 0.12;
        ctx.strokeStyle = css(cookColor('#fbf9f2', '#fbf9f2', { ...st, cook: st.cook + 0.5 }), 0.75); ctx.stroke(); ctx.restore();
      }
      const yolk = cookColor('#f6a91a', '#f2bd45', { ...st, dry: st.dry * 0.5 });
      ellipse(ctx, 0.08, -0.06, 0.32, 0.29); ball(ctx, yolk, 0.08, -0.06, 0.32);
      if (st.cook < 1.3) gloss(ctx, 0, -0.16, 0.1, 0.05, 0.6, 0);
      if ((st.q ?? 1) < 0.6) { // bits of shell
        ctx.fillStyle = '#efe0c6';
        for (const [x, y] of [[-0.45, 0.2], [0.5, 0.25], [-0.2, -0.45], [0.35, -0.4]]) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.09, y + 0.03); ctx.lineTo(x + 0.02, y + 0.09); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      return;
    }
    // Whisked: a glossy puddle, then soft curds.
    if (st.cook < 0.35) {
      blob(ctx, r, 0.85, 0.66, 11, 0.1); ctx.fillStyle = css(C('#f2c040'), 0.92); ctx.fill(); ctx.stroke();
      gloss(ctx, -0.25, -0.2, 0.3, 0.08, 0.4, 0); return;
    }
    const Y = cookColor('#f5cd4c', '#f8dc70', st);
    for (const [x, y] of scatter(r, 12, 0.55)) { blob(ctx, r, 0.24 + r() * 0.08, 0.19, 7, 0.22, x, y); fillStroke(ctx, shade(Y, (r() - 0.5) * 0.15)); }
  },
  bread(ctx, r, d, A, B, st) {
    if (st.prep === 'slice') {
      shadow(ctx, 0.7, 0.18, 0.72);
      breadSlicePath(ctx, 1); fillStroke(ctx, A);
      breadSlicePath(ctx, 0.84); ctx.fillStyle = css(B); ctx.fill();
      ctx.fillStyle = css(shade(B, -0.18), 0.6);
      for (let i = 0; i < 14; i++) { ellipse(ctx, (r() - 0.5) * 0.85, (r() - 0.4) * 0.95, 0.035, 0.025, r() * 3); ctx.fill(); }
      return;
    }
    shadow(ctx, 0.9);
    ctx.beginPath(); ctx.moveTo(-0.88, 0.45); ctx.lineTo(-0.88, -0.02);
    ctx.bezierCurveTo(-0.85, -0.62, 0.85, -0.62, 0.88, -0.02); ctx.lineTo(0.88, 0.45); ctx.closePath(); ball(ctx, A);
    ctx.save(); ctx.strokeStyle = css(shade(A, 0.35), 0.8); ctx.lineWidth *= 2;
    for (const x of [-0.45, 0, 0.45]) { ctx.beginPath(); ctx.moveTo(x - 0.12, -0.25); ctx.lineTo(x + 0.12, -0.05); ctx.stroke(); }
    ctx.restore();
  },
  pasta(ctx, r, d, A, B, st) {
    // Fresh noodles: a loose nest, dusted with flour until it's cooked.
    shadow(ctx, 0.85);
    blob(ctx, r, 0.82, 0.6, 10, 0.08); fillStroke(ctx, shade(A, -0.12));
    for (let i = 0; i < 30; i++) {
      const x0 = (r() - 0.5) * 1.3, y0 = (r() - 0.5) * 0.9;
      if ((x0 * x0) / 0.42 + (y0 * y0) / 0.2 > 1) continue;
      const a = r() * Math.PI * 2, L = 0.3 + r() * 0.25;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L * 0.6, x0 + Math.cos(a + 2) * L, y0 + Math.sin(a + 2) * L * 0.6, x0 + Math.cos(a + 1) * L * 0.8, y0 + Math.sin(a + 1) * L * 0.5);
      ctx.strokeStyle = css(shade(A, -0.3), 0.8); ctx.lineWidth = 0.085; ctx.stroke();
      ctx.strokeStyle = css(shade(A, 0.1 + r() * 0.1)); ctx.lineWidth = 0.055; ctx.stroke();
    }
    if (st.cook < 0.3) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (const [x, y] of scatter(r, 14, 0.6)) { ellipse(ctx, x, y, 0.03, 0.02); ctx.fill(); }
    }
  },
  rice(ctx, r, d, A, B, st) {
    if (st.cook < 0.45) {
      shadow(ctx, 0.75, 0.2, 0.45);
      ctx.strokeStyle = 'rgba(80,60,40,0.35)';
      for (const [x, y] of scatter(r, 80, 0.7)) { ellipse(ctx, x, y, 0.075, 0.032, r() * 3); ctx.fillStyle = css(shade(A, -0.04 - r() * 0.08)); ctx.fill(); ctx.stroke(); }
      return;
    }
    shadow(ctx, 0.85); blob(ctx, r, 0.82, 0.62, 10, 0.1); ball(ctx, A);
    ctx.strokeStyle = 'rgba(120,100,70,0.22)';
    for (const [x, y] of scatter(r, 55, 0.68, 0.7)) { ellipse(ctx, x, y - 0.05, 0.07, 0.032, r() * 3); ctx.fillStyle = css(shade(A, 0.3), 0.9); ctx.fill(); ctx.stroke(); }
  },
};

// ---------- Cuts ----------

const PATTERN = {
  seeds(ctx, r, A, B) {
    ctx.fillStyle = css(shade(B, 0.25));
    ellipse(ctx, 0, 0, 0.09, 0.08); ctx.fill();
    for (let k = 0; k < 3; k++) {
      const t = (k / 3) * Math.PI * 2 + 0.4;
      ellipse(ctx, Math.cos(t) * 0.14, Math.sin(t) * 0.13, 0.075, 0.05, t); ctx.fillStyle = 'rgba(247,214,122,0.95)'; ctx.fill();
    }
  },
  segments(ctx, r, A, B) {
    ctx.save(); ctx.strokeStyle = css(shade(B, 0.5)); ctx.lineWidth *= 1.2;
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * 0.24, Math.sin(t) * 0.22); ctx.stroke(); }
    ctx.restore();
  },
  core(ctx, r, A, B) { ellipse(ctx, 0, 0, 0.12, 0.11); ctx.fillStyle = css(shade(B, 0.22)); ctx.fill(); },
  rings(ctx, r, A, B) {
    ctx.save(); ctx.strokeStyle = css(shade(B, -0.18), 0.8);
    for (const k of [0.09, 0.17]) { ellipse(ctx, 0, 0, k, k * 0.92); ctx.stroke(); }
    ctx.restore();
  },
  plain() {},
};

// How uneven the pieces are: 0 for clean knife work, up to 1 for a mess.
const sloppy = (st) => 1 - (st.q ?? 1);

const SLICES = {
  round(ctx, r, d, A, B, st) {
    for (const [x, y] of [[-0.42, -0.2], [0.02, -0.3], [0.44, -0.18], [-0.22, 0.24], [0.24, 0.26]]) {
      ctx.save(); ctx.translate(x + (r() - 0.5) * 0.06, y + (r() - 0.5) * 0.06);
      const k = 1 + (r() - 0.5) * 1.1 * sloppy(st); ctx.scale(k, k);
      ellipse(ctx, 0, 0, 0.33, 0.3); fillStroke(ctx, A);
      ellipse(ctx, 0, 0, 0.27, 0.245); ctx.fillStyle = css(B); ctx.fill();
      PATTERN[d.pattern || 'plain'](ctx, r, A, B);
      ctx.restore();
    }
  },
  strip(ctx, r, d, A, B, st) {
    for (const [x, y] of scatter(r, 7, 0.55)) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-0.6 + (r() - 0.5) * 0.9);
      ctx.scale(1 + (r() - 0.5) * 1.2 * sloppy(st), 1);
      ctx.beginPath(); ctx.roundRect(-0.32, -0.08, 0.64, 0.16, 0.07);
      if (d.skin) {
        fillStroke(ctx, A);
        ctx.beginPath(); ctx.roundRect(-0.27, 0.01, 0.54, 0.05, 0.025); ctx.fillStyle = css(B); ctx.fill();
      } else {
        fillStroke(ctx, B);
        ctx.save(); ctx.strokeStyle = css(A, 0.9); ctx.lineWidth = 0.045; ctx.stroke(); ctx.restore();
      }
      ctx.restore();
    }
  },
  chip(ctx, r, d, A, B) {
    for (const [x, y] of scatter(r, 9, 0.5)) { ellipse(ctx, x, y, 0.12, 0.085, r() * 3); fillStroke(ctx, B); }
  },
  profile(ctx, r, d, A, B) {
    for (const [x, y] of scatter(r, 6, 0.5)) {
      ctx.save(); ctx.translate(x, y); ctx.rotate((r() - 0.5) * 1.2);
      ctx.beginPath(); ctx.moveTo(-0.22, 0);
      ctx.bezierCurveTo(-0.22, -0.2, 0.22, -0.2, 0.22, 0);
      ctx.lineTo(0.07, 0.02); ctx.lineTo(0.06, 0.18); ctx.lineTo(-0.06, 0.18); ctx.lineTo(-0.07, 0.02); ctx.closePath();
      fillStroke(ctx, B);
      ctx.beginPath(); ctx.moveTo(-0.22, 0); ctx.bezierCurveTo(-0.22, -0.2, 0.22, -0.2, 0.22, 0);
      ctx.save(); ctx.strokeStyle = css(A); ctx.lineWidth = 0.06; ctx.stroke(); ctx.restore();
      ctx.restore();
    }
  },
};

const CUTS = {
  slice(ctx, r, d, A, B, st) { SLICES[d.slice || 'round'](ctx, r, d, A, B, st); },
  dice(ctx, r, d, A, B, st) {
    for (const [x, y] of scatter(r, 15, 0.66)) {
      const s = (0.15 + r() * 0.05) * (1 + (r() - 0.5) * 1.4 * sloppy(st));
      ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 1.5);
      ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.25); fillStroke(ctx, shade(B, (r() - 0.5) * 0.12));
      if (d.skin) { ctx.beginPath(); ctx.moveTo(-s / 2, -s / 2); ctx.lineTo(s / 2, -s / 2); ctx.strokeStyle = css(A); ctx.lineWidth = 0.05; ctx.stroke(); }
      ctx.restore();
    }
  },
  mince(ctx, r, d, A, B, st) {
    ctx.lineWidth *= 0.5;
    for (const [x, y] of scatter(r, 50, 0.6)) {
      const s = (0.05 + r() * 0.035) * (1 + r() * 2 * sloppy(st));
      ctx.beginPath(); ctx.rect(x - s / 2, y - s / 2, s, s); fillStroke(ctx, shade(B, (r() - 0.5) * 0.2));
    }
  },
  wedge(ctx, r, d, A, B, st) {
    for (const [x, y, rot] of [[-0.4, -0.22, -0.3], [0.38, -0.25, 0.4], [-0.3, 0.22, -0.9], [0.35, 0.25, 0.9]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const k = 1 + (r() - 0.5) * 1.1 * sloppy(st); ctx.scale(k, k);
      ctx.beginPath(); ctx.ellipse(0, -0.1, 0.42, 0.3, 0, 0, Math.PI); ctx.closePath(); fillStroke(ctx, A);
      ctx.beginPath(); ctx.ellipse(0, -0.1, 0.35, 0.22, 0, 0, Math.PI); ctx.closePath(); ctx.fillStyle = css(B); ctx.fill();
      if (d.pattern === 'segments') {
        ctx.strokeStyle = css(shade(B, 0.5));
        for (const t of [0.5, 1.1, 1.6, 2.1, 2.6]) { ctx.beginPath(); ctx.moveTo(0, -0.1); ctx.lineTo(Math.cos(t) * 0.33, -0.1 + Math.sin(t) * 0.2); ctx.stroke(); }
        ctx.strokeStyle = INK;
      }
      ctx.restore();
    }
  },
  grate(ctx, r, d, A, B) {
    for (const [x, y] of scatter(r, 36, 0.62)) {
      const a = r() * Math.PI, L = 0.13 + r() * 0.1;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * L, y - Math.sin(a) * L);
      ctx.quadraticCurveTo(x + (r() - 0.5) * 0.15, y + (r() - 0.5) * 0.15, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.07; ctx.stroke();
      ctx.strokeStyle = css(shade(B, (r() - 0.5) * 0.15)); ctx.lineWidth = 0.045; ctx.stroke();
    }
  },
  tear(ctx, r, d, A, B) { for (const [x, y] of scatter(r, 7, 0.55)) leaf(ctx, x, y, r() * 6, 0.16 + r() * 0.05, A, B); },
};

function puddle(ctx, r, d, A, B, st) {
  const col = cookColor(d.melt.color, d.melt.color, { ...st, dry: st.dry * (d.melt.brown ?? 1) });
  blob(ctx, r, 0.9, 0.68, 12, 0.12); ctx.fillStyle = css(col, d.melt.alpha ?? 1); ctx.fill(); ctx.stroke();
  if (st.ing === 'tomato') {
    for (const [x, y] of scatter(r, 8, 0.55)) { ctx.beginPath(); ctx.roundRect(x - 0.06, y - 0.06, 0.12, 0.12, 0.04); fillStroke(ctx, shade(col, -0.12)); }
  } else if (st.ing === 'cheese') {
    ctx.save(); ctx.strokeStyle = css(shade(col, 0.3), 0.8); ctx.lineWidth = 0.05;
    for (const [x, y] of scatter(r, 8, 0.5)) { ctx.beginPath(); ctx.moveTo(x - 0.15, y); ctx.quadraticCurveTo(x, y - 0.1, x + 0.15, y); ctx.stroke(); }
    ctx.restore();
  }
  gloss(ctx, -0.3, -0.25, 0.32, 0.1, 0.35, -0.2);
}

// st: { ing, prep, cook, dry }. Draws at (x, y) with radius s.
export function drawItem(ctx, st, x, y, s, seed = 1) {
  const d = INGS[st.ing], r = rng(seed);
  const A = cookColor(d.a, d.ac, st), B = cookColor(d.b, d.bc, st);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = Math.min(2.2, Math.max(0.9, s * 0.03)) / s;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
  if (isMelted(st)) puddle(ctx, r, d, A, B, st);
  else if (SPECIAL[st.ing]) SPECIAL[st.ing](ctx, r, d, A, B, st);
  else if (st.prep === 'whole') WHOLE[st.ing](ctx, r, d, A, B, st);
  else CUTS[st.prep](ctx, r, d, A, B, st);
  ctx.restore();
}

// Several things tossed or mixed together: sauces underneath, the rest heaped around the middle.
// Drawn in a fixed order (not the order they went in), so the same mix always looks the same.
export function drawMix(ctx, sts, x, y, s, seed = 1) {
  if (sts.length === 1) { drawItem(ctx, sts[0], x, y, s, seed); return; }
  const key = (st) => `${st.ing}|${st.prep}`;
  const sorted = [...sts].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const wet = sorted.filter(isMelted), solid = sorted.filter((st) => !isMelted(st));
  wet.forEach((st, n) => drawItem(ctx, st, x + s * (0.14 + n * 0.08), y + s * 0.2, s * 0.85, seed + n));
  const k = solid.length;
  solid.forEach((st, n) => {
    const a = (n / k) * Math.PI * 2 + 0.6, rr = k > 1 ? s * 0.32 : 0;
    drawItem(ctx, st, x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.75, s * (k > 1 ? 0.68 : 0.9), seed + 31 * (n + 1));
  });
}

// ---------- The plate ----------

export function plateRole(c) { return isMelted(c) ? 'sauce' : INGS[c.ing].role; }

// Where each item sits, in plate radii. Depends only on what's on the plate, never on the order it was added.
// Things tossed or mixed together (the same group) are one unit: one heap, one spot on the plate.
export function layoutPlate(comps) {
  const groups = new Map();
  comps.forEach((c, i) => {
    const g = c.group != null ? 'g' + c.group : 's' + i;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });
  const ckey = (i) => `${comps[i].ing}|${comps[i].prep}|${Math.round(comps[i].cook * 4)}`;
  const units = [...groups.values()].map((m) => ({ m, k: m.map(ckey).sort().join('+') }));
  const RANK = ['main', 'base', 'side', 'sauce', 'garnish'];
  const by = { base: [], sauce: [], main: [], side: [], garnish: [] };
  for (const u of units) {
    const roles = u.m.map((i) => plateRole(comps[i]));
    by[RANK.find((r) => roles.includes(r))].push(u);
  }
  for (const k in by) by[k].sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  const out = [];
  const put = (u, x, y, s, role, n) => out.push({
    members: u.m, i: u.m[0], x, y, s: s * Math.min(1.3, 1 + 0.12 * (u.m.length - 1)), seed: hashStr(u.k) + role.length * 131 + n * 977,
  });
  const nb = by.base.length, hasBase = nb > 0, hasMain = by.main.length > 0;

  const BASES = [[[0, 0.02, 0.64]], [[-0.3, 0, 0.44], [0.3, 0, 0.44]], [[-0.3, -0.14, 0.38], [0.3, -0.14, 0.38], [0, 0.3, 0.38]]];
  const bases = BASES[Math.min(nb, 3) - 1] || [];
  by.base.forEach((i, n) => { const b = bases[n % 3] || [0, 0, 0.3]; put(i, b[0], b[1], b[2], 'base', n); });

  by.sauce.forEach((i, n) => {
    const b = bases[n % Math.max(1, bases.length)];
    if (b) put(i, b[0] + n * 0.05, b[1] - 0.02, b[2] * 0.75, 'sauce', n);
    else put(i, 0.12 + n * 0.06, 0.14, 0.5, 'sauce', n);
  });

  // Sides go around the rim, or get piled on the base when there's no main to sit there.
  const ANG = [2.4, 0.75, 1.6, 3.4, -0.2, 4.4];
  by.side.forEach((i, n) => {
    if (hasBase && !hasMain) { const p = [[0, -0.07], [-0.16, 0.1], [0.17, 0.07], [0, 0.2]][n % 4]; put(i, p[0], p[1], 0.38, 'side', n); return; }
    const ring = hasBase || hasMain ? 0.6 : 0.34, s = hasBase || hasMain ? 0.3 : 0.4, a = ANG[n % 6];
    put(i, Math.cos(a) * ring, Math.sin(a) * ring * 0.9, s, 'side', n);
  });

  const MAINS = hasBase
    ? [[[0.06, -0.04, 0.44]], [[-0.18, -0.02, 0.36], [0.22, 0.04, 0.36]]]
    : [[[0, 0, 0.54]], [[-0.27, 0, 0.42], [0.29, 0.02, 0.42]]];
  by.main.forEach((i, n) => {
    const set = MAINS[Math.min(by.main.length, 2) - 1], m = set[n] || [(n - 1) * 0.2, 0.2, 0.24];
    put(i, m[0], m[1], m[2], 'main', n);
  });

  const alone = !hasBase && !hasMain && !by.side.length && !by.sauce.length;
  by.garnish.forEach((i, n) => {
    if (alone && by.garnish.length === 1) { put(i, 0, 0, 0.52, 'garnish', n); return; }
    const p = [[0.02, -0.12], [-0.17, 0.05], [0.18, 0.1], [0, 0.18]][n % 4];
    put(i, p[0], p[1], 0.32, 'garnish', n);
  });
  return out;
}

function drawSeason(ctx, cx, cy, R, season, seed) {
  const r = rng(seed * 97 + 3);
  const spot = (k) => { const t = r() * Math.PI * 2, u = Math.sqrt(r()) * R * k; return [cx + Math.cos(t) * u, cy + Math.sin(t) * u * 0.9]; };
  ctx.save();
  for (let n = 0; n < (season.soy || 0); n++) {
    const [x, y] = spot(0.25), w = R * (0.28 + r() * 0.1);
    ctx.beginPath(); ctx.moveTo(x - w, y);
    ctx.bezierCurveTo(x - w * 0.4, y - R * 0.12, x + w * 0.2, y + R * 0.12, x + w, y - R * 0.02);
    ctx.strokeStyle = 'rgba(74,36,14,0.6)'; ctx.lineWidth = R * 0.03; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,200,0.25)'; ctx.lineWidth = R * 0.008; ctx.stroke();
  }
  ctx.fillStyle = '#1d1a17';
  for (let n = 0; n < (season.pepper || 0) * 16; n++) { const [x, y] = spot(0.45), s = R * (0.01 + r() * 0.006); ctx.fillRect(x, y, s, s); }
  ctx.fillStyle = '#b3261e';
  for (let n = 0; n < (season.chili || 0) * 9; n++) {
    const [x, y] = spot(0.42);
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 3); ctx.fillRect(-R * 0.014, -R * 0.007, R * 0.028, R * 0.014); ctx.restore();
  }
  ctx.restore();
}

// comps: [{ ing, prep, cook, dry }]. Returns where each item landed, for taps.
export function drawPlate(ctx, cx, cy, R, comps, season = {}, seed = 7) {
  ctx.save();
  ellipse(ctx, cx + R * 0.04, cy + R * 0.08, R * 1.02, R * 0.98); ctx.fillStyle = 'rgba(60,30,10,0.18)'; ctx.fill();
  ellipse(ctx, cx, cy, R, R);
  const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e9e2d4');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(90,70,50,0.25)'; ctx.lineWidth = Math.max(1, R * 0.012); ctx.stroke();
  ellipse(ctx, cx, cy, R * 0.74, R * 0.74); ctx.fillStyle = '#fbf8f2'; ctx.fill();
  ctx.strokeStyle = 'rgba(90,70,50,0.12)'; ctx.stroke();
  ctx.restore();
  const hits = [];
  for (const p of layoutPlate(comps)) {
    const x = cx + p.x * R, y = cy + p.y * R, s = p.s * R;
    drawMix(ctx, p.members.map((i) => comps[i]), x, y, s, p.seed);
    hits.push({ i: p.i, x, y, r: s });
  }
  drawSeason(ctx, cx, cy, R, season, seed);
  return hits;
}

// ---------- Stations ----------

export function drawTiles(ctx, w, h, col = '#efe6d5') {
  ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(120,90,60,0.08)'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 34) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
  for (let y = 0; y < h; y += 34) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
}

export function drawStoveTop(ctx, w, h) {
  drawTiles(ctx, w, h);
  const top = Math.min(70, h * 0.12);
  const g = ctx.createLinearGradient(0, top, 0, h);
  g.addColorStop(0, '#3a3c42'); g.addColorStop(1, '#25262a');
  ctx.fillStyle = g; ctx.fillRect(0, top, w, h - top);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, top, w, 3);
}

export function drawFlames(ctx, x, y, R, level, t) {
  if (!level) {
    ellipse(ctx, x, y, R * 0.75, R * 0.3); ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = R * 0.06; ctx.stroke();
    return;
  }
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, fx = x + Math.cos(a) * R * 0.72, fy = y + Math.sin(a) * R * 0.28;
    const hgt = R * (0.08 + level * 0.05) * (0.75 + 0.25 * Math.sin(t * 18 + i * 1.7));
    ctx.beginPath(); ctx.moveTo(fx - R * 0.035, fy); ctx.quadraticCurveTo(fx, fy - hgt * 1.6, fx + R * 0.035, fy); ctx.closePath();
    ctx.fillStyle = `rgba(90,150,255,${0.55 + level * 0.12})`; ctx.fill();
  }
}

export function drawPan(ctx, x, y, R, heat) {
  ctx.save();
  ctx.fillStyle = '#1d1d20';
  ctx.beginPath(); ctx.roundRect(x - R * 1.62, y - R * 0.09, R * 0.75, R * 0.18, R * 0.08); ctx.fill();
  ellipse(ctx, x + R * 0.03, y + R * 0.1, R * 1.02, R * 0.66); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ellipse(ctx, x, y, R, R * 0.64); ctx.fillStyle = '#2a2b30'; ctx.fill();
  ctx.strokeStyle = '#55575f'; ctx.lineWidth = R * 0.04; ctx.stroke();
  ellipse(ctx, x, y + R * 0.03, R * 0.88, R * 0.54);
  const g = ctx.createRadialGradient(x - R * 0.2, y - R * 0.15, R * 0.1, x, y, R);
  g.addColorStop(0, '#5a5c64'); g.addColorStop(1, '#303136');
  ctx.fillStyle = g; ctx.fill();
  if (heat) { ctx.fillStyle = `rgba(255,110,40,${0.04 * heat})`; ctx.fill(); }
  ctx.restore();
}

export function drawPot(ctx, x, y, R, heat, t) {
  ctx.save();
  const top = y - R * 0.12;
  ellipse(ctx, x + R * 0.04, y + R * 0.9, R * 1.05, R * 0.25); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  for (const s of [-1, 1]) { ctx.fillStyle = '#5c6168'; ctx.beginPath(); ctx.roundRect(x + s * R * 1.0 - (s > 0 ? 0 : R * 0.22), top + R * 0.15, R * 0.22, R * 0.12, R * 0.05); ctx.fill(); }
  const g = ctx.createLinearGradient(x - R, 0, x + R, 0);
  g.addColorStop(0, '#80868e'); g.addColorStop(0.35, '#d5dadf'); g.addColorStop(0.7, '#9aa0a8'); g.addColorStop(1, '#6d737b');
  ctx.beginPath(); ctx.moveTo(x - R, top); ctx.lineTo(x - R, y + R * 0.8);
  ctx.ellipse(x, y + R * 0.8, R, R * 0.2, 0, Math.PI, 0, true);
  ctx.lineTo(x + R, top); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  ellipse(ctx, x, top, R, R * 0.42); ctx.fillStyle = '#4d5259'; ctx.fill(); ctx.strokeStyle = '#c6cbd1'; ctx.lineWidth = R * 0.04; ctx.stroke();
  ellipse(ctx, x, top + R * 0.04, R * 0.9, R * 0.35); ctx.fillStyle = heat ? '#b3d3df' : '#9fc0cf'; ctx.fill();
  ctx.restore();
}

// Water over whatever's in the pot, and bubbles when it's on.
export function drawPotWater(ctx, x, y, R, heat, t) {
  const top = y - R * 0.12;
  ctx.save();
  ellipse(ctx, x, top + R * 0.04, R * 0.9, R * 0.35); ctx.clip();
  ctx.fillStyle = 'rgba(160,200,215,0.28)'; ctx.fillRect(x - R, top - R, R * 2, R * 2);
  if (heat) {
    const r = rng(Math.floor(t * (3 + heat * 3)));
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, R * 0.015);
    for (let i = 0; i < 5 + heat * 6; i++) {
      const bx = x + (r() - 0.5) * R * 1.6, by = top + (r() - 0.5) * R * 0.55, br = R * (0.02 + r() * 0.035);
      ellipse(ctx, bx, by, br, br * 0.8); ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawOven(ctx, o, heat, t) {
  const { x, y, w, h } = o;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.roundRect(x + 6, y + 8, w, h, 18); ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#efe7d8'); g.addColorStop(1, '#d7ccb8');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, w, h, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(70,50,30,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  // Control strip with knobs and a light.
  const ph = h * 0.14;
  ctx.fillStyle = '#c9bca5'; ctx.beginPath(); ctx.roundRect(x + 10, y + 10, w - 20, ph, 10); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const kx = x + w * (0.22 + i * 0.16), ky = y + 10 + ph / 2, kr = ph * 0.3;
    ellipse(ctx, kx, ky, kr, kr); ctx.fillStyle = '#3b332c'; ctx.fill();
    const a = -Math.PI / 2 + (i === 0 ? heat * 0.9 : 0);
    ctx.strokeStyle = '#f2e9da'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(kx + Math.cos(a) * kr * 0.8, ky + Math.sin(a) * kr * 0.8); ctx.stroke();
  }
  ellipse(ctx, x + w * 0.8, y + 10 + ph / 2, ph * 0.13, ph * 0.13);
  ctx.fillStyle = heat ? `rgba(255,${120 + 40 * Math.sin(t * 3)},40,1)` : '#6b5f52'; ctx.fill();
  // Handle.
  ctx.fillStyle = '#8d8478'; ctx.beginPath(); ctx.roundRect(x + w * 0.2, y + ph + 22, w * 0.6, 9, 5); ctx.fill();
  // Window.
  const win = { x: x + w * 0.1, y: y + ph + 42, w: w * 0.8, h: h - ph - 62 };
  ctx.beginPath(); ctx.roundRect(win.x, win.y, win.w, win.h, 14); ctx.fillStyle = '#231c18'; ctx.fill();
  if (heat) {
    const gl = ctx.createRadialGradient(win.x + win.w / 2, win.y + win.h * 0.2, 10, win.x + win.w / 2, win.y + win.h / 2, win.w * 0.7);
    gl.addColorStop(0, `rgba(255,150,60,${0.35 + heat * 0.1 + 0.04 * Math.sin(t * 2)})`); gl.addColorStop(1, 'rgba(120,40,10,0.15)');
    ctx.fillStyle = gl; ctx.fill();
    ctx.strokeStyle = `rgba(255,90,30,${0.5 + 0.2 * heat})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(win.x + 16, win.y + 12); ctx.lineTo(win.x + win.w - 16, win.y + 12); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(win.x + 8, win.y + win.h * 0.55); ctx.lineTo(win.x + win.w - 8, win.y + win.h * 0.55); ctx.stroke();
  // Tray.
  const tray = { x: win.x + win.w * 0.08, y: win.y + win.h * 0.3, w: win.w * 0.84, h: win.h * 0.6 };
  ctx.fillStyle = '#4a4440'; ctx.beginPath(); ctx.roundRect(tray.x, tray.y, tray.w, tray.h, 8); ctx.fill();
  ctx.strokeStyle = '#6d6560'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  return { win, tray };
}

export function drawOvenGlass(ctx, win) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(win.x, win.y, win.w, win.h, 14); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.moveTo(win.x, win.y + win.h * 0.7); ctx.lineTo(win.x + win.w * 0.35, win.y); ctx.lineTo(win.x + win.w * 0.5, win.y); ctx.lineTo(win.x + win.w * 0.15, win.y + win.h); ctx.lineTo(win.x, win.y + win.h); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.roundRect(win.x, win.y, win.w, win.h, 14); ctx.strokeStyle = '#8d8478'; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
}

// A marble counter.
export function drawMarble(ctx, w, h) {
  ctx.fillStyle = '#e8ddd0'; ctx.fillRect(0, 0, w, h);
  const r = rng(11);
  ctx.strokeStyle = 'rgba(140,120,100,0.12)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath(); let px = r() * w, py = 0; ctx.moveTo(px, py);
    while (py < h) { px += (r() - 0.5) * 60; py += 30 + r() * 40; ctx.lineTo(px, py); }
    ctx.stroke();
  }
}

export function drawBoard(ctx, w, h, b) {
  drawMarble(ctx, w, h);
  ctx.save();
  ctx.fillStyle = 'rgba(60,30,10,0.25)'; ctx.beginPath(); ctx.roundRect(b.x + 6, b.y + 10, b.w, b.h, 22); ctx.fill();
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, '#d4a46d'); g.addColorStop(1, '#bf8c55');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 22); ctx.fill();
  ctx.strokeStyle = 'rgba(90,50,20,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.clip();
  const gr = rng(5);
  ctx.strokeStyle = 'rgba(120,70,30,0.18)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const yy = b.y + (i + 0.5) * (b.h / 14);
    ctx.beginPath(); ctx.moveTo(b.x, yy);
    ctx.bezierCurveTo(b.x + b.w * 0.3, yy + (gr() - 0.5) * 14, b.x + b.w * 0.7, yy + (gr() - 0.5) * 14, b.x + b.w, yy);
    ctx.stroke();
  }
  ellipse(ctx, b.x + b.w * 0.93, b.y + b.h * 0.18, b.h * 0.05, b.h * 0.05); ctx.fillStyle = '#e8ddd0'; ctx.fill();
  ctx.restore();
}

// A mixing bowl in three-quarter view. The inside is drawn first; drawBowlFront goes over the contents.
export function drawBowl(ctx, x, y, R) {
  ctx.save();
  ellipse(ctx, x + R * 0.05, y + R * 0.8, R * 0.85, R * 0.18); ctx.fillStyle = 'rgba(60,30,10,0.22)'; ctx.fill();
  ellipse(ctx, x, y, R, R * 0.42); ctx.fillStyle = '#e6dccd'; ctx.fill();
  const g = ctx.createRadialGradient(x, y - R * 0.1, R * 0.1, x, y, R);
  g.addColorStop(0, '#fbf7f0'); g.addColorStop(1, '#ddd0bd');
  ellipse(ctx, x, y + R * 0.03, R * 0.92, R * 0.36); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}
export function drawBowlFront(ctx, x, y, R) {
  ctx.save();
  ctx.beginPath(); ctx.moveTo(x - R, y);
  ctx.ellipse(x, y, R, R * 0.42, 0, Math.PI, 0, true);
  ctx.bezierCurveTo(x + R, y + R * 0.55, x + R * 0.55, y + R * 0.8, x, y + R * 0.8);
  ctx.bezierCurveTo(x - R * 0.55, y + R * 0.8, x - R, y + R * 0.55, x - R, y);
  ctx.closePath();
  const g = ctx.createLinearGradient(x - R, 0, x + R, 0);
  g.addColorStop(0, '#5b86b0'); g.addColorStop(0.4, '#8db3d6'); g.addColorStop(1, '#4b7399');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(30,40,60,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = R * 0.04;
  ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.42, 0, 0, Math.PI); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = R * 0.05;
  ctx.beginPath(); ctx.moveTo(x - R * 0.6, y + R * 0.35); ctx.quadraticCurveTo(x - R * 0.5, y + R * 0.6, x - R * 0.2, y + R * 0.68); ctx.stroke();
  ctx.restore();
}

export function drawTable(ctx, w, h) {
  ctx.fillStyle = '#f6efe2'; ctx.fillRect(0, 0, w, h);
  const s = 44;
  ctx.fillStyle = 'rgba(205,72,48,0.13)';
  for (let x = 0; x < w; x += s * 2) ctx.fillRect(x, 0, s, h);
  for (let y = 0; y < h; y += s * 2) ctx.fillRect(0, y, w, s);
}
