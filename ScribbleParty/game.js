// Trystero lets whichever peer has the smaller id start each connection, but a page
// that has been open for more than about a minute can't start one anymore (its pooled
// offers go stale). So the host, who has been there longest, often never connected to
// people who joined mid-game. Starting each id with a countdown from the join time gives
// newer pages smaller ids, so the newcomer, whose offers are fresh, always goes first.
// Trystero builds the id from the first 20 Math.random() calls when it loads.
const idPrefix = String(9999999999 - Math.floor(Date.now() / 1000)).padStart(10, '0');
const realRandom = Math.random;
let idChars = 0;
Math.random = () => idChars < idPrefix.length ? (Number(idPrefix[idChars++]) + 0.5) / 62 : realRandom();
const { joinRoom, selfId } = await import('https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm');
Math.random = realRandom;

// ---------- Settings ----------
const APP_ID = 'jasonphe-scribble-party';
const CHOOSE_MS = 15000;
const DRAW_TIMES = [30, 45, 60, 80, 100, 120, 150, 180]; // seconds
const DEFAULT_DRAW = 80;
const clampDraw = v => DRAW_TIMES.includes(Number(v)) ? Number(v) : DEFAULT_DRAW;
const REVEAL_MS = 6000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Default words live in words.txt (one per line) so they're easy to edit.
let defaultWords = [];
const FALLBACK_WORDS = ['apple', 'cat', 'house', 'sun', 'tree', 'car', 'fish', 'star', 'boat'];
fetch('words.txt')
  .then(r => r.ok ? r.text() : Promise.reject(r.status))
  .then(t => { defaultWords = parseWords(t); })
  .catch(e => console.warn('Could not load words.txt', e));

const COLORS = ['#1f1f1f', '#868e96', '#e03131', '#f76707', '#fcc419', '#2f9e44', '#1c7ed6', '#7048e8', '#e64980', '#8b5a2b'];
const SIZES = [0.006, 0.014, 0.03, 0.06];
const AVATAR_COLORS = ['#ff6b6b', '#f59f00', '#37b24d', '#1c7ed6', '#7048e8', '#e64980', '#0ca678', '#d9480f'];

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};
// Compare guesses loosely: ignore case, accents, spaces and punctuation.
const norm = s => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const isLetter = c => /[\p{L}\p{N}]/u.test(c);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const MAX_DELAY = 60;
const clampDelay = v => Math.min(MAX_DELAY, Math.max(0, Math.round(Number(v)) || 0));
const MAX_PENALTY = 50;
const clampPenalty = v => Math.min(MAX_PENALTY, Math.max(0, Math.round(Number(v)) || 0));

// Splits a word list on commas or new lines, dropping blanks and duplicates.
function parseWords(text) {
  const seen = new Set();
  return String(text).split(/[,\n]/).map(w => cleanText(w, 40)).filter(w => {
    const k = norm(w);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function avatarColor(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}
let audio;
function ding(freqs = [660, 880]) {
  try {
    audio ??= new AudioContext();
    freqs.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      const t = audio.currentTime + i * 0.1;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(audio.destination);
      o.start(t); o.stop(t + 0.3);
    });
  } catch { }
}

// ---------- Join screen ----------
const codeFromHash = () => location.hash.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const newCode = () => Array.from({ length: 4 }, () => pick(CODE_CHARS)).join('');
let hashCode = codeFromHash();

$('nameInput').value = store.get('scribble-name') || '';
function showJoinMode() {
  $('joinExisting').classList.toggle('hidden', !hashCode);
  $('joinFresh').classList.toggle('hidden', !!hashCode);
  $('joinBtn').textContent = `Join room ${hashCode}`;
}
showJoinMode();
$('newInstead').onclick = () => { hashCode = ''; history.replaceState(null, '', cleanPath()); showJoinMode(); };

function getName() {
  const n = cleanText($('nameInput').value, 16);
  if (!n) { $('nameInput').focus(); toast('Pick a name first'); return null; }
  store.set('scribble-name', n);
  return n;
}
// ---------- Avatar ----------
// The avatar is drawn on a pad and saved as its strokes, so it can be edited later.
// Other players get a small JPEG of it.
const AVATAR_PX = 96;
const AVATAR_SIZES = [0.02, 0.045, 0.09, 0.16];
const AVATAR_MAX = 40000;
const cleanAvatar = a => typeof a === 'string' && a.length < AVATAR_MAX && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a) ? a : null;
let avatarStrokes = [];
try { avatarStrokes = JSON.parse(store.get('scribble-avatar') || '[]'); } catch { }
if (!Array.isArray(avatarStrokes)) avatarStrokes = [];

function paintAvatar(c, list) {
  const g = c.getContext('2d'), W = c.width;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, W);
  g.lineCap = g.lineJoin = 'round';
  for (const s of list) {
    const p = s.p;
    g.strokeStyle = g.fillStyle = s.c;
    g.lineWidth = s.w * W;
    g.beginPath();
    if (p.length === 2) {
      g.arc(p[0] * W, p[1] * W, g.lineWidth / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.moveTo(p[0] * W, p[1] * W);
    for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * W, p[i + 1] * W);
    g.stroke();
  }
}
function avatarUrl(list) {
  if (!list.length) return null;
  const c = el('canvas', { width: AVATAR_PX, height: AVATAR_PX });
  paintAvatar(c, list);
  return c.toDataURL('image/jpeg', 0.85);
}
let myAvatar = avatarUrl(avatarStrokes);

