// Copycat Kitchen: study a photo of a dish, cook it from scratch, and get judged on how close you came.
import { INGS, PREPS, HEAT, HEAT_LABELS, PAN_KEY, SEASONINGS, FLAVORS, FLAVOR_NAMES, DISHES, PANTRY, DRY, nextPreps } from './data.js';
import {
  drawItem, drawPlate, stageName, isScorched, hashStr,
  drawStoveTop, drawFlames, drawPan, drawPot, drawPotWater, drawOven, drawOvenGlass, drawBoard, drawKnife, drawTable, drawTiles,
} from './draw.js';
import { judge, flavorOf, targetComps, recipeSteps, CATEGORIES } from './score.js';

const $ = (s) => document.querySelector(s);
const CAP = { counter: 12, board: 1, pan: 6, pot: 4, oven: 6, plate: 10 };
const PLACE = { counter: 'counter', board: 'board', pan: 'pan', pot: 'pot', oven: 'oven', plate: 'plate' };
const STATION_OF = { pan: 'stove', pot: 'stove', oven: 'oven', board: 'board', plate: 'plate' };
const HINTS = {
  pantry: 'Tap an ingredient to put it on the counter.',
  board: 'Drag something from the counter onto the board to cut it.',
  stove: 'Drag food into the pan or pot, then turn up the heat.',
  oven: 'Drag food into the oven, then set the temperature.',
  plate: 'Drag finished food onto the plate. Season it, then serve.',
};
const LEVELS = ['', 'Easy', 'Medium', 'Hard'];
const PAN_SLOTS = [[-0.5, -0.16], [0, -0.22], [0.5, -0.16], [-0.42, 0.2], [0.04, 0.25], [0.48, 0.2]];
const POT_SLOTS = [[-0.42, -0.02], [0.02, -0.08], [0.44, -0.01], [0, 0.1]];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const seedOf = (dish) => hashStr(dish.id) % 100000;

function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage blocked: fine */ } }
const best = load('copycat-best', {});

// ---------- Canvases ----------

function sizeCanvas(cv, w, h) {
  const r = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(w * r)), H = Math.max(1, Math.round(h * r));
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(r, 0, 0, r, 0, 0);
  return ctx;
}

// A plate drawn to fill a square canvas sized by CSS.
function plateImage(cv, comps, season, seed) {
  const w = cv.clientWidth || 200;
  const ctx = sizeCanvas(cv, w, w);
  ctx.clearRect(0, 0, w, w);
  drawPlate(ctx, w / 2, w / 2, w * 0.46, comps, season, seed);
}

// ---------- Screens ----------

let screen = 'menu';
function show(name) {
  screen = name;
  for (const id of ['menu', 'kitchen', 'results']) $('#' + id).hidden = id !== name;
  window.scrollTo(0, 0);
}

function dailyDish() {
  const d = new Date();
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return DISHES[day % DISHES.length];
}
const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

function renderMenu() {
  const t = dailyDish(), b = best[t.id];
  $('#today').innerHTML = `
    <article class="today-card">
      <div class="today-photo"><canvas class="plate-cv" data-dish="${t.id}"></canvas></div>
      <div class="today-info">
        <span class="badge">Today's dish</span>
        <h3>${esc(t.name)}</h3>
        <p class="diner">“${esc(t.diner)}”</p>
        <p class="meta"><span class="level l${t.level}">${LEVELS[t.level]}</span>${b ? `<span class="best">Best ${b.score} <span class="stars">${starStr(b.stars)}</span></span>` : ''}</p>
        <button class="btn" data-play="${t.id}">Start cooking</button>
      </div>
    </article>`;
  $('#dishGrid').innerHTML = DISHES.map((d) => {
    const bd = best[d.id];
    return `<button class="dish-card" data-play="${d.id}">
      <canvas class="plate-cv" data-dish="${d.id}"></canvas>
      <span class="dc-name">${esc(d.name)}</span>
      <span class="dc-meta"><span class="level l${d.level}">${LEVELS[d.level]}</span><span class="stars">${bd ? starStr(bd.stars) : ''}</span></span>
    </button>`;
  }).join('');
  document.querySelectorAll('#menu canvas[data-dish]').forEach((cv) => {
    const d = DISHES.find((x) => x.id === cv.dataset.dish);
    plateImage(cv, targetComps(d), d.season, seedOf(d));
  });
}

$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-play]');
  if (b) start(DISHES.find((d) => d.id === b.dataset.play));
});

// ---------- The cook ----------

let S = null, uidN = 1;

function start(dish) {
  S = {
    dish, items: [], heat: { pan: 0, pot: 0, oven: 0 }, season: { salt: 0, pepper: 0, chili: 0, soy: 0 },
    tokens: 3, tasted: {}, station: 'pantry', sel: null, chop: null, knifeT: 9, drag: null,
    fx: [], hits: [], zones: [], clock: 0, dt: 0,
  };
  lastCounter = lastActions = lastControls = '';
  show('kitchen');
  $('#dishName').textContent = dish.name;
  plateImage($('#targetThumb'), targetComps(dish), dish.season, seedOf(dish));
  renderPantry();
  setStation('pantry');
  audio();
}

