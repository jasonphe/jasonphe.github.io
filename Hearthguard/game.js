// Networking and drawing. The host (whoever has been in the room longest) runs the
// Sim from sim.js and sends the state to everyone; everyone else sends their actions
// to the host and draws whatever state comes back.

// Trystero lets whichever peer has the smaller id start each connection, but a page
// that has been open for more than about a minute can't start one anymore. Starting
// each id with a countdown from the join time gives newer pages smaller ids, so the
// newcomer, whose offers are fresh, always goes first. (Same trick as Scribble Party.)
const idPrefix = String(9999999999 - Math.floor(Date.now() / 1000)).padStart(10, '0');
const realRandom = Math.random;
let idChars = 0;
Math.random = () => idChars < idPrefix.length ? (Number(idPrefix[idChars++]) + 0.5) / 62 : realRandom();
const { joinRoom, selfId } = await import('https://cdn.jsdelivr.net/npm/trystero@0.25.4/+esm');
Math.random = realRandom;

import { CLASSES, CARDS, cardDef, cardText, ENEMIES, RELICS, EVENTS, PACES, DEFAULT_TEMPO, TEMPO, setTempo, RARITIES, RARITY_NAMES, DECK_SIZE, UNLOCK_PRICE, DEFAULT_DECK, DIFFICULTIES, deckProblem, costFor } from './data.js';
import { Sim, newLobby, MAX_PLAYERS, HAND, REMOVE_PRICE, ROWS, baseRegen } from './sim.js';

// ---------- Settings ----------
const APP_ID = 'jasonphe-hearthguard';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TICK_MS = 100;
const PCOLORS = ['#ff8a5b', '#5bc0ff', '#c38cff', '#7ee081'];
const NODE_ICONS = { fight: '⚔️', elite: '😈', rest: '🔥', shop: '💰', event: '❓', treasure: '🎁' };
const NODE_NAMES = { fight: 'Fight', elite: 'Elite', rest: 'Campfire', shop: 'Shop', event: 'Unknown', treasure: 'Treasure', boss: 'Boss' };
const INTENT = {
  atk: '⚔️', pounce: '🎯', wave: '🌊', quake: '💥', block: '🛡️', buff: '💪', rally: '📯',
  heal: '💚', summon: '💀', hex: '🧿', drain: '🪫', slow: '🕸️',
};

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clamp01 = x => Math.max(0, Math.min(1, x));

// ---------- Progress (this browser only) ----------
// Embers earned from runs, cards bought with them, cards seen during runs, the deck
// built for each class, and the hardest difficulty won. There are no accounts, so all of it lives
// in this browser.
const PROGRESS_KEY = 'hearthguard-progress';
const progress = (() => {
  const p = (() => { try { return JSON.parse(store.get(PROGRESS_KEY) || '{}') || {}; } catch { return {}; } })();
  return {
    unlocked: Array.isArray(p.unlocked) ? p.unlocked.filter(id => CARDS[id]) : [],
    seen: Array.isArray(p.seen) ? p.seen.filter(id => CARDS[id]) : [],
    decks: p.decks && typeof p.decks === 'object' ? p.decks : {},
    best: Number.isInteger(p.best) ? p.best : -1,
    embers: Number.isFinite(p.embers) ? p.embers : 0,
    award: p.award || null,
  };
})();
const saveProgress = () => store.set(PROGRESS_KEY, JSON.stringify(progress));
const isUnlocked = id => CARDS[id]?.r === 'common' || progress.unlocked.includes(id);
const rarityIdx = id => RARITIES.indexOf(CARDS[id]?.r);
// Remember every card this player has come across in a run, so the deck builder can
// show it (locked) instead of face down.
function noteSeen() {
  const m = me();
  if (!m || S.phase === 'lobby') return;
  const ids = [...(m.deck || []).map(c => c.id), ...(S.reward?.[m.id]?.cards || []), ...(S.shop?.items?.[m.id] || []).map(x => x.id),
    ...(S.event?.gains || []).filter(g => g.pid === m.id && g.card).map(g => g.card)];
  const fresh = ids.filter(id => CARDS[id] && CARDS[id].r !== 'common' && !progress.seen.includes(id));
  if (!fresh.length) return;
  progress.seen.push(...new Set(fresh));
  saveProgress();
}
// The deck this player starts with as `cls`: their saved build, or the default one.
function myDeck(cls) {
  const ids = progress.decks[cls];
  return ids && !deckProblem(cls, ids) && ids.every(isUnlocked) ? ids : DEFAULT_DECK[cls];
}

function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = text;
  $('toasts').append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

// ---------- Join screen ----------
// When the game files this browser is running were published, newest first, so
// players can tell whether they have the latest build. Read from the copies the
// browser already has, which are the ones actually running.
Promise.all(['index.html', 'game.js', 'sim.js', 'data.js', 'style.css'].map(f =>
  fetch(f, { method: 'HEAD', cache: 'force-cache' }).then(r => Date.parse(r.headers.get('Last-Modified')) || 0, () => 0)))
  .then(times => {
    const t = Math.max(...times);
    if (t) $('buildStamp').textContent = `Updated ${new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  });
const hashCode = location.hash.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, '');
$('nameInput').value = store.get('hearthguard-name') || '';
if (hashCode) {
  $('joinExisting').classList.remove('hidden');
  $('joinFresh').classList.add('hidden');
  $('joinCodeLabel').textContent = hashCode;
}
const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
function getName() {
  const n = cleanText($('nameInput').value, 16);
  if (!n) { $('nameInput').focus(); toast('Enter your name'); return null; }
  store.set('hearthguard-name', n);
  return n;
}
$('createBtn').onclick = () => { const n = getName(); if (n) start(n, newCode()); };
$('newInstead').onclick = () => {
  history.replaceState(null, '', cleanPath());
  location.reload();
};
$('joinForm').onsubmit = e => {
  e.preventDefault();
  const n = getName();
  if (!n) return;
  const code = hashCode || $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 3) { $('codeInput').focus(); toast('Enter a room code'); return; }
  start(n, code);
};

// ---------- State ----------
let room, roomCode;
const actions = {};
const peers = new Map();           // id -> { name, t } (includes me)
let hostId = selfId;
let S = newLobby();                // the run, from the host
let C = null;                      // the current fight, from the host
let cbAt = 0;                      // when C arrived (performance.now)
let sim = null;                    // only the host has one
let lastTick = performance.now();

const isHost = () => hostId === selfId;
const me = () => S.players.find(p => p.id === selfId);
const pIndex = id => S.players.findIndex(p => p.id === id);
const pColor = id => PCOLORS[Math.max(0, pIndex(id)) % PCOLORS.length];
const pName = id => S.players.find(p => p.id === id)?.name ?? peers.get(id)?.name ?? 'Someone';

const cleanPath = () => location.pathname.replace(/index\.html$/, '');
const inviteUrl = () => `${location.origin}${cleanPath()}#${roomCode}`;
async function copyInvite() {
  const url = inviteUrl();
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: 'Hearthguard', text: `Join my Hearthguard party: ${roomCode}`, url }); return; } catch { }
  }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied'); }
  catch { prompt('Copy this link:', url); }
}
$('copyTop').onclick = copyInvite;
$('endRunBtn').onclick = () => {
  if (confirm('End this run for everyone? You will all go to the end screen with your stats so far.')) act({ k: 'abandon' });
};

function start(name, code) {
  roomCode = code;
  history.replaceState(null, '', `${cleanPath()}#${code}`);
  window.addEventListener('hashchange', () => location.reload());
  $('join').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('roomCode').textContent = code;
  document.title = `Hearthguard · ${code}`;
  peers.set(selfId, { name, t: Date.now() });
  connect();
  electHost();
  render();
  setInterval(hostTick, TICK_MS);
  requestAnimationFrame(frame);
}

// ---------- Networking ----------
function connect() {
  room = joinRoom({ appId: APP_ID }, roomCode);
  for (const name of ['hello', 'st', 'cb', 'ev', 'act']) {
    actions[name] = room.makeAction(name);
    actions[name].onMessage = (data, meta) => {
      const from = typeof meta === 'string' ? meta : meta?.peerId;
      if (from) handlers[name](data, from);
    };
  }
  room.onPeerJoin = id => send('hello', hello(), id);
  room.onPeerLeave = id => {
    const name = peers.get(id)?.name;
    peers.delete(id);
    electHost();
    if (name) toast(`${name} left`);
    if (isHost()) {
      sim.leave(id);
      // Someone who rejoined before their old connection timed out is watching;
      // now that the old seat is free they can take it back.
      for (const [pid, p] of peers) sim.join(pid, p.name);
    }
    render();
  };
}
const hello = () => ({ n: peers.get(selfId).name, t: peers.get(selfId).t });
function send(name, data, target) {
  try { actions[name].send(data, target ? { target } : undefined); } catch (e) { console.warn(name, e); }
}