// An avatar circle: the player's drawing, or the first letter of their name.
function avatarEl(id, name, url) {
  const av = el('span', { className: 'avatar' });
  if (url) av.append(el('img', { src: url, alt: '' }));
  else {
    av.textContent = name?.[0]?.toUpperCase() || '?';
    av.style.background = avatarColor(id);
  }
  return av;
}
function renderAvatarPreview() {
  $('avatarPreview').replaceWith(Object.assign(avatarEl(selfId, cleanText($('nameInput').value, 16), myAvatar), { id: 'avatarPreview' }));
}
renderAvatarPreview();
$('nameInput').addEventListener('input', renderAvatarPreview);
$('avatarBtn').onclick = openAvatarEditor;

let pad;
function setupAvatarPad() {
  const c = $('avatarPad');
  pad = { c, strokes: [], color: COLORS[0], size: AVATAR_SIZES[1], cur: null };
  const redrawPad = () => paintAvatar(c, pad.strokes);
  pad.redraw = redrawPad;
  const pos = e => {
    const r = c.getBoundingClientRect();
    const f = v => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    return [f((e.clientX - r.left) / r.width), f((e.clientY - r.top) / r.height)];
  };
  c.addEventListener('pointerdown', e => {
    c.setPointerCapture(e.pointerId);
    pad.cur = { c: pad.color, w: pad.size, p: pos(e) };
    pad.strokes.push(pad.cur);
    redrawPad();
  });
  c.addEventListener('pointermove', e => {
    if (!pad.cur) return;
    for (const ev of e.getCoalescedEvents?.() ?? [e]) pad.cur.p.push(...pos(ev));
    redrawPad();
  });
  const end = () => { pad.cur = null; };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);

  const sw = $('avatarSwatches');
  for (const col of [...COLORS, '#ffffff']) {
    const b = el('button', { type: 'button', className: 'swatch' + (col === '#ffffff' ? ' eraser' : ''), title: col === '#ffffff' ? 'Eraser' : col });
    if (col === '#ffffff') b.textContent = '🧽'; else b.style.background = col;
    b.onclick = () => { pad.color = col; sw.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b)); };
    if (col === pad.color) b.classList.add('on');
    sw.append(b);
  }
  const sz = $('avatarSizes');
  AVATAR_SIZES.forEach((s, i) => {
    const b = el('button', { type: 'button', className: 'size', title: ['Thin', 'Medium', 'Thick', 'Huge'][i] });
    const dot = el('i');
    dot.style.width = dot.style.height = `${[4, 8, 14, 22][i]}px`;
    b.append(dot);
    b.onclick = () => { pad.size = s; sz.querySelectorAll('.size').forEach(x => x.classList.toggle('on', x === b)); };
    if (s === pad.size) b.classList.add('on');
    sz.append(b);
  });
  $('avatarUndo').onclick = () => { pad.strokes.pop(); redrawPad(); };
  $('avatarClear').onclick = () => { pad.strokes = []; redrawPad(); };
  $('avatarDialog').addEventListener('close', () => {
    if ($('avatarDialog').returnValue === 'save') saveAvatar(pad.strokes);
  });
}
function openAvatarEditor() {
  if (!pad) setupAvatarPad();
  pad.strokes = structuredClone(avatarStrokes);
  pad.redraw();
  $('avatarDialog').returnValue = '';
  $('avatarDialog').showModal();
}
function saveAvatar(list) {
  avatarStrokes = list;
  store.set('scribble-avatar', JSON.stringify(list));
  myAvatar = avatarUrl(list);
  renderAvatarPreview();
  const mine = peers.get(selfId);
  if (mine) {
    mine.a = myAvatar;
    send('hello', me());
    render();
  }
}

$('createBtn').onclick = () => {
  const n = getName();
  if (n) start(n, newCode());
};
$('joinForm').onsubmit = e => {
  e.preventDefault();
  const n = getName();
  if (!n) return;
  const code = hashCode || $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3) { $('codeInput').focus(); toast('Enter a room code'); return; }
  start(n, code);
};

// ---------- Game state ----------
let room, act = {};
let roomCode;
const peers = new Map();          // id -> { name, t, a } (includes me; a is the avatar image)
let hostId = selfId;
let pub = { phase: 'lobby', players: [], drawer: null, hint: '', len: 0, endsIn: 0, round: 0, rounds: 3, queue: [], word: null, gains: null, custom: null, hints: true, delay: 0, penalty: 0, drawTime: DEFAULT_DRAW, opensIn: 0 };
let guessOpen = 0;                // local clock time guessers can start guessing
let deadline = 0;                 // local clock time the current phase ends
let secret = {};                  // { choices } or { word } sent only to the drawer
let strokes = [];                 // [{ i, c, w, p: [x, y, ...] }]
const H = { scores: {}, word: null, choices: [], deadline: 0, guessed: new Set(), gains: {}, revealed: new Set(), guessFrom: 0, custom: [], only: false, used: new Set() };

const isHost = () => hostId === selfId;
const inGame = () => pub.phase !== 'lobby' && pub.phase !== 'over';
const nameOf = id => peers.get(id)?.name ?? pub.players.find(p => p.id === id)?.name ?? 'Someone';
const iAmDrawer = () => pub.drawer === selfId && pub.phase === 'draw';

