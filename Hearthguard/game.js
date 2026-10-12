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
import { Sim, newLobby, MAX_PLAYERS, HAND, REMOVE_PRICE, ROWS, baseRegen, comboWindow } from './sim.js';

// ---------- Settings ----------
const APP_ID = 'jasonphe-hearthguard';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TICK_MS = 100;
const PCOLORS = ['#ff8a5b', '#5bc0ff', '#c38cff', '#7ee081'];
const NODE_ICONS = { fight: '⚔️', elite: '😈', rest: '🔥', shop: '💰', event: '❓', treasure: '🎁' };
const NODE_NAMES = { fight: 'Fight', elite: 'Elite', rest: 'Campfire', shop: 'Shop', event: 'Unknown', treasure: 'Treasure', boss: 'Boss' };
// Painted UI icons in assets/ui, each with the emoji shown if its image is missing.
const ICONS = {
  atk: '⚔️', pounce: '🎯', wave: '🌊', quake: '💥', block: '🛡️', buff: '💪', rally: '📯', heal: '💚',
  summon: '💀', hex: '🧿', drain: '🪫', slow: '🕸️', burn: '🔥', poison: '🧪', vuln: '🎯', weak: '🥀', stun: '💫',
  energy: '⚡', armor: '🪖', barrier: '🔷', embers: '🔶', gold: '🪙', hp: '❤️', floor: '🪜', deck: '🂠',
  discard: '♻️', cast: '⏱', difficulty: '💀', 'stand-guard': '⚜️', taunt: '😤', interrupt: '✋', revive: '🕊️', lock: '🔒', shatter: '💔', sunder: '🪓', defy: '😠',
  cloaked: '👤', cover: '🫸', twin: '♊', combo: '✨',
};
const ico = (name, title = '') => ICONS[name]
  ? `<img class="ico" src="assets/ui/${name}.webp" alt="${ICONS[name]}"${title ? ` title="${title}"` : ''} draggable="false" onerror="this.replaceWith(this.alt)">`
  : name;

// Card and relic text is written with ⚡; show the painted energy icon in its place.
const iconize = html => html.replace(/ ?⚡/g, m => (m[0] === ' ' ? ' ' : '') + ico('energy'));
const relicText = id => iconize(esc(RELICS[id].text));

// ---------- Helpers ----------
const $ = id => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const cleanText = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const clamp01 = x => Math.max(0, Math.min(1, x));
// Each page load gets a new peer id, so this per-tab key (kept across reloads) is how the
// host recognises a player coming back before their old connection has timed out.
const tabKey = (() => {
  try {
    let k = sessionStorage.getItem('hearthguard-tab');
    if (!k) sessionStorage.setItem('hearthguard-tab', k = realRandom().toString(36).slice(2, 14));
    return k;
  } catch { return realRandom().toString(36).slice(2, 14); }
})();

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

// ---------- Debug cheats (this browser only) ----------
// Kept apart from real progress: while on, every card is usable and every difficulty
// open, decks built go in their own slot, and runs don't touch Embers, unlocks or seen
// cards. Turning them off brings back the real progress exactly as it was.
const CHEAT_KEY = 'hearthguard-cheats';
const cheats = (() => { try { return { cards: false, diffs: false, decks: {}, ...JSON.parse(store.get(CHEAT_KEY) || '{}') }; } catch { return { cards: false, diffs: false, decks: {} }; } })();
const saveCheats = () => store.set(CHEAT_KEY, JSON.stringify(cheats));
const cheating = () => cheats.cards || cheats.diffs;

const isUnlocked = id => cheats.cards || CARDS[id]?.r === 'common' || progress.unlocked.includes(id);
const rarityIdx = id => RARITIES.indexOf(CARDS[id]?.r);
// Remember every card this player has come across in a run, so the deck builder can
// show it (locked) instead of face down.
function noteSeen() {
  const m = me();
  if (!m || S.phase === 'lobby' || cheating()) return;
  const ids = [...(m.deck || []).map(c => c.id), ...(S.reward?.[m.id]?.cards || []), ...(S.shop?.items?.[m.id] || []).map(x => x.id),
    ...(S.event?.gains || []).filter(g => g.pid === m.id && g.card).map(g => g.card)];
  const fresh = ids.filter(id => CARDS[id] && CARDS[id].r !== 'common' && !progress.seen.includes(id));
  if (!fresh.length) return;
  progress.seen.push(...new Set(fresh));
  saveProgress();
}
// The deck this player starts with as `cls`: their saved build, or the default one.
function myDeck(cls) {
  const ids = (cheats.cards ? cheats.decks : progress.decks)[cls];
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
  peers.set(selfId, { name, t: Date.now(), key: tabKey });
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
      for (const [pid, p] of peers) sim.join(pid, p.name, p.key);
    }
    render();
  };
}
const hello = () => ({ n: peers.get(selfId).name, t: peers.get(selfId).t, k: tabKey });
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
    for (const [id, p] of peers) sim.join(id, p.name, p.key);
    if (was !== selfId && S.phase !== 'lobby') toast('You are now hosting the run');
    // A brand-new room starts at the pace this browser last picked.
    const saved = Number(store.get('hearthguard-pace'));
    if (S.phase === 'lobby' && S.players.length <= 1 && PACES.some(p => p.v === saved)) S.tempo = saved;
  }
}