// The host is whoever has been in the room longest. A new host picks up the last
// state it was sent, so the run carries on.
function electHost() {
  let best = null;
  for (const [id, p] of peers) if (!best || p.t < best.t || (p.t === best.t && id < best.id)) best = { id, t: p.t };
  const was = hostId;
  hostId = best.id;
  if (!isHost()) { sim = null; return; }
  if (!sim) {
    sim = new Sim(S, C);
    sim.hostId = selfId;
    for (const p of [...S.players]) if (p.on && !peers.has(p.id)) sim.leave(p.id);
    for (const [id, p] of peers) sim.join(id, p.name);
    if (was !== selfId && S.phase !== 'lobby') toast('You are now hosting the run');
    // A brand-new room starts at the pace this browser last picked.
    const saved = Number(store.get('hearthguard-pace'));
    if (S.phase === 'lobby' && S.players.length <= 1 && PACES.some(p => p.v === saved)) S.tempo = saved;
  }
}

const handlers = {
  hello(d, from) {
    const isNew = !peers.has(from);
    peers.set(from, { name: cleanText(d?.n, 16) || 'Hero', t: Number(d?.t) || Date.now() });
    electHost();
    if (isNew && S.phase === 'lobby') toast(`${pName(from)} joined`);
    if (isHost()) { sim.join(from, peers.get(from).name); sim.dirty = true; }
    render();
  },
  st(d, from) {
    if (from !== hostId || !d) return;
    const prev = S.phase;
    S = d;
    onState(prev);
  },
  cb(d, from) {
    if (from !== hostId) return;
    C = d;
    cbAt = performance.now();
  },
  ev(d, from) {
    if (from !== hostId || !Array.isArray(d)) return;
    handleEvents(d);
  },
  act(d, from) {
    if (isHost() && sim) sim.act(from, d);
  },
};

function act(a) {
  if (isHost()) sim?.act(selfId, a);
  else send('act', a, hostId);
}

function hostTick() {
  const now = performance.now();
  // Background tabs only get timers about once a second, so catch up in small steps.
  let dt = Math.min(2, (now - lastTick) / 1000);
  lastTick = now;
  if (!isHost() || !sim) return;
  const prev = S.phase;
  while (dt > 1e-6) { const step = Math.min(0.1, dt); sim.tick(step); dt -= step; }
  S = sim.S;
  C = sim.C;
  cbAt = now;
  const evs = sim.ev.splice(0);
  if (sim.dirty) {
    sim.dirty = false;
    send('st', S);
    onState(prev);
  }
  if (C && S.phase === 'combat') send('cb', C);
  if (evs.length) { send('ev', evs); handleEvents(evs); }
}

// ---------- Rendering ----------
let screenKey = '';
function onState(prevPhase) {
  if (prevPhase === 'combat' && S.phase !== 'combat') { combatDom = null; sel = null; }
  render();
}

let sentDeck = '';
function syncDeck() {
  const m = me();
  if (S.phase !== 'lobby' || !m?.cls) return;
  const ids = myDeck(m.cls);
  const key = `${hostId}:${m.cls}:${ids.join()}`;
  if ((m.loadout || []).join() === ids.join() || sentDeck === key) return;
  sentDeck = key;
  act({ k: 'deck', ids });
}

function render() {
  setTempo(S.tempo ?? DEFAULT_TEMPO);
  syncDeck();
  noteSeen();
  renderRunbar();
  $('endRunBtn').classList.toggle('hidden', !isHost() || ['lobby', 'over'].includes(S.phase));
  const main = $('main');
  document.body.dataset.phase = S.phase;
  if (S.phase === 'combat') {
    if (!combatDom || !main.contains(combatDom.root)) buildCombat();
    return;
  }
  combatDom = null;
  const scroll = main.querySelector('.map-scroll')?.scrollTop;
  const html = (SCREENS[S.phase] || SCREENS.lobby)();
  if (html !== screenKey) {
    main.innerHTML = html;
    screenKey = html;
    const ms = main.querySelector('.map-scroll');
    if (ms) {
      if (scroll != null) ms.scrollTop = scroll;
      else main.querySelector('.node.can')?.scrollIntoView({ block: 'center' });
    }
  }
}

function renderRunbar() {
  const html = runbarHTML();
  if ($('runbar').dataset.v !== html) { $('runbar').innerHTML = html; $('runbar').dataset.v = html; }
}
function runbarHTML() {
  const m = me();
  if (S.phase === 'lobby' || !S.hearthMax) return '';
  const floor = S.pos ? Math.min(S.pos.r + 1, ROWS + 1) : 0;
  return `
    <span class="rb-hearth" title="The Hearth: your team's shared life">${hearthPic('rb-icon')} <b>${Math.max(0, Math.ceil(S.hearth))}</b>/${S.hearthMax}</span>
    <span title="Floor">🪜 ${floor}/${ROWS + 1}</span>
    ${S.diff ? `<span title="Difficulty">💀 ${DIFFICULTIES[S.diff].name}</span>` : ''}
    ${m ? `<span title="Your HP">❤️ ${m.hp}/${m.maxHp}</span><span title="Your gold">🪙 ${m.gold}</span>` : ''}
    <span class="rb-relics">${(S.relics || []).map(r => `<button class="relic" data-relic="${r}" aria-label="${esc(RELICS[r].name)}: ${esc(RELICS[r].text)}">${relicPic(r)}</button>`).join('')}</span>
    ${m ? `<button class="chip" data-deck="view">🂠 Deck ${m.deck.length}</button>` : ''}`;
}

// A painted image, or the emoji if the image is missing.
const pic = (src, emoji, cls = '') => `<img class="pic ${cls}" src="assets/${src}.webp" alt="${emoji}" draggable="false" onerror="this.replaceWith(this.alt)">`;
const classPic = (cls, extra = '') => CLASSES[cls] ? pic(`classes/${cls}`, CLASSES[cls].icon, `portrait ${extra}`) : '❔';
const relicPic = id => pic(`relics/${id}`, RELICS[id].icon, 'relic-pic');
const hearthPic = cls => pic('icons/hearth', '❤️‍🔥', cls);
const scene = (id, emoji) => `<div class="scene">${pic(`scenes/${id}`, emoji)}</div>`;

function tgtLabel(c) {
  return { enemy: 'Enemy', all: 'All enemies', random: 'Random enemies', ally: 'Ally', self: 'Self', none: 'Team' }[c.tgt] || '';
}
// A card not yet seen in any run: face down, showing only its rarity.
function cardBackHTML(id) {
  const c = CARDS[id];
  return `<div class="cardface back r-${c.r}"><span class="gem" title="${RARITY_NAMES[c.r]}"></span>
    <div class="cback">?</div><div class="ctype">${RARITY_NAMES[c.r]}</div></div>`;
}
function cardHTML(id, up, extra = '') {
  const c = cardDef(id, up);
  return `<div class="cardface cls-${c.cls} r-${c.r}${c.upgraded ? ' up' : ''}">
    <span class="cost">${c.unplayable ? '–' : c.cost}</span>
    ${RARITY_NAMES[c.r] ? `<span class="gem" title="${RARITY_NAMES[c.r]}"></span>` : ''}
    ${c.cast ? `<span class="ct" title="Cast time">⏱${c.cast}s</span>` : ''}
    <div class="cart">${pic(`cards/${c.id}`, c.icon)}</div>
    <div class="cname">${esc(c.name)}</div>
    <div class="ctext">${cardText(c)}</div>
    <div class="ctype">${c.power ? 'Power' : tgtLabel(c)}</div>
    ${extra}
  </div>`;
}

function waitingFor(done) {
  return `<div class="waiting">${S.players.filter(p => p.on).map(p => `<span class="pchip ${done?.[p.id] != null ? 'ok' : ''}" style="--pc:${pColor(p.id)}">${esc(p.name)} ${done?.[p.id] != null ? '✓' : '…'}</span>`).join('')}</div>`;
}

