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

import { CLASSES, CARDS, cardDef, cardText, ENEMIES, RELICS, EVENTS } from './data.js';
import { Sim, newLobby, MAX_PLAYERS, HAND, REMOVE_PRICE, ROWS } from './sim.js';

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

function toast(text, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = text;
  $('toasts').append(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

// ---------- Join screen ----------
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
    if (isHost()) sim.leave(id);
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

function render() {
  renderRunbar();
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
  const m = me();
  if (S.phase === 'lobby' || !S.hearthMax) { $('runbar').innerHTML = ''; return; }
  const floor = S.pos ? Math.min(S.pos.r + 1, ROWS + 1) : 0;
  $('runbar').innerHTML = `
    <span class="rb-hearth" title="The Hearth: your team's shared life">❤️‍🔥 <b>${Math.max(0, Math.ceil(S.hearth))}</b>/${S.hearthMax}</span>
    <span title="Floor">🪜 ${floor}/${ROWS + 1}</span>
    ${m ? `<span title="Your gold">🪙 ${m.gold}</span>` : ''}
    <span class="rb-relics">${(S.relics || []).map(r => `<span class="relic" title="${esc(RELICS[r].name)}: ${esc(RELICS[r].text)}">${RELICS[r].icon}</span>`).join('')}</span>
    ${m ? `<button class="chip" data-deck="view">🂠 Deck ${m.deck.length}</button>` : ''}`;
}

function tgtLabel(c) {
  return { enemy: 'Enemy', all: 'All enemies', ally: 'Ally', self: 'Self', none: 'Team' }[c.tgt] || '';
}
function cardHTML(id, up, extra = '') {
  const c = cardDef(id, up);
  return `<div class="cardface cls-${c.cls} r-${c.r}${c.upgraded ? ' up' : ''}">
    <span class="cost">${c.unplayable ? '–' : c.cost}</span>
    ${c.cast ? `<span class="ct" title="Cast time">⏱${c.cast}s</span>` : ''}
    <div class="cicon">${c.icon}</div>
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
        <div class="seat-icon">${c ? c.icon : '❔'}</div>
        <div><b>${esc(p.name)}</b>${p.id === hostId ? ' <span class="tag">host</span>' : ''}${p.id === selfId ? ' <span class="tag">you</span>' : ''}<br><small>${c ? c.name : 'choosing…'}</small></div>
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
          <span class="class-icon">${c.icon}</span><b>${c.name}</b><small>❤️ ${c.hp} HP</small><span>${c.blurb}</span>
        </button>`).join('')}</div>` : `<p class="note">The party is full, so you're watching this one.</p>`}
      <div class="lobby-go">
        ${isHost() ? `<button class="btn big" data-start ${ready ? '' : 'disabled'}>${ready ? 'Begin the descent' : 'Everyone needs a class'}</button>`
        : `<p class="sub">Waiting for ${esc(pName(hostId))} to start…</p>`}
      </div>
      <details class="howto" open>
        <summary>How to play</summary>
        <ul>
          <li><b>No turns.</b> ⚡ Energy refills over time. Play cards whenever you can afford them. Cards marked ⏱ take time to cast, and you can't play anything else while casting.</li>
          <li><b>The Hearth</b> ❤️‍🔥 is your team's shared life and carries over between fights. If it goes out, the run is over.</li>
          <li>Enemies <b>wind up</b> each move (watch the bar). Attacks hit the Hearth unless someone <b>Taunts</b> that enemy, which sends the hits to the taunter's own HP and Guard. A hero who is knocked out gets back up after 8s.</li>
          <li><b>Interrupt</b> cancels a wind-up. Big moves have poise pips, and each interrupt breaks one. 🔒 moves can't be stopped. 🌊 waves ignore taunts.</li>
          <li><b>Shield</b> soaks hits for the Hearth but fades over time.</li>
          <li><b>Combo:</b> a cast that finishes while a teammate is casting (or just finished) is 25% stronger for each teammate.</li>
          <li>Stuck with a bad card? <b>↻ Discard</b> it to draw another for 1⚡.</li>
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
        <circle r="19"/><text y="7">${NODE_ICONS[n.type]}</text>${voteDots(key)}</g>`;
    }));
    const bossName = S.boss.map(id => ENEMIES[id].name).join(' & ');
    nodes += `<g class="node boss ${reach.has('boss') ? 'can' : ''} ${S.votes?.[selfId] === 'boss' ? 'mine' : ''}" data-node="boss" transform="translate(${bossXY[0]},${bossXY[1]})"><title>Boss: ${esc(bossName)}</title>
      <circle r="27"/><text y="10" class="big">${ENEMIES[S.boss[0]].icon}</text>${voteDots('boss')}</g>`;
    return `<div class="map-wrap">
      <aside class="panel map-side">
        <h2>The Descent</h2>
        <p class="sub">Vote on the next room. Majority wins, ties are random.</p>
        ${waitingFor(S.votes)}
        <ul class="legend">${Object.entries(NODE_ICONS).map(([k, v]) => `<li>${v} ${NODE_NAMES[k]}</li>`).join('')}<li>${ENEMIES[S.boss[0]].icon} ${esc(bossName)}</li></ul>
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
      <p class="sub">Everyone gains <b>🪙 ${S.rewardGold}</b>.${relic ? ` The team found <b>${relic.icon} ${esc(relic.name)}</b>: ${esc(relic.text)}` : ''}</p>
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
      <div class="big-icon">🔥</div>
      <h2>Campfire</h2>
      <p class="sub">Each of you picks one: tend the Hearth, or sharpen a card.</p>
      ${m && done == null ? `<div class="choices">
        <button class="choice" data-rest><b>🔥 Rest</b><span>Heal the Hearth ${heal}.</span></button>
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
      <div class="big-icon">💰</div>
      <h2>Merchant</h2>
      <p class="sub">Cards go in your own deck. Relics help the whole team.</p>
      ${m && !done ? `
      <h3>Cards</h3>
      <div class="card-grid">${items.map((it, i) => `<button class="card-btn ${it.sold ? 'sold' : ''}" data-buy="${i}" ${it.sold || m.gold < it.price ? 'disabled' : ''}>${cardHTML(it.id, 0, `<span class="price">🪙 ${it.price}</span>`)}</button>`).join('')}</div>
      <h3>Relics</h3>
      <div class="relic-row">${S.shop.relics.map((r, i) => `<button class="relic-btn" data-buy-relic="${i}" ${r.sold || m.gold < r.price ? 'disabled' : ''}>
        <span class="relic-icon">${RELICS[r.id].icon}</span><b>${esc(RELICS[r.id].name)}</b><small>${esc(RELICS[r.id].text)}</small><span class="price">${r.sold ? 'Sold' : `🪙 ${r.price}`}</span></button>`).join('') || '<p class="note">Sold out.</p>'}</div>
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
      <div class="big-icon">${d.icon}</div>
      <h2>${esc(d.name)}</h2>
      <p class="story">${esc(d.text)}</p>
      ${ev.result ? `<p class="result"><b>${esc(d.opts[ev.choice].t)}:</b> ${esc(ev.result)}</p>
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
      <div class="big-icon">🎁</div>
      <h2>Treasure</h2>
      ${r ? `<p class="sub">The team found <b>${r.icon} ${esc(r.name)}</b>: ${esc(r.text)}</p>` : '<p class="sub">The chest is empty.</p>'}
      ${me() && S.done?.[selfId] == null ? '<button class="btn" data-done>Continue</button>' : ''}
      ${waitingFor(S.done)}
    </div>`;
  },

  over() {
    const o = S.over;
    return `<div class="panel center">
      <div class="big-icon">${o.win ? '👑' : '🕯️'}</div>
      <h2>${o.win ? 'The Hearth endures' : 'The Hearth has gone out'}</h2>
      <p class="sub">${o.win ? `You defeated ${esc(o.boss)}!` : `The party fell on floor ${o.floor}.`}</p>
      <p class="note">${S.stats?.fights || 0} fights · ${S.stats?.cards || 0} cards played · ${(S.relics || []).length} relics</p>
      <div class="party">${partyList()}</div>
      ${isHost() ? '<button class="btn big" data-lobby>Back to the lobby</button>' : `<p class="sub">Waiting for ${esc(pName(hostId))}…</p>`}
    </div>`;
  },
};

function reachableClient() {
  if (!S.pos) return S.map[0].map((_, i) => `0,${i}`);
  if (S.pos.r >= ROWS - 1) return ['boss'];
  return S.map[S.pos.r][S.pos.i].next.map(i => `${S.pos.r + 1},${i}`);
}

function partyList() {
  return S.players.map(p => `<div class="pline ${p.on ? '' : 'off'}" style="--pc:${pColor(p.id)}">
    <span>${CLASSES[p.cls]?.icon || '❔'}</span><b>${esc(p.name)}</b><small>${CLASSES[p.cls]?.name || ''} · ${p.deck.length} cards · 🪙 ${p.gold}${p.on ? '' : ' · away'}</small></div>`).join('');
}

// ---------- Clicks outside combat ----------
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-node]');
  if (!t) return;
  const d = t.dataset;
  if ('copy' in d) copyInvite();
  else if (d.cls) act({ k: 'cls', c: d.cls });
  else if ('start' in d) act({ k: 'start' });
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
      <div class="hearth-icon">❤️‍🔥</div>
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
  if (curEnergy(h) < c.cost - 0.02) { toast('Not enough ⚡'); return; }
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
  return (1 / 1.5) * (1 + h.pw.regen / 100 + quick) * (h.haste > t ? 2 : 1) * (h.slow > t ? 0.5 : 1);
}
function curEnergy(h) {
  if (h.down) return h.e;
  const t = C.t + ahead();
  return Math.min(h.emax, h.e + regenRate(h, t) * ahead());
}