const handlers = {
  hello(d, from) {
    const isNew = !peers.has(from);
    // A duplicated tab copies our key; never let it stand in for us.
    const key = cleanText(d?.k, 24) === tabKey ? '' : cleanText(d?.k, 24);
    // Same tab under a new id (it reloaded or reconnected): its old connection is dead.
    if (key) for (const [id, p] of peers) if (id !== from && id !== selfId && p.key === key) peers.delete(id);
    peers.set(from, { name: cleanText(d?.n, 16) || 'Hero', t: Number(d?.t) || Date.now(), key });
    electHost();
    if (isNew && S.phase === 'lobby') toast(`${pName(from)} joined`);
    if (isHost()) { sim.join(from, peers.get(from).name, key); sim.dirty = true; }
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
  // In a run the logo makes way for the run stats.
  $('topbar').classList.toggle('inrun', !!html);
}
function runbarHTML() {
  const m = me();
  if (S.phase === 'lobby' || !S.hearthMax) return '';
  return `
    <span class="rb-hearth" title="The Hearth: your team's shared life">${hearthPic('rb-icon')} <b>${Math.max(0, Math.ceil(S.hearth))}</b><span class="rb-max">/${S.hearthMax}</span></span>
    ${S.diff ? `<span title="Difficulty: ${DIFFICULTIES[S.diff].name}">${ico('difficulty')}<span class="rb-txt"> ${DIFFICULTIES[S.diff].name}</span></span>` : ''}
    ${m ? `<span title="Your HP">${ico('hp')} ${m.hp}<span class="rb-max">/${m.maxHp}</span></span><span title="Your gold">${ico('gold')} ${m.gold}</span>` : ''}
    <span class="rb-relics">${(S.relics || []).map(r => `<button class="relic" data-relic="${r}" aria-label="${esc(RELICS[r].name)}: ${esc(RELICS[r].text)}">${relicPic(r)}</button>`).join('')}</span>
    ${m ? `<button class="chip" data-deck="view" title="Your deck">${ico('deck')}<span class="rb-txt"> Deck</span></button>` : ''}`;
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
  return `<div class="cardface back r-${c.r}">
    <div class="cback">?</div><div class="ctype">${RARITY_NAMES[c.r]}</div></div>`;
}
// `from` (another version of the card) highlights what changed, for upgrade previews.
function cardHTML(id, up, extra = '', from = null) {
  const c = cardDef(id, up);
  const changed = k => from && from[k] !== c[k] ? ' diff' : '';
  return `<div class="cardface cls-${c.cls} r-${c.r}${c.upgraded ? ' up' : ''}">
    <span class="cost${changed('cost')}">${c.unplayable ? '–' : c.cost}</span>
    ${c.cast ? `<span class="ct${changed('cast')}" title="Cast time">${ico('cast')}${c.cast}s</span>` : ''}
    <div class="cart">${pic(`cards/${c.id}`, c.icon)}</div>
    <div class="cname">${esc(c.name)}</div>
    <div class="ctext">${iconize(from ? diffText(cardText(from), cardText(c)) : cardText(c))}</div>
    <div class="ctype">${c.power ? 'Power' : tgtLabel(c)}</div>
    ${extra}
  </div>`;
}

// Highlights each number in `after` that differs from the matching number in `before`.
// Card text keeps the same wording when upgraded, so the numbers line up in order.
function diffText(before, after) {
  const old = before.match(/\d+(\.\d+)?/g) || [];
  let i = 0;
  return after.replace(/\d+(\.\d+)?/g, n => (old[i++] === n ? n : `<span class="up-diff">${n}</span>`));
}

// The map sidebar: each player's vote, in their color, with the room they picked.
function voteList() {
  return `<div class="waiting votes-list">${S.players.filter(p => p.on).map(p => {
    const v = S.votes?.[p.id];
    const type = v === 'boss' ? 'boss' : v ? S.map[v.split(',')[0]]?.[v.split(',')[1]]?.type : null;
    return `<span class="pchip vote ${v ? 'ok' : ''}" style="--pc:${pColor(p.id)}"><i class="dot"></i>${esc(p.name)} ${type ? `${pic(`icons/${type}`, NODE_ICONS[type] || '👑')} ${NODE_NAMES[type]}` : '…'}</span>`;
  }).join('')}</div>`;
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
        <div><b>${esc(p.name)}</b>${p.id === hostId ? ' <span class="tag">host</span>' : ''}${p.id === selfId ? ' <span class="tag">you</span>' : ''}<br><small>${c ? c.name : 'choosing…'}${p.id === selfId ? ` · ${ico('embers')} ${progress.embers}` : ''}</small>
          ${c ? (p.id === selfId ? `<button class="btn small seat-deck" data-build>${ico('deck')} Edit deck</button>` : `<button class="btn small seat-deck" data-view-deck="${p.id}">${ico('deck')} View deck</button>`) : ''}</div>
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
          <span class="class-icon">${classPic(k)}</span><b>${c.name}</b><span>${c.blurb}</span>
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
          <li><b>No turns.</b> ${ico('energy')} Energy refills over time. Play cards whenever you can afford them. Cards marked ${ico('cast')} take time to cast, and you can't play anything else while casting.</li>
          <li><b>The Hearth</b> ${hearthPic()} is your team's shared life. If it goes out, the run is over. It and your own HP both carry over between fights, so rest at campfires.</li>
          <li>Enemies <b>wind up</b> each move (watch the bar). Attacks hit the Hearth unless someone <b>Taunts</b> that enemy, which sends the hits to the taunter's own HP and ${ico('armor')} Armor. A hero who is knocked out stays down until a Resurrection or the end of the fight. If the whole party is down, the run is over.</li>
          <li><b>Interrupt</b> only works on moves with a <b>poise bar</b>: each interrupt breaks one pip, and the move is cancelled when they're all gone. Moves without one can't be stopped, only stunned, taunted or blocked.</li>
          <li><b>Stuns</b> pause a wind-up, but an enemy that's just been stunned shrugs off new stuns for a while (${ico('lock')}). ${ico('wave')} Waves ignore taunts.</li>
          <li>${ico('barrier')} <b>Barrier</b> soaks hits for the Hearth but fades over time. ${ico('armor')} <b>Armor</b> soaks hits for one hero.</li>
          <li><b>Bigger parties</b> face quicker enemies, extra minions, and moves that shatter Barrier, strip Armor or shrug off taunts.</li>
          <li><b>Combo:</b> a cast that finishes while a teammate is casting (or just finished) is 25% stronger for each teammate.</li>
          <li>Stuck with a bad card? <b>${ico('discard')} Discard</b> it to draw another for 1${ico('energy')}.</li>
          <li><b>${ico('embers')} Embers:</b> every run earns Embers (more for winning and on harder difficulties). Spend them in <b>Edit deck</b> to unlock cards you've found in runs. Rarer cards need a win on a harder difficulty, and each win opens the next one.</li>
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
    // Each vote rings the room in the voter's color and adds a pin with their initial.
    const voteDots = (key, r0 = 19) => {
      const voters = S.players.filter(p => S.votes?.[p.id] === key);
      const rings = voters.map((p, k) => `<circle class="vote-ring" r="${r0 + 4 + k * 4}" style="stroke:${pColor(p.id)}"/>`).join('');
      const pins = voters.map((p, k) => `<g class="vote-pin" transform="translate(${(k - (voters.length - 1) / 2) * 17},${-r0 - 14 - voters.length * 2})">
        <circle r="8" style="fill:${pColor(p.id)};stroke:#1a120c"/><text y="4">${esc((p.name || '?')[0].toUpperCase())}</text><title>${esc(p.name)}</title></g>`).join('');
      return rings + pins;
    };
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
      <circle r="27"/><text y="10" class="big alt">${ENEMIES[S.boss[0]].icon}</text><image href="assets/enemies/${S.boss[0]}.webp" x="-24" y="-26" width="48" height="48" clip-path="circle(24px)" onerror="this.previousElementSibling.classList.remove('alt')"/>${voteDots('boss', 27)}</g>`;
    return `<div class="map-wrap">
      <aside class="panel map-side">
        <h2>The Descent</h2>
        <p class="sub">Vote on the next room. Majority wins, ties are random.</p>
        ${voteList()}
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
      <p class="sub">Everyone gains <b>${ico('gold')} ${S.rewardGold}</b>.${relic ? ` The team found <b>${relicPic(S.rewardRelic)} ${esc(relic.name)}</b>: ${relicText(S.rewardRelic)}` : ''}</p>
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
        <button class="choice" data-rest><b>${pic('icons/rest', '🔥')} Rest</b><span>Heal the Hearth ${heal} and restore your HP (${m.hp}/${m.maxHp}).</span></button>
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
      <div class="card-grid">${items.map((it, i) => `<button class="card-btn ${it.sold ? 'sold' : ''}" data-buy="${i}" ${it.sold || m.gold < it.price ? 'disabled' : ''}>${cardHTML(it.id, 0, `<span class="price">${ico('gold')} ${it.price}</span>`)}</button>`).join('')}</div>
      <h3>Relics</h3>
      <div class="relic-row">${S.shop.relics.map((r, i) => `<button class="relic-btn" data-buy-relic="${i}" ${r.sold || m.gold < r.price ? 'disabled' : ''}>
        <span class="relic-icon">${relicPic(r.id)}</span><b>${esc(RELICS[r.id].name)}</b><small>${relicText(r.id)}</small><span class="price">${r.sold ? 'Sold' : `${ico('gold')} ${r.price}`}</span></button>`).join('') || '<p class="note">Sold out.</p>'}</div>
      <div class="shop-foot">
        <button class="btn ghost" data-deck="remove" ${S.shop.removed[selfId] || m.gold < REMOVE_PRICE ? 'disabled' : ''}>🗑️ Remove a card (${ico('gold')} ${REMOVE_PRICE})</button>
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
      ${r ? `<p class="sub">The team found <b>${relicPic(S.treasure)} ${esc(r.name)}</b>: ${relicText(S.treasure)}</p>` : '<p class="sub">The chest is empty.</p>'}
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
const relicTile = id => `<div class="relic-tile">${relicPic(id)}<div><b>${esc(RELICS[id].name)}</b><span>${relicText(id)}</span></div></div>`;

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
// Any element with data-tip (a title) and data-tipd (what it does) gets the same styled
// panel as relics, on hover, keyboard focus or tap.
const tipAttr = (title, desc) => ` data-tip="${esc(title)}" data-tipd="${esc(desc)}"`;
const TIPPABLE = '[data-relic], [data-tip]';
function showRelicTip(btn) {
  const tip = $('relicTip');
  if (btn.dataset.relic) {
    const id = btn.dataset.relic;
    tip.innerHTML = `${relicPic(id)}<div><b>${esc(RELICS[id].name)}</b><span>${relicText(id)}</span><small>Team relic · helps everyone</small></div>`;
  } else {
    const icon = btn.querySelector('img.ico, img.pic');
    tip.innerHTML = `${icon ? `<img class="ico" src="${icon.getAttribute('src')}" alt="">` : ''}<div><b>${esc(btn.dataset.tip)}</b><span>${iconize(esc(btn.dataset.tipd || ''))}</span></div>`;
  }
  tip.classList.toggle('status', !btn.dataset.relic);
  tip.hidden = false;
  const r = btn.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  // Open above things near the bottom of the screen (like hero panels).
  tip.style.top = `${r.bottom + 8 + hgt > innerHeight - 8 ? Math.max(8, r.top - hgt - 8) : r.bottom + 8}px`;
  tipFor = btn;
}
function hideRelicTip() { $('relicTip').hidden = true; tipFor = null; }
// The open tooltip's numbers changed (a timer ticked): update its text, leave the rest.
function refreshTip(btn) {
  const tip = $('relicTip'), b = tip.querySelector('b'), d = tip.querySelector('span');
  if (!b || !d) { showRelicTip(btn); return; }
  b.textContent = btn.dataset.tip;
  d.innerHTML = iconize(esc(btn.dataset.tipd || ''));
}
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest(TIPPABLE);
  if (b) { if (b !== tipFor) showRelicTip(b); }
  else if (tipFor) hideRelicTip();
});
document.addEventListener('click', e => {
  const b = e.target.closest(TIPPABLE);
  if (b && e.pointerType !== 'mouse') { tipFor === b ? hideRelicTip() : showRelicTip(b); return; }
  if (b) return;
  if (tipFor && !e.target.closest('#relicTip')) hideRelicTip();
});
document.addEventListener('focusin', e => { const b = e.target.closest(TIPPABLE); if (b) showRelicTip(b); });
document.addEventListener('focusout', e => { if (e.target.closest(TIPPABLE)) hideRelicTip(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipFor) hideRelicTip(); });
addEventListener('scroll', () => tipFor && hideRelicTip(), { passive: true });

// ---------- End-of-run stats ----------
const STAT_ROWS = [
  ['dmg', 'atk', 'Total damage dealt'],
  ['burn', 'burn', 'Burn damage'],
  ['poison', 'poison', 'Poison damage'],
  ['kills', 'difficulty', 'Kills'],
  ['tanked', 'block', 'Damage tanked'],
  ['healed', 'heal', 'Healing'],
  ['shield', 'barrier', 'Barrier given'],
  ['guard', 'armor', 'Armor given'],
  ['interrupts', 'interrupt', 'Interrupts'],
  ['energyGiven', 'energy', 'Energy given'],
  ['revives', 'revive', 'Revives'],
  ['cards', 'deck', 'Cards played'],
  ['combos', 'combo', 'Combos'],
  ['downs', 'stun', 'Times knocked out'],
];
// The top player in each of these earns the title.
const MAX_TITLES = 2;
const TITLES = [
  ['dmg', 'Slayer'], ['burn', 'Pyromaniac'], ['poison', 'Venomancer'], ['kills', 'Executioner'], ['tanked', 'Bulwark'],
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
      <dl>${STAT_ROWS.map(([k, icon, label]) => `<div class="${val(p, k) ? '' : 'zero'}"><dt>${ico(icon)} ${label}</dt><dd>${val(p, k).toLocaleString()}</dd></div>`).join('')}</dl>
    </div>`).join('')}</div>`;
}