const SCREENS = {
  lobby() {
    const m = me();
    const seats = Array.from({ length: MAX_PLAYERS }, (_, i) => {
      const p = S.players[i];
      if (!p) return `<div class="seat empty">Open seat</div>`;
      const c = CLASSES[p.cls];
      return `<div class="seat" style="--pc:${pColor(p.id)}">
        <div class="seat-icon">${classPic(p.cls)}</div>
        <div><b>${esc(p.name)}</b>${p.id === hostId ? ' <span class="tag">host</span>' : ''}${p.id === selfId ? ' <span class="tag">you</span>' : ''}<br><small>${c ? c.name : 'choosing…'}${p.id === selfId ? ` · 🔶 ${progress.embers}` : ''}</small>
          ${c ? (p.id === selfId ? '<button class="btn ghost small seat-deck" data-build>Edit deck</button>' : `<button class="btn ghost small seat-deck" data-view-deck="${p.id}">View deck</button>`) : ''}</div>
      </div>`;
    }).join('');
    const ready = S.players.length && S.players.every(p => p.cls);
    return `<div class="panel lobby">
      <h2>Gather your party</h2>
      <p class="sub">Share code <b class="code">${esc(roomCode)}</b> or <button class="link" data-copy>copy the invite link</button>. Up to ${MAX_PLAYERS} players.</p>
      <div class="seats">${seats}</div>
      ${m ? `<h3>Choose your class</h3>
      <div class="classes">${Object.entries(CLASSES).map(([k, c]) => `
        <button class="class-card ${m.cls === k ? 'on' : ''}" data-cls="${k}" style="--cc:${c.color}">
          <span class="class-icon">${classPic(k)}</span><b>${c.name}</b><small>❤️ ${c.hp} HP</small><span>${c.blurb}</span>
        </button>`).join('')}</div>` : `<p class="note">The party is full, so you're watching this one.</p>`}
      ${diffHTML()}
      ${paceHTML()}
      <div class="lobby-go">
        ${isHost() ? `<button class="btn big" data-start ${ready ? '' : 'disabled'}>${ready ? 'Begin the descent' : 'Everyone needs a class'}</button>`
        : `<p class="sub">Waiting for ${esc(pName(hostId))} to start…</p>`}
      </div>
      <details class="howto" open>
        <summary>How to play</summary>
        <ul>
          <li><b>No turns.</b> ⚡ Energy refills over time. Play cards whenever you can afford them. Cards marked ⏱ take time to cast, and you can't play anything else while casting.</li>
          <li><b>The Hearth</b> ❤️‍🔥 is your team's shared life. If it goes out, the run is over. It and your own HP both carry over between fights, so rest at campfires.</li>
          <li>Enemies <b>wind up</b> each move (watch the bar). Attacks hit the Hearth unless someone <b>Taunts</b> that enemy, which sends the hits to the taunter's own HP and 🪖 Armor. A hero who is knocked out stays down until a Resurrection or the end of the fight. If the whole party is down, the run is over.</li>
          <li><b>Interrupt</b> cancels a wind-up. Big moves have poise pips, and each interrupt breaks one. 🔒 moves can't be stopped. 🌊 waves ignore taunts.</li>
          <li>🔷 <b>Barrier</b> soaks hits for the Hearth but fades over time. 🪖 <b>Armor</b> soaks hits for one hero.</li>
          <li><b>Combo:</b> a cast that finishes while a teammate is casting (or just finished) is 25% stronger for each teammate.</li>
          <li>Stuck with a bad card? <b>↻ Discard</b> it to draw another for 1⚡.</li>
          <li><b>🔶 Embers:</b> every run earns Embers (more for winning and on harder difficulties). Spend them in <b>Edit deck</b> to unlock cards you've found in runs. Rarer cards need a win on a harder difficulty, and each win opens the next one.</li>
          <li>Keys: <kbd>1</kbd>–<kbd>5</kbd> pick a card (press again to auto-target), <kbd>X</kbd> discards it, <kbd>Esc</kbd> cancels.</li>
        </ul>
      </details>
    </div>`;
  },

  map() {
    const reach = new Set(sim ? sim.reachable() : reachableClient());
    const W = 420, rowH = 66, top = 70;
    const H = top + ROWS * rowH + 30;
    const pos = (r, n) => [((n.x + 0.5) / 5) * W, top + (ROWS - 1 - r) * rowH + rowH / 2];
    const bossXY = [W / 2, 36];
    const path = new Set(S.path || []);
    let lines = '', nodes = '';
    S.map.forEach((row, r) => row.forEach((n, i) => {
      const [x, y] = pos(r, n);
      const targets = r === ROWS - 1 ? [bossXY] : n.next.map(j => pos(r + 1, S.map[r + 1][j]));
      const fromHere = r === ROWS - 1 ? ['boss'] : n.next.map(j => `${r + 1},${j}`);
      targets.forEach((t, k) => {
        const walked = path.has(`${r},${i}`) && path.has(fromHere[k]);
        lines += `<line x1="${x}" y1="${y}" x2="${t[0]}" y2="${t[1]}" class="${walked ? 'walked' : ''}"/>`;
      });
    }));
    const voteDots = key => S.players.filter(p => S.votes?.[p.id] === key)
      .map((p, k) => `<circle cx="${-14 + k * 9}" cy="-24" r="5" fill="${pColor(p.id)}"><title>${esc(p.name)}</title></circle>`).join('');
    S.map.forEach((row, r) => row.forEach((n, i) => {
      const key = `${r},${i}`;
      const [x, y] = pos(r, n);
      const here = S.pos && S.pos.r === r && S.pos.i === i;
      const cls = `node ${n.type} ${reach.has(key) ? 'can' : ''} ${path.has(key) ? 'been' : ''} ${here ? 'here' : ''} ${S.votes?.[selfId] === key ? 'mine' : ''}`;
      nodes += `<g class="${cls}" data-node="${key}" transform="translate(${x},${y})"><title>${NODE_NAMES[n.type]}</title>
        <circle r="19"/><text y="7" class="alt">${NODE_ICONS[n.type]}</text><image href="assets/icons/${n.type}.webp" x="-17" y="-17" width="34" height="34" onerror="this.previousElementSibling.classList.remove('alt')"/>${voteDots(key)}</g>`;
    }));
    const bossName = S.boss.map(id => ENEMIES[id].name).join(' & ');
    nodes += `<g class="node boss ${reach.has('boss') ? 'can' : ''} ${S.votes?.[selfId] === 'boss' ? 'mine' : ''}" data-node="boss" transform="translate(${bossXY[0]},${bossXY[1]})"><title>Boss: ${esc(bossName)}</title>
      <circle r="27"/><text y="10" class="big alt">${ENEMIES[S.boss[0]].icon}</text><image href="assets/enemies/${S.boss[0]}.webp" x="-24" y="-26" width="48" height="48" clip-path="circle(24px)" onerror="this.previousElementSibling.classList.remove('alt')"/>${voteDots('boss')}</g>`;
    return `<div class="map-wrap">
      <aside class="panel map-side">
        <h2>The Descent</h2>
        <p class="sub">Vote on the next room. Majority wins, ties are random.</p>
        ${waitingFor(S.votes)}
        <ul class="legend">${Object.entries(NODE_ICONS).map(([k, v]) => `<li>${pic(`icons/${k}`, v)} ${NODE_NAMES[k]}</li>`).join('')}<li>${pic('icons/boss', ENEMIES[S.boss[0]].icon)} ${esc(bossName)}</li></ul>
        <div class="party">${partyList()}</div>
      </aside>
      <div class="map-scroll"><svg viewBox="0 0 ${W} ${H}" class="map">${lines}${nodes}</svg></div>
    </div>`;
  },

  reward() {
    const r = S.reward?.[selfId];
    const done = S.done?.[selfId] != null;
    const relic = S.rewardRelic && RELICS[S.rewardRelic];
    return `<div class="panel center">
      <h2>Victory</h2>
      <p class="sub">Everyone gains <b>🪙 ${S.rewardGold}</b>.${relic ? ` The team found <b>${relicPic(S.rewardRelic)} ${esc(relic.name)}</b>: ${esc(relic.text)}` : ''}</p>
      ${r && !done ? `<h3>Add a card to your deck</h3>
        <div class="card-grid">${r.cards.map(id => `<button class="card-btn" data-reward="${id}">${cardHTML(id, 0)}</button>`).join('')}</div>
        <button class="btn ghost" data-reward-skip>Skip</button>`
        : `<p class="note">${r ? 'Waiting for the others…' : 'Watching.'}</p>`}
      ${waitingFor(S.done)}
    </div>`;
  },

  rest() {
    const m = me();
    const done = S.done?.[selfId];
    const heal = Math.ceil(S.hearthMax * 0.3 / Math.max(1, S.players.filter(p => p.on).length));
    return `<div class="panel center">
      ${scene('rest', '🔥')}
      <h2>Campfire</h2>
      <p class="sub">Each of you picks one: tend the Hearth, or sharpen a card.</p>
      ${m && done == null ? `<div class="choices">
        <button class="choice" data-rest><b>🔥 Rest</b><span>Heal the Hearth ${heal} and restore your HP (${m.hp}/${m.maxHp}).</span></button>
        <button class="choice" data-deck="smith"><b>⚒️ Smith</b><span>Upgrade a card in your deck.</span></button>
      </div>` : `<p class="note">${m ? (done === 'rest' ? 'You rested.' : 'You upgraded a card.') : ''} Waiting for the others…</p>`}
      ${waitingFor(S.done)}
    </div>`;
  },

  shop() {
    const m = me();
    const items = S.shop.items[selfId] || [];
    const done = S.done?.[selfId] != null;
    return `<div class="panel center wide">
      ${scene('shop', '💰')}
      <h2>Merchant</h2>
      <p class="sub">Cards go in your own deck. Relics help the whole team.</p>
      ${m && !done ? `
      <h3>Cards</h3>
      <div class="card-grid">${items.map((it, i) => `<button class="card-btn ${it.sold ? 'sold' : ''}" data-buy="${i}" ${it.sold || m.gold < it.price ? 'disabled' : ''}>${cardHTML(it.id, 0, `<span class="price">🪙 ${it.price}</span>`)}</button>`).join('')}</div>
      <h3>Relics</h3>
      <div class="relic-row">${S.shop.relics.map((r, i) => `<button class="relic-btn" data-buy-relic="${i}" ${r.sold || m.gold < r.price ? 'disabled' : ''}>
        <span class="relic-icon">${relicPic(r.id)}</span><b>${esc(RELICS[r.id].name)}</b><small>${esc(RELICS[r.id].text)}</small><span class="price">${r.sold ? 'Sold' : `🪙 ${r.price}`}</span></button>`).join('') || '<p class="note">Sold out.</p>'}</div>
      <div class="shop-foot">
        <button class="btn ghost" data-deck="remove" ${S.shop.removed[selfId] || m.gold < REMOVE_PRICE ? 'disabled' : ''}>🗑️ Remove a card (🪙 ${REMOVE_PRICE})</button>
        <button class="btn" data-done>Leave shop</button>
      </div>` : `<p class="note">Waiting for the others to finish shopping…</p>`}
      ${waitingFor(S.done)}
    </div>`;
  },

  event() {
    const ev = S.event, d = EVENTS[ev.id];
    const voted = ev.votes[selfId];
    return `<div class="panel center">
      ${scene(ev.id, d.icon)}
      <h2>${esc(d.name)}</h2>
      <p class="story">${esc(d.text)}</p>
      ${ev.result ? `<p class="result"><b>${esc(d.opts[ev.choice].t)}:</b> ${esc(ev.result)}</p>
        ${gainsHTML(ev.gains)}
        ${me() && S.done?.[selfId] == null ? '<button class="btn" data-done>Continue</button>' : ''}
        ${waitingFor(S.done)}`
      : `<div class="choices">${d.opts.map((o, i) => `<button class="choice ${voted === i ? 'on' : ''}" data-evote="${i}" ${me() ? '' : 'disabled'}>
          <b>${esc(o.t)}</b><span>${esc(o.d)}</span>
          <span class="votes">${S.players.filter(p => ev.votes[p.id] === i).map(p => `<i style="background:${pColor(p.id)}" title="${esc(p.name)}"></i>`).join('')}</span>
        </button>`).join('')}</div>
        <p class="sub">The team votes. Majority wins, ties are random.</p>
        ${waitingFor(ev.votes)}`}
    </div>`;
  },

  treasure() {
    const r = S.treasure && RELICS[S.treasure];
    return `<div class="panel center">
      ${scene('treasure', '🎁')}
      <h2>Treasure</h2>
      ${r ? `<p class="sub">The team found <b>${relicPic(S.treasure)} ${esc(r.name)}</b>: ${esc(r.text)}</p>` : '<p class="sub">The chest is empty.</p>'}
      ${me() && S.done?.[selfId] == null ? '<button class="btn" data-done>Continue</button>' : ''}
      ${waitingFor(S.done)}
    </div>`;
  },

  over() {
    const o = S.over;
    return `<div class="panel center">
      ${o.win ? scene('victory', '👑') : scene('defeat', '🕯️')}
      <h2>${o.win ? 'The Hearth endures' : o.quit ? 'The run was abandoned' : o.wipe ? 'The party has fallen' : 'The Hearth has gone out'}</h2>
      <p class="sub">${S.diff ? `${DIFFICULTIES[S.diff].name} · ` : ''}${o.win ? `You defeated ${esc(o.boss)}!` : o.quit ? `The party turned back on floor ${o.floor}.` : o.wipe ? `Every hero was knocked out on floor ${o.floor}.` : `The party fell on floor ${o.floor}.`}</p>
      <p class="note">${S.stats?.fights || 0} fights · ${S.stats?.cards || 0} cards played · ${(S.relics || []).length} relics</p>
      ${embersHTML()}
      ${statsBoard()}
      ${isHost() ? '<button class="btn big" data-lobby>Back to the lobby</button>' : `<p class="sub">Waiting for ${esc(pName(hostId))}…</p>`}
    </div>`;
  },
};

// ---------- Gains ----------
// A relic as a small tile with its picture and effect.
const relicTile = id => `<div class="relic-tile">${relicPic(id)}<div><b>${esc(RELICS[id].name)}</b><span>${esc(RELICS[id].text)}</span></div></div>`;

// What an event gave out: relics for the team, cards for each player (yours first).
function gainsHTML(gains) {
  if (!gains?.length) return '';
  const relics = gains.filter(g => g.relic);
  const cards = gains.filter(g => g.card).sort((a, b) => (b.pid === selfId) - (a.pid === selfId));
  return `<div class="gains">
    ${relics.map(g => relicTile(g.relic)).join('')}
    ${cards.length ? `<div class="card-grid">${cards.map(g => `<div class="gain-card ${g.pid === selfId ? 'mine' : ''}">
      ${cardHTML(g.card, g.up)}<span class="owner" style="--pc:${pColor(g.pid)}">${g.pid === selfId ? 'You' : esc(pName(g.pid))}${g.up ? ' · upgraded' : ''}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

// A popup for something just bought.
function showGain(ev) {
  const el = document.createElement('div');
  el.className = 'gain-pop';
  const head = ev.relic
    ? (ev.by === selfId ? 'You bought a relic for the team' : `${esc(pName(ev.by))} bought a relic for the team`)
    : 'Added to your deck';
  el.innerHTML = `<small>${head}</small>${ev.relic ? relicTile(ev.relic) : cardHTML(ev.card, ev.up)}`;
  el.onclick = () => el.remove();
  $('gainPops').append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// ---------- Relic details in the top bar ----------
let tipFor = null;
function showRelicTip(btn) {
  const id = btn.dataset.relic;
  const tip = $('relicTip');
  tip.innerHTML = `${relicPic(id)}<div><b>${esc(RELICS[id].name)}</b><span>${esc(RELICS[id].text)}</span><small>Team relic · helps everyone</small></div>`;
  tip.hidden = false;
  const r = btn.getBoundingClientRect(), w = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${r.bottom + 8}px`;
  tipFor = id;
}
function hideRelicTip() { $('relicTip').hidden = true; tipFor = null; }
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest('[data-relic]');
  if (b) showRelicTip(b);
  else if (tipFor) hideRelicTip();
});
document.addEventListener('click', e => {
  const b = e.target.closest('[data-relic]');
  if (b) { tipFor === b.dataset.relic && e.pointerType !== 'mouse' ? hideRelicTip() : showRelicTip(b); return; }
  if (tipFor && !e.target.closest('#relicTip')) hideRelicTip();
});
document.addEventListener('focusin', e => { const b = e.target.closest('[data-relic]'); if (b) showRelicTip(b); });
document.addEventListener('focusout', e => { if (e.target.closest('[data-relic]')) hideRelicTip(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipFor) hideRelicTip(); });
addEventListener('scroll', () => tipFor && hideRelicTip(), { passive: true });

// ---------- End-of-run stats ----------
const STAT_ROWS = [
  ['dmg', '⚔️', 'Damage dealt'],
  ['burn', '🔥', 'Burn damage'],
  ['kills', '💀', 'Kills'],
  ['tanked', '🛡️', 'Damage tanked'],
  ['healed', '💚', 'Healing'],
  ['shield', '🔷', 'Barrier given'],
  ['guard', '🪖', 'Armor given'],
  ['interrupts', '✋', 'Interrupts'],
  ['energyGiven', '⚡', 'Energy given'],
  ['revives', '🕊️', 'Revives'],
  ['cards', '🃏', 'Cards played'],
  ['combos', '✨', 'Combos'],
  ['downs', '😵', 'Times knocked out'],
];
// The top player in each of these earns the title.
const MAX_TITLES = 2;
const TITLES = [
  ['dmg', 'Slayer'], ['burn', 'Pyromaniac'], ['kills', 'Executioner'], ['tanked', 'Bulwark'],
  ['healed', 'Lifeline'], ['shield', 'Warden'], ['interrupts', 'Silencer'], ['energyGiven', 'Battery'],
  ['combos', 'Conductor'], ['downs', 'Floor Inspector'],
];
function statsBoard() {
  const players = S.players.filter(p => p.stats);
  if (!players.length) return '';
  const val = (p, k) => Math.round(p.stats[k] || 0);
  // Each leader earns that stat's title. A player keeps at most MAX_TITLES, picking the
  // stats they lead by the widest margin over the runner-up.
  const won = {};
  if (players.length > 1) {
    for (const [k, title] of TITLES) {
      const vals = players.map(p => val(p, k)).sort((x, y) => y - x);
      const [best, second] = vals;
      if (best <= 0) continue;
      const margin = (best - second) / best;
      for (const p of players) if (val(p, k) === best) (won[p.id] ??= []).push({ title, margin });
    }
  }
  const titles = {};
  for (const [id, list] of Object.entries(won)) {
    titles[id] = list.sort((x, y) => y.margin - x.margin).slice(0, MAX_TITLES).map(t => t.title);
  }
  return `<div class="statboard">${players.map(p => `
    <div class="statcard" style="--pc:${pColor(p.id)}">
      <div class="statcard-head">
        <span class="pavatar">${classPic(p.cls)}</span>
        <div><b>${esc(p.name)}</b><small>${CLASSES[p.cls]?.name || ''}</small></div>
      </div>
      ${titles[p.id] ? `<div class="titles">${titles[p.id].map(t => `<span>${t}</span>`).join('')}</div>` : ''}
      <dl>${STAT_ROWS.map(([k, icon, label]) => `<div class="${val(p, k) ? '' : 'zero'}"><dt>${icon} ${label}</dt><dd>${val(p, k).toLocaleString()}</dd></div>`).join('')}</dl>
    </div>`).join('')}</div>`;
}

// ---------- Starting deck, difficulty, Embers ----------
function diffHTML() {
  const cur = S.diff ?? 0;
  const d = DIFFICULTIES[cur];
  if (!isHost()) return `<p class="pace-note">Difficulty: <b>${d.name}</b> <span>(${d.blurb})</span></p>`;
  return `<h3>Difficulty</h3>
    <div class="paces">${DIFFICULTIES.map((x, i) => {
      const open = i <= progress.best + 1 || i === cur;
      return `<button class="pace ${i === cur ? 'on' : ''}" data-diff="${i}" ${open ? '' : 'disabled'}>
        <b>${open ? '' : '🔒 '}${x.name}</b><small>${x.blurb}</small>
        <small>${open ? `🔶 ×${x.embers} · a win lets you buy <span class="rt r-${x.cap}">${RARITY_NAMES[x.cap]}</span> cards` : `Win on ${DIFFICULTIES[i - 1].name} to open`}</small></button>`;
    }).join('')}</div>`;
}

// Embers for a finished run: some for every floor reached, a bonus for winning, all
// scaled by difficulty. Paid once per run, when this player first sees the end screen.
const EMBERS_PER_FLOOR = 5, EMBERS_WIN = 60;
const embersFor = (over, diff) => Math.round(((over.floor || 0) * EMBERS_PER_FLOOR + (over.win ? EMBERS_WIN : 0)) * DIFFICULTIES[diff].embers);

function embersHTML() {
  const m = me();
  if (!m?.cls || !S.runId) return '';
  const diff = S.diff ?? 0;
  let a = progress.award;
  if (a?.run !== S.runId) {
    const first = S.over.win && diff > progress.best;
    a = progress.award = {
      run: S.runId,
      n: embersFor(S.over, diff),
      tier: first ? DIFFICULTIES[diff].cap : null,
      opened: first && diff + 1 < DIFFICULTIES.length ? DIFFICULTIES[diff + 1].name : null,
    };
    if (S.over.win) progress.best = Math.max(progress.best, diff);
    progress.embers += a.n;
    saveProgress();
  }
  return `<div class="unlock">
    <h3>+${a.n} 🔶 Embers</h3>
    <p class="sub">You have ${progress.embers}. Spend them on new cards with <b>Edit deck</b> in the lobby.</p>
    ${a.tier ? `<p class="unlock-note">🔓 <span class="rt r-${a.tier}">${RARITY_NAMES[a.tier]}</span> cards can now be bought.</p>` : ''}
    ${a.opened ? `<p class="unlock-note">🔓 <b>${a.opened}</b> difficulty is now open.</p>` : ''}
  </div>`;
}

// Uncommons can be bought from the start; each rarer tier needs a win on the
// difficulty whose `cap` it is.
const buyNeeds = r => DIFFICULTIES.findIndex(d => d.cap === r);
const canBuyTier = r => buyNeeds(r) <= progress.best;

// ---------- Deck builder ----------
let draft = [], draftCls = null;
function openBuilder() {
  const m = me();
  if (!m?.cls || S.phase !== 'lobby') return;
  draftCls = m.cls;
  draft = [...myDeck(m.cls)];
  renderBuilder();
  $('buildDialog').showModal();
}
function renderBuilder() {
  const order = Object.keys(CARDS);
  const problem = deckProblem(draftCls, draft);
  $('buildTitle').textContent = `${CLASSES[draftCls].name} deck`;
  $('buildEmbers').textContent = `🔶 ${progress.embers}`;
  $('buildHint').innerHTML = `<b>${draft.length}/${DECK_SIZE}</b> cards, one of each. Click a card to add or remove it.`;
  $('buildSave').disabled = !!problem;
  const pool = order.filter(id => CARDS[id].cls === draftCls).sort((a, b) => rarityIdx(a) - rarityIdx(b) || order.indexOf(a) - order.indexOf(b));
  $('buildGrid').innerHTML = pool.map(id => {
    const r = CARDS[id].r;
    if (isUnlocked(id)) {
      const inDeck = draft.includes(id);
      return `<button class="card-btn pick ${inDeck ? 'in' : ''}" data-toggle="${id}" ${!inDeck && draft.length >= DECK_SIZE ? 'disabled' : ''}>${cardHTML(id, 0, inDeck ? '<span class="owned">✓ In deck</span>' : '')}</button>`;
    }
    if (!progress.seen.includes(id)) return `<div class="card-btn static" title="Find this card in a run to reveal it">${cardBackHTML(id)}</div>`;
    if (!canBuyTier(r)) return `<div class="card-btn static locked">${cardHTML(id, 0)}<span class="lockmark">🔒 Win on ${DIFFICULTIES[buyNeeds(r)].name} to buy</span></div>`;
    const price = UNLOCK_PRICE[r];
    return `<button class="card-btn locked buyable" data-unlock-card="${id}" ${progress.embers < price ? 'disabled' : ''}>${cardHTML(id, 0)}<span class="lockmark">🔶 ${price} · Unlock</span></button>`;
  }).join('');
}
function toggleCard(id) {
  if (!isUnlocked(id)) return;
  const i = draft.indexOf(id);
  if (i >= 0) draft.splice(i, 1);
  else if (draft.length < DECK_SIZE) draft.push(id);
  renderBuilder();
}
function buyCard(id) {
  const c = CARDS[id], price = UNLOCK_PRICE[c.r];
  if (isUnlocked(id) || !progress.seen.includes(id) || !canBuyTier(c.r) || progress.embers < price) return;
  if (!confirm(`Unlock ${c.name} for ${price} Embers?`)) return;
  progress.embers -= price;
  progress.unlocked.push(id);
  saveProgress();
  renderBuilder();
  screenKey = '';
  render();
}
$('buildCancel').onclick = () => $('buildDialog').close();
$('buildReset').onclick = () => { draft = [...DEFAULT_DECK[draftCls]]; renderBuilder(); };
$('buildSave').onclick = () => {
  if (deckProblem(draftCls, draft)) return;
  progress.decks[draftCls] = [...draft];
  saveProgress();
  $('buildDialog').close();
  screenKey = '';
  render();
};

// Another player's starting deck, as the host has it.
function viewDeck(pid) {
  const p = S.players.find(x => x.id === pid);
  if (!p?.cls) return;
  const ids = deckProblem(p.cls, p.loadout) ? DEFAULT_DECK[p.cls] : p.loadout;
  deckMode = 'view';
  $('deckTitle').textContent = `${p.name}'s deck`;
  $('deckHint').textContent = `${CLASSES[p.cls].name} · ${ids.length} cards.`;
  $('deckGrid').innerHTML = [...ids].sort((a, b) => rarityIdx(b) - rarityIdx(a)).map(id => `<div class="card-btn static">${cardHTML(id, 0)}</div>`).join('');
  $('deckDialog').showModal();
}

// Described relative to Normal (the default pace).
const paceInfo = t => `1⚡ every ${+(1.5 * t).toFixed(2)}s · ${t === DEFAULT_TEMPO ? 'standard speed' : `enemies at ${Math.round(DEFAULT_TEMPO / t * 100)}% speed`}`;
function paceHTML() {
  const cur = S.tempo ?? DEFAULT_TEMPO;
  const name = PACES.find(p => p.v === cur)?.name;
  if (!isHost()) return `<p class="pace-note">Pace: <b>${name}</b> <span>(${paceInfo(cur)})</span></p>`;
  return `<h3>Pace</h3>
    <div class="paces">${PACES.map(p => `<button class="pace ${p.v === cur ? 'on' : ''}" data-tempo="${p.v}">
      <b>${p.name}</b><small>${paceInfo(p.v)}</small></button>`).join('')}</div>`;
}

function reachableClient() {
  if (!S.pos) return S.map[0].map((_, i) => `0,${i}`);
  if (S.pos.r >= ROWS - 1) return ['boss'];
  return S.map[S.pos.r][S.pos.i].next.map(i => `${S.pos.r + 1},${i}`);
}

function partyList() {
  return S.players.map(p => `<div class="pline ${p.on ? '' : 'off'}" style="--pc:${pColor(p.id)}">
    <span class="pavatar">${classPic(p.cls)}</span><b>${esc(p.name)}</b><small>${CLASSES[p.cls]?.name || ''} · ❤️ ${p.hp ?? '?'}/${p.maxHp ?? '?'} · ${p.deck.length} cards · 🪙 ${p.gold}${p.on ? '' : ' · away'}</small></div>`).join('');
}

// ---------- Clicks outside combat ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-node]');
  if (!t) return;
  const d = t.dataset;
  if ('copy' in d) copyInvite();
  else if (d.cls) act({ k: 'cls', c: d.cls });
  else if ('start' in d) act({ k: 'start' });
  else if (d.tempo) { act({ k: 'tempo', v: Number(d.tempo) }); store.set('hearthguard-pace', d.tempo); }
  else if (d.diff != null) act({ k: 'diff', v: Number(d.diff) });
  else if ('build' in d) openBuilder();
  else if (d.viewDeck) viewDeck(d.viewDeck);
  else if (d.toggle) toggleCard(d.toggle);
  else if (d.unlockCard) buyCard(d.unlockCard);
  else if ('lobby' in d) act({ k: 'lobby' });
  else if (d.node && S.phase === 'map' && t.classList.contains('can')) act({ k: 'vote', n: d.node });
  else if (d.reward) act({ k: 'reward', c: d.reward });
  else if ('rewardSkip' in d) act({ k: 'reward', c: null });
  else if ('rest' in d) act({ k: 'rest' });
  else if (d.buy != null) act({ k: 'buy', i: Number(d.buy) });
  else if (d.buyRelic != null) act({ k: 'buy', relic: Number(d.buyRelic) });
  else if ('done' in d) act({ k: 'done' });
  else if (d.evote != null) act({ k: 'evote', o: Number(d.evote) });
  else if (d.deck) openDeck(d.deck);
  else if (d.pick != null) {
    const u = Number(d.pick);
    if (deckMode === 'smith') act({ k: 'rest', u });
    if (deckMode === 'remove') act({ k: 'remove', u });
    $('deckDialog').close();
  }
});

// ---------- Deck dialog ----------
let deckMode = 'view';
function openDeck(mode) {
  const m = me();
  if (!m) return;
  deckMode = mode;
  const order = Object.keys(CARDS);
  const deck = [...m.deck].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id) || a.up - b.up);
  $('deckTitle').textContent = { view: 'Your deck', smith: 'Upgrade a card', remove: 'Remove a card' }[mode];
  $('deckHint').textContent = { view: `${deck.length} cards.`, smith: 'Showing what each card becomes once upgraded.', remove: `Pick a card to remove for 🪙 ${REMOVE_PRICE}.` }[mode];
  $('deckGrid').innerHTML = deck.map(c => {
    if (mode === 'view') return `<div class="card-btn static">${cardHTML(c.id, c.up)}</div>`;
    if (mode === 'smith') return `<button class="card-btn" data-pick="${c.u}" ${c.up ? 'disabled' : ''}>${cardHTML(c.id, 1)}</button>`;
    return `<button class="card-btn" data-pick="${c.u}">${cardHTML(c.id, c.up)}</button>`;
  }).join('');
  $('deckDialog').showModal();
}
$('deckClose').onclick = () => $('deckDialog').close();
$('deckDialog').addEventListener('click', e => { if (e.target === $('deckDialog')) $('deckDialog').close(); });