const byUid = (u) => S.items.find((it) => it.uid === u);
const selected = () => (S.sel == null ? null : byUid(S.sel) || null);
const itemsAt = (where) => S.items.filter((it) => it.where === where).sort((a, b) => a.slot - b.slot);
function freeSlot(where) {
  const used = new Set(itemsAt(where).map((it) => it.slot));
  let s = 0;
  while (used.has(s)) s++;
  return s;
}

// What an item looks like and how it was cooked: its main method, and how much of the cooking was dry heat.
function stateOf(it) {
  let tot = 0, dry = 0, bestM = 'raw', bv = 0;
  for (const m in it.by) {
    const v = it.by[m];
    tot += v;
    if (DRY(m)) dry += v;
    if (v > bv) { bv = v; bestM = m; }
  }
  return { ing: it.ing, prep: it.prep, cook: it.cook, dry: tot ? dry / tot : 0, method: tot > 0.05 ? bestM : 'raw' };
}

function addItem(ing) {
  if (itemsAt('counter').length >= CAP.counter) return toast('The counter is full. Use or bin something first.');
  S.items.push({ uid: uidN++, ing, prep: 'whole', cook: 0, by: {}, with: {}, where: 'counter', slot: freeSlot('counter'), seed: (Math.random() * 1e9) >>> 0 });
  sfx('pop');
  toast(`${INGS[ing].name} is on the counter.`);
}

function moveTo(it, where) {
  if (it.where === where) return false;
  if (itemsAt(where).length >= CAP[where]) { toast(`The ${PLACE[where]} is full.`); return false; }
  if (it.where === 'board') S.chop = null;
  it.slot = freeSlot(where);
  it.where = where;
  S.sel = null;
  sfx(where === 'pan' && S.heat.pan ? 'sizzle' : 'pop');
  return true;
}

function bin(it) {
  if (it.where === 'board') S.chop = null;
  S.items = S.items.filter((x) => x !== it);
  if (S.sel === it.uid) S.sel = null;
  sfx('bin');
  toast(`Binned the ${INGS[it.ing].name.toLowerCase()}.`);
}

function tick(dt) {
  for (const v of ['pan', 'pot', 'oven']) {
    const h = S.heat[v];
    if (!h) continue;
    const list = itemsAt(v), key = v === 'pan' ? PAN_KEY[h] : v, f = HEAT[v][h];
    for (const it of list) {
      const d = (f * dt) / (INGS[it.ing].time * PREPS[it.prep].speed);
      it.cook += d;
      it.by[key] = (it.by[key] || 0) + d;
      for (const o of list) if (o !== it) it.with[o.uid] = (it.with[o.uid] || 0) + dt;
      if (!it.warned && isScorched(stateOf(it))) {
        it.warned = true;
        if (S.station !== STATION_OF[v]) toast(`Something's burning in the ${PLACE[v]}!`, true);
      }
    }
  }
}

// ---------- Stations ----------

function setStation(st) {
  S.station = st;
  S.fx = [];
  if (st !== 'board') S.chop = null;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.st === st));
  $('#pantry').hidden = st !== 'pantry';
  $('#stage').style.visibility = st === 'pantry' ? 'hidden' : 'visible';
  lastControls = lastActions = '';
}
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-st]');
  if (b && S) { setStation(b.dataset.st); sfx('tick'); }
});

function renderPantry() {
  $('#pantry').innerHTML = `<div class="shelf">${PANTRY.map((id) => `
    <button class="pantry-item" data-ing="${id}"><canvas width="128" height="128"></canvas><span>${esc(INGS[id].name)}</span></button>`).join('')}</div>`;
  document.querySelectorAll('.pantry-item').forEach((b) => {
    const ctx = b.querySelector('canvas').getContext('2d');
    drawItem(ctx, { ing: b.dataset.ing, prep: 'whole', cook: 0, dry: 0 }, 64, 64, 46, 3);
  });
}
$('#pantry').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ing]');
  if (!b) return;
  addItem(b.dataset.ing);
  b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
});