// ---------- Starting deck, difficulty, Embers ----------
function diffHTML() {
  const cur = S.diff ?? 0;
  const d = DIFFICULTIES[cur];
  if (!isHost()) return `<p class="pace-note">Difficulty: <b>${d.name}</b> <span>(${d.blurb})</span></p>`;
  return `<h3>Difficulty</h3>
    <div class="paces">${DIFFICULTIES.map((x, i) => {
      const open = cheats.diffs || i <= progress.best + 1 || i === cur;
      return `<button class="pace ${i === cur ? 'on' : ''}" data-diff="${i}" ${open ? '' : 'disabled'}>
        <b>${open ? '' : `${ico('lock')} `}${x.name}</b><small>${x.blurb}</small>
        <small>${open ? `${ico('embers')} ×${x.embers} · a win lets you buy <span class="rt r-${x.cap}">${RARITY_NAMES[x.cap]}</span> cards` : `Win on ${DIFFICULTIES[i - 1].name} to open`}</small></button>`;
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
  if (cheating()) return `<div class="unlock"><p class="sub">🛠 Cheats were on, so this run doesn't earn Embers or open difficulties.</p></div>`;
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
    <h3>+${a.n} ${ico('embers')} Embers</h3>
    <p class="sub">You have ${progress.embers}. Spend them on new cards with <b>Edit deck</b> in the lobby.</p>
    ${a.tier ? `<p class="unlock-note">🔓 <span class="rt r-${a.tier}">${RARITY_NAMES[a.tier]}</span> cards can now be bought.</p>` : ''}
    ${a.opened ? `<p class="unlock-note">🔓 <b>${a.opened}</b> difficulty is now open.</p>` : ''}
  </div>`;
}

// Uncommons can be bought from the start; each rarer tier needs a win on the
// difficulty whose `cap` it is.
const buyNeeds = r => DIFFICULTIES.findIndex(d => d.cap === r);
const canBuyTier = r => buyNeeds(r) <= progress.best;

// ---------- Debug menu ----------
// Hidden from normal play: Ctrl+Shift+D, or ?debug in the address, shows it. The 🛠
// button stays in the top bar while any cheat is on, so they're easy to turn off.
const debugWanted = new URLSearchParams(location.search).has('debug');
function renderDebugButton() {
  const on = cheating();
  $('debugBtn').classList.toggle('hidden', !(on || debugWanted));
  $('debugBtn').classList.toggle('on', on);
  $('debugBtn').innerHTML = on ? '🛠 Cheats on' : '🛠';
}
function openDebug() {
  $('cheatCards').checked = cheats.cards;
  $('cheatDiffs').checked = cheats.diffs;
  $('debugDialog').showModal();
}
function setCheat(key, on) {
  cheats[key] = on;
  saveCheats();
  renderDebugButton();
  if ($('buildDialog').open) { draft = [...myDeck(draftCls)]; renderBuilder(); }
  screenKey = '';
  render();
  toast(on ? 'Cheat on' : 'Cheat off: your real progress is back');
}
$('debugBtn').onclick = openDebug;
$('debugClose').onclick = () => $('debugDialog').close();
$('cheatCards').onchange = e => setCheat('cards', e.target.checked);
$('cheatDiffs').onchange = e => setCheat('diffs', e.target.checked);
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) { e.preventDefault(); openDebug(); }
});
renderDebugButton();

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
  $('buildEmbers').innerHTML = `${ico('embers')} ${progress.embers}`;
  $('buildHint').innerHTML = `<b>${draft.length}/${DECK_SIZE}</b> cards, one of each. Click a card to add or remove it.`;
  $('buildSave').disabled = !!problem;
  const pool = order.filter(id => CARDS[id].cls === draftCls).sort((a, b) => rarityIdx(a) - rarityIdx(b) || order.indexOf(a) - order.indexOf(b));
  $('buildGrid').innerHTML = pool.map(id => {
    const r = CARDS[id].r;
    if (isUnlocked(id)) {
      const inDeck = draft.includes(id);
      return `<button class="card-btn pick ${inDeck ? 'in' : ''}" data-toggle="${id}" ${!inDeck && draft.length >= DECK_SIZE ? 'disabled' : ''}>${cardHTML(id, 0)}</button>`;
    }
    if (!progress.seen.includes(id)) return `<div class="card-btn static" title="Find this card in a run to reveal it">${cardBackHTML(id)}</div>`;
    if (!canBuyTier(r)) return `<div class="card-btn static locked">${cardHTML(id, 0)}<span class="lockmark">${ico('lock')} Win on ${DIFFICULTIES[buyNeeds(r)].name} to buy</span></div>`;
    const price = UNLOCK_PRICE[r];
    return `<button class="card-btn locked buyable" data-unlock-card="${id}" ${progress.embers < price ? 'disabled' : ''}>${cardHTML(id, 0)}<span class="lockmark">${ico('embers')} ${price} · Unlock</span></button>`;
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
  if (cheats.cards) { cheats.decks[draftCls] = [...draft]; saveCheats(); }
  else { progress.decks[draftCls] = [...draft]; saveProgress(); }
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
const paceInfo = t => `1${ico('energy')} every ${+(1.5 * t).toFixed(2)}s · ${t === DEFAULT_TEMPO ? 'standard speed' : `enemies at ${Math.round(DEFAULT_TEMPO / t * 100)}% speed`}`;
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
    <span class="pavatar">${classPic(p.cls)}</span><b>${esc(p.name)}</b><small>${CLASSES[p.cls]?.name || ''} · ${ico('hp')} ${p.hp ?? '?'}/${p.maxHp ?? '?'} · ${p.deck.length} cards · ${ico('gold')} ${p.gold}${p.on ? '' : ' · away'}</small></div>`).join('');
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
    if (deckMode === 'smith' && e.pointerType !== 'mouse' && compareFor !== d.pick) { showCompare(t); return; }
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
  $('deckHint').innerHTML = {
    view: `${deck.length} cards.`,
    smith: touch.matches ? 'Tap a card to see it upgraded, then tap it again to upgrade it.' : 'Hover a card to see it upgraded. Click it to upgrade it.',
    remove: `Pick a card to remove for ${ico('gold')} ${REMOVE_PRICE}.`,
  }[mode];
  compareFor = null;
  $('deckGrid').innerHTML = deck.map(c => {
    if (mode === 'view') return `<div class="card-btn static">${cardHTML(c.id, c.up)}</div>`;
    if (mode === 'smith') return c.up
      ? `<button class="card-btn" disabled title="Already upgraded">${cardHTML(c.id, 1)}</button>`
      : `<button class="card-btn" data-pick="${c.u}" data-compare="${c.id}">${cardHTML(c.id, 0)}</button>`;
    return `<button class="card-btn" data-pick="${c.u}">${cardHTML(c.id, c.up)}</button>`;
  }).join('');
  $('deckDialog').showModal();
}
$('deckClose').onclick = () => $('deckDialog').close();
$('deckDialog').addEventListener('close', () => hideCompare());

// The upgrade picker: hovering (or a first tap) turns a card into its upgraded version,
// with the numbers that change highlighted.
let compareFor = null;
function showCompare(btn) {
  if (compareFor === btn.dataset.pick) return;
  hideCompare();
  btn.innerHTML = cardHTML(btn.dataset.compare, 1, '', cardDef(btn.dataset.compare, 0));
  btn.classList.add('previewing');
  compareFor = btn.dataset.pick;
}
function hideCompare() {
  const b = compareFor != null && $('deckGrid').querySelector(`[data-pick="${compareFor}"]`);
  if (b) { b.innerHTML = cardHTML(b.dataset.compare, 0); b.classList.remove('previewing'); }
  compareFor = null;
}
$('deckGrid').addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const b = e.target.closest('[data-compare]');
  if (b) showCompare(b); else hideCompare();
});
$('deckGrid').addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideCompare(); });
// Keyboard focus only: a tap also focuses the card, and that must not count as the first tap.
$('deckGrid').addEventListener('focusin', e => { const b = e.target.closest('[data-compare]'); if (b && b.matches(':focus-visible')) showCompare(b); });
$('deckDialog').addEventListener('click', e => {
  if (e.target === $('deckDialog')) $('deckDialog').close();
  else if (!e.target.closest('[data-compare]')) hideCompare();
});

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
        <div class="hearth-label"><b>Hearth</b><span class="hnum"></span><span class="snum"></span><span class="hpows"></span></div>
        <div class="bar big"><i class="hp"></i><i class="sh"></i></div>
      </div>
    </div>
    <div class="stage" id="stageEl">
      <div class="side heroes" id="heroesEl" data-n="0"></div>
      <div class="side enemies" id="enemiesEl" data-n="0"></div>
    </div>
    <div class="me" id="meEl">
      <div class="me-top">
        <div class="energy" title="Energy"><div class="epips big"></div><span class="enum"></span></div>
        <div class="mycast hidden"><i></i><span></span><button class="x" title="Cancel cast (Esc)">✕</button></div>
        <div class="piles"></div>
      </div>
      <div class="hand" id="handEl"><button class="zoom" id="cardZoom" hidden></button></div>
    </div>
  </div>`;
  screenKey = '';
  const root = $('combat');
  combatDom = { root, enemies: new Map(), heroes: new Map(), hand: [] };
  preloadVfx(S.players.map(p => p.cls));
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
  $('cardZoom').addEventListener('click', () => { if (sel != null) chooseCard(sel); });
  // Tapping anywhere else (that didn't just play the card) puts the selected card back.
  root.addEventListener('click', e => { if (!e.target.closest('.hand, .mycast')) sel = null; });
  $('enemiesEl').addEventListener('click', e => {
    const en = e.target.closest('.enemy');
    // Tapping a target plays the card; without a card, the tap opens the intent's details.
    if (en && selDef()?.tgt === 'enemy') { e.stopPropagation(); playSel(en.dataset.id); }
  });
  $('heroesEl').addEventListener('click', e => {
    const h = e.target.closest('.hero');
    if (h && selDef()?.tgt === 'ally') { e.stopPropagation(); playSel(h.dataset.id); }
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

function autoTarget(c) {
  if (c.tgt === 'ally') {
    // Support cards are weaker on yourself, so they go to the teammate who needs them most:
    // energy to the emptiest, Armor to whoever is taunting, healing to the most hurt.
    if (!c.share) return selfId;
    const others = Object.entries(C.heroes).filter(([id, x]) => id !== selfId && !x.down && S.players.find(p => p.id === id)?.on);
    if (!others.length) return selfId;
    const taunting = id => C.enemies.some(e => e.hp > 0 && e.taunt?.pid === id);
    const need = ([id, x]) => 'energy' in c.fx ? x.e / x.emax : 'mend' in c.fx ? x.hp / x.max : (taunting(id) ? 0 : 1) + x.hp / x.max;
    return others.sort((a, b) => need(a) - need(b))[0][0];
  }
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
  if (curEnergy(h) < costFor(c, h) - 0.02) { toast('Not enough energy'); return; }
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
      <div class="itgt"></div><div class="wrow"><div class="wind"><i></i></div><div class="poise"></div></div></div>
    <div class="fig">
      <div class="art"><img src="assets/enemies/${e.type}.webp" alt="" draggable="false"></div>
      <div class="status"></div>
      <div class="taunt-tag"></div>
    </div>
    <div class="plate">
      <div class="ename">${esc(d.name)}</div>
      <div class="bar"><i class="hp"></i><i class="blk"></i><span></span></div>
    </div>`;
  // Fall back to the emoji if there's no painting for this enemy.
  el.querySelector('.art img').onerror = ev => { ev.target.replaceWith(d.icon); };
  if (d.boss) el.classList.add('boss');
  if (d.elite) el.classList.add('elite');
  $('enemiesEl').append(el);
  combatDom.enemies.set(e.id, el);
  return el;
}

// Classes with full-body pose art (assets/heroes/<cls>-<pose>.webp). The rest stand in
// with their bust until their sheet is sliced.
const HERO_ART = new Set(['knight', 'mage', 'rogue', 'cleric']);
const POSES = ['idle', 'attack', 'cast', 'down'];
// A pose shown briefly after a card lands, by player id: { pose, until } in ms.
const poseFlash = new Map();
const POSE_MS = { attack: 450, cast: 600 };