// ---------- Combat UI ----------
let combatDom = null;   // { root, enemies: Map, heroes: Map, hand: [] }
let sel = null;         // selected card uid
let hoverU = null;
let pending = new Map(); // uid -> time we asked to play it

function buildCombat() {
  const main = $('main');
  main.innerHTML = `<div id="combat">
    <div class="hearth" id="hearthEl">
      <div class="hearth-icon">${hearthPic()}</div>
      <div class="hearth-body">
        <div class="hearth-label"><b>Hearth</b><span class="hnum"></span><span class="snum"></span></div>
        <div class="bar big"><i class="hp"></i><i class="sh"></i></div>
      </div>
    </div>
    <div class="enemies" id="enemiesEl"></div>
    <div class="heroes" id="heroesEl"></div>
    <div class="me" id="meEl">
      <div class="me-top">
        <div class="energy" title="Energy"><div class="epips big"></div><span class="enum"></span></div>
        <div class="mycast hidden"><i></i><span></span><button class="x" title="Cancel cast (Esc)">✕</button></div>
        <div class="piles"></div>
      </div>
      <div class="info" id="cardInfo"></div>
      <div class="hand" id="handEl"></div>
    </div>
  </div>`;
  screenKey = '';
  const root = $('combat');
  combatDom = { root, enemies: new Map(), heroes: new Map(), hand: [] };
  for (let i = 0; i < HAND; i++) {
    const b = document.createElement('button');
    b.className = 'hand-card';
    b.dataset.slot = i;
    $('handEl').append(b);
    combatDom.hand.push({ el: b, u: null });
  }
  root.querySelector('.mycast .x').onclick = () => act({ k: 'cancel' });
  $('handEl').addEventListener('click', onHandClick);
  $('handEl').addEventListener('contextmenu', e => {
    const b = e.target.closest('.hand-card');
    if (!b) return;
    e.preventDefault();
    const u = slotU(b.dataset.slot);
    if (u != null) act({ k: 'cycle', u });
  });
  $('handEl').addEventListener('pointerover', e => { const b = e.target.closest('.hand-card'); hoverU = b ? slotU(b.dataset.slot) : null; });
  $('handEl').addEventListener('pointerleave', () => { hoverU = null; });
  $('enemiesEl').addEventListener('click', e => {
    const en = e.target.closest('.enemy');
    if (en && selDef()?.tgt === 'enemy') playSel(en.dataset.id);
  });
  $('heroesEl').addEventListener('click', e => {
    const h = e.target.closest('.hero');
    if (h && selDef()?.tgt === 'ally') playSel(h.dataset.id);
  });
  sel = null;
}