// Drop targets light up while something from the counter is picked up.
const wantsDrop = () => S.drag != null || selected()?.where === 'counter';
function zone(ctx, where, x, y, rx, ry) {
  S.zones.push({ where, x, y, rx, ry });
  if (!wantsDrop()) return;
  ctx.save();
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -S.clock * 30;
  ctx.strokeStyle = `rgba(255,205,80,${0.7 + 0.3 * Math.sin(S.clock * 5)})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x, y, rx + 6, ry + 6, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function selRing(ctx, x, y, s) {
  ctx.save();
  ctx.setLineDash([6, 5]); ctx.lineDashOffset = -S.clock * 20;
  ctx.strokeStyle = '#ffd25e'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x, y, s * 1.15, s * 1.02, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function tag(ctx, x, y, text, alert) {
  ctx.save();
  ctx.font = '700 10px "DM Sans", system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = alert ? 'rgba(170,32,20,0.92)' : 'rgba(28,20,14,0.74)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y, w, 15, 7.5); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 8);
  ctx.restore();
}

// Draw an item sitting in a station, and remember where it is for taps. Returns a label to draw on top later.
function drawHeld(ctx, it, x, y, s) {
  const st = stateOf(it);
  const jig = S.heat[it.where] && it.where === 'pan' ? Math.sin(S.clock * 45 + it.uid) * 0.5 * S.heat.pan : 0;
  drawItem(ctx, st, x + jig, y, s, it.seed);
  S.hits.push({ uid: it.uid, x, y, r: s });
  if (S.sel === it.uid) selRing(ctx, x, y, s);
  return () => tag(ctx, x, y + s * 0.8 + 2, stageName(st), isScorched(st));
}

function steam(x, y, smoky) {
  if (S.fx.length > 160) return;
  S.fx.push({ kind: smoky ? 'smoke' : 'steam', x: x + (Math.random() - 0.5) * 20, y, vx: (Math.random() - 0.5) * 12, vy: -(22 + Math.random() * 22), life: 0, max: 1.4 + Math.random(), r: 5 + Math.random() * 6 });
}

function drawFx(ctx, dt) {
  for (const p of S.fx) {
    p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const a = Math.max(0, 1 - p.life / p.max);
    if (p.kind === 'bit') {
      p.vy += 500 * dt;
      ctx.fillStyle = p.color; ctx.globalAlpha = a;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.fillStyle = p.kind === 'smoke' ? `rgba(70,62,56,${0.4 * a})` : `rgba(255,255,255,${0.22 * a})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.life * 1.2), 0, Math.PI * 2); ctx.fill();
  }
  S.fx = S.fx.filter((p) => p.life < p.max);
}

function drawBoardStation(ctx, w, h, H) {
  const bw = Math.min(w * 0.88, H * 1.35), bh = Math.min(bw * (w < 560 ? 0.9 : 0.62), H * 0.8);
  const b = { x: (w - bw) / 2, y: (H - bh) / 2 + 4, w: bw, h: bh };
  drawBoard(ctx, w, h, b);
  zone(ctx, 'board', b.x + bw / 2, b.y + bh / 2, bw / 2, bh / 2);
  const it = itemsAt('board')[0];
  if (!it) {
    ctx.save(); ctx.font = 'italic 500 18px Fraunces, Georgia, serif'; ctx.fillStyle = 'rgba(80,45,15,0.45)';
    ctx.textAlign = 'center'; ctx.fillText('Nothing on the board', b.x + bw / 2, b.y + bh / 2 + 6); ctx.restore();
    return [];
  }
  const s = bh * 0.34, x = b.x + bw * (S.chop ? 0.42 : 0.5), y = b.y + bh * 0.52;
  const label = drawHeld(ctx, it, x, y, s);
  if (S.chop) drawKnife(ctx, x + s * 0.5, y - s * 0.05, bh * 0.58, Math.min(1, S.knifeT * 7));
  return [label];
}

function drawStoveStation(ctx, w, h, H) {
  drawStoveTop(ctx, w, h);
  let pan, pot;
  if (w < 560) {
    const R = Math.min(w * 0.36, H * 0.23);
    pan = { x: w * 0.57, y: H * 0.3, R };
    pot = { x: w * 0.5, y: H * 0.73, R: R * 0.85 };
  } else {
    const R = Math.min(w * 0.19, H * 0.36);
    pan = { x: w * 0.36, y: H * 0.5, R };
    pot = { x: w * 0.75, y: H * 0.46, R: R * 0.9 };
  }
  const labels = [];

  drawFlames(ctx, pan.x, pan.y + pan.R * 0.42, pan.R * 1.25, S.heat.pan, S.clock);
  drawPan(ctx, pan.x, pan.y, pan.R, S.heat.pan);
  zone(ctx, 'pan', pan.x, pan.y, pan.R, pan.R * 0.64);
  const inPan = itemsAt('pan').map((it) => ({ it, p: PAN_SLOTS[it.slot] })).sort((a, b) => a.p[1] - b.p[1]);
  for (const { it, p } of inPan) {
    const x = pan.x + p[0] * pan.R, y = pan.y + p[1] * pan.R;
    labels.push(drawHeld(ctx, it, x, y, pan.R * 0.29));
    if (S.heat.pan && Math.random() < S.dt * S.heat.pan * 1.3) steam(x, y - pan.R * 0.15, isScorched(stateOf(it)));
  }

  drawFlames(ctx, pot.x, pot.y + pot.R * 0.85, pot.R * 1.2, S.heat.pot, S.clock);
  drawPot(ctx, pot.x, pot.y, pot.R, S.heat.pot, S.clock);
  const top = pot.y - pot.R * 0.12;
  for (const it of itemsAt('pot')) {
    const p = POT_SLOTS[it.slot], x = pot.x + p[0] * pot.R, y = top + p[1] * pot.R;
    labels.push(drawHeld(ctx, it, x, y, pot.R * 0.26));
  }
  drawPotWater(ctx, pot.x, pot.y, pot.R, S.heat.pot, S.clock);
  zone(ctx, 'pot', pot.x, pot.y + pot.R * 0.25, pot.R, pot.R * 0.75);
  if (S.heat.pot >= 2 && Math.random() < S.dt * S.heat.pot) steam(pot.x + (Math.random() - 0.5) * pot.R, top - pot.R * 0.2, false);
  return labels;
}