// Drop "index.html" so shared links look like /ScribbleParty/#CODE.
const cleanPath = () => location.pathname.replace(/index\.html$/, '');
function inviteUrl() { return `${location.origin}${cleanPath()}#${roomCode}`; }
async function copyInvite() {
  const url = inviteUrl();
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Scribble Party', text: `Join my Scribble Party room ${roomCode}`, url }); return; } catch { }
  }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  catch { prompt('Copy this link:', url); }
}
$('copyTop').onclick = copyInvite;
$('endBtn').onclick = () => {
  if (!isHost() || !inGame() || !confirm('End the game now? Scores so far will be final.')) return;
  broadcastMsg({ k: 'sys', x: `${nameOf(selfId)} ended the game.` });
  endGame();
};

function start(name, code) {
  roomCode = code;
  history.replaceState(null, '', `${cleanPath()}#${code}`);
  window.addEventListener('hashchange', () => location.reload());
  $('join').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomCode').textContent = code;
  document.title = `Scribble Party · ${code}`;

  peers.set(selfId, { name, t: Date.now(), a: myAvatar });
  setupCanvas();
  setupTools();
  connect();
  render();
  setInterval(tick, 250);
}

// ---------- Networking ----------
function connect() {
  room = joinRoom({ appId: APP_ID }, roomCode);
  for (const name of ['hello', 'st', 'sec', 'pick', 'dr', 'ud', 'clr', 'snap', 'msg', 'gs', 'go']) {
    act[name] = room.makeAction(name);
    act[name].onMessage = (data, meta) => {
      const from = typeof meta === 'string' ? meta : meta?.peerId;
      if (from) handlers[name](data, from);
    };
  }
  room.onPeerJoin = id => send('hello', me(), id);
  room.onPeerLeave = id => {
    const wasHost = id === hostId;
    const name = peers.get(id)?.name;
    peers.delete(id);
    electHost();
    if (name) sysMsg(`${name} left`);
    if (isHost()) {
      if (wasHost) takeOverAsHost();
      else if (pub.drawer === id && (pub.phase === 'choose' || pub.phase === 'draw')) endTurn(true);
      else hostSync();
    }
    render();
  };
}
const me = () => ({ n: peers.get(selfId).name, t: peers.get(selfId).t, a: myAvatar });
function send(name, data, target) {
  try { act[name].send(data, target ? { target } : undefined); } catch (e) { console.warn(name, e); }
}
// Send to the host, or handle directly if that's me.
function toHost(name, data) {
  if (isHost()) handlers[name](data, selfId);
  else send(name, data, hostId);
}

// The host is whoever has been in the room longest.
function electHost() {
  let best = null;
  for (const [id, p] of peers) {
    if (!best || p.t < best.t || (p.t === best.t && id < best.id)) best = { id, t: p.t };
  }
  hostId = best.id;
}

const handlers = {
  hello(d, from) {
    const isNew = !peers.has(from);
    peers.set(from, { name: cleanText(d?.n, 16) || 'Player', t: Number(d?.t) || Date.now(), a: cleanAvatar(d?.a) });
    const wasHost = isHost();
    electHost();
    if (isNew) sysMsg(`${nameOf(from)} joined`);
    if (isHost()) {
      // Someone joining mid-game gets a turn to draw at the end of this round.
      if (isNew && wasHost && inGame() && from !== pub.drawer && !pub.queue.includes(from)) {
        pub.queue.push(from);
        sendMsg({ k: 'sys', x: "You joined mid-game! You'll get a turn to draw this round." }, from);
      }
      if (!wasHost) takeOverAsHost();
      else hostSync();
      if (pub.phase === 'draw' && strokes.length) send('snap', strokes, from);
    }
    render();
  },
  st(d, from) {
    if (from !== hostId && from !== selfId) return;
    const prevPhase = pub.phase, prevDrawer = pub.drawer;
    pub = d;
    deadline = Date.now() + (d.endsIn || 0);
    guessOpen = Date.now() + (d.opensIn || 0);
    if (pub.phase !== prevPhase || pub.drawer !== prevDrawer) {
      if (pub.phase !== 'draw' && pub.phase !== 'choose') secret = {};
      if (pub.phase === 'choose') strokes = [], redraw();
      onPhaseChange(prevPhase);
    }
    render();
  },
  sec(d, from) {
    if (from !== hostId && from !== selfId) return;
    secret = d || {};
    render();
  },
  snap(d, from) {
    if (from !== hostId || !Array.isArray(d)) return;
    strokes = d;
    redraw();
  },
  dr(d, from) {
    if (from !== pub.drawer || !d || !Array.isArray(d.p)) return;
    let s = strokes.find(s => s.i === d.i);
    if (!s) { s = { i: d.i, c: d.c, w: d.w, p: [] }; strokes.push(s); }
    const startIdx = s.p.length;
    s.p.push(...d.p);
    drawStroke(s, startIdx);
  },
  ud(d, from) {
    if (from !== pub.drawer) return;
    strokes = strokes.filter(s => s.i !== d);
    redraw();
  },
  clr(_, from) {
    if (from !== pub.drawer && from !== hostId) return;
    strokes = [];
    redraw();
  },
  msg(d, from) {
    if (from !== hostId && from !== selfId) return;
    addLog(d);
    if (d.k === 'ok') ding();
  },
  // ----- host-only below -----
  go(d, from) {
    // Only the host starts games, and only between games.
    if (!isHost() || from !== selfId || (pub.phase !== 'lobby' && pub.phase !== 'over')) return;
    startGame(d);
  },
  pick(d, from) {
    if (!isHost() || pub.phase !== 'choose' || from !== pub.drawer) return;
    const w = H.choices[Number(d)];
    if (w) startDraw(w);
  },
  gs(d, from) {
    if (!isHost()) return;
    const text = cleanText(d, 60);
    if (!text) return;
    const name = nameOf(from);
    if (pub.phase !== 'draw') return broadcastMsg({ k: 'chat', n: name, x: text });
    if (from === pub.drawer || H.guessed.has(from)) {
      // Only people who already know the word can see this.
      const msg = { k: 'secret', n: name, x: text };
      for (const id of [pub.drawer, ...H.guessed]) sendMsg(msg, id);
      return;
    }
    if (Date.now() < H.guessFrom) return; // guessing isn't open yet
    const g = norm(text), w = norm(H.word);
    if (g === w) {
      const frac = Math.max(0, (H.deadline - Date.now()) / (pub.drawTime * 1000));
      const pts = 50 + Math.round(50 * frac) + Math.max(0, 20 - 5 * H.guessed.size);
      H.guessed.add(from);
      H.gains[from] = (H.gains[from] || 0) + pts;
      H.gains[pub.drawer] = (H.gains[pub.drawer] || 0) + 20;
      H.scores[from] = (H.scores[from] || 0) + pts;
      H.scores[pub.drawer] = (H.scores[pub.drawer] || 0) + 20;
      broadcastMsg({ k: 'ok', x: `${name} guessed the word! +${pts}` });
      sendMsg({ k: 'ok', x: `You got it: ${H.word}` }, from);
      const guessers = [...peers.keys()].filter(id => id !== pub.drawer);
      if (guessers.every(id => H.guessed.has(id))) endTurn();
      else hostSync();
      return;
    }
    broadcastMsg({ k: 'chat', n: name, x: text });
    // Wrong guesses cost points, but a score never drops below zero.
    const loss = Math.min(pub.penalty, H.scores[from] || 0);
    if (loss) {
      H.scores[from] -= loss;
      H.gains[from] = (H.gains[from] || 0) - loss;
      hostSync();
    }
    if (w.length > 3 && lev(g, w) === 1) sendMsg({ k: 'close', x: `"${text}" is really close!` }, from);
  },
};