const myHero = () => C?.heroes?.[selfId];
const handCard = u => myHero()?.hand.find(c => c?.u === u);
const touch = matchMedia('(pointer: coarse)');
const selDef = () => { const i = sel != null && handCard(sel); return i ? cardDef(i.id, i.up) : null; };
const slotU = i => myHero()?.hand[i]?.u ?? null;
const aliveEnemies = () => (C?.enemies || []).filter(e => e.hp > 0);

function onHandClick(e) {
  const b = e.target.closest('.hand-card');
  if (!b) return;
  const u = slotU(b.dataset.slot);
  if (u == null) return;
  if (e.target.closest('.cyc')) { act({ k: 'cycle', u }); if (sel === u) sel = null; return; }
  chooseCard(u);
}

function chooseCard(u) {
  const inst = handCard(u), h = myHero();
  if (!inst || !h) return;
  const c = cardDef(inst.id, inst.up);
  // Touch screens have no hover, so the first tap shows the card and the second plays it.
  if (touch.matches && sel !== u) { sel = u; return; }
  if (c.unplayable) { toast('Hex is unplayable. Discard it with ↻ or X.'); return; }
  if (h.ch) { toast('You are still casting'); return; }
  if (sel === u) { playSel(autoTarget(c)); return; }
  const needsPick = (c.tgt === 'enemy' && aliveEnemies().length > 1) || (c.tgt === 'ally' && Object.keys(C.heroes).length > 1);
  if (!needsPick) { sel = u; playSel(autoTarget(c)); return; }
  sel = u;
}