function heroEl(pid) {
  let el = combatDom.heroes.get(pid);
  if (el) return el;
  const p = S.players.find(p => p.id === pid);
  el = document.createElement('div');
  el.className = 'hero' + (pid === selfId ? ' mine' : '');
  el.dataset.id = pid;
  el.style.setProperty('--pc', pColor(pid));
  const cls = CLASSES[p?.cls] ? p.cls : null;
  // Every pose is in the page from the start, stacked, so swapping one is instant.
  const art = !cls ? '❔'
    : HERO_ART.has(cls) ? POSES.map(k => `<img class="pose" data-pose="${k}" src="assets/heroes/${cls}-${k}.webp" alt="" draggable="false">`).join('')
    : `<img class="bust" src="assets/classes/${cls}.webp" alt="" draggable="false">`;
  el.innerHTML = `
    <div class="fig">
      <div class="art${HERO_ART.has(cls) ? ' posed' : ''}" style="--breathe-delay: ${(-Math.random() * 3).toFixed(2)}s">${art}</div>
      <span class="guard"></span>
      <span class="htaunt"></span>
      <div class="down"></div>
    </div>
    <div class="plate">
      <div class="hname"><b>${esc(p?.name)}</b></div>
      <div class="bar"><i class="hp"></i><span></span></div>
      <div class="hcast"><i></i><span></span></div>
    </div>`;
  if (cls && !HERO_ART.has(cls)) el.querySelector('.art img').onerror = ev => { ev.target.replaceWith(CLASSES[cls].icon); };
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
    case 'shatter': num = a.dmg ? n(dmg) : ''; tgt = `Breaks ${a.v >= 1 ? '' : `${Math.round(a.v * 100)}% `}Barrier${a.dmg ? ' → Hearth' : ''}`; danger = !!a.dmg; break;
    case 'sunder': num = a.dmg ? n(heroDmg) : ''; tgt = `Strips ${a.v >= 1 ? 'all' : `${Math.round(a.v * 100)}% of`} Armor${a.dmg ? ', hits every hero' : ''}`; break;
    case 'defy': num = a.dmg ? n(dmg) : ''; tgt = `Can't be taunted for ${a.v * TEMPO}s${a.dmg ? ', → Hearth' : ''}`; danger = !!a.dmg; break;
  }
  return { a, num, tgt, danger };
}

// The combat view is redrawn many times a second, so these only touch the page when
// a value actually changed. Every write makes the browser redo style and layout,
// which adds up to a lot of heat on phones.
const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
const setHTML = (el, v) => { if (el.dataset.v !== v) { el.innerHTML = v; el.dataset.v = v; } };
// What each enemy move kind does, for the intent icon's tooltip.
const INTENT_TIPS = {
  atk: 'An attack on the Hearth, or on whoever has taunted this enemy.',
  pounce: 'An attack on a random hero, or on whoever has taunted this enemy.',
  wave: 'Hits the Hearth and ignores taunts. Interrupt it if it has a poise bar, or raise Barrier.',
  quake: 'Hits the Hearth and every hero.',
  block: 'Gains block that soaks damage.',
  buff: 'Gains strength: its attacks hit harder for the rest of the fight.',
  rally: 'Every enemy gains strength.',
  heal: 'Restores its HP.',
  summon: 'Calls another enemy into the fight.',
  hex: 'Shuffles unplayable Hex cards into decks. Discard them to get rid of them.',
  drain: 'Drains energy from every hero.',
  slow: "Halves every hero's energy regen for a while.",
  shatter: "Breaks the Hearth's Barrier, then hits the Hearth. Only bigger parties see it.",
  sunder: "Strips every hero's Armor, then hits each of them. Only bigger parties see it.",
  defy: "Shakes off any taunt and can't be taunted for a while. Only bigger parties see it.",
};

// Status icons on a hero panel, each with a tooltip.
function heroStatuses(pid, h, t) {
  const out = [];
  const left = until => `${Math.ceil(until - t)}s left.`;
  const tag = (k, icon, title, desc, label = '') => out.push({ k, icon, label, tip: title, tipd: desc });
  if (h.guard) tag('armor', ico('armor'), `Armor ${Math.round(h.guard)}`, 'Soaks hits on this hero before their HP.', ` ${Math.round(h.guard)}`);
  if (h.shelter > t) tag('shelter', ico('stand-guard'), 'Standing guard', `This hero's Armor also soaks hits on the Hearth. ${left(h.shelter)}`);
  if (h.vanish > t) tag('vanish', ico('cloaked'), 'Cloaked', `Enemies can't hurt this hero. ${left(h.vanish)}`);
  if (h.cover && h.cover.until > t && C.heroes[h.cover.by] && h.cover.by !== pid) tag('cover', ico('cover'), `Covered by ${pName(h.cover.by)}`, `Hits aimed at this hero go to ${pName(h.cover.by)} instead. ${left(h.cover.until)}`);
  if (h.haste > t) tag('haste', ico('energy'), 'Hasted', `Regenerates ⚡ twice as fast. ${left(h.haste)}`);
  if (h.slow > t) tag('slow', ico('slow'), 'Slowed', `Regenerates ⚡ at half speed. ${left(h.slow)}`);
  if (h.empower) tag('empower', ico('buff'), `Empowered +${h.empower}`, `This hero's next attack deals ${h.empower} more damage.`, ` +${h.empower}`);
  if (h.twin) tag('twin', ico('twin'), 'Twincast ready', 'The next spell with a cast time resolves twice.');
  // Powers this hero played that act on themselves; team-wide ones sit on the Hearth.
  for (const [id, up] of h.powers || []) {
    const c = cardDef(id, up);
    if (c.tgt !== 'none') tag(`pw:${id}:${up}`, powerPic(c), c.name, `Active for the rest of the fight. ${powerText(c)}`);
  }
  return out;
}

// Active powers show as their card art, with the card's text (minus markup) as the tooltip.
const powerPic = c => pic(`cards/${c.id}`, c.icon, 'pw-pic');
const powerText = c => cardText(c).replace(/<[^>]+>/g, '').replace(/(^|\. )Power: (.)/g, (m, a, ch) => a + ch.toUpperCase());
function teamPowers() {
  const out = [];
  for (const [pid, h] of Object.entries(C.heroes)) for (const [id, up] of h.powers || []) {
    const c = cardDef(id, up);
    if (c.tgt === 'none') out.push({ k: `pw:${pid}:${id}:${up}`, icon: powerPic(c), tip: c.name, tipd: `Played by ${pName(pid)}, active for the rest of the fight. ${powerText(c)}` });
  }
  return out;
}

// Status chips (icon + number, each with a tooltip) are updated in place, keyed by `k`:
// the same chip stays put while its numbers tick, and new chips go on the end, so a
// hovered tooltip doesn't flicker and chips don't slide around.
function syncChips(box, items, cls = 'hs') {
  const have = new Map([...box.children].map(c => [c.dataset.k, c]));
  for (const it of items) {
    let c = have.get(it.k);
    have.delete(it.k);
    if (!c) {
      c = document.createElement('span');
      c.className = cls;
      c.dataset.k = it.k;
      c.innerHTML = `${it.icon}<span class="n"></span>`;
      box.append(c);
    }
    setText(c.querySelector('.n'), it.label || '');
    if (c.dataset.tip !== it.tip || c.dataset.tipd !== it.tipd) {
      c.dataset.tip = it.tip;
      c.dataset.tipd = it.tipd;
      if (tipFor === c) refreshTip(c);
    }
  }
  for (const c of have.values()) { if (tipFor === c) hideRelicTip(); c.remove(); }
}

// Who would combo with `pid` if their cast landed at fight-time `at`: teammates still
// casting then, or who finished a cast within the combo window before it.
function comboPartners(pid, at, now) {
  const W = comboWindow(), out = [];
  for (const [id, x] of Object.entries(C.heroes)) {
    if (id === pid || x.down || !S.players.find(p => p.id === id)?.on) continue;
    const lands = x.ch ? now + (x.ch.dur - x.ch.el) / (1 + x.pw.focus / 100) : x.lastCh;
    if (lands > at - W && (x.ch || x.lastCh > -9)) out.push(id);
  }
  return out;
}
const comboMult = n => 1 + 0.25 * n * (S.relics?.includes('choir') ? 2 : 1);
const comboLabel = n => `×${comboMult(n).toFixed(2).replace(/0$/, '')}`;