function sendMsg(msg, id) {
  if (id === selfId) handlers.msg(msg, selfId);
  else send('msg', msg, id);
}
function broadcastMsg(msg) {
  send('msg', msg);
  handlers.msg(msg, selfId);
}
function sysMsg(text) { addLog({ k: 'sys', x: text }); }

// ---------- Host logic ----------
function hostSync() {
  const order = [...peers.entries()].sort((a, b) => a[1].t - b[1].t);
  pub.players = order.map(([id, p]) => ({ id, name: p.name, score: H.scores[id] || 0, g: H.guessed.has(id) }));
  pub.endsIn = Math.max(0, H.deadline - Date.now());
  pub.opensIn = pub.phase === 'draw' ? Math.max(0, H.guessFrom - Date.now()) : 0;
  pub.queue = pub.queue.filter(id => peers.has(id));
  send('st', pub);
  handlers.st(structuredClone(pub), selfId);
}

function takeOverAsHost() {
  H.scores = Object.fromEntries(pub.players.map(p => [p.id, p.score]));
  H.guessed = new Set();
  if (pub.phase === 'choose' || pub.phase === 'draw' || pub.phase === 'reveal') {
    // The old host had the secret word, so skip to the next turn.
    broadcastMsg({ k: 'sys', x: 'The host left, so skipping to the next turn.' });
    nextTurn();
  } else {
    hostSync();
  }
}

function startGame({ rounds, words, only, hints, delay, penalty, drawTime }) {
  rounds = Math.min(5, Math.max(1, Number(rounds) || 3));
  H.custom = parseWords(words || '');
  H.only = !!only && H.custom.length >= 3;
  H.used = new Set();
  pub.custom = H.custom.length ? { n: H.custom.length, only: H.only } : null;
  pub.hints = hints !== false;
  pub.delay = clampDelay(delay);
  pub.penalty = clampPenalty(penalty);
  pub.drawTime = clampDraw(drawTime);
  H.scores = {};
  pub.rounds = rounds;
  pub.round = 1;
  pub.queue = [...peers.entries()].sort((a, b) => a[1].t - b[1].t).map(([id]) => id);
  broadcastMsg({ k: 'sys', x: `New game! ${rounds} round${rounds > 1 ? 's' : ''}.` });
  nextTurn();
}

function endGame() {
  pub.phase = 'over';
  pub.drawer = null;
  pub.word = null;
  H.word = null;
  H.deadline = 0;
  H.guessed.clear();
  hostSync();
}

function nextTurn() {
  pub.queue = pub.queue.filter(id => peers.has(id));
  if (!pub.queue.length) {
    pub.round++;
    if (pub.round > pub.rounds || peers.size < 2) return endGame();
    pub.queue = [...peers.entries()].sort((a, b) => a[1].t - b[1].t).map(([id]) => id);
  }
  pub.drawer = pub.queue.shift();
  pub.phase = 'choose';
  pub.word = null;
  pub.gains = null;
  pub.hint = '';
  H.word = null;
  H.guessed.clear();
  H.gains = {};
  H.choices = chooseWords();
  H.deadline = Date.now() + CHOOSE_MS;
  send('clr', null);
  strokes = [];
  redraw();
  hostSync();
  sendSecret({ choices: H.choices });
}

function sendSecret(d) {
  if (pub.drawer === selfId) handlers.sec(d, selfId);
  else send('sec', d, pub.drawer);
}