function selHint(c) {
  if (touch.matches) {
    if (c.unplayable) return 'Tap ↻ to discard it.';
    if (c.tgt === 'enemy') return 'Tap an enemy, or tap the card again to hit the most urgent one.';
    if (c.tgt === 'ally') return 'Tap an ally, or tap the card again to target yourself.';
    return 'Tap the card again to play it.';
  }
  return `${c.tgt === 'ally' ? 'Click an ally' : 'Click an enemy'}, or press its key again to auto-target. Esc cancels.`;
}

function autoTarget(c) {
  if (c.tgt === 'ally') return selfId;
  if (c.tgt !== 'enemy') return null;
  const alive = aliveEnemies();
  // The most urgent enemy: the one about to land a move.
  let best = alive[0];
  for (const e of alive) if (e.act && (!best.act || e.act.el / e.act.dur > best.act.el / best.act.dur)) best = e;
  return best?.id ?? null;
}

function playSel(tgt) {
  const u = sel;
  sel = null;
  const inst = handCard(u), h = myHero();
  if (!inst || !h) return;
  const c = cardDef(inst.id, inst.up);
  if (c.tgt === 'enemy' && !aliveEnemies().some(e => e.id === tgt)) { sel = u; return; }
  if (c.tgt === 'ally' && !C.heroes[tgt]) { sel = u; return; }
  if (curEnergy(h) < costFor(c, h) - 0.02) { toast('Not enough ⚡'); return; }
  pending.set(u, performance.now());
  act({ k: 'play', u, t: tgt });
}