function pips(el, val, max) {
  if (el.childElementCount !== max) el.innerHTML = '<i><b></b></i>'.repeat(max);
  [...el.children].forEach((p, i) => { p.firstChild.style.width = `${clamp01(val - i) * 100}%`; p.classList.toggle('full', val >= i + 1); });
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
    <div class="hname"><span>${CLASSES[p?.cls]?.icon || '❔'}</span><b>${esc(p?.name)}</b><span class="htaunt"></span></div>
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
  const dmg = Math.round(((a.dmg || 0) + e.str) * weak * (C.dm || 1));
  const taunter = e.taunt && C.heroes[e.taunt.pid] && !C.heroes[e.taunt.pid].down ? e.taunt.pid : null;
  let num = '', tgt = '', danger = false;
  const n = a.hits > 1 ? `${dmg}×${a.hits}` : `${dmg}`;
  switch (a.k) {
    case 'atk': num = n; tgt = taunter ? `→ ${pName(taunter)}` : '→ Hearth'; danger = !taunter; break;
    case 'pounce': num = n; tgt = taunter ? `→ ${pName(taunter)}` : '→ a random hero'; break;
    case 'wave': num = n; tgt = '→ Hearth (ignores taunt)'; danger = true; break;
    case 'quake': num = n; tgt = '→ Hearth + every hero'; danger = true; break;
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

function frame() {
  requestAnimationFrame(frame);
  if (S.phase !== 'combat' || !C || !combatDom) return;
  const x = ahead();
  const t = C.t + x;

  // Hearth
  const hEl = $('hearthEl');
  const hp = Math.max(0, S.hearth), max = S.hearthMax;
  const sh = Math.max(0, C.shield - (S.relics?.includes('anchor') ? 0 : (0.4 + C.shield * 0.05) * x));
  hEl.querySelector('.hp').style.width = `${clamp01(hp / max) * 100}%`;
  hEl.querySelector('.sh').style.width = `${clamp01(sh / max) * 100}%`;
  hEl.querySelector('.hnum').textContent = `${Math.ceil(hp)} / ${max}`;
  hEl.querySelector('.snum').textContent = sh >= 1 ? `🛡️ ${Math.floor(sh)}` : '';
  hEl.classList.toggle('low', hp / max < 0.3);

  // Enemies
  const seen = new Set();
  for (const e of C.enemies) {
    const el = enemyEl(e);
    seen.add(e.id);
    el.classList.toggle('dead', e.hp <= 0);
    el.classList.toggle('stunned', e.stun > t);
    el.querySelector('.bar .hp').style.width = `${clamp01(e.hp / e.max) * 100}%`;
    el.querySelector('.bar .blk').style.width = `${clamp01(e.block / e.max) * 100}%`;
    el.querySelector('.bar span').textContent = `${Math.ceil(e.hp)}/${e.max}${e.block ? ` 🛡️${e.block}` : ''}`;
    const st = [];
    if (e.str) st.push(`<span title="Strength: +${e.str} damage">💪${e.str}</span>`);
    if (e.burn) st.push(`<span title="Burn: takes this much damage next second, then it drops by 1">🔥${e.burn}</span>`);
    if (e.vuln > t) st.push(`<span title="Vulnerable: takes 50% more damage">🎯${Math.ceil(e.vuln - t)}s</span>`);
    if (e.weak > t) st.push(`<span title="Weak: deals 30% less damage">🥀${Math.ceil(e.weak - t)}s</span>`);
    if (e.stun > t) st.push(`<span title="Stunned">💫${Math.ceil(e.stun - t)}s</span>`);
    const stHtml = st.join('');
    const stEl = el.querySelector('.status');
    if (stEl.innerHTML !== stHtml) stEl.innerHTML = stHtml;
    const tt = el.querySelector('.taunt-tag');
    if (e.taunt && e.hp > 0) { tt.textContent = `Taunted by ${pName(e.taunt.pid)}`; tt.style.background = pColor(e.taunt.pid); tt.hidden = false; }
    else tt.hidden = true;
    const intent = el.querySelector('.intent');
    if (e.act && e.hp > 0) {
      const info = intentFor(e, t);
      intent.hidden = false;
      intent.classList.toggle('danger', info.danger);
      intent.querySelector('.iicon').textContent = INTENT[info.a.k];
      intent.querySelector('.iname').textContent = info.a.n;
      intent.querySelector('.idmg').textContent = info.num;
      intent.querySelector('.itgt').textContent = info.tgt;
      const el2 = e.act.el + (e.stun > t ? 0 : x);
      intent.querySelector('.wind i').style.width = `${clamp01(el2 / e.act.dur) * 100}%`;
      const pz = intent.querySelector('.poise');
      const want = e.act.maxPoise >= 99 ? '<span title="Can\'t be interrupted">🔒</span>'
        : e.act.maxPoise > 1 ? Array.from({ length: e.act.maxPoise }, (_, i) => `<i class="${i < e.act.poise ? 'on' : ''}"></i>`).join('') : '';
      if (pz.innerHTML !== want) pz.innerHTML = want;
    } else intent.hidden = true;
    el.classList.toggle('targetable', sel != null && e.hp > 0 && cardDef(handCard(sel)?.id || 'hex').tgt === 'enemy');
  }
  for (const [id, el] of combatDom.enemies) if (!seen.has(id)) { el.remove(); combatDom.enemies.delete(id); }

  // Heroes
  const selCard = sel != null && handCard(sel) ? cardDef(handCard(sel).id, handCard(sel).up) : null;
  for (const [pid, h] of Object.entries(C.heroes)) {
    const el = heroEl(pid);
    const p = S.players.find(p => p.id === pid);
    el.classList.toggle('off', !p?.on);
    el.classList.toggle('isdown', !!h.down);
    el.classList.toggle('targetable', selCard?.tgt === 'ally');
    el.querySelector('.bar .hp').style.width = `${clamp01(h.hp / h.max) * 100}%`;
    el.querySelector('.bar span').textContent = `${Math.ceil(h.hp)}/${h.max}`;
    el.querySelector('.guard').textContent = h.guard ? `🛡️ ${Math.round(h.guard)}` : '';
    pips(el.querySelector('.epips'), curEnergy(h), h.emax);
    const taunts = C.enemies.filter(e => e.hp > 0 && e.taunt?.pid === pid).length;
    el.querySelector('.htaunt').textContent = taunts ? `😤×${taunts}` : '';
    const hc = el.querySelector('.hcast');
    if (h.ch) {
      hc.hidden = false;
      const c = cardDef(h.ch.inst.id, h.ch.inst.up);
      hc.querySelector('span').textContent = `${c.icon} ${c.name}`;
      hc.querySelector('i').style.width = `${clamp01((h.ch.el + x * (1 + h.pw.focus / 100)) / h.ch.dur) * 100}%`;
    } else hc.hidden = true;
    el.querySelector('.down').textContent = h.down ? `Down · ${Math.ceil(h.down - t)}s` : '';
  }

  // My hand
  const h = myHero();
  const meEl = $('meEl');
  meEl.hidden = !h;
  if (!h) return;
  const e = curEnergy(h);
  pips(meEl.querySelector('.energy .epips'), e, h.emax);
  meEl.querySelector('.enum').textContent = `${Math.floor(e)}/${h.emax}`;
  meEl.querySelector('.piles').innerHTML = `<span title="Draw pile">🂠 ${h.draw.length}</span><span title="Discard pile">♻️ ${h.disc.length}</span>${h.cycleFree ? `<span title="Free discards">↻ free×${h.cycleFree}</span>` : ''}`;
  const mc = meEl.querySelector('.mycast');
  if (h.ch) {
    mc.classList.remove('hidden');
    const c = cardDef(h.ch.inst.id, h.ch.inst.up);
    mc.querySelector('span').textContent = `Casting ${c.name}…`;
    mc.querySelector('i').style.width = `${clamp01((h.ch.el + x * (1 + h.pw.focus / 100)) / h.ch.dur) * 100}%`;
  } else mc.classList.add('hidden');
  meEl.classList.toggle('isdown', !!h.down);

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
    slot.el.classList.toggle('poor', !c.unplayable && e < c.cost - 0.02);
    slot.el.classList.toggle('busy', !!h.ch || !!h.down);
    slot.el.classList.toggle('sel', sel === u);
    slot.el.classList.toggle('pending', pending.has(u) && performance.now() - pending.get(u) < 700);
    const fill = c.cost ? clamp01(e / c.cost) : 1;
    slot.el.style.setProperty('--fill', fill);
  });

  const infoU = sel ?? hoverU;
  const infoInst = infoU != null ? handCard(infoU) : null;
  const info = $('cardInfo');
  const want = infoInst ? (() => { const c = cardDef(infoInst.id, infoInst.up); return `<b>${c.icon} ${esc(c.name)}</b> ${c.cast ? `⏱${c.cast}s ` : ''}· ${cardText(c)}${sel != null ? ` <span class="hint">${selHint(c)}</span>` : ''}`; })()
    : h.down ? `<span class="hint">You're down. You'll be back in ${Math.ceil(h.down - t)}s.</span>`
      : touch.matches ? `<span class="hint">Tap a card to read it, tap again to play. ↻ discards it and draws another for 1⚡.</span>`
        : `<span class="hint">Click a card to play it. ↻ (or right-click, or X) discards it and draws another for 1⚡.</span>`;
  if (info.dataset.v !== want) { info.innerHTML = want; info.dataset.v = want; }
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
      case 'dmg':
        if (ev.v > 0) { floatText(ev.to, `−${ev.v}`, ev.to === 'hearth' ? 'hearth-dmg' : 'dmg'); flash(ev.to, 'hit'); }
        else if (ev.b > 0) floatText(ev.to, `🛡️${ev.b}`, 'blocked');
        break;
      case 'heal': floatText(ev.to, ev.to === 'shield' ? `+${ev.v}🛡️` : `+${ev.v}`, 'heal'); break;
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