// Picks 3 words for the drawer. Custom words get one slot each turn
// (or all three with "only my words"), and nothing repeats until the pool runs out.
function chooseWords() {
  const defaults = defaultWords.length ? defaultWords : FALLBACK_WORDS;
  const fresh = list => { const f = list.filter(w => !H.used.has(norm(w))); return f.length ? f : list; };
  let picks;
  if (H.only) {
    picks = shuffle(fresh(H.custom)).slice(0, 3);
  } else {
    const mine = H.custom.length ? shuffle(fresh(H.custom)).slice(0, 1) : [];
    const rest = shuffle(fresh(defaults)).filter(w => !mine.some(m => norm(m) === norm(w)));
    picks = shuffle([...mine, ...rest.slice(0, 3 - mine.length)]);
  }
  picks.forEach(w => H.used.add(norm(w)));
  return picks;
}

function mask(word, revealed) {
  return [...word].map((ch, i) => !isLetter(ch) || revealed.has(i) ? ch : '_').join('');
}

function startDraw(word) {
  H.word = word;
  H.revealed = new Set();
  // The guess delay is a head start for the drawer on top of the normal drawing time.
  H.guessFrom = Date.now() + pub.delay * 1000;
  H.deadline = H.guessFrom + pub.drawTime * 1000;
  pub.phase = 'draw';
  // With hints off, guessers get no blanks, letter count or revealed letters.
  pub.hint = pub.hints ? mask(word, H.revealed) : '';
  pub.len = pub.hints ? norm(word).length : 0;
  hostSync();
  sendSecret({ word });
}

function endTurn(drawerLeft) {
  if (pub.phase === 'choose' || !H.word) return nextTurn();
  pub.phase = 'reveal';
  pub.word = H.word;
  pub.gains = H.gains;
  H.deadline = Date.now() + REVEAL_MS;
  if (drawerLeft) broadcastMsg({ k: 'sys', x: 'The artist left!' });
  broadcastMsg({ k: 'sys', x: `The word was "${H.word}"` });
  hostSync();
}

function tick() {
  renderTimer();
  if (!isHost()) return;
  const now = Date.now();
  if (pub.phase === 'choose') {
    if (!peers.has(pub.drawer)) nextTurn();
    else if (now > H.deadline) startDraw(pick(H.choices));
  } else if (pub.phase === 'draw') {
    if (!peers.has(pub.drawer)) return endTurn(true);
    if (now > H.deadline) return endTurn();
    // Reveal a letter at 50% and 75% of the time, for longer words.
    const frac = (now - H.guessFrom) / (pub.drawTime * 1000);
    const letters = [...H.word].map((c, i) => isLetter(c) ? i : -1).filter(i => i >= 0 && !H.revealed.has(i));
    const want = pub.hints && norm(H.word).length > 3 ? (frac > 0.75 ? 2 : frac > 0.5 ? 1 : 0) : 0;
    if (H.revealed.size < want && letters.length > 1) {
      H.revealed.add(pick(letters));
      pub.hint = mask(H.word, H.revealed);
      hostSync();
    }
  } else if (pub.phase === 'reveal') {
    if (now > H.deadline) nextTurn();
  }
}

// ---------- Drawing ----------
let canvas, ctx;
let color = COLORS[0], size = SIZES[1];
let current = null, pending = [], strokeN = 0;

function setupCanvas() {
  canvas = $('canvas');
  ctx = canvas.getContext('2d');
  new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    redraw();
  }).observe($('board'));

  const pos = e => {
    const r = canvas.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
  };
  canvas.addEventListener('pointerdown', e => {
    if (!iAmDrawer()) return;
    canvas.setPointerCapture(e.pointerId);
    current = { i: `${selfId}:${strokeN++}`, c: color, w: size, p: pos(e) };
    strokes.push(current);
    pending = [...current.p];
    drawStroke(current, 0);
  });
  canvas.addEventListener('pointermove', e => {
    if (!current) return;
    const evs = e.getCoalescedEvents?.() ?? [e];
    const startIdx = current.p.length;
    for (const ev of evs) {
      const [x, y] = pos(ev);
      const n = current.p.length;
      if (current.p[n - 2] === x && current.p[n - 1] === y) continue;
      current.p.push(x, y);
      pending.push(x, y);
    }
    drawStroke(current, startIdx);
  });
  const end = () => { if (current) { flush(); current = null; } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  setInterval(flush, 50);
}

function flush() {
  if (!current || !pending.length) return;
  send('dr', { i: current.i, c: current.c, w: current.w, p: pending });
  pending = [];
}

// Draws points of a stroke starting at array index `from` (in x,y pairs).
function drawStroke(s, from) {
  const W = canvas.width, Hh = canvas.height, p = s.p;
  if (p.length < 2) return;
  ctx.strokeStyle = ctx.fillStyle = s.c;
  ctx.lineWidth = s.w * W;
  ctx.lineCap = ctx.lineJoin = 'round';
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0] * W, p[1] * Hh, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const i0 = Math.max(0, from - 2);
  ctx.beginPath();
  ctx.moveTo(p[i0] * W, p[i0 + 1] * Hh);
  for (let i = i0 + 2; i < p.length; i += 2) ctx.lineTo(p[i] * W, p[i + 1] * Hh);
  ctx.stroke();
}

function redraw() {
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of strokes) drawStroke(s, 0);
}