document.addEventListener('keydown', e => {
  if (S.phase !== 'combat' || !combatDom || e.target.closest('input, textarea') || $('deckDialog').open) return;
  if (e.key >= '1' && e.key <= String(HAND)) {
    const u = slotU(Number(e.key) - 1);
    if (u != null) chooseCard(u);
  } else if (e.key === 'x' || e.key === 'X') {
    const u = sel ?? hoverU;
    if (u != null) { act({ k: 'cycle', u }); sel = null; }
  } else if (e.key === 'Escape') {
    if (sel != null) sel = null;
    else if (myHero()?.ch) act({ k: 'cancel' });
  }
});

// How far to run the clock forward since the last snapshot, so bars move smoothly.
const ahead = () => Math.min(0.3, (performance.now() - cbAt) / 1000);
function regenRate(h, t) {
  const quick = S.relics?.includes('quick') ? 0.12 : 0;
  return baseRegen() * (1 + h.pw.regen / 100 + quick) * (h.haste > t ? 2 : 1) * (h.slow > t ? 0.5 : 1);
}
function curEnergy(h) {
  if (h.down) return h.e;
  const t = C.t + ahead();
  return Math.min(h.emax, h.e + regenRate(h, t) * ahead());
}

function pips(el, val, max) {
  if (el.childElementCount !== max) el.innerHTML = '<i><b></b></i>'.repeat(max);
  [...el.children].forEach((p, i) => { setW(p.firstChild, val - i); tog(p, 'full', val >= i + 1); });
}

function enemyEl(e) {
  let el = combatDom.enemies.get(e.id);
  if (el) return el;
  el = document.createElement('div');
  el.className = 'enemy';
  el.dataset.id = e.id;
  const d = ENEMIES[e.type];
  el.innerHTML = `
    <div class="intent"><div class="iline"><span class="iicon"></span><span class="iname"></span><span class="idmg"></span></div>
      <div class="itgt"></div><div class="wind"><i></i></div><div class="poise"></div></div>
    <div class="art"><img src="assets/enemies/${e.type}.webp" alt="" draggable="false"></div>
    <div class="ename">${esc(d.name)}</div>
    <div class="bar"><i class="hp"></i><i class="blk"></i><span></span></div>
    <div class="status"></div>
    <div class="taunt-tag"></div>`;
  // Fall back to the emoji if there's no painting for this enemy.
  el.querySelector('.art img').onerror = ev => { ev.target.replaceWith(d.icon); };
  if (d.boss) el.classList.add('boss');
  if (d.elite) el.classList.add('elite');
  $('enemiesEl').append(el);
  combatDom.enemies.set(e.id, el);
  return el;
}

function heroEl(pid) {
  let el = combatDom.heroes.get(pid);
  if (el) return el;
  const p = S.players.find(p => p.id === pid);
  el = document.createElement('div');
  el.className = 'hero' + (pid === selfId ? ' mine' : '');
  el.dataset.id = pid;
  el.style.setProperty('--pc', pColor(pid));
  el.innerHTML = `
    <div class="hname"><span class="havatar">${classPic(p?.cls)}</span><b>${esc(p?.name)}</b><span class="htaunt"></span></div>
    <div class="bar"><i class="hp"></i><span></span></div>
    <div class="hrow"><div class="epips"></div><span class="guard"></span></div>
    <div class="hcast"><i></i><span></span></div>
    <div class="down"></div>`;
  $('heroesEl').append(el);
  combatDom.heroes.set(pid, el);
  return el;
}

function intentFor(e, t) {
  const a = ENEMIES[e.type].acts[e.act.i];
  const weak = e.weak > t ? 0.7 : 1;
  const base = ((a.dmg || 0) + e.str) * weak;
  const dmg = Math.round(base * (C.dm || 1));
  const heroDmg = Math.round(base * (C.hdm ?? C.dm ?? 1));   // hits on heroes scale more gently
  const taunter = e.taunt && C.heroes[e.taunt.pid] && !C.heroes[e.taunt.pid].down ? e.taunt.pid : null;
  let num = '', tgt = '', danger = false;
  const n = v => a.hits > 1 ? `${v}×${a.hits}` : `${v}`;
  switch (a.k) {
    case 'atk': num = n(taunter ? heroDmg : dmg); tgt = taunter ? `→ ${pName(taunter)}` : '→ Hearth'; danger = !taunter; break;
    case 'pounce': num = n(heroDmg); tgt = taunter ? `→ ${pName(taunter)}` : '→ a random hero'; break;
    case 'wave': num = n(dmg); tgt = '→ Hearth (ignores taunt)'; danger = true; break;
    case 'quake': num = n(dmg); tgt = `→ Hearth, and ${heroDmg} to every hero`; danger = true; break;
    case 'block': tgt = 'Gains block'; break;
    case 'buff': tgt = `+${a.v} strength`; break;
    case 'rally': tgt = `All enemies +${a.v} strength`; break;
    case 'heal': tgt = 'Heals'; break;
    case 'summon': tgt = `Summons ${ENEMIES[a.v].name}`; break;
    case 'hex': tgt = `Hexes ${a.v} deck${a.v > 1 ? 's' : ''}`; break;
    case 'drain': tgt = `Everyone −${a.v}⚡`; break;
    case 'slow': tgt = 'Halves ⚡ regen'; break;
  }
  return { a, num, tgt, danger };
}

// The combat view is redrawn many times a second, so these only touch the page when
// a value actually changed. Every write makes the browser redo style and layout,
// which adds up to a lot of heat on phones.
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
const setHTML = (el, v) => { if (el.dataset.v !== v) { el.innerHTML = v; el.dataset.v = v; } };
const setW = (el, frac) => { const w = `${Math.round(clamp01(frac) * 400) / 4}%`; if (el.style.width !== w) el.style.width = w; };
const setHidden = (el, v) => { if (el.hidden !== v) el.hidden = v; };
const tog = (el, cls, on) => { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); };