function drawOvenStation(ctx, w, h, H) {
  drawTiles(ctx, w, h);
  const ow = Math.min(w * 0.92, H * 1.2), oh = Math.min(H * 0.94, ow * (w < 560 ? 1.2 : 0.85));
  const o = { x: (w - ow) / 2, y: (H - oh) / 2 + 4, w: ow, h: oh };
  const { win, tray } = drawOven(ctx, o, S.heat.oven, S.clock);
  zone(ctx, 'oven', win.x + win.w / 2, win.y + win.h / 2, win.w / 2, win.h / 2);
  const s = Math.min(tray.w / 5.6, tray.h / 3.8), labels = [];
  for (const it of itemsAt('oven')) {
    const c = it.slot % 3, r = Math.floor(it.slot / 3);
    const x = tray.x + (tray.w * (c + 0.5)) / 3, y = tray.y + (tray.h * (r + 0.42)) / 2;
    labels.push(drawHeld(ctx, it, x, y, s));
    if (S.heat.oven && isScorched(stateOf(it)) && Math.random() < S.dt * 2) steam(x, y - s, true);
  }
  drawOvenGlass(ctx, win);
  return labels;
}

function drawPlateStation(ctx, w, h, H) {
  drawTable(ctx, w, h);
  const R = Math.min(w * 0.42, H * 0.44), cx = w / 2, cy = H / 2 + 4;
  const items = itemsAt('plate');
  const hits = drawPlate(ctx, cx, cy, R, items.map(stateOf), S.season, seedOf(S.dish));
  for (const p of hits) {
    const it = items[p.i];
    S.hits.push({ uid: it.uid, x: p.x, y: p.y, r: p.r });
    if (S.sel === it.uid) selRing(ctx, p.x, p.y, p.r);
  }
  zone(ctx, 'plate', cx, cy, R, R);
  if (!items.length) {
    ctx.save(); ctx.font = 'italic 500 17px Fraunces, Georgia, serif'; ctx.fillStyle = 'rgba(80,60,40,0.45)';
    ctx.textAlign = 'center'; ctx.fillText('An empty plate', cx, cy + 6); ctx.restore();
  }
  return [];
}

const STATION_DRAW = { board: drawBoardStation, stove: drawStoveStation, oven: drawOvenStation, plate: drawPlateStation };

function drawStage() {
  if (S.station === 'pantry') return;
  const wrap = $('#stageWrap'), w = wrap.clientWidth, h = wrap.clientHeight;
  const ctx = sizeCanvas($('#stage'), w, h);
  const H = Math.max(120, h - $('#controls').offsetHeight - 6);
  S.hits = []; S.zones = [];
  const labels = STATION_DRAW[S.station](ctx, w, h, H);
  drawFx(ctx, S.dt);
  for (const draw of labels) draw();
}

// ---------- Canvas input ----------

const stage = $('#stage');
function canvasPoint(x, y) { const r = stage.getBoundingClientRect(); return [x - r.left, y - r.top]; }
function hitItem(x, y) {
  let found = null, bd = Infinity;
  for (const h of S.hits) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r * 1.05 && d < bd) { bd = d; found = h; } }
  return found;
}
const hitZone = (x, y) => S.zones.find((z) => ((x - z.x) / z.rx) ** 2 + ((y - z.y) / z.ry) ** 2 <= 1);

stage.addEventListener('pointerdown', (e) => {
  if (!S) return;
  audio();
  const [x, y] = canvasPoint(e.clientX, e.clientY);
  if (S.station === 'board' && S.chop) { chop(); return; }
  const sel = selected();
  if (sel && sel.where === 'counter') { const z = hitZone(x, y); if (z) { moveTo(sel, z.where); return; } }
  const h = hitItem(x, y);
  S.sel = h && S.sel !== h.uid ? h.uid : null;
});