function setupTools() {
  const sw = $('swatches');
  for (const c of [...COLORS, '#ffffff']) {
    const b = el('button', { className: 'swatch' + (c === '#ffffff' ? ' eraser' : ''), title: c === '#ffffff' ? 'Eraser' : c });
    if (c === '#ffffff') b.textContent = '🧽'; else b.style.background = c;
    b.onclick = () => { color = c; sw.querySelectorAll('.swatch').forEach(x => x.classList.toggle('on', x === b)); };
    if (c === color) b.classList.add('on');
    sw.append(b);
  }
  const sz = $('sizes');
  SIZES.forEach((s, i) => {
    const b = el('button', { className: 'size', title: ['Thin', 'Medium', 'Thick', 'Huge'][i] });
    const dot = el('i');
    dot.style.width = dot.style.height = `${[4, 8, 14, 22][i]}px`;
    b.append(dot);
    b.onclick = () => { size = s; sz.querySelectorAll('.size').forEach(x => x.classList.toggle('on', x === b)); };
    if (s === size) b.classList.add('on');
    sz.append(b);
  });
  $('undoBtn').onclick = () => {
    if (!iAmDrawer()) return;
    const mine = strokes.filter(s => s.i.startsWith(selfId + ':'));
    const last = mine[mine.length - 1];
    if (!last) return;
    strokes = strokes.filter(s => s !== last);
    send('ud', last.i);
    redraw();
  };
  $('clearBtn').onclick = () => {
    if (!iAmDrawer() || !strokes.length) return;
    strokes = [];
    send('clr', null);
    redraw();
  };
  $('guessForm').onsubmit = e => {
    e.preventDefault();
    const v = cleanText($('guessInput').value, 60);
    if (!v) return;
    $('guessInput').value = '';
    toHost('gs', v);
  };
}

// ---------- Rendering ----------
function onPhaseChange(prev) {
  if (pub.phase === 'draw' && pub.drawer !== selfId) {
    $('guessInput').focus({ preventScroll: true });
  }
  if (pub.phase === 'choose' && pub.drawer === selfId) ding([520, 660, 780]);
  if (pub.phase === 'over' && prev !== 'over') ding([523, 659, 784, 1047]);
}