// About 30 fps is plenty for bars and timers, at half the work of drawing every frame.
const FRAME_MS = 30;
let lastFrame = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (S.phase !== 'combat' || !C || !combatDom) return;
  if (now - lastFrame < FRAME_MS) return;
  lastFrame = now;
  const x = ahead();
  const t = C.t + x;

  // Hearth
  const hEl = $('hearthEl');
  const hp = Math.max(0, S.hearth), max = S.hearthMax;
  const sh = Math.max(0, C.shield - (S.relics?.includes('anchor') ? 0 : (0.4 + C.shield * 0.05) * x / TEMPO));
  setW(hEl.querySelector('.hp'), hp / max);
  setW(hEl.querySelector('.sh'), sh / max);
  setText(hEl.querySelector('.hnum'), `${Math.ceil(hp)} / ${max}`);
  setText(hEl.querySelector('.snum'), sh >= 1 ? `🔷 ${Math.floor(sh)}` : '');
  tog(hEl, 'low', hp / max < 0.3);

  // Enemies
  const seen = new Set();
  for (const e of C.enemies) {
    const el = enemyEl(e);
    seen.add(e.id);
    tog(el, 'dead', e.hp <= 0);
    tog(el, 'stunned', e.stun > t);
    setW(el.querySelector('.bar .hp'), e.hp / e.max);
    setW(el.querySelector('.bar .blk'), e.block / e.max);
    setText(el.querySelector('.bar span'), `${Math.ceil(e.hp)}/${e.max}${e.block ? ` 🛡️${e.block}` : ''}`);
    const st = [];
    if (e.str) st.push(`<span title="Strength: +${e.str} damage">💪${e.str}</span>`);
    if (e.burn) st.push(`<span title="Burn: takes this much damage next second, then it drops by 1">🔥${e.burn}</span>`);
    if (e.vuln > t) st.push(`<span title="Vulnerable: takes 50% more damage">🎯${Math.ceil(e.vuln - t)}s</span>`);
    if (e.weak > t) st.push(`<span title="Weak: deals 30% less damage">🥀${Math.ceil(e.weak - t)}s</span>`);
    if (e.stun > t) st.push(`<span title="Stunned">💫${Math.ceil(e.stun - t)}s</span>`);
    setHTML(el.querySelector('.status'), st.join(''));
    const tt = el.querySelector('.taunt-tag');
    if (e.taunt && e.hp > 0) {
      setText(tt, `Taunted by ${pName(e.taunt.pid)}`);
      const bg = pColor(e.taunt.pid);
      if (tt.dataset.bg !== bg) { tt.style.background = bg; tt.dataset.bg = bg; }
      setHidden(tt, false);
    } else setHidden(tt, true);
    const intent = el.querySelector('.intent');
    if (e.act && e.hp > 0) {
      const info = intentFor(e, t);
      setHidden(intent, false);
      tog(intent, 'danger', info.danger);
      setText(intent.querySelector('.iicon'), INTENT[info.a.k]);
      setText(intent.querySelector('.iname'), info.a.n);
      setText(intent.querySelector('.idmg'), String(info.num));
      setText(intent.querySelector('.itgt'), info.tgt);
      const el2 = e.act.el + (e.stun > t ? 0 : x);
      setW(intent.querySelector('.wind i'), el2 / e.act.dur);
      setHTML(intent.querySelector('.poise'), e.act.maxPoise >= 99 ? '<span title="Can\'t be interrupted">🔒</span>'
        : e.act.maxPoise > 1 ? Array.from({ length: e.act.maxPoise }, (_, i) => `<i class="${i < e.act.poise ? 'on' : ''}"></i>`).join('') : '');
    } else setHidden(intent, true);
    tog(el, 'targetable', sel != null && e.hp > 0 && cardDef(handCard(sel)?.id || 'hex').tgt === 'enemy');
  }
  for (const [id, el] of combatDom.enemies) if (!seen.has(id)) { el.remove(); combatDom.enemies.delete(id); }

  // Heroes
  const selCard = sel != null && handCard(sel) ? cardDef(handCard(sel).id, handCard(sel).up) : null;
  for (const [pid, h] of Object.entries(C.heroes)) {
    const el = heroEl(pid);
    const p = S.players.find(p => p.id === pid);
    tog(el, 'off', !p?.on);
    tog(el, 'isdown', !!h.down);
    tog(el, 'targetable', selCard?.tgt === 'ally');
    setW(el.querySelector('.bar .hp'), h.hp / h.max);
    setText(el.querySelector('.bar span'), `${Math.ceil(h.hp)}/${h.max}`);
    setText(el.querySelector('.guard'), (h.guard ? `🪖 ${Math.round(h.guard)}` : '') + (h.shelter > t ? ' ⚜️' : ''));
    pips(el.querySelector('.epips'), curEnergy(h), h.emax);
    const taunts = C.enemies.filter(e => e.hp > 0 && e.taunt?.pid === pid).length;
    setText(el.querySelector('.htaunt'), taunts ? `😤×${taunts}` : '');
    const hc = el.querySelector('.hcast');
    if (h.ch) {
      setHidden(hc, false);
      const c = cardDef(h.ch.inst.id, h.ch.inst.up);
      setText(hc.querySelector('span'), `${c.icon} ${c.name}`);
      setW(hc.querySelector('i'), (h.ch.el + x * (1 + h.pw.focus / 100)) / h.ch.dur);
    } else setHidden(hc, true);
    setText(el.querySelector('.down'), h.down ? 'Down' : '');
  }

  // My hand
  const h = myHero();
  const meEl = $('meEl');
  setHidden(meEl, !h);
  if (!h) return;
  const e = curEnergy(h);
  pips(meEl.querySelector('.energy .epips'), e, h.emax);
  setText(meEl.querySelector('.enum'), `${Math.floor(e)}/${h.emax}`);
  setHTML(meEl.querySelector('.piles'), `<span title="Draw pile">🂠 ${h.draw.length}</span><span title="Discard pile">♻️ ${h.disc.length}</span>${h.cycleFree ? `<span title="Free discards">↻ free×${h.cycleFree}</span>` : ''}`);
  const mc = meEl.querySelector('.mycast');
  if (h.ch) {
    tog(mc, 'hidden', false);
    const c = cardDef(h.ch.inst.id, h.ch.inst.up);
    setText(mc.querySelector('span'), `Casting ${c.name}…`);
    setW(mc.querySelector('i'), (h.ch.el + x * (1 + h.pw.focus / 100)) / h.ch.dur);
  } else tog(mc, 'hidden', true);
  tog(meEl, 'isdown', !!h.down);

  if (sel != null && !handCard(sel)) sel = null;
  h.hand.forEach((inst, i) => {
    const slot = combatDom.hand[i];
    const u = inst?.u ?? null;
    if (slot.u !== u) {
      slot.u = u;
      if (inst) {
        slot.el.innerHTML = cardHTML(inst.id, inst.up, `<span class="cyc" title="Discard and draw (${h.cycleFree ? 'free' : '1⚡'})">↻</span><span class="key">${i + 1}</span>`);
        slot.el.classList.remove('drawn'); void slot.el.offsetWidth; slot.el.classList.add('drawn');
      } else slot.el.innerHTML = '<div class="cardface empty"></div>';
    }
    if (!inst) return;
    const c = cardDef(inst.id, inst.up);
    const cost = costFor(c, h);
    tog(slot.el, 'poor', !c.unplayable && e < cost - 0.02);
    tog(slot.el, 'busy', !!h.ch || !!h.down);
    tog(slot.el, 'sel', sel === u);
    tog(slot.el, 'pending', pending.has(u) && performance.now() - pending.get(u) < 700);
    const fill = String(cost ? Math.round(clamp01(e / cost) * 100) / 100 : 1);
    if (slot.el.style.getPropertyValue('--fill') !== fill) slot.el.style.setProperty('--fill', fill);
  });

  const infoU = sel ?? hoverU;
  const infoInst = infoU != null ? handCard(infoU) : null;
  const want = infoInst ? (() => { const c = cardDef(infoInst.id, infoInst.up); return `<b>${c.icon} ${esc(c.name)}</b> ${c.cast ? `⏱${c.cast}s ` : ''}· ${cardText(c)}${sel != null ? ` <span class="hint">${selHint(c)}</span>` : ''}`; })()
    : h.down ? `<span class="hint">You're down until a Resurrection or the end of this fight.</span>`
      : touch.matches ? `<span class="hint">Tap a card to read it, tap again to play. ↻ discards it and draws another for 1⚡.</span>`
        : `<span class="hint">Click a card to play it. ↻ (or right-click, or X) discards it and draws another for 1⚡.</span>`;
  setHTML($('cardInfo'), want);
}

// ---------- Floating text ----------
function anchor(to) {
  if (!combatDom) return null;
  if (to === 'hearth' || to === 'shield') return $('hearthEl');
  return combatDom.enemies.get(to) || combatDom.heroes.get(to) || null;
}
function floatText(to, text, cls) {
  const a = anchor(to);
  if (!a) return;
  const r = a.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float ${cls || ''}`;
  f.textContent = text;
  f.style.left = `${r.left + r.width / 2 + (Math.random() * 30 - 15)}px`;
  f.style.top = `${r.top + r.height * 0.35}px`;
  $('fxLayer').append(f);
  setTimeout(() => f.remove(), 1200);
}
function flash(to, cls) {
  const a = anchor(to);
  if (!a) return;
  a.classList.remove(cls); void a.offsetWidth; a.classList.add(cls);
}

function handleEvents(list) {
  for (const ev of list) {
    switch (ev.k) {
      case 'note': toast(ev.x); break;
      case 'gain': if (ev.to === selfId || ev.to === 'team') showGain(ev); break;
      case 'dmg':
        if (ev.v > 0) { floatText(ev.to, `−${ev.v}`, ev.to === 'hearth' ? 'hearth-dmg' : 'dmg'); flash(ev.to, 'hit'); }
        else if (ev.b > 0) floatText(ev.to, `${ev.to === 'hearth' ? '🔷' : combatDom?.heroes.has(ev.to) ? '🪖' : '🛡️'}${ev.b}`, 'blocked');
        break;
      case 'heal': floatText(ev.to, ev.to === 'shield' ? `+${ev.v}🔷` : `+${ev.v}`, 'heal'); break;
      case 'txt': floatText(ev.to, ev.x, ev.c || 'txt'); break;
      case 'eact': floatText(ev.by, ev.x, 'eact'); flash(ev.by, 'lunge'); break;
      case 'cast':
        floatText(ev.by, ev.card, 'cast');
        if (ev.combo) floatText(ev.by, `COMBO ×${(1 + ev.combo * 0.25 * (S.relics?.includes('choir') ? 2 : 1)).toFixed(2).replace(/0$/, '')}`, 'combo');
        break;
      case 'down': flash(ev.to, 'hit'); break;
      case 'die': floatText(ev.to, '☠️', 'txt'); break;
    }
  }
}