function chop() {
  const it = itemsAt('board')[0];
  if (!it || !S.chop) return;
  S.chop.taps++;
  S.knifeT = 0;
  sfx('chop');
  const wrap = $('#stageWrap'), w = wrap.clientWidth, H = wrap.clientHeight - $('#controls').offsetHeight;
  const col = INGS[it.ing].b;
  for (let i = 0; i < 5; i++) S.fx.push({ kind: 'bit', x: w * 0.45, y: H * 0.5, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 120, life: 0, max: 0.6, r: 4 + Math.random() * 4, color: col });
  if (S.chop.taps >= PREPS[S.chop.prep].taps) {
    it.prep = S.chop.prep;
    S.chop = null;
    sfx('pop');
  }
}

// ---------- Counter, with drag and drop ----------

let lastCounter = '';
function renderCounter() {
  const items = itemsAt('counter');
  const key = items.map((it) => `${it.uid}:${it.prep}`).join(',') + '|' + S.sel;
  if (key === lastCounter) return;
  lastCounter = key;
  const el = $('#counter');
  if (!items.length) { el.innerHTML = '<p class="empty">Empty. Grab something from the pantry.</p>'; return; }
  el.innerHTML = items.map((it) => {
    const st = stateOf(it), sub = (it.prep === 'whole' ? '' : PREPS[it.prep].done + ', ') + stageName(st);
    return `<button class="chip${S.sel === it.uid ? ' sel' : ''}" data-uid="${it.uid}"><canvas width="88" height="88"></canvas><span class="chip-name">${esc(INGS[it.ing].name)}</span><span class="chip-sub">${sub}</span></button>`;
  }).join('');
  el.querySelectorAll('.chip').forEach((b) => {
    const it = byUid(+b.dataset.uid);
    drawItem(b.querySelector('canvas').getContext('2d'), stateOf(it), 44, 46, 34, it.seed);
  });
}

let press = null;
const counterEl = $('#counter'), ghost = $('#ghost');
counterEl.addEventListener('pointerdown', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  audio();
  press = { uid: +chip.dataset.uid, x: e.clientX, y: e.clientY, id: e.pointerId, drag: false };
  chip.setPointerCapture(e.pointerId);
});
counterEl.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id) return;
  if (!press.drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
    press.drag = true;
    S.drag = press.uid;
    const it = byUid(press.uid);
    ghost.innerHTML = '<canvas width="128" height="128"></canvas>';
    drawItem(ghost.firstChild.getContext('2d'), stateOf(it), 64, 64, 48, it.seed);
    ghost.hidden = false;
  }
  if (press.drag) ghost.style.transform = `translate(${e.clientX - 32}px, ${e.clientY - 40}px)`;
});
counterEl.addEventListener('pointerup', (e) => {
  if (!press || e.pointerId !== press.id) return;
  const p = press;
  press = null;
  if (!p.drag) { S.sel = S.sel === p.uid ? null : p.uid; return; }
  ghost.hidden = true;
  S.drag = null;
  const it = byUid(p.uid), el = document.elementFromPoint(e.clientX, e.clientY);
  if (!it || !el) return;
  if (el.closest('#trash')) { bin(it); return; }
  if (el === stage) {
    const [x, y] = canvasPoint(e.clientX, e.clientY), z = hitZone(x, y);
    if (z) moveTo(it, z.where);
  }
});
counterEl.addEventListener('pointercancel', () => { if (press?.drag) { ghost.hidden = true; S.drag = null; } press = null; });

$('#trash').addEventListener('click', () => {
  const it = selected();
  if (it) bin(it); else toast('Pick something first, then tap the bin.');
});

// ---------- Selection actions ----------

let lastActions = '';
function actionsFor(it) {
  const a = [], st = S.station;
  if (it.where === 'counter') {
    if (st === 'board') a.push(['board', 'Onto board']);
    if (st === 'stove') a.push(['pan', 'Into pan'], ['pot', 'Into pot']);
    if (st === 'oven') a.push(['oven', 'Into oven']);
    if (st === 'plate') a.push(['plate', 'Onto plate']);
  } else {
    a.push(['counter', it.where === 'plate' ? 'Take off' : 'Take out']);
    if (it.where !== 'plate' && it.where !== 'board') a.push(['plate', 'Plate it']);
  }
  a.push(['trash', 'Bin']);
  return a;
}

function renderActions() {
  const it = selected();
  let key, html;
  if (!it) {
    key = 'hint:' + S.station;
    html = `<p class="hint">${HINTS[S.station]}</p>`;
  } else {
    const st = stateOf(it), sub = (it.prep === 'whole' ? '' : PREPS[it.prep].done + ', ') + stageName(st);
    key = `${it.uid}|${it.where}|${S.station}|${sub}`;
    html = `<div class="sel-label"><b>${esc(INGS[it.ing].name)}</b><span>${sub}</span></div>
      <div class="act-btns">${actionsFor(it).map(([a, t]) => `<button class="pill${a === 'trash' ? ' danger' : ''}" data-act="${a}">${t}</button>`).join('')}</div>`;
  }
  if (key === lastActions) return;
  lastActions = key;
  $('#actions').innerHTML = html;
}
$('#actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'), it = selected();
  if (!b || !it) return;
  if (b.dataset.act === 'trash') bin(it); else moveTo(it, b.dataset.act);
});

