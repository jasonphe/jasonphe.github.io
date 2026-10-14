// Prep minigames: cutting, mincing, grating, tearing, cracking, whisking, stirring and tossing.
// A game draws over its station and takes pointer input in canvas coordinates. When it's finished it sets `done`,
// and `q` for how well it went (0 to 1). Input handlers can return { sfx, msg, hop } for game.js to act on.

const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 1);

// A chef's knife pointing down, tip at the bottom, handle up. angle turns it around (x, y).
function knife(ctx, x, y, len, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const w = len * 0.16;
  ctx.fillStyle = '#2b211a';
  ctx.beginPath(); ctx.roundRect(-w * 0.45, -len * 0.95, w * 0.9, len * 0.42, w * 0.3); ctx.fill();
  ctx.fillStyle = '#c9cdd2';
  for (const k of [0.82, 0.66]) { ctx.beginPath(); ctx.arc(0, -len * k, w * 0.12, 0, TAU); ctx.fill(); }
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, '#9aa2ab'); g.addColorStop(0.5, '#f3f5f7'); g.addColorStop(1, '#b7bec6');
  ctx.beginPath(); ctx.moveTo(-w * 0.55, -len * 0.53); ctx.lineTo(w * 0.6, -len * 0.53); ctx.lineTo(w * 0.6, len * 0.3);
  ctx.quadraticCurveTo(w * 0.5, len * 0.45, -w * 0.55, len * 0.5); ctx.closePath();
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(40,40,50,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function bar(ctx, x, y, w, h, v, zone) {
  ctx.save();
  ctx.fillStyle = 'rgba(30,20,12,0.55)'; ctx.beginPath(); ctx.roundRect(x - 3, y - 3, w + 6, h + 6, (h + 6) / 2); ctx.fill();
  ctx.fillStyle = '#f2e9da'; ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fill();
  if (zone) { ctx.fillStyle = '#7cc06f'; ctx.fillRect(x + w * zone[0], y, w * (zone[1] - zone[0]), h); }
  else { ctx.fillStyle = '#e0682a'; ctx.beginPath(); ctx.roundRect(x, y, Math.max(h, w * clamp01(v)), h, h / 2); ctx.fill(); }
  ctx.restore();
}

// Dashed circle with an arrow, and a ring filling up with progress: "drag in circles".
function circleGuide(ctx, x, y, r, p, t) {
  ctx.save();
  ctx.setLineDash([8, 8]); ctx.lineDashOffset = -t * 30;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(p)); ctx.stroke();
  ctx.restore();
}

// ---------- The games ----------

// A knife sweeps across; tap to cut. Each cut lands on the nearest line, scored by how close it was.
// With turns, the board turns and you cut again the other way (dicing).
function knifeGame({ cuts, turns, speed }) {
  const phases = turns ? 2 : 1;
  const lines = () => Array.from({ length: cuts }, (_, i) => ({ at: -0.68 + (1.36 * (i + 0.5)) / cuts, done: false }));
  let phase = 0, marks = lines(), t = 0, since = 9;
  const made = [], qs = [];
  const pos = () => Math.sin(t * speed) * 0.85;
  return {
    hint: turns ? 'Tap when the knife is on a line' : 'Tap when the knife is on a line',
    progress: () => (phase * cuts + marks.filter((m) => m.done).length) / (phases * cuts),
    update(dt) { t += dt; since += dt; },
    down() {
      const p = pos(), gap = 1.36 / cuts;
      let m = null;
      for (const x of marks) if (!x.done && (!m || Math.abs(x.at - p) < Math.abs(m.at - p))) m = x;
      m.done = true;
      qs.push(clamp01(1 - Math.abs(m.at - p) / (gap * 0.6)));
      made.push({ phase, at: p });
      since = 0;
      if (marks.every((x) => x.done)) {
        if (phase + 1 < phases) { phase++; marks = lines(); return { sfx: 'chop', msg: 'Now the other way.' }; }
        this.done = true; this.q = avg(qs);
      }
      return { sfx: 'chop' };
    },
    draw(ctx, g) {
      const along = (ph, at, dashed) => {
        ctx.beginPath();
        if (ph === 0) { ctx.moveTo(g.x + at * g.s, g.y - g.s * 0.85); ctx.lineTo(g.x + at * g.s, g.y + g.s * 0.85); }
        else { ctx.moveTo(g.x - g.s * 0.9, g.y + at * g.s * 0.8); ctx.lineTo(g.x + g.s * 0.9, g.y + at * g.s * 0.8); }
        ctx.setLineDash(dashed ? [6, 6] : []); ctx.stroke();
      };
      ctx.save();
      ctx.strokeStyle = 'rgba(60,30,10,0.6)'; ctx.lineWidth = 2.5;
      for (const c of made) along(c.phase, c.at, false);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
      for (const m of marks) if (!m.done) along(phase, m.at, true);
      ctx.restore();
      const p = pos(), down = since < 0.09 ? g.s * 0.12 : 0;
      if (phase === 0) knife(ctx, g.x + p * g.s, g.y - g.s * 0.2 + down, g.s * 1.5);
      else knife(ctx, g.x + g.s * 0.2 - down, g.y + p * g.s * 0.8, g.s * 1.5, Math.PI / 2);
    },
  };
}