const setW = (el, frac) => { const w = `${Math.round(clamp01(frac) * 400) / 4}%`; if (el.style.width !== w) el.style.width = w; };
const setHidden = (el, v) => { if (el.hidden !== v) el.hidden = v; };
// How many units stand on a side of the stage; the CSS lays out the formation from it.
const setCount = (el, n) => { if (el.dataset.n !== String(n)) el.dataset.n = n; };
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
  syncChips(hEl.querySelector('.hpows'), teamPowers());
  syncChips(hEl.querySelector('.snum'), sh >= 1 ? [{ k: 'barrier', icon: ico('barrier'), label: ` ${Math.floor(sh)}`, tip: `Barrier ${Math.floor(sh)}`, tipd: S.relics?.includes('anchor') ? 'Soaks hits on the Hearth. The Anchor stops it from fading.' : 'Soaks hits on the Hearth, and slowly fades.' }] : [], '');
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
    setText(el.querySelector('.bar span'), `${Math.ceil(e.hp)}/${e.max}`);
    const st = [];
    const left = until => `${Math.ceil(until - t)}s left.`;
    const tag = (k, title, desc, label, icon = ico(k)) => st.push({ k, icon, label: String(label), tip: title, tipd: desc });
    if (e.str) tag('buff', `Strength +${e.str}`, `Its attacks deal ${e.str} more damage.`, e.str);
    if (e.burn) tag('burn', `Burn ${e.burn}`, `Takes ${e.burn} damage each second, then Burn drops by 1. Ignores block.`, e.burn);
    if (e.poison) tag('poison', `Poison ${e.poison}`, `Takes ${e.poison} damage each second, then Poison drops by 1. Ignores block.`, e.poison);
    if (e.vuln > t) tag('vuln', 'Vulnerable', `Takes 50% more damage. ${left(e.vuln)}`, `${Math.ceil(e.vuln - t)}s`);
    if (e.weak > t) tag('weak', 'Weak', `Deals 30% less damage. ${left(e.weak)}`, `${Math.ceil(e.weak - t)}s`);
    if (e.stun > t) tag('stun', 'Stunned', `Can't act, and its wind-up is paused. ${left(e.stun)}`, `${Math.ceil(e.stun - t)}s`);
    else if (e.stunImmune > t) tag('steady', 'Steadfast', `Just shook off a stun, so it can't be stunned again yet. ${left(e.stunImmune)}`, `${Math.ceil(e.stunImmune - t)}s`, ico('lock'));
    if (e.defiant > t) tag('defy', 'Defiant', `Can't be taunted. ${left(e.defiant)}`, `${Math.ceil(e.defiant - t)}s`);
    if (e.block) tag('block', `Block ${e.block}`, `Soaks the next ${e.block} damage before its HP. Burn and Poison ignore it.`, e.block);
    syncChips(el.querySelector('.status'), st, '');
    const tt = el.querySelector('.taunt-tag');
    if (e.taunt && e.hp > 0) {
      setHTML(tt, `${ico('taunt')}<span>${esc(pName(e.taunt.pid))}</span>`);
      const td = `Its attacks hit ${pName(e.taunt.pid)} (and their Armor) instead of the Hearth. ${Math.max(0, Math.ceil(e.taunt.until - t))}s left.`;
      if (tt.dataset.tipd !== td) { tt.dataset.tip = 'Taunted'; tt.dataset.tipd = td; }
      const bg = pColor(e.taunt.pid);
      if (tt.dataset.bg !== bg) { tt.style.background = bg; tt.dataset.bg = bg; }
      setHidden(tt, false);
    } else setHidden(tt, true);
    const intent = el.querySelector('.intent');
    if (e.act && e.hp > 0) {
      const info = intentFor(e, t);
      tog(intent, 'vacant', false);
      tog(intent, 'danger', info.danger);
      setHTML(intent.querySelector('.iicon'), ico(info.a.k));
      const poiseTip = e.act.maxPoise > 0 && e.act.maxPoise < 99 ? ` Poise ${e.act.poise}/${e.act.maxPoise}: takes ${e.act.poise} more interrupt${e.act.poise > 1 ? 's' : ''} to cancel.` : " Can't be interrupted.";
      const itip = `${info.num ? `${info.num} ` : ''}${info.tgt}. ${INTENT_TIPS[info.a.k] || ''}${poiseTip}`;
      if (intent.dataset.tip !== info.a.n || intent.dataset.tipd !== itip) {
        intent.dataset.tip = info.a.n;
        intent.dataset.tipd = itip;
        if (tipFor === intent) refreshTip(intent);
      }
      setText(intent.querySelector('.iname'), info.a.n);
      setText(intent.querySelector('.idmg'), String(info.num));
      setHTML(intent.querySelector('.itgt'), iconize(esc(info.tgt)));
      const el2 = e.act.el + (e.stun > t ? 0 : x);
      setW(intent.querySelector('.wind i'), el2 / e.act.dur);
      // Only moves with poise can be interrupted; the pips are the cue.
      setHTML(intent.querySelector('.poise'), e.act.maxPoise > 0 && e.act.maxPoise < 99 ? `<span class="pips">${Array.from({ length: e.act.maxPoise }, (_, i) => `<i class="${i < e.act.poise ? 'on' : ''}"></i>`).join('')}</span>` : '');
    } else {
      tog(intent, 'vacant', true);
      if (tipFor === intent) hideRelicTip();
    }
    tog(el, 'targetable', sel != null && e.hp > 0 && cardDef(handCard(sel)?.id || 'hex').tgt === 'enemy');
  }
  for (const [id, el] of combatDom.enemies) if (!seen.has(id)) { el.remove(); combatDom.enemies.delete(id); }
  setCount($('enemiesEl'), combatDom.enemies.size);

  // Heroes
  const selCard = sel != null && handCard(sel) ? cardDef(handCard(sel).id, handCard(sel).up) : null;
  for (const [pid, h] of Object.entries(C.heroes)) {
    const el = heroEl(pid);
    const p = S.players.find(p => p.id === pid);
    tog(el, 'off', !p?.on);
    tog(el, 'isdown', !!h.down);
    setPose(el, pid, h);
    tog(el, 'targetable', selCard?.tgt === 'ally');
    setW(el.querySelector('.bar .hp'), h.hp / h.max);
    setText(el.querySelector('.bar span'), `${Math.ceil(h.hp)}/${h.max}`);
    syncChips(el.querySelector('.guard'), heroStatuses(pid, h, t));
    const taunts = C.enemies.filter(e => e.hp > 0 && e.taunt?.pid === pid).length;
    setHTML(el.querySelector('.htaunt'), taunts ? `<span${tipAttr(`Taunting ${taunts}`, `${taunts} enem${taunts > 1 ? 'ies are' : 'y is'} attacking this hero instead of the Hearth.`)}>${ico('taunt')}×${taunts}</span>` : '');
    const hc = el.querySelector('.hcast');
    const windowLeft = !h.ch && pid !== selfId && !h.down ? h.lastCh + comboWindow() - t : 0;
    if (h.ch) {
      tog(hc, 'vacant', false);
      const c = cardDef(h.ch.inst.id, h.ch.inst.up);
      setText(hc.querySelector('span'), `${c.icon} ${c.name}`);
      setW(hc.querySelector('i'), (h.ch.el + x * (1 + h.pw.focus / 100)) / h.ch.dur);
    } else if (windowLeft > 0) {
      tog(hc, 'vacant', false);
      setText(hc.querySelector('span'), 'Combo window');
      setW(hc.querySelector('i'), windowLeft / comboWindow());
    } else tog(hc, 'vacant', true);
    // A teammate's cast (or the window after it) is a chance to combo.
    tog(hc, 'combo-open', pid !== selfId && (!!h.ch || windowLeft > 0));
    tog(hc, 'window', windowLeft > 0);
    const dn = el.querySelector('.down');
    setText(dn, h.down ? 'Down' : '');
    if (h.down && !dn.dataset.tip) { dn.dataset.tip = 'Knocked out'; dn.dataset.tipd = "Can't act until a Resurrection or the end of the fight."; }
  }

  setCount($('heroesEl'), combatDom.heroes.size);

  // My hand
  const h = myHero();
  const meEl = $('meEl');
  setHidden(meEl, !h);
  if (!h) return;
  const e = curEnergy(h);
  pips(meEl.querySelector('.energy .epips'), e, h.emax);
  setText(meEl.querySelector('.enum'), `${Math.floor(e)}/${h.emax}`);
  setHTML(meEl.querySelector('.piles'), `<span title="Draw pile">${ico('deck')} ${h.draw.length}</span><span title="Discard pile">${ico('discard')} ${h.disc.length}</span>${h.cycleFree ? `<span title="Free discards">↻ free×${h.cycleFree}</span>` : ''}`);
  const mc = meEl.querySelector('.mycast');
  if (h.ch) {
    tog(mc, 'hidden', false);
    const c = cardDef(h.ch.inst.id, h.ch.inst.up);
    const lands = t + (h.ch.dur - h.ch.el - x * (1 + h.pw.focus / 100)) / (1 + h.pw.focus / 100);
    const n = comboPartners(selfId, lands, t).length;
    setText(mc.querySelector('span'), `Casting ${c.name}…${n ? ` · Combo ${comboLabel(n)}` : ''}`);
    setW(mc.querySelector('i'), (h.ch.el + x * (1 + h.pw.focus / 100)) / h.ch.dur);
    tog(mc, 'combo', n > 0);
  } else tog(mc, 'hidden', true);
  tog(meEl, 'isdown', !!h.down);

  if (sel != null && !handCard(sel)) sel = null;
  h.hand.forEach((inst, i) => {
    const slot = combatDom.hand[i];
    const u = inst?.u ?? null;
    if (slot.u !== u) {
      slot.u = u;
      if (inst) {
        slot.el.innerHTML = cardHTML(inst.id, inst.up, `<span class="cyc" title="Discard and draw (${h.cycleFree ? 'free' : '1 energy'})">${ico('discard')}</span><span class="key">${i + 1}</span>`);
        slot.el.classList.remove('drawn'); void slot.el.offsetWidth; slot.el.classList.add('drawn');
      } else slot.el.innerHTML = '<div class="cardface empty"></div>';
    }
    if (!inst) return;
    const c = cardDef(inst.id, inst.up);
    const cost = costFor(c, h);
    // The printed cost, after discounts like Archmage Ascendant.
    if (!c.unplayable) { const ce = slot.el.querySelector('.cost'); setText(ce, String(cost)); tog(ce, 'cheaper', cost < c.cost); }
    tog(slot.el, 'poor', !c.unplayable && e < cost - 0.02);
    tog(slot.el, 'busy', !!h.ch || !!h.down);
    tog(slot.el, 'sel', sel === u);
    tog(slot.el, 'pending', pending.has(u) && performance.now() - pending.get(u) < 700);
    const fill = String(cost ? Math.round(clamp01(e / cost) * 100) / 100 : 1);
    if (slot.el.style.getPropertyValue('--fill') !== fill) slot.el.style.setProperty('--fill', fill);
    const n = c.cast > 0 && !h.ch && !h.down ? comboPartners(selfId, t + c.cast / (1 + h.pw.focus / 100), t).length : 0;
    const label = n ? comboLabel(n) : '';
    if ((slot.el.dataset.combo || '') !== label) { if (label) slot.el.dataset.combo = label; else delete slot.el.dataset.combo; }
  });

  // Phones: the selected card pops up full size, with its text, above the hand.
  const zoom = $('cardZoom');
  const zInst = sel != null ? handCard(sel) : null;
  setHidden(zoom, !zInst);
  if (zInst) {
    tog(zoom, 'right', cardDef(zInst.id, zInst.up).tgt === 'ally');
    const slot = combatDom.hand.find(s => s.u === sel)?.el;
    setHTML(zoom, cardHTML(zInst.id, zInst.up));
    if (slot) {
      const sc = slot.querySelector('.cost'), zc = zoom.querySelector('.cost');
      if (sc && zc) { setText(zc, sc.textContent); tog(zc, 'cheaper', sc.classList.contains('cheaper')); }
      tog(zoom, 'poor', slot.classList.contains('poor'));
      const fill = slot.style.getPropertyValue('--fill');
      if (zoom.style.getPropertyValue('--fill') !== fill) zoom.style.setProperty('--fill', fill);
    }
  }
}

// Down beats everything, then a pose flashed by a card that just landed, then casting.
function setPose(el, pid, h) {
  const art = el.querySelector('.art.posed');
  if (!art) return;
  const f = poseFlash.get(pid);
  const pose = h.down ? 'down' : f && f.until > performance.now() ? f.pose : h.ch ? 'cast' : 'idle';
  if (art.dataset.pose === pose) return;
  art.dataset.pose = pose;
  for (const img of art.children) tog(img, 'on', img.dataset.pose === pose);
}