// ---------- Station controls ----------

let lastControls = '';
function heatRow(v, label) {
  return `<div class="ctl-row"><span class="ctl-label">${label}</span><div class="seg">${HEAT_LABELS[v].map((t, i) =>
    `<button class="seg-btn${S.heat[v] === i ? ' on h' + i : ''}" data-ctl="heat" data-v="${v}" data-h="${i}">${t}</button>`).join('')}</div></div>`;
}

function renderControls() {
  let html = '';
  const st = S.station;
  if (st === 'board') {
    const it = itemsAt('board')[0];
    if (!it) html = '';
    else if (S.chop) {
      const need = PREPS[S.chop.prep].taps;
      html = `<div class="ctl-row"><span class="ctl-label">Tap anywhere to ${PREPS[S.chop.prep].name.toLowerCase()}</span>
        <span class="pips">${'<i class="on"></i>'.repeat(S.chop.taps)}${'<i></i>'.repeat(need - S.chop.taps)}</span>
        <button class="seg-btn" data-ctl="chop-stop">Stop</button></div>`;
    } else {
      const opts = nextPreps(it.ing, it.prep);
      const none = it.prep === 'whole' ? 'This one is used whole.' : 'Ready to cook.';
      html = `<div class="ctl-row"><span class="ctl-label">${opts.length ? 'Prep' : none}</span>
        ${opts.map((p) => `<button class="seg-btn" data-ctl="prep" data-prep="${p}">${PREPS[p].name}</button>`).join('')}
        <button class="seg-btn ghost" data-ctl="board-off">To the counter</button></div>`;
    }
  } else if (st === 'stove') html = heatRow('pan', 'Pan') + heatRow('pot', 'Pot');
  else if (st === 'oven') html = heatRow('oven', 'Oven');
  else if (st === 'plate') {
    const any = Object.values(S.season).some(Boolean);
    html = `<div class="ctl-row"><span class="ctl-label">Season</span>${Object.keys(SEASONINGS).map((k) =>
      `<button class="seg-btn shaker" data-ctl="season" data-k="${k}">${SEASONINGS[k].name}${S.season[k] ? ` <b>×${S.season[k]}</b>` : ''}</button>`).join('')}
      <button class="seg-btn ghost" data-ctl="unseason"${any ? '' : ' disabled'}>Clear</button></div>
      <div class="ctl-row end"><button class="seg-btn" data-ctl="taste">Taste test</button><button class="btn serve" data-ctl="serve">Serve</button></div>`;
  }
  const key = st + html;
  if (key === lastControls) return;
  lastControls = key;
  $('#controls').innerHTML = html;
  $('#controls').hidden = !html;
}

$('#controls').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ctl]');
  if (!b || !S) return;
  audio();
  const c = b.dataset.ctl;
  if (c === 'heat') { S.heat[b.dataset.v] = +b.dataset.h; sfx('tick'); }
  else if (c === 'prep') { S.chop = { prep: b.dataset.prep, taps: 0 }; S.knifeT = 9; }
  else if (c === 'chop-stop') S.chop = null;
  else if (c === 'board-off') { const it = itemsAt('board')[0]; if (it) moveTo(it, 'counter'); }
  else if (c === 'season') { S.season[b.dataset.k]++; sfx('shake'); }
  else if (c === 'unseason') { for (const k in S.season) S.season[k] = 0; }
  else if (c === 'taste') openTarget();
  else if (c === 'serve') serve();
});

// ---------- Chrome that follows the simulation ----------

function updateTabs() {
  const anyIn = (w) => S.items.some((it) => it.where === w);
  const burning = (ws) => S.items.some((it) => ws.includes(it.where) && isScorched(stateOf(it)));
  const set = (st, on, alert) => {
    const dot = document.querySelector(`#tabs [data-st="${st}"] .dot`);
    dot.classList.toggle('on', !!on);
    dot.classList.toggle('alert', !!alert);
  };
  set('board', anyIn('board'), false);
  set('stove', S.heat.pan || S.heat.pot, burning(['pan', 'pot']) && (S.heat.pan || S.heat.pot));
  set('oven', S.heat.oven, burning(['oven']) && S.heat.oven);
  set('plate', anyIn('plate'), false);
}

let toastTimer = 0;
function toast(text, alert = false) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.toggle('alert', alert);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), alert ? 2600 : 1600);
}

// ---------- The original and taste tests ----------