function addLog({ k, n, x }) {
  const log = $('log');
  const li = el('li', { className: `m-${k || 'chat'}` });
  if (n) li.append(el('b', { textContent: n + ': ' }));
  li.append(x ?? '');
  log.append(li);
  while (log.children.length > 150) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// Guessers can't type until the guess delay is over.
function renderGuessLock() {
  const gi = $('guessInput');
  const guessing = pub.phase === 'draw' && pub.drawer !== selfId && !pub.players.find(p => p.id === selfId)?.g;
  const wait = guessing ? Math.ceil((guessOpen - Date.now()) / 1000) : 0;
  const locked = wait > 0;
  if (locked) gi.placeholder = `Guessing opens in ${wait}…`;
  else if (gi.disabled) {
    gi.placeholder = 'Type your guess…';
    gi.disabled = false;
    gi.focus({ preventScroll: true });
  }
  gi.disabled = locked;
  gi.form.querySelector('button').disabled = locked;
}

function renderTimer() {
  renderGuessLock();
  const t = $('timer');
  const active = pub.phase === 'choose' || pub.phase === 'draw';
  t.classList.toggle('hidden', !active);
  if (!active) return;
  const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  t.textContent = s;
  t.classList.toggle('low', pub.phase === 'draw' && s <= 10);
}

function render() {
  const n = peers.size;
  $('status').textContent = n > 1 ? `${n} players` : 'Waiting for friends…';

  // Word / hint
  const hint = $('hint');
  hint.replaceChildren();
  if (pub.phase === 'draw') {
    if (pub.drawer === selfId && secret.word) {
      hint.append(`✏️ ${secret.word}`);
    } else if (!pub.hints) {
      hint.append(el('small', { textContent: 'Guess the word!' }));
    } else {
      hint.append([...pub.hint].map(c => c === ' ' ? ' ' : c).join(' '));
      hint.append(el('small', { textContent: `(${pub.len})` }));
    }
  } else if (pub.phase === 'choose') {
    hint.append(el('small', { textContent: pub.drawer === selfId ? 'Pick a word!' : `${nameOf(pub.drawer)} is choosing…` }));
  } else if (pub.phase === 'reveal') {
    hint.append(pub.word || '');
  }

  $('endBtn').classList.toggle('hidden', !isHost() || !inGame());
  $('roundLabel').textContent = inGame() ? `Round ${Math.min(pub.round, pub.rounds)}/${pub.rounds}` : '';

  // Players
  const list = $('players');
  list.replaceChildren();
  const shown = [...pub.players];
  for (const [id, p] of peers) if (!shown.some(s => s.id === id)) shown.push({ id, name: p.name, score: 0 });
  for (const p of shown) {
    const li = el('li', { className: (p.id === selfId ? 'me ' : '') + (p.g ? 'got' : '') });
    const av = avatarEl(p.id, p.name, peers.get(p.id)?.a);
    if (p.id === selfId) {
      av.classList.add('editable');
      av.title = 'Draw your avatar';
      av.onclick = openAvatarEditor;
    }
    li.append(av, el('span', { className: 'pname', textContent: p.name + (p.id === selfId ? ' (you)' : '') }));
    if (p.id === hostId) li.append(el('span', { className: 'tag', title: 'Host', textContent: '👑' }));
    if (p.id === pub.drawer && (pub.phase === 'draw' || pub.phase === 'choose')) li.append(el('span', { className: 'tag', title: 'Drawing', textContent: '✏️' }));
    if (p.g) li.append(el('span', { className: 'tag', title: 'Guessed it', textContent: '✅' }));
    li.append(el('span', { className: 'score', textContent: p.score }));
    list.append(li);
  }

  // Tools & input
  $('tools').classList.toggle('hidden', !iAmDrawer());
  canvas?.classList.toggle('can-draw', iAmDrawer());
  const gi = $('guessInput');
  gi.placeholder = pub.phase === 'draw'
    ? (pub.drawer === selfId ? 'Chat with people who guessed…' : pub.players.find(p => p.id === selfId)?.g ? 'You got it! Chat with other finishers…' : 'Type your guess…')
    : 'Say something…';

  renderOverlay();
  renderTimer();
}

function renderOverlay() {
  const ov = $('overlay');
  // Remember focus so the host can keep typing custom words while people join.
  const focused = settings && [settings.words, settings.delay, settings.penalty].find(x => x === document.activeElement);
  const sel = focused && focused === settings.words && [focused.selectionStart, focused.selectionEnd];
  const scroll = ov.scrollTop;
  ov.replaceChildren();
  const box = el('div');
  let show = true;

  if (pub.phase === 'lobby') {
    box.append(el('h2', { textContent: 'Waiting room' }));
    box.append(el('p', { textContent: peers.size < 2 ? 'Send this link to friends so they can join.' : `${peers.size} players are here.` }));
    box.append(inviteBox());
    box.append(hostControls('Start game'));
  } else if (pub.phase === 'choose') {
    if (pub.drawer === selfId && secret.choices) {
      box.append(el('h2', { textContent: 'Your turn to draw!' }));
      box.append(el('p', { textContent: 'Pick a word:' }));
      const row = el('div', { className: 'choices' });
      secret.choices.forEach((w, i) => {
        const b = el('button', { className: 'btn', textContent: w });
        b.onclick = () => { toHost('pick', i); row.querySelectorAll('button').forEach(x => x.disabled = true); };
        row.append(b);
      });
      box.append(row);
    } else {
      box.append(el('h2', { textContent: `${nameOf(pub.drawer)} is picking a word…` }));
      box.append(el('p', { textContent: 'Get ready to guess!' }));
    }
  } else if (pub.phase === 'reveal') {
    box.append(el('p', { textContent: 'The word was' }));
    box.append(el('div', { className: 'big-word', textContent: pub.word }));
    const ul = el('ul', { className: 'gains' });
    const rows = pub.players.filter(p => peers.has(p.id)).map(p => [p, pub.gains?.[p.id] || 0]).sort((a, b) => b[1] - a[1]);
    for (const [p, g] of rows) {
      ul.append(el('li', {}, el('span', { textContent: p.name }), el('span', { className: g > 0 ? 'plus' : g < 0 ? 'minus' : 'zero', textContent: g > 0 ? `+${g}` : g < 0 ? `−${-g}` : '+0' })));
    }
    box.append(ul);
  } else if (pub.phase === 'over') {
    box.append(el('h2', { textContent: 'Game over!' }));
    const ranked = [...pub.players].filter(p => peers.has(p.id)).sort((a, b) => b.score - a.score);
    const pod = el('div', { className: 'podium' });
    const slots = [[ranked[1], 'p2', '🥈'], [ranked[0], 'p1', '🥇'], [ranked[2], 'p3', '🥉']];
    for (const [p, cls, medal] of slots) {
      if (!p) continue;
      pod.append(el('div', { className: cls }, avatarEl(p.id, p.name, peers.get(p.id)?.a), `${medal} ${p.name}`, el('span', { textContent: `${p.score} pts` })));
    }
    box.append(pod);
    box.append(hostControls('Play again'));
  } else {
    show = false;
  }

  ov.classList.toggle('hidden', !show);
  if (show) ov.append(box);
  ov.scrollTop = scroll;
  if (focused && box.contains(focused)) {
    focused.focus({ preventScroll: true });
    if (sel) focused.setSelectionRange(...sel);
  }
}

function inviteBox() {
  const row = el('div', { className: 'invite' });
  row.append(el('span', { className: 'invite-link', textContent: inviteUrl() }));
  const b = el('button', { className: 'btn small', textContent: 'Copy link' });
  b.onclick = copyInvite;
  row.append(b);
  return row;
}

// One settings line: the label and optional info icon on the left, the control on the right.
function settingRow(control, label, info, forId = control?.id) {
  const row = el('div', { className: 'setting-row' }, el('label', { htmlFor: forId }, ...[label].flat()));
  if (info) row.append(infoIcon(info));
  if (control) row.append(control);
  return row;
}

// A small "i" that shows its text on hover, or on tap for touch screens.
function infoIcon(text) {
  const tip = el('span', { className: 'tip', role: 'tooltip', textContent: text });
  const btn = el('button', { type: 'button', className: 'info', ariaLabel: 'More info', textContent: 'i' });
  btn.onclick = e => {
    e.preventDefault();
    const open = !btn.classList.contains('open');
    document.querySelectorAll('.info.open').forEach(b => b.classList.remove('open'));
    btn.classList.toggle('open', open);
  };
  return el('span', { className: 'info-wrap' }, btn, tip);
}
document.addEventListener('click', e => {
  if (!e.target.closest('.info')) document.querySelectorAll('.info.open').forEach(b => b.classList.remove('open'));
});

// The host's settings are built once and reused, so re-rendering the lobby
// (e.g. when someone joins) doesn't wipe what the host is typing.
let settings;
function hostSettings() {
  if (settings) return settings;
  const rounds = el('select', { id: 'setRounds' });
  const savedRounds = Number(store.get('scribble-rounds')) || 3;
  for (let r = 1; r <= 5; r++) rounds.append(el('option', { value: r, textContent: r, selected: r === savedRounds }));

  const drawTime = el('select', { id: 'setDrawTime' });
  const savedDraw = clampDraw(store.get('scribble-draw'));
  for (const t of DRAW_TIMES) drawTime.append(el('option', { value: t, textContent: `${t}s`, selected: t === savedDraw }));

  const hints = el('input', { id: 'setHints', type: 'checkbox', checked: store.get('scribble-hints') !== '0' });
  const delay = el('input', {
    id: 'setDelay', type: 'number', min: 0, max: MAX_DELAY, step: 1, inputMode: 'numeric',
    value: clampDelay(store.get('scribble-delay')),
  });
  const penalty = el('input', {
    id: 'setPenalty', type: 'number', min: 0, max: MAX_PENALTY, step: 1, inputMode: 'numeric',
    value: clampPenalty(store.get('scribble-penalty')),
  });
  const words = el('textarea', {
    id: 'setWords',
    rows: 3,
    placeholder: 'grandma, the office printer, our dog Biscuit…',
    value: store.get('scribble-words') || '',
  });
  const only = el('input', { id: 'setOnly', type: 'checkbox', checked: store.get('scribble-only') === '1' });
  const count = el('span', { className: 'word-count' });
  const summary = el('span', { className: 'summary-note' });

  const onlyRow = settingRow(only, 'Only use my words', 'Every word choice comes from your list. Needs at least 3 words.');
  const box = el('details', { className: 'settings' },
    el('summary', {}, '⚙️ Settings', summary),
    settingRow(rounds, 'Rounds'),
    settingRow(drawTime, 'Drawing time', 'How long the artist has to draw each word.'),
    settingRow(hints, 'Show letter count & hints', 'Guessers see a blank for each letter, and a couple of letters get revealed as time runs out.'),
    settingRow(delay, 'Guess delay (seconds)', 'Guessers have to wait this long before guessing, which gives the artist a head start. The delay is added on top of the normal drawing time.'),
    settingRow(penalty, 'Wrong guess penalty (points)', 'Each wrong guess loses this many points, so nobody can just spam guesses. Scores never go below zero.'),
    settingRow(null, ['Custom words ', count], 'Separate with commas or new lines. One of your words shows up each turn, mixed in with the built-in list.', 'setWords'),
    words,
    onlyRow,
  );

  // A short summary of anything changed from the defaults, shown while the box is closed.
  const update = () => {
    const n = parseWords(words.value).length;
    count.textContent = n ? `(${n})` : '';
    only.disabled = n < 3;
    onlyRow.classList.toggle('disabled', n < 3);
    const d = clampDelay(delay.value);
    const notes = [
      rounds.value !== '3' && `${rounds.value} round${rounds.value > 1 ? 's' : ''}`,
      drawTime.value !== String(DEFAULT_DRAW) && `${drawTime.value}s turns`,
      !hints.checked && 'no hints',
      d && `${d}s delay`,
      clampPenalty(penalty.value) && `-${clampPenalty(penalty.value)} per miss`,
      n && `${n} custom word${n > 1 ? 's' : ''}${only.checked && !only.disabled ? ' only' : ''}`,
    ].filter(Boolean);
    summary.textContent = notes.length ? ` · ${notes.join(' · ')}` : '';
  };
  rounds.onchange = () => { store.set('scribble-rounds', rounds.value); update(); };
  drawTime.onchange = () => { store.set('scribble-draw', drawTime.value); update(); };
  hints.onchange = () => { store.set('scribble-hints', hints.checked ? '1' : '0'); update(); };
  delay.oninput = () => { store.set('scribble-delay', clampDelay(delay.value)); update(); };
  delay.onchange = () => { delay.value = clampDelay(delay.value); };
  penalty.oninput = () => { store.set('scribble-penalty', clampPenalty(penalty.value)); update(); };
  penalty.onchange = () => { penalty.value = clampPenalty(penalty.value); };
  words.oninput = () => { store.set('scribble-words', words.value); update(); };
  only.onchange = () => { store.set('scribble-only', only.checked ? '1' : '0'); update(); };
  update();
  settings = { rounds, drawTime, hints, delay, penalty, words, only, box };
  return settings;
}

function hostControls(label) {
  const wrap = el('div');
  if (!isHost()) {
    wrap.append(el('p', { textContent: `Waiting for ${nameOf(hostId)} to start…` }));
    const notes = [
      pub.drawTime !== DEFAULT_DRAW && `Artists get ${pub.drawTime}s to draw.`,
      pub.hints === false && 'Letter count and hints are off.',
      pub.penalty > 0 && `Wrong guesses cost ${pub.penalty} point${pub.penalty > 1 ? 's' : ''}.`,
      pub.delay > 0 && `Guessing opens ${pub.delay}s after each drawing starts.`,
      pub.custom && `Playing with ${pub.custom.n} custom word${pub.custom.n > 1 ? 's' : ''}${pub.custom.only ? ' only' : ''}.`,
    ].filter(Boolean);
    for (const n of notes) wrap.append(el('p', { className: 'fine', textContent: n }));
    return wrap;
  }
  const { rounds, drawTime, hints, delay, penalty, words, only, box } = hostSettings();
  const row = el('div', { className: 'host-row' });
  const b = el('button', { className: 'btn', textContent: label, disabled: peers.size < 2 });
  b.onclick = () => toHost('go', {
    rounds: rounds.value,
    drawTime: Number(drawTime.value),
    hints: hints.checked,
    delay: clampDelay(delay.value),
    penalty: clampPenalty(penalty.value),
    words: words.value,
    only: only.checked && !only.disabled,
  });
  row.append(b);
  wrap.append(row);
  if (peers.size < 2) wrap.append(el('p', { textContent: 'Need at least 2 players.' }));
  wrap.append(box);
  return wrap;
}