// ---------- Floating text ----------
function anchor(to) {
  if (!combatDom) return null;
  if (to === 'hearth' || to === 'shield') return $('hearthEl');
  return combatDom.enemies.get(to) || combatDom.heroes.get(to) || null;
}
function floatText(to, text, cls, html = false) {
  const a = anchor(to);
  if (!a) return;
  const r = a.getBoundingClientRect();
  const f = document.createElement('div');
  f.className = `float ${cls || ''}`;
  if (html) f.innerHTML = text; else f.textContent = text;
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

// ---------- Effects ----------
// Painted sprites in assets/vfx (black keyed to transparency when sliced). Most cards have
// a recipe in CARD_FX; the rest get their class's default hit. Status overlays (poison,
// stun, weak, energy, powers…) are added from the card's fx keys either way. Melee hits
// appear on the target; only spells and thrown things fly. Each sprite is a short-lived
// <img> moved with transforms only, which phones handle cheaply, capped at VFX_MAX at once.
const VFX_SETS = {
  base: ['slash', 'impact', 'fireball', 'frost', 'arcane', 'lightning', 'dagger', 'poison', 'holy',
    'barrier', 'armor', 'heal', 'shout', 'stun', 'smoke', 'claw', 'shadow', 'curse', 'fissure'],
  shared: ['energy', 'empower', 'weaken', 'vulnerable', 'haste', 'thorns', 'powerrune', 'soul', 'killblow'],
  knight: ['smash', 'cleave', 'shieldbash', 'fissure', 'sunder', 'banner', 'challenge', 'ward', 'shieldtoss'],
  rogue: ['assassinate', 'xslash', 'garrote', 'knives', 'vial', 'deathmark', 'shadowstep', 'caltrops', 'coins'],
  mage: ['meteor', 'flamewave', 'explosion', 'frostnova', 'blizzard', 'missiles', 'timerune', 'manasurge', 'brokenrune'],
  cleric: ['pillar', 'lightsword', 'wings', 'holyfire', 'consecrate', 'bell', 'hymn', 'lanternflare', 'bloodlight'],
};
const VFX_MAX = 28;
const calmMotion = matchMedia('(prefers-reduced-motion: reduce)');
// Decode the sprites a fight can use up front (the party's classes), so the first Fireball
// doesn't stutter and phones don't download sets nobody plays.
const vfxKept = new Map();
function preloadVfx(classes) {
  for (const n of [...VFX_SETS.base, ...VFX_SETS.shared, ...classes.flatMap(c => VFX_SETS[c] || [])]) {
    if (vfxKept.has(n)) continue;
    const i = new Image();
    i.src = `assets/vfx/${n}.webp`;
    vfxKept.set(n, i);
  }
}

// Where an effect lands on a unit: its figure (or the Hearth's brazier), and how big that
// figure is, so effects scale with the stage.
function fxSpot(to) {
  if (!combatDom) return null;
  const el = to === 'hearth' || to === 'shield' ? $('hearthEl').querySelector('.hearth-icon')
    : combatDom.enemies.get(to)?.querySelector('.fig') || combatDom.heroes.get(to)?.querySelector('.fig');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.55, bottom: r.bottom, size: Math.max(56, Math.min(r.height, 170)) };
}
// `at`: 'mid' centres on the figure, 'feet' lays a flat decal on the ground under it,
// 'stand' stands the sprite on the ground (pillars, flames, auras that rise).
const fxY = (p, s, at) => at === 'feet' ? p.bottom - s * 0.16 : at === 'stand' ? p.bottom - s * 0.46 : p.y;