const dlg = $('#targetDlg');
function fbar(v, cls) {
  return `<span class="fbar ${cls}"><i style="width:${Math.min(100, (v / 3) * 100)}%"></i><em>${v.toFixed(1)}</em></span>`;
}
function renderTarget() {
  const d = S.dish, ft = flavorOf(targetComps(d), d.season), fm = flavorOf(itemsAt('plate').map(stateOf), S.season);
  $('#targetBody').innerHTML = `
    <button class="dlg-x" data-dlg="close" aria-label="Close">×</button>
    <p class="kicker">The original</p>
    <h2>${esc(d.name)}</h2>
    <div class="target-photo"><canvas id="targetBig" class="plate-cv"></canvas></div>
    <p class="diner">“${esc(d.diner)}”</p>
    <div class="taste">
      <div class="taste-head"><b>Taste test</b><span class="spoons">${S.tokens} of 3 left</span></div>
      <div class="taste-grid">
        <span></span><span class="th">Original</span><span class="th">Your plate</span>
        ${FLAVORS.map((k) => `<span class="fl-name">${FLAVOR_NAMES[k]}</span>${S.tasted[k] ? fbar(ft[k], 'orig')
          : `<button class="taste-btn" data-taste="${k}"${S.tokens ? '' : ' disabled'}>Taste</button>`}${fbar(fm[k], 'mine')}`).join('')}
      </div>
      <p class="taste-note">Each taste reveals one flavor of the original. Tasting your own plate is free.</p>
    </div>
    <button class="btn wide" data-dlg="close">Back to cooking</button>`;
  plateImage($('#targetBig'), targetComps(d), d.season, seedOf(d));
}
function openTarget() {
  if (!dlg.open) dlg.showModal();
  renderTarget();
}
$('#targetBtn').addEventListener('click', () => { if (S) openTarget(); });
dlg.addEventListener('click', (e) => {
  if (e.target === dlg || e.target.closest('[data-dlg="close"]')) { dlg.close(); return; }
  const t = e.target.closest('[data-taste]');
  if (t && S.tokens > 0) { S.tokens--; S.tasted[t.dataset.taste] = true; sfx('pop'); renderTarget(); }
});

// ---------- Serving and results ----------

function serve() {
  const items = itemsAt('plate');
  if (!items.length) { toast('Put something on the plate first.'); return; }
  const mine = items.map(stateOf);
  const pairs = new Set();
  items.forEach((a, i) => items.forEach((b, j) => {
    if (i < j && (a.with[b.uid] || 0) >= 2) pairs.add([a.ing, b.ing].sort().join('|'));
  }));
  const res = judge(S.dish, mine, S.season, pairs);
  const prev = best[S.dish.id];
  const isBest = !prev || res.total > prev.score;
  if (isBest) { best[S.dish.id] = { score: res.total, stars: res.stars }; save('copycat-best', best); }
  S.heat = { pan: 0, pot: 0, oven: 0 };
  renderResults(mine, res, isBest && !!prev);
  show('results');
  sfx('ding');
}

function renderResults(mine, res, newBest) {
  const d = S.dish;
  $('#results').innerHTML = `
    <div class="res-inner">
      <p class="kicker">The verdict</p>
      <h1>${esc(d.name)}</h1>
      <div class="res-plates">
        <figure><canvas id="resTarget" class="plate-cv"></canvas><figcaption>The original</figcaption></figure>
        <figure><canvas id="resMine" class="plate-cv"></canvas><figcaption>Yours</figcaption></figure>
      </div>
      <div class="res-score">
        <div class="big">${res.total}</div>
        <div><div class="stars">${starStr(res.stars)}</div><div class="of">out of 100${newBest ? ' · <b>New best!</b>' : ''}</div></div>
      </div>
      <ul class="res-notes">${res.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <div class="res-cats">${CATEGORIES.map((c) => {
        const v = Math.round(res.cats[c.key] * 100);
        return `<div class="cat"><span>${c.name}</span><span class="cbar"><i style="width:${v}%"></i></span><b>${v}</b></div>`;
      }).join('')}</div>
      <details class="recipe"><summary>Show the original recipe</summary><ol>${recipeSteps(d).map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>
      <div class="res-btns">
        <button class="btn" data-res="retry">Cook it again</button>
        <button class="btn ghost" data-res="next">Next dish</button>
        <button class="btn ghost" data-res="share">Copy score</button>
        <button class="btn ghost" data-res="menu">Menu</button>
      </div>
    </div>`;
  S.result = res;
  requestAnimationFrame(() => {
    plateImage($('#resTarget'), targetComps(d), d.season, seedOf(d));
    plateImage($('#resMine'), mine, S.season, seedOf(d));
  });
}