// Tap fast to rock the knife. The meter drains, so slow tapping never gets there.
function rockGame() {
  let fill = 0, t = 0, rockA = 0;
  return {
    hint: 'Tap fast to rock the knife',
    progress: () => fill,
    update(dt) { t += dt; fill = Math.max(0, fill - dt * 0.22); rockA *= Math.pow(0.02, dt); },
    down() {
      fill += 0.085; rockA = 1;
      if (fill >= 1) { this.done = true; this.q = clamp01(1.25 - t / 8); }
      return { sfx: 'chop' };
    },
    draw(ctx, g) {
      knife(ctx, g.x + g.s * 0.1, g.y - g.s * 0.1, g.s * 1.7, -Math.PI / 2 + 0.15 - rockA * 0.35);
      bar(ctx, g.x - g.s, g.y + g.s * 1.05, g.s * 2, 12, fill);
    },
  };
}

// Drag up and down to grate. The block shrinks and a pile builds up beside the grater.
function grateGame({ strokes }) {
  let n = 0, lastY = null, dir = 0, run = 0, off = 0;
  const stroke = () => { if (run > 28) { n++; run = 0; return true; } run = 0; return false; };
  const self = {
    hint: 'Drag up and down to grate',
    progress: () => n / strokes,
    update() {},
    itemOffset: (g) => [-g.s * 0.42, off],
    itemScale: () => 0.75 - 0.35 * (n / strokes),
    down(x, y) { lastY = y; },
    move(x, y) {
      if (lastY == null) return null;
      const dy = y - lastY, d = Math.sign(dy);
      lastY = y;
      off = Math.max(-40, Math.min(40, off + dy));
      let ev = null;
      if (d && d !== dir) { if (stroke()) ev = { sfx: 'shake' }; dir = d; }
      run += Math.abs(dy);
      if (n >= strokes) { self.done = true; self.q = 1; }
      return ev;
    },
    up() { lastY = null; const ev = stroke() ? { sfx: 'shake' } : null; if (n >= strokes) { self.done = true; self.q = 1; } return ev; },
    draw(ctx, g) {
      const x = g.x + g.s * 0.35, y = g.y - g.s * 0.75, w = g.s * 0.7, h = g.s * 1.5;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 4, w * 0.6, 8, 0, 0, TAU); ctx.fill();
      const gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, '#9aa2ab'); gr.addColorStop(0.5, '#e3e7eb'); gr.addColorStop(1, '#8d959e');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x + w * 0.12, y); ctx.lineTo(x + w * 0.88, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,40,50,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(40,40,50,0.55)';
      for (let r = 0; r < 7; r++) for (let c = 0; c < 4; c++) { ctx.beginPath(); ctx.arc(x + w * (0.2 + c * 0.2), y + h * (0.15 + r * 0.11), 2.2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#5c6168'; ctx.beginPath(); ctx.roundRect(x + w * 0.3, y - 12, w * 0.4, 12, 6); ctx.fill();
      ctx.strokeStyle = '#f3cf5c'; ctx.lineWidth = 2;
      for (let i = 0; i < n * 3; i++) {
        const a = (i * 2.4) % TAU, rr = 4 + ((i * 7) % 18);
        const px = x + w + 14 + Math.cos(a) * rr, py = y + h - 6 + Math.sin(a) * rr * 0.4;
        ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py + 2); ctx.stroke();
      }
      ctx.restore();
    },
  };
  return self;
}