function fxSprite(name, x, y, size, rot = 0, flip = false, filter = '') {
  const layer = $('fxLayer');
  if (layer.childElementCount >= VFX_MAX) return null;
  const img = document.createElement('img');
  img.className = 'vfx';
  img.src = `assets/vfx/${name}.webp`;
  img.alt = '';
  img.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size}px${filter ? `;filter:${filter}` : ''}`;
  layer.append(img);
  img.dataset.base = `translate(-50%, -50%) rotate(${rot}rad) scaleX(${flip ? -1 : 1})`;
  return img;
}

// A burst in place: pops in, swells a little and fades. `thrust` drives it a few pixels
// forward as it appears, like a stab; `dy` and `rot` vary repeated hits.
function fxBurst(name, to, { scale = 1, delay = 0, rise = 0, flip = false, dur = 520, thrust = 0, dy = 0, rot = 0, at = 'mid', filter = '' } = {}) {
  const p = fxSpot(to);
  if (!p) return;
  const s = p.size * scale;
  const img = fxSprite(name, p.x, fxY(p, s, at) + dy, s, rot, flip, filter);
  if (!img) return;
  const b = img.dataset.base;
  img.animate([
    { transform: `${b} translate(${-thrust}px, 0) scale(.55)`, opacity: 0 },
    { transform: `${b} translate(0, ${-rise * 0.4}px) scale(1.05)`, opacity: 1, offset: 0.3 },
    { transform: `${b} translate(0, ${-rise}px) scale(1.15)`, opacity: 0 },
  ], { duration: dur, delay, easing: 'ease-out', fill: 'both' }).onfinish = () => img.remove();
}

// A projectile from one unit to another, pointed along its path, then `then()` on arrival.
// Sprites are painted heading right (or left, with `left`), and turned to face the target.
function fxShot(name, from, to, { scale = 0.8, delay = 0, left = false, filter = '', then } = {}) {
  const a = fxSpot(from), b = fxSpot(to);
  if (!a || !b) return;
  if (calmMotion.matches) { setTimeout(() => then?.(), delay); return; }
  const dx = b.x - a.x, dy = b.y - a.y;
  const rot = Math.atan2(dy, dx) + (left ? Math.PI : 0);
  const img = fxSprite(name, a.x, a.y, Math.min(a.size, b.size) * scale, rot, false, filter);
  if (!img) { setTimeout(() => then?.(), delay); return; }
  const base = `translate(-50%, -50%)`, turn = `rotate(${rot}rad)`;
  const dur = Math.min(420, 160 + Math.hypot(dx, dy) * 0.6);
  img.animate([
    { transform: `${base} translate(0, 0) ${turn} scale(.6)`, opacity: 0 },
    { transform: `${base} translate(${dx * 0.15}px, ${dy * 0.15}px) ${turn} scale(1)`, opacity: 1, offset: 0.15 },
    { transform: `${base} translate(${dx}px, ${dy}px) ${turn} scale(1)`, opacity: 1 },
  ], { duration: dur, delay, easing: 'ease-in', fill: 'both' }).onfinish = () => { img.remove(); then?.(); };
}

// Something falling onto a unit from off to the side and above (a meteor, a sword of light).
function fxDrop(name, to, { scale = 1, delay = 0, from = [-160, -260], at = 'mid', then } = {}) {
  const p = fxSpot(to);
  if (!p) return;
  if (calmMotion.matches) { setTimeout(() => then?.(), delay); return; }
  const s = p.size * scale;
  const img = fxSprite(name, p.x, fxY(p, s, at), s);
  if (!img) { setTimeout(() => then?.(), delay); return; }
  const b = img.dataset.base;
  img.animate([
    { transform: `${b} translate(${from[0]}px, ${from[1]}px)`, opacity: 0 },
    { transform: `${b} translate(${from[0] * 0.75}px, ${from[1] * 0.75}px)`, opacity: 1, offset: 0.2 },
    { transform: `${b} translate(0, 0)`, opacity: 1 },
  ], { duration: 380, delay, easing: 'ease-in', fill: 'both' }).onfinish = () => { img.remove(); then?.(); };
}

// A bolt that jumps from the caster to each target in turn.
function fxChain(name, from, ids, i = 0) {
  if (i >= ids.length) return;
  fxShot(name, i ? ids[i - 1] : from, ids[i], { scale: 0.9, then: () => { fxBurst('impact', ids[i], { scale: 0.45 }); fxChain(name, from, ids, i + 1); } });
}

// A short jolt of the whole stage for the biggest hits.
function fxShake(delay = 0) {
  if (calmMotion.matches || !$('stageEl')) return;
  $('stageEl').animate([
    { transform: 'translate(0, 0)' }, { transform: 'translate(-7px, 3px)' }, { transform: 'translate(6px, -3px)' },
    { transform: 'translate(-3px, 2px)' }, { transform: 'translate(0, 0)' },
  ], { duration: 340, delay });
}

// The mage's element, from the spell's name or what it does.
function mageElement(c) {
  if (/frost|ice|blizzard|nova/i.test(c.name)) return 'frost';
  if (/lightning|torrent/i.test(c.name) || 'zap' in c.fx) return 'lightning';
  if (/fire|flame|pyro|meteor|inferno|ignite|scorch|combust|detonat/i.test(c.name) || 'burn' in c.fx || 'detonate' in c.fx) return 'fireball';
  return 'arcane';
}
const ROGUE_THROWN = /fan of knives|crimson fan|dart/i;
const HARMFUL = ['dmg', 'guardDmg', 'shieldDmg', 'detonate', 'guardBlast', 'zap', 'burn', 'poison', 'interrupt', 'stun', 'weak', 'vuln', 'exec', 'caltrops'];
const HITS = ['dmg', 'zap', 'guardDmg', 'shieldDmg', 'guardBlast', 'exec', 'detonate'];
const RED = 'hue-rotate(215deg) saturate(1.3)';   // the rogue's green knives, turned crimson

// Per-card effects. `f` aims at the card's targets: f.on (each enemy hit), f.feet (decal under
// each), f.shot / f.drop / f.chain (from the caster), f.self / f.ally / f.hearth / f.heroes.
// f.no(key) skips that key's generic effect (say, the Barrier dome for Smokescreen).
// Cards not listed get their class's default hit (classHit).
const CARD_FX = {
  // Knight
  k_guard: f => { f.no('guard'); f.self('ward', { scale: 1.15, dur: 700 }); },
  k_provoke: f => { f.no('taunt'); f.on('challenge', { scale: 0.8, dur: 700 }); },
  k_bash: f => f.on('shieldbash', { scale: 0.85, thrust: 20 }),
  k_cleave: f => f.on('cleave', { scale: 1.1, thrust: 24 }),
  k_challenge: f => { f.no('taunt', 'guard'); f.on('challenge', { scale: 0.75, dur: 700 }); f.self('ward', { scale: 1.1, dur: 700 }); },
  k_heavy: f => { f.on('smash', { scale: 1.25, at: 'stand', delay: 60 }); f.shake(80); },
  k_iron: f => { f.no('guard'); f.self('ward', { scale: 1.25, dur: 800 }); },
  k_slam: f => { f.no('guard'); f.on('smash', { scale: 0.95, at: 'stand' }); f.self('ward', { scale: 1, dur: 600 }); },
  k_warcry: f => f.self('banner', { scale: 1.1, at: 'stand', rise: 12, dur: 900 }),
  k_sunder: f => f.on('sunder', { scale: 1.1, at: 'stand' }),
  k_hold: f => { f.no('taunt'); f.on('challenge', { scale: 0.75, dur: 700 }); },
  k_laststand: f => { f.no('guard'); f.self('ward', { scale: 1.2, dur: 800 }); },
  k_oath: f => { f.no('guard'); f.self('ward', { scale: 1.15, dur: 800 }); },
  k_bulwark: f => f.on('shieldbash', { scale: 0.9, thrust: 20 }),
  k_quake: f => { f.feet('fissure', { scale: 1.25, dur: 800 }); f.on('smash', { scale: 0.65, at: 'stand', delay: 120 }); f.shake(60); },
  k_fortress: f => { f.no('taunt', 'guard'); f.self('ward', { scale: 1.35, dur: 900 }); f.on('challenge', { scale: 0.75, dur: 700 }); },
  k_charge: f => { f.on('shieldbash', { scale: 0.85, thrust: 30 }); f.shake(60); },
  k_titan: f => { f.feet('fissure', { scale: 1.35, dur: 900 }); f.on('smash', { scale: 0.95, at: 'stand', delay: 100 }); f.shake(100); },
  k_aegis: f => { f.no('guard'); f.self('ward', { scale: 1.2, dur: 800 }); },
  k_undying: f => { f.no('guard'); f.self('ward', { scale: 1.2, dur: 800, filter: 'hue-rotate(-25deg) saturate(1.4)' }); },
  k_toss: f => { f.no('guard'); f.volley('shieldtoss', 2, 0.7); },
  k_parry: f => { f.no('guard'); f.on('shieldbash', { scale: 0.8, thrust: 16 }); },
  k_intercept: f => { f.no('guard'); f.ally('ward', { scale: 1.15, dur: 700 }); f.self('shieldbash', { scale: 0.6 }); },
  k_bastion: f => { f.no('guard'); f.heroes('ward', { scale: 1.05, dur: 700 }); },
  k_standard: f => f.self('banner', { scale: 1.15, at: 'stand', rise: 12, dur: 1000 }),
  k_comers: f => { f.no('taunt', 'guard'); f.on('challenge', { scale: 0.75, dur: 700 }); f.self('ward', { scale: 1.2, dur: 800 }); },
  // Rogue
  r_smoke: f => { f.no('shield'); f.hearth('smoke', { scale: 1.6, dur: 900 }); },
  r_hamstring: f => f.on('xslash', { scale: 0.7, rot: 0.3 }),
  r_twin: f => f.hits('xslash', 2),
  r_flurry: f => f.hits('xslash', 4),
  r_dance: f => f.hits('xslash', 5),
  r_quick: f => f.on('xslash', { scale: 0.7 }),
  r_venom: f => { f.no('poison'); f.on('vial', { scale: 0.8 }); },
  r_expose: f => f.on('deathmark', { scale: 0.75, dur: 800 }),
  r_feint: f => f.self('shadowstep', { scale: 1, dur: 600 }),
  r_distract: f => { f.no('taunt', 'guard'); f.self('shadowstep', { scale: 1, dur: 600 }); f.on('challenge', { scale: 0.65, dur: 600, filter: 'hue-rotate(110deg)' }); },
  r_fan: f => f.shot('knives', { scale: 0.85 }),
  r_evade: f => { f.no('vanish'); f.self('shadowstep', { scale: 1.2, dur: 800 }); },
  r_backstab: f => f.on('assassinate', { scale: 1, thrust: 24 }),
  r_bomb: f => { f.no('shield'); f.on('smoke', { scale: 1.2, dur: 900 }); f.hearth('smoke', { scale: 1.3, dur: 900 }); },
  r_garrote: f => f.on('garrote', { scale: 0.9, dur: 650 }),
  r_toxin: f => { f.no('poison'); f.on('vial', { scale: 0.95 }); },
  r_cheap: f => f.on('garrote', { scale: 0.8, dur: 600 }),
  r_pick: f => { f.stab(); f.on('coins', { scale: 0.7, rise: 30, delay: 120, dur: 800 }); },
  r_assassin: f => { f.on('assassinate', { scale: 1.35, thrust: 30 }); f.shake(60); },
  r_shadow: f => f.self('shadowstep', { scale: 1.1, dur: 800 }),
  r_crimson: f => f.shot('knives', { scale: 0.85, filter: RED }),
  r_vanish: f => { f.no('vanish'); f.self('shadowstep', { scale: 1.25, dur: 900 }); },
  r_clone: f => f.self('shadowstep', { scale: 1.1, dur: 800 }),
  r_cloak: f => { f.no('vanish'); f.ally('shadowstep', { scale: 1.15, dur: 800 }); },
  r_coup: f => f.on('assassinate', { scale: 1.1, thrust: 24 }),
  r_caltrops: f => f.foesFeet('caltrops', { scale: 1.1, dur: 1000 }),
  r_mark: f => f.on('deathmark', { scale: 0.8, dur: 900 }),
  // Mage
  m_bolt: f => f.shot('fireball', { scale: 0.75, hit: 'explosion', hitScale: 0.6 }),
  m_fireball: f => f.shot('fireball', { scale: 0.9, hit: 'explosion', hitScale: 0.95 }),
  m_counter: f => f.on('brokenrune', { scale: 0.8 }),
  m_spark: f => f.shot('missiles', { scale: 0.55 }),
  m_lance: f => f.shot('frost', { scale: 0.85, hit: 'impact', hitScale: 0.5 }),
  m_wave: f => f.on('flamewave', { scale: 1.2, at: 'stand', thrust: 40, dur: 700 }),
  m_ignite: f => f.on('flamewave', { scale: 0.8, at: 'stand', dur: 650 }),
  m_missile: f => f.shot('missiles', { scale: 0.8 }),
  m_channel: f => f.self('manasurge', { scale: 1.1, at: 'stand', dur: 800 }),
  m_chain: f => f.chain('lightning'),
  m_haste: f => f.self('timerune', { scale: 1, dur: 800 }),
  m_silence: f => f.on('brokenrune', { scale: 0.95 }),
  m_nova: f => f.feet('frostnova', { scale: 1.4, dur: 800 }),
  m_detonate: f => { f.on('explosion', { scale: 1.05 }); f.shake(40); },
  m_focus: f => f.self('manasurge', { scale: 1.1, at: 'stand', dur: 800 }),
  m_inferno: f => f.on('flamewave', { scale: 1.1, at: 'stand', thrust: 30, dur: 800 }),
  m_meteor: f => f.drop('meteor', { scale: 1.05, hit: 'explosion', hitScale: 1.1, shake: true }),
  m_pyro: f => f.shot('fireball', { scale: 1.15, hit: 'explosion', hitScale: 1.35, shake: true }),
  m_font: f => f.self('manasurge', { scale: 1.2, at: 'stand', dur: 900 }),
  m_overload: f => f.self('manasurge', { scale: 1.2, at: 'stand', dur: 700, filter: 'hue-rotate(-40deg) saturate(1.5)' }),
  m_torrent: f => f.volley('missiles', 5, 0.55),
  m_rewind: f => f.on('timerune', { scale: 0.85, dur: 800 }),
  m_living: f => f.self('flamewave', { scale: 0.9, at: 'stand', dur: 800 }),
  m_arch: f => f.self('manasurge', { scale: 1.35, at: 'stand', dur: 1000 }),
  m_scorch: f => f.shot('fireball', { scale: 0.6, hit: 'flamewave', hitScale: 0.6, hitAt: 'stand' }),
  m_frostbite: f => f.shot('frost', { scale: 0.75, hit: 'frostnova', hitScale: 0.9, hitAt: 'feet' }),
  m_steal: f => f.on('brokenrune', { scale: 0.8 }),
  m_combust: f => { f.on('explosion', { scale: 0.95 }); f.shake(40); },
  m_blizzard: f => f.on('blizzard', { scale: 1.3, at: 'stand', dur: 900 }),
  m_twin: f => f.self('manasurge', { scale: 1, at: 'stand', dur: 700, filter: 'hue-rotate(60deg)' }),
  // Cleric
  c_prayer: f => { f.self('lanternflare', { scale: 0.8, dur: 600 }); },
  c_sanct: f => f.hearth('consecrate', { scale: 1.5, at: 'feet', dur: 900 }),
  c_rebuke: f => f.on('bell', { scale: 0.7, dur: 650 }),
  c_bless: f => f.ally('hymn', { scale: 0.9, rise: 20, dur: 900 }),
  c_light: f => f.self('lanternflare', { scale: 1, dur: 700 }),
  c_purify: f => f.self('lanternflare', { scale: 0.85, dur: 600 }),
  c_judge: f => f.drop('lightsword', { scale: 1.2, at: 'stand', from: [0, -240], hit: 'holy', hitScale: 0.7 }),
  c_hush: f => f.on('bell', { scale: 0.75, dur: 650 }),
  c_holyfire: f => f.on('holyfire', { scale: 1, at: 'stand', dur: 750 }),
  c_res: f => f.self('lanternflare', { scale: 0.9, dur: 600 }),
  c_hymn: f => f.self('hymn', { scale: 1.1, rise: 24, dur: 1000 }),
  c_consecrate: f => { f.feet('consecrate', { scale: 1.3, dur: 900 }); f.on('holyfire', { scale: 0.85, at: 'stand', delay: 150, dur: 700 }); },
  c_angel: f => { f.no('guard'); f.ally('wings', { scale: 1.35, dur: 900 }); },
  c_bene: f => f.self('hymn', { scale: 1, rise: 20, dur: 900 }),
  c_smiteevil: f => f.drop('lightsword', { scale: 1.5, at: 'stand', from: [0, -300], hit: 'holy', hitScale: 1.1, shake: true }),
  c_ground: f => f.hearth('consecrate', { scale: 1.6, at: 'feet', dur: 1000 }),
  c_circle: f => f.hearth('consecrate', { scale: 1.7, at: 'feet', dur: 1000 }),
  c_martyr: f => f.shotTo('bloodlight', 'hearth', { scale: 0.8 }),
  c_grace: f => f.heroes('hymn', { scale: 0.8, rise: 18, dur: 900 }),
  c_miracle: f => f.self('lanternflare', { scale: 1.1, dur: 700 }),
  c_divint: f => { f.no('invuln'); f.hearth('wings', { scale: 1.8, dur: 1000 }); },
  c_beacon: f => f.self('lanternflare', { scale: 1, dur: 800 }),
  c_ascend: f => f.heroes('wings', { scale: 1.2, dur: 900 }),
  c_penance: f => { f.on('holy', { scale: 0.8 }); f.shotFrom('bloodlight', 'hearth', { scale: 0.6, delay: 150 }); },
  c_dawn: f => f.self('lanternflare', { scale: 1, dur: 700 }),
  c_peal: f => f.on('bell', { scale: 0.75, dur: 650 }),
  c_transfuse: f => f.shotTo('bloodlight', f.allyId, { scale: 0.75 }),
  c_covenant: f => { f.no('teamGuard'); f.heroes('ward', { scale: 1.05, dur: 700 }); },
};

// The default hit for a class's attack cards without their own recipe.
function classHit(f, c) {
  const hits = HITS.some(k => k in c.fx);
  if (c.cls === 'mage') {
    const el = mageElement(c);
    f.shot(el, { scale: el === 'lightning' ? 1 : 0.8, hit: el === 'fireball' ? 'impact' : null });
  } else if (c.cls === 'rogue') {
    if (hits && ROGUE_THROWN.test(c.name)) f.shot('dagger', { scale: 0.7 });
    else if (hits) f.stab();
  } else if (c.cls === 'cleric') {
    if (hits) f.on('holy', { scale: 0.9, delay: 120 });
  } else if (hits) f.on('slash', { scale: 1.05, delay: 120 });
}

// Recent hits by a card that executes, so an enemy dying to one gets a killing-blow mark.
const execHits = new Map();

function castFx(ev) {
  const c = CARDS[ev.id] && cardDef(ev.id);
  if (!c || !combatDom) return;
  const fx = c.fx, by = ev.by;
  const alive = aliveEnemies().map(e => e.id);
  const harmful = HARMFUL.some(k => k in fx);
  const foes = !harmful && !('taunt' in fx) ? [] : (c.tgt === 'enemy' ? [ev.t] : c.tgt === 'all' || c.tgt === 'random' ? alive : []).filter(Boolean).slice(0, 5);
  const ally = c.tgt === 'ally' && ev.t ? ev.t : by;
  const heroes = Object.keys(C.heroes);
  const skip = new Set();
  const each = (list, fn, gap = 80) => list.forEach((id, i) => fn(id, i * gap));
  const f = {
    allyId: ally, land: 0,
    no: (...keys) => keys.forEach(k => skip.add(k)),
    on: (n, o = {}) => each(foes, (id, d) => fxBurst(n, id, { ...o, delay: (o.delay || 0) + d })),
    feet: (n, o = {}) => each(foes, (id, d) => fxBurst(n, id, { ...o, at: 'feet', delay: (o.delay || 0) + d })),
    foesFeet: (n, o = {}) => each(alive, (id, d) => fxBurst(n, id, { ...o, at: 'feet', delay: (o.delay || 0) + d })),
    self: (n, o) => fxBurst(n, by, o),
    ally: (n, o) => fxBurst(n, ally, o),
    hearth: (n, o) => fxBurst(n, 'hearth', o),
    heroes: (n, o = {}) => each(heroes, (id, d) => fxBurst(n, id, { ...o, delay: (o.delay || 0) + d }), 60),
    shake: (delay = 0) => fxShake(delay),
    // One stab per hit, up to `max`, each at a slightly different angle.
    stab: (max = 3) => each(foes, (id, d) => { for (let k = 0; k < Math.min(max, fx.hits || 1); k++) fxBurst('dagger', id, { scale: 0.75, delay: d + 100 + k * 110, thrust: 26, dy: [0, -10, 10][k], rot: [0, 0.25, -0.2][k], dur: 360 }); }),
    hits: (n, max) => each(foes, (id, d) => { for (let k = 0; k < Math.min(max, fx.hits || 1); k++) fxBurst(n, id, { scale: 0.7, delay: d + 90 + k * 120, rot: [0, 0.5, -0.4, 0.9, -0.8][k], dy: [0, -8, 8, -4, 4][k], dur: 380 }); }),
    shot: (n, o = {}) => {
      f.land = 280;
      each(foes, (id, d) => fxShot(n, by, id, { ...o, delay: (o.delay || 0) + d, then: () => {
        if (o.hit) fxBurst(o.hit, id, { scale: o.hitScale || 0.8, at: o.hitAt || 'mid' });
        if (o.shake) fxShake();
      } }));
    },
    // Several projectiles at random targets, one after another (Arcane Torrent).
    volley: (n, count, scale) => { f.land = 300; for (let k = 0; k < count && alive.length; k++) fxShot(n, by, alive[Math.floor(Math.random() * alive.length)], { scale, delay: k * 90 }); },
    shotTo: (n, to, o = {}) => fxShot(n, by, to, o),
    shotFrom: (n, to, o = {}) => foes.forEach(id => fxShot(n, id, to, o)),
    drop: (n, o = {}) => {
      f.land = 400;
      each(foes, (id, d) => fxDrop(n, id, { ...o, delay: (o.delay || 0) + d * 1.5, then: () => {
        if (o.hit) fxBurst(o.hit, id, { scale: o.hitScale || 1 });
        if (o.shake) fxShake();
      } }), 100);
    },
    chain: n => { f.land = 260; fxChain(n, by, foes); },
  };
  const recipe = CARD_FX[c.id];
  if (recipe) recipe(f);
  else if (harmful) classHit(f, c);
  if ('exec' in fx) for (const id of foes) execHits.set(id, performance.now());

  // Extra effects on each enemy hit, once the hit lands.
  const later = (fn) => each(foes, (id, d) => fn(id, f.land + d));
  if ('poison' in fx && !skip.has('poison')) later((id, d) => fxBurst('poison', id, { scale: 0.7, delay: d + 60 }));
  if ('interrupt' in fx) later((id, d) => fxBurst('impact', id, { scale: 0.55, delay: d }));
  if ('stun' in fx) later((id, d) => fxBurst('stun', id, { scale: 0.7, delay: d + 150, rise: 18, dur: 900 }));
  if ('weak' in fx) later((id, d) => fxBurst('weaken', id, { scale: 0.85, delay: d + 100, dur: 800 }));
  if ('vuln' in fx) later((id, d) => fxBurst('vulnerable', id, { scale: 0.65, delay: d + 120, dur: 700 }));

  // Defence and support, unless the recipe drew its own.
  const has = k => k in fx && !skip.has(k);
  if (has('shield') || has('ward') || has('invuln')) fxBurst('barrier', 'hearth', { scale: 1.4, dur: 800 });
  if (has('heal')) fxBurst('heal', 'hearth', { scale: 1.1, rise: 26, dur: 900 });
  if (has('guard') || has('guardSelf') || has('aegis') || has('bastion') || has('shelter')) fxBurst('armor', has('guardSelf') ? by : ally, { scale: 0.8 });
  if (has('teamGuard')) f.heroes('armor', { scale: 0.7 });
  if (has('mend')) fxBurst('heal', ally, { scale: 0.9, rise: 22, dur: 900 });
  if (has('teamMend')) f.heroes('heal', { scale: 0.8, rise: 22, dur: 900 });
  if (has('taunt') || has('rally')) fxBurst('shout', by, { scale: 1.1 });
  if (has('vanish')) fxBurst('shadowstep', ally, { scale: 1.1, dur: 800 });
  // Buffs on whoever they're for: the whole team for team* keys.
  const buff = (keys, name, o) => {
    const k = keys.find(has);
    if (k) for (const id of k.startsWith('team') ? heroes : [k === 'fury' ? by : ally]) fxBurst(name, id, o);
  };
  buff(['energy', 'teamEnergy'], 'energy', { scale: 0.75, at: 'stand', rise: 14, dur: 800 });
  buff(['empower', 'teamEmpower', 'fury'], 'empower', { scale: 1, at: 'stand', dur: 750, delay: 80 });
  buff(['haste', 'teamHaste', 'hurry'], 'haste', { scale: 0.85, rise: 16, dur: 800, delay: 120 });
  buff(['regen', 'teamRegen', 'cleanse', 'beacon'], 'holy', { scale: 0.55, rise: 16 });
  if (has('thorns') || has('retri')) fxBurst('thorns', by, { scale: 0.85, at: 'feet', dur: 900 });
  // Powers lock in with a rune under the hero.
  if (c.power) fxBurst('powerrune', by, { scale: 1.1, at: 'feet', dur: 1100, delay: 100 });
}

// Enemy moves that strike from range, by name, and what they throw. Every other attack
// claws in melee, right on its target.
const ENEMY_SHOT = { 'Shadow Bolt': 'shadow', 'Soul Drain': 'shadow', 'Bone Spear': 'shadow', Chill: 'shadow', Volley: 'dagger', Snipe: 'dagger', 'Flame Breath': 'fireball' };
function enemyFx(ev) {
  const e = C?.enemies.find(x => x.id === ev.by);
  if (!e || !combatDom) return;
  const heroes = Object.keys(C.heroes);
  const shot = ENEMY_SHOT[ev.x];
  // Projectiles painted heading right (fireball, dagger) are turned to face left; shadow already does.
  const hit = (to, scale = 1) => shot
    ? fxShot(shot, e.id, to, { scale: 0.7 * scale, left: shot === 'shadow', then: () => fxBurst('impact', to, { scale: 0.5 }) })
    : fxBurst('claw', to, { scale: 0.9 * scale, delay: 120 });
  switch (ev.kk) {
    case 'atk': case 'pounce': if (ev.to) hit(ev.to); break;
    case 'wave': fxShot(shot || 'fireball', e.id, 'hearth', { scale: 1.1, left: shot === 'shadow', then: () => fxBurst('impact', 'hearth', { scale: 0.9 }) }); break;
    case 'quake': fxBurst('impact', 'hearth', { scale: 1.1 }); for (const id of heroes) fxBurst('fissure', id, { scale: 1.4, at: 'feet', delay: 80, dur: 800 }); fxShake(60); break;
    case 'shatter': fxBurst('impact', 'hearth', { scale: 1 }); break;
    case 'sunder': for (const id of heroes) fxBurst('claw', id, { scale: 0.8 }); break;
    case 'block': fxBurst('armor', e.id, { scale: 0.8 }); break;
    case 'buff': case 'defy': fxBurst('shout', e.id, { scale: 1, flip: true }); break;
    case 'rally': for (const x of aliveEnemies()) fxBurst('shout', x.id, { scale: 0.8, flip: true }); break;
    case 'heal': fxBurst('heal', e.id, { scale: 0.9, rise: 22, dur: 900 }); break;
    case 'summon': fxBurst('smoke', e.id, { scale: 1.1, dur: 800 }); break;
    case 'hex': case 'drain': case 'slow': for (const id of heroes) fxBurst('curse', id, { scale: 0.75, dur: 800 }); break;
  }
}

// An enemy's soul rises as it dies; a killing blow from an execute card marks it first.
function deathFx(id) {
  const t = execHits.get(id);
  if (t && performance.now() - t < 1500) fxBurst('killblow', id, { scale: 0.9, dur: 700 });
  execHits.delete(id);
  fxBurst('soul', id, { scale: 0.9, rise: 40, delay: 150, dur: 1100 });
}

function handleEvents(list) {
  for (const ev of list) {
    switch (ev.k) {
      case 'note': toast(ev.x); break;
      case 'gain': if (ev.to === selfId || ev.to === 'team') showGain(ev); break;
      case 'dmg':
        if (ev.v > 0) { floatText(ev.to, `−${ev.v}`, ev.to === 'hearth' ? 'hearth-dmg' : 'dmg'); flash(ev.to, 'hit'); }
        else if (ev.b > 0) floatText(ev.to, `${ico(ev.to === 'hearth' ? 'barrier' : combatDom?.heroes.has(ev.to) ? 'armor' : 'block')}${ev.b}`, 'blocked', true);
        break;
      case 'heal': floatText(ev.to, ev.to === 'shield' ? `+${ev.v}${ico('barrier')}` : `+${ev.v}`, 'heal', true); break;
      case 'txt':
        floatText(ev.to, ev.x, ev.c || 'txt');
        if (ev.x === 'Revived!') fxBurst('pillar', ev.to, { scale: 1.4, at: 'stand', dur: 1100 });
        break;
      case 'eact': floatText(ev.by, ev.x, 'eact'); flash(ev.by, 'lunge'); enemyFx(ev); break;
      case 'cast': {
        // Attacks swing and lunge at the enemy; everything else is a quick skill pose.
        const pose = ev.atk ? 'attack' : 'cast';
        poseFlash.set(ev.by, { pose, until: performance.now() + POSE_MS[pose] });
        if (ev.atk) flash(ev.by, 'lunge');
        castFx(ev);
        floatText(ev.by, ev.card, 'cast');
        if (ev.combo) floatText(ev.by, `COMBO ×${(1 + ev.combo * 0.25 * (S.relics?.includes('choir') ? 2 : 1)).toFixed(2).replace(/0$/, '')}`, 'combo');
        break;
      }
      case 'down': flash(ev.to, 'hit'); break;
      case 'die': deathFx(ev.to); break;
    }
  }
}