$('#results').addEventListener('click', (e) => {
  const b = e.target.closest('[data-res]');
  if (!b) return;
  const d = S.dish, r = b.dataset.res;
  if (r === 'retry') start(d);
  else if (r === 'next') start(DISHES[(DISHES.indexOf(d) + 1) % DISHES.length]);
  else if (r === 'menu') { show('menu'); renderMenu(); }
  else if (r === 'share') {
    const sq = (v) => (v >= 0.85 ? '🟩' : v >= 0.6 ? '🟨' : '🟥');
    const text = `Copycat Kitchen · ${d.name}\n${starStr(S.result.stars)} ${S.result.total}/100\n${CATEGORIES.map((c) => sq(S.result.cats[c.key])).join('')}\n${location.href.split('#')[0]}`;
    navigator.clipboard?.writeText(text).then(() => toast('Copied your score.'), () => toast("Couldn't copy."));
  }
});

$('#backBtn').addEventListener('click', () => {
  if (S.items.length && !confirm('Leave this dish? Your cooking will be lost.')) return;
  S.heat = { pan: 0, pot: 0, oven: 0 };
  show('menu');
  renderMenu();
});

// ---------- Sound ----------

let AC = null, NOISE = null, sizzleGain = null, muted = load('copycat-muted', false);
function audio() {
  if (muted) return null;
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = NOISE.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (AC.state === 'suspended') AC.resume();
  } catch { return null; }
  return AC;
}

const TONES = { pop: [520, 0.09, 'sine', 0.16], shake: [1400, 0.04, 'triangle', 0.05], ding: [880, 1.0, 'sine', 0.22], bin: [200, 0.14, 'triangle', 0.14], tick: [760, 0.03, 'square', 0.03] };
function sfx(kind) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime, g = ac.createGain();
  g.connect(ac.destination);
  if (kind === 'chop' || kind === 'sizzle' || kind === 'shake') {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter();
    s.buffer = NOISE;
    f.type = kind === 'chop' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 'chop' ? 1800 : 4000;
    const len = kind === 'sizzle' ? 0.5 : kind === 'shake' ? 0.12 : 0.08;
    s.connect(f).connect(g);
    g.gain.setValueAtTime(kind === 'chop' ? 0.6 : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.start(t, Math.random() * 0.5);
    s.stop(t + len + 0.02);
    return;
  }
  const [f, len, type, v] = TONES[kind], o = ac.createOscillator();
  o.type = type;
  o.connect(g);
  o.frequency.setValueAtTime(f, t);
  if (kind === 'pop') o.frequency.exponentialRampToValueAtTime(f * 1.6, t + len);
  if (kind === 'bin') o.frequency.exponentialRampToValueAtTime(90, t + len);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.start(t);
  o.stop(t + len + 0.02);
  if (kind === 'ding') {
    const o2 = ac.createOscillator(), g2 = ac.createGain();
    o2.frequency.value = 1320; o2.connect(g2).connect(ac.destination);
    g2.gain.setValueAtTime(0.12, t + 0.12); g2.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o2.start(t + 0.12); o2.stop(t + 1.15);
  }
}

// A steady sizzle that follows how full and hot the pan is.
function updateSizzle() {
  if (!AC) return;
  if (!sizzleGain) {
    const s = AC.createBufferSource(), f = AC.createBiquadFilter();
    s.buffer = NOISE; s.loop = true;
    f.type = 'highpass'; f.frequency.value = 3000;
    sizzleGain = AC.createGain(); sizzleGain.gain.value = 0;
    s.connect(f).connect(sizzleGain).connect(AC.destination);
    s.start();
  }
  const n = !muted && S && screen === 'kitchen' && S.heat.pan ? itemsAt('pan').length : 0;
  const level = n ? Math.min(1, 0.4 + n * 0.12) * (S.heat.pan / 3) : 0;
  sizzleGain.gain.setTargetAtTime(level * 0.05 * (0.8 + Math.random() * 0.4), AC.currentTime, 0.08);
}

function renderSound() { $('#soundBtn').textContent = muted ? '🔇' : '🔊'; }
$('#soundBtn').addEventListener('click', () => {
  muted = !muted;
  save('copycat-muted', muted);
  renderSound();
  if (!muted) audio();
});
renderSound();

// ---------- Main loop ----------

// #dev in the URL runs the loop on a timer (so it keeps going in a hidden preview) and exposes the state as window.ck.
const DEV = location.hash.includes('dev');
const nextFrame = DEV ? (f) => setTimeout(() => f(performance.now()), 33) : requestAnimationFrame;
if (DEV) window.ck = { get S() { return S; }, stateOf, start };

let last = 0;
function frame(t) {
  nextFrame(frame);
  const dt = Math.min(0.1, Math.max(0, (t - last) / 1000));
  last = t;
  if (S && screen === 'kitchen') {
    S.dt = dt;
    S.clock += dt;
    S.knifeT += dt;
    tick(dt);
    renderControls();
    renderCounter();
    renderActions();
    drawStage();
    updateTabs();
  }
  updateSizzle();
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (screen === 'menu') renderMenu(); }, 150);
});

renderMenu();
nextFrame(frame);