// Drag outward from the leaves to rip pieces off.
function tearGame({ pieces }) {
  let n = 0, start = null, cur = null, center = null;
  const bits = [];
  const self = {
    hint: 'Drag outward to tear off pieces',
    progress: () => n / pieces,
    update(dt) { for (const b of bits) b.t += dt; },
    down(x, y) { start = [x, y]; cur = [x, y]; },
    move(x, y) { if (start) cur = [x, y]; return null; },
    up(x, y) {
      if (!start) return null;
      const dx = x - start[0], dy = y - start[1];
      start = null;
      if (Math.hypot(dx, dy) < 45) return null;
      n++;
      bits.push({ x: center ? center[0] : x, y: center ? center[1] : y, dx, dy, t: 0 });
      if (n >= pieces) { self.done = true; self.q = 1; }
      return { sfx: 'pop' };
    },
    draw(ctx, g) {
      center = [g.x, g.y];
      ctx.save();
      for (const b of bits) {
        const k = Math.min(1, b.t * 2.5), a = Math.max(0, 1 - b.t * 1.5);
        ctx.globalAlpha = a; ctx.fillStyle = '#3f8f3a';
        ctx.beginPath(); ctx.ellipse(b.x + b.dx * k, b.y + b.dy * k, 9, 6, b.dx, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (start && cur) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(start[0], start[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
      }
      ctx.restore();
    },
  };
  return self;
}

// A power meter swings back and forth. Stop it in the green: too gentle does nothing, too hard gets shell in.
function crackGame() {
  let t = 0, shake = 0;
  const v = () => (Math.sin(t * 3.4 - Math.PI / 2) + 1) / 2;
  const ZONE = [0.62, 0.8];
  return {
    hint: 'Tap when the swing is in the green',
    noMeter: true,
    progress: () => 0,
    update(dt) { t += dt; shake = Math.max(0, shake - dt * 3); },
    itemOffset: () => [Math.sin(t * 60) * shake * 6, 0],
    down() {
      const p = v();
      if (p < ZONE[0]) { shake = 1; return { sfx: 'tick', msg: 'Too gentle. Try again.' }; }
      this.done = true;
      if (p <= ZONE[1]) { this.q = 1; return { sfx: 'chop', msg: 'A clean crack!' }; }
      this.q = 0.3;
      return { sfx: 'chop', msg: 'Too hard! Bits of shell got in.' };
    },
    draw(ctx, g) {
      const w = g.s * 2, x = g.x - g.s, y = g.y + g.s * 1.05;
      bar(ctx, x, y, w, 14, 0, ZONE);
      const px = x + w * v();
      ctx.save();
      ctx.fillStyle = '#2b211a'; ctx.beginPath(); ctx.moveTo(px, y - 4); ctx.lineTo(px - 7, y - 16); ctx.lineTo(px + 7, y - 16); ctx.closePath(); ctx.fill();
      ctx.fillRect(px - 1.5, y - 3, 3, 20);
      ctx.restore();
    },
  };
}

// Drag in circles. Used for whisking on the board and stirring in the bowl.
function circleGame({ turns, tool }) {
  let acc = 0, last = null, toolA = -Math.PI / 2, center = null, t = 0;
  const self = {
    hint: tool === 'whisk' ? 'Drag in circles to whisk' : 'Drag in circles to stir',
    progress: () => acc / (turns * TAU),
    update(dt) { t += dt; },
    down(x, y) { if (center) last = Math.atan2(y - center[1], x - center[0]); },
    move(x, y) {
      if (last == null || !center) return null;
      const a = Math.atan2(y - center[1], x - center[0]);
      let d = a - last;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      const before = Math.floor(acc / Math.PI);
      acc += Math.abs(d); last = a; toolA = a;
      if (acc >= turns * TAU) { self.done = true; self.q = 1; }
      return Math.floor(acc / Math.PI) > before ? { sfx: 'shake', hop: true } : null;
    },
    up() { last = null; return null; },
    draw(ctx, g) {
      center = [g.x, g.y];
      circleGuide(ctx, g.x, g.y, g.s * 1.05, self.progress(), t);
      const tx = g.x + Math.cos(toolA) * g.s * 0.45, ty = g.y + Math.sin(toolA) * g.s * 0.32;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(0.35);
      if (tool === 'whisk') {
        ctx.strokeStyle = '#c9cdd2'; ctx.lineWidth = 2;
        for (const k of [-0.5, -0.17, 0.17, 0.5]) { ctx.beginPath(); ctx.ellipse(0, g.s * 0.12, g.s * 0.16 * Math.abs(k * 2) + 2, g.s * 0.3, 0, 0, TAU); ctx.stroke(); }
        ctx.fillStyle = '#2b211a'; ctx.beginPath(); ctx.roundRect(-4, -g.s * 0.95, 8, g.s * 0.8, 4); ctx.fill();
      } else {
        ctx.fillStyle = '#c99556'; ctx.strokeStyle = 'rgba(80,45,15,0.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(-4, -g.s * 1.2, 8, g.s * 1.1, 4); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, g.s * 0.14, g.s * 0.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    },
  };
  return self;
}

// Flick upward on the pan to toss everything in it.
function flickGame({ flicks }) {
  let n = 0, start = null, t = 0;
  const self = {
    hint: 'Flick upward on the pan to toss',
    progress: () => n / flicks,
    update(dt) { t += dt; },
    down(x, y) { start = [x, y]; },
    move(x, y) {
      if (!start || start[1] - y < 55) return null;
      start = null;
      n++;
      if (n >= flicks) { self.done = true; self.q = 1; }
      return { sfx: 'sizzle', hop: true };
    },
    up() { start = null; return null; },
    draw(ctx, g) {
      const k = (t * 1.2) % 1, y = g.y + g.s * 0.6 - k * g.s * 1.2;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(g.x, y + g.s * 0.5); ctx.lineTo(g.x, y); ctx.moveTo(g.x - 14, y + 14); ctx.lineTo(g.x, y); ctx.lineTo(g.x + 14, y + 14); ctx.stroke();
      ctx.restore();
    },
  };
  return self;
}

const GAMES = { knife: knifeGame, rock: rockGame, grate: grateGame, tear: tearGame, crack: crackGame, circle: circleGame, flick: flickGame };

export function createGame(kind, opts = {}) {
  const g = GAMES[kind](opts);
  g.kind = kind;
  return g;
}
