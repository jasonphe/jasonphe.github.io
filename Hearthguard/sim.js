// The game rules. Only the host runs this; everyone else just draws the state it sends.
// S is the run (lobby, map, decks, shops...) and changes now and then.
// C is the current fight and changes every tick. Times in C are fight-seconds (C.t),
// so another player can pick up a saved copy and keep going if the host leaves.
import { CLASSES, CARDS, DEFAULT_DECK, deckProblem, DIFFICULTIES, costFor, cardDef, ENEMIES, ENCOUNTERS, RELICS, EVENTS, TEMPO, WARD_EVERY, PACES, DEFAULT_TEMPO, setTempo } from './data.js';

export const MAX_PLAYERS = 4;
export const HAND = 5;
export const baseRegen = () => 1 / 1.5 / TEMPO;  // ⚡ per second
const BASE_MAX_E = 5;
const REVIVE_HP = 0.25;          // share of max HP a knocked-out hero has for the next fight
const ROWS = 13;                 // map rows before the boss
const COLS = 5;
const PRICES = { common: 45, uncommon: 70, rare: 110, epic: 160, legendary: 240, mythic: 320 };
// Card reward odds, rarest first. Mythics only come from unlocks.
const REWARD_ODDS = { fight: [['legendary', 0.01], ['epic', 0.04], ['rare', 0.13], ['uncommon', 0.30]], elite: [['legendary', 0.04], ['epic', 0.13], ['rare', 0.28], ['uncommon', 0.35]] };
const REMOVE_PRICE = 60;
// Indexed by party size.
const HP_SCALE = [1, 0.85, 1.8, 2.8, 3.9];
const DMG_SCALE = [1, 0.6, 1.05, 1.6, 2.2];
const HEARTH = [60, 70, 85, 100, 115];

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

export function newLobby() {
  return { phase: 'lobby', players: [], uid: 1, tempo: DEFAULT_TEMPO, diff: 0 };
}

export class Sim {
  constructor(S, C) {
    this.S = S;
    this.C = C || null;
    this.ev = [];          // things that happened, for floaty numbers and toasts
    this.dirty = true;     // S changed and needs sending
    this.hostId = null;
  }

  // ---------- Helpers ----------
  has(relic) { return this.S.relics?.includes(relic); }
  player(id) { return this.S.players.find(p => p.id === id); }
  active() { return this.S.players.filter(p => p.on); }
  note(text) { this.ev.push({ k: 'note', x: text }); }
  inst(id, up = 0) { return { u: this.S.uid++, id, up }; }
  allDone(done) { const a = this.active(); return a.length > 0 && a.every(p => done[p.id] != null); }
  diff() { return DIFFICULTIES[this.S.diff] || DIFFICULTIES[0]; }
  hpMult() { return (HP_SCALE[this.S.players.length] || 1) * this.diff().hp; }
  dmgMult() { return (DMG_SCALE[this.S.players.length] || 1) * this.diff().dmg * (1 + 0.03 * (this.S.pos?.r || 0)); }

  // Per-player stats for the current fight; folded into each player's run totals when it ends.
  stat(pid, key, v = 1) {
    if (!pid || !this.C || !v) return;
    const s = (this.C.st[pid] ??= {});
    s[key] = (s[key] || 0) + v;
  }
  foldStats() {
    if (!this.C?.st) return;
    for (const p of this.S.players) {
      const fight = this.C.st[p.id];
      if (!fight) continue;
      p.stats ??= {};
      for (const [k, v] of Object.entries(fight)) p.stats[k] = (p.stats[k] || 0) + v;
    }
    this.C.st = {};
  }

  // ---------- Lobby ----------
  join(id, name) {
    const S = this.S;
    let p = S.players.find(p => p.id === id);
    if (p) { p.on = true; p.name = name; this.dirty = true; return; }
    // A returning player with the same name takes their old seat back.
    p = S.players.find(p => !p.on && p.name === name);
    if (p) {
      const old = p.id;
      p.id = id; p.on = true;
      if (this.C?.heroes[old]) { this.C.heroes[id] = this.C.heroes[old]; delete this.C.heroes[old]; }
      if (this.C?.st?.[old]) { this.C.st[id] = this.C.st[old]; delete this.C.st[old]; }
      for (const e of this.C?.enemies || []) if (e.burnBy?.[old]) { e.burnBy[id] = e.burnBy[old]; delete e.burnBy[old]; }
      if (this.C?.wardBy?.[old]) { this.C.wardBy[id] = this.C.wardBy[old]; delete this.C.wardBy[old]; }
      for (const e of this.C?.enemies || []) if (e.taunt?.pid === old) e.taunt.pid = id;
      for (const m of [S.votes, S.done, S.reward, S.shop?.items, S.shop?.removed, S.event?.votes]) {
        if (m && old in m) { m[id] = m[old]; delete m[old]; }
      }
      this.note(`${name} is back`);
      this.dirty = true;
      return;
    }
    if (S.phase !== 'lobby' || S.players.length >= MAX_PLAYERS) return; // watches instead
    S.players.push({ id, name, cls: null, on: true, gold: 0, deck: [] });
    this.dirty = true;
  }

  leave(id) {
    const p = this.player(id);
    if (!p) return;
    if (this.S.phase === 'lobby') this.S.players = this.S.players.filter(q => q !== p);
    else {
      p.on = false;
      const h = this.C?.heroes[id];
      if (h?.ch) { h.disc.push(h.ch.inst); h.ch = null; }
    }
    this.dirty = true;
    this.checkProgress();
  }

  // ---------- Actions from players ----------
  act(pid, a) {
    setTempo(this.S.tempo ?? DEFAULT_TEMPO);
    const S = this.S, p = this.player(pid);
    if (!a || !p) return;
    const f = ACTIONS[a.k];
    if (f) f.call(this, p, a);
  }

  // ---------- Run setup ----------
  startRun() {
    const S = this.S;
    if (S.phase !== 'lobby' || !S.players.length || S.players.some(p => !p.cls)) return;
    for (const p of S.players) {
      p.gold = 25;
      p.maxHp = p.hp = CLASSES[p.cls].hp;
      p.stats = {};
      const ids = deckProblem(p.cls, p.loadout) ? DEFAULT_DECK[p.cls] : p.loadout;
      p.deck = ids.map(id => this.inst(id));
    }
    S.hearthMax = S.hearth = HEARTH[S.players.length];
    S.relics = [];
    S.phoenix = false;
    S.map = genMap();
    S.boss = pick(ENCOUNTERS.boss);
    S.pos = null;
    S.votes = {};
    S.done = {};
    S.seenEvents = [];
    S.path = [];
    S.stats = { fights: 0, cards: 0 };
    S.runId = Math.random().toString(36).slice(2, 10);
    S.phase = 'map';
    this.C = null;
    this.dirty = true;
  }

  backToLobby() {
    const S = this.S;
    S.players = S.players.filter(p => p.on);
    for (const p of S.players) { p.deck = []; p.gold = 0; }
    Object.assign(S, { phase: 'lobby', map: null, pos: null, over: null, relics: [] });
    this.C = null;
    this.dirty = true;
  }

  reachable() {
    const S = this.S;
    if (!S.pos) return S.map[0].map((_, i) => `0,${i}`);
    if (S.pos.r >= ROWS - 1) return ['boss'];
    return S.map[S.pos.r][S.pos.i].next.map(i => `${S.pos.r + 1},${i}`);
  }

  // Called whenever someone votes, finishes, or leaves.
  checkProgress() {
    const S = this.S;
    if (S.phase === 'map' && this.allDone(S.votes)) {
      const tally = {};
      for (const p of this.active()) tally[S.votes[p.id]] = (tally[S.votes[p.id]] || 0) + 1;
      const best = Math.max(...Object.values(tally));
      this.enterNode(pick(Object.keys(tally).filter(k => tally[k] === best)));
    } else if (['reward', 'rest', 'shop', 'treasure'].includes(S.phase) && this.allDone(S.done)) {
      this.toMap();
    } else if (S.phase === 'event' && !S.event.result && this.allDone(S.event.votes)) {
      const tally = [0, 0];
      for (const p of this.active()) tally[S.event.votes[p.id]]++;
      const choice = tally[0] === tally[1] ? randInt(0, 1) : tally[0] > tally[1] ? 0 : 1;
      this.resolveEvent(choice);
    } else if (S.phase === 'event' && S.event.result && this.allDone(S.done)) {
      this.toMap();
    }
  }

  toMap() {
    const S = this.S;
    if (S.pos?.r === ROWS) { this.endRun(true); return; }
    S.phase = 'map';
    S.votes = {};
    S.done = {};
    this.dirty = true;
  }

  enterNode(key) {
    const S = this.S;
    let type;
    if (key === 'boss') { S.pos = { r: ROWS, i: 0 }; type = 'boss'; }
    else {
      const [r, i] = key.split(',').map(Number);
      S.pos = { r, i };
      type = S.map[r][i].type;
    }
    S.path.push(key);
    S.votes = {};
    S.done = {};
    S.nodeType = type;
    if (type === 'fight') this.startCombat(pick(S.pos.r < 3 ? ENCOUNTERS.easy : ENCOUNTERS.normal), 'fight');
    else if (type === 'elite') this.startCombat(pick(ENCOUNTERS.elite), 'elite');
    else if (type === 'boss') this.startCombat(S.boss, 'boss');
    else if (type === 'rest') S.phase = 'rest';
    else if (type === 'shop') this.openShop();
    else if (type === 'treasure') { S.treasure = this.randomRelic(); if (S.treasure) S.relics.push(S.treasure); S.phase = 'treasure'; }
    else if (type === 'event') {
      const left = Object.keys(EVENTS).filter(k => !S.seenEvents.includes(k));
      const id = pick(left.length ? left : Object.keys(EVENTS));
      S.seenEvents.push(id);
      S.event = { id, votes: {}, result: null };
      S.phase = 'event';
    }
    this.dirty = true;
  }

  randomRelic() {
    const left = Object.keys(RELICS).filter(r => !this.S.relics.includes(r));
    return left.length ? pick(left) : null;
  }

  randomCard(cls, rarity) {
    const pool = Object.entries(CARDS).filter(([, c]) => c.cls === cls && c.r === rarity).map(([id]) => id);
    return pick(pool);
  }

  rollRarity(elite) {
    let x = Math.random();
    for (const [r, odds] of REWARD_ODDS[elite ? 'elite' : 'fight']) { if (x < odds) return r; x -= odds; }
    return 'common';
  }

  cardChoices(cls, elite) {
    const out = [];
    for (let tries = 0; out.length < 3 && tries < 40; tries++) {
      const id = this.randomCard(cls, this.rollRarity(elite));
      if (!out.includes(id)) out.push(id);
    }
    return out;
  }

  // ---------- Shops, rests, events ----------
  openShop() {
    const S = this.S;
    const items = {};
    for (const p of S.players) {
      const ids = new Set();
      for (const r of ['common', 'uncommon', 'uncommon', 'rare', Math.random() < 0.25 ? 'legendary' : 'epic']) {
        for (let k = 0; k < 10; k++) { const id = this.randomCard(p.cls, r); if (!ids.has(id)) { ids.add(id); break; } }
      }
      items[p.id] = [...ids].map(id => ({ id, price: Math.round(PRICES[CARDS[id].r] * rand(0.9, 1.1)), sold: false }));
    }
    const relics = [];
    for (let k = 0; k < 2; k++) {
      const r = this.randomRelic();
      if (r && !relics.some(x => x.id === r)) relics.push({ id: r, price: randInt(110, 150), sold: false });
    }
    S.shop = { items, relics, removed: {} };
    S.phase = 'shop';
  }

  resolveEvent(choice) {
    const S = this.S, ev = S.event;
    const everyone = this.S.players;
    let res = '';
    const gains = [];   // shown as pictures on the result screen
    const giveRelic = () => { const r = this.randomRelic(); if (r) { S.relics.push(r); gains.push({ relic: r }); return 'The team gains a relic.'; } return 'The relic crumbles to dust.'; };
    const giveCard = rarity => everyone.forEach(p => { const id = this.randomCard(p.cls, rarity); p.deck.push(this.inst(id)); gains.push({ pid: p.id, card: id, up: 0 }); });
    switch (ev.id + choice) {
      case 'shrine0': this.hurtHearthOutside(10); res = `The Hearth loses 10. ${giveRelic()}`; break;
      case 'smith0': {
        const none = [];
        for (const p of everyone) {
          const c = pick(p.deck.filter(c => !c.up));
          if (!c) { none.push(p.name); continue; }
          c.up = 1;
          gains.push({ pid: p.id, card: c.id, up: 1 });
        }
        res = 'The smith sharpens a card for each of you.' + (none.length ? ` (${none.join(', ')} had nothing left to upgrade.)` : '');
        break;
      }
      case 'smith1': everyone.forEach(p => p.gold += 25); res = 'Everyone gains 25 gold.'; break;
      case 'fountain0': S.hearth = Math.min(S.hearthMax, S.hearth + 15); everyone.forEach(p => p.hp = Math.min(p.maxHp, p.hp + 10)); res = 'The Hearth heals 15 and everyone restores 10 HP.'; break;
      case 'fountain1': S.hearthMax += 8; S.hearth += 8; res = 'The Hearth grows (+8 max).'; break;
      case 'dice0': {
        everyone.forEach(p => p.gold = Math.max(0, p.gold - 20));
        res = Math.random() < 0.5 ? `Snake eyes... for the skeleton. ${giveRelic()}` : 'The skeleton cackles and keeps your gold.';
        break;
      }
      case 'library0': giveCard('uncommon'); res = 'Each of you learns a new card.'; break;
      case 'library1': S.hearth = Math.min(S.hearthMax, S.hearth + 8); res = 'The Hearth heals 8.'; break;
      case 'trader0': S.hearthMax = Math.max(10, S.hearthMax - 12); S.hearth = Math.min(S.hearth, S.hearthMax); giveCard('rare'); res = 'The Hearth dims (−12 max). Each of you gains a rare card.'; break;
      case 'ambush0': S.ambush = true; S.phase = 'map'; this.startCombat(pick(ENCOUNTERS.normal), 'fight'); return;
      case 'ambush1': this.hurtHearthOutside(9); res = 'You escape, but the Hearth loses 9.'; break;
      default: res = 'You move on.';
    }
    ev.choice = choice;
    ev.result = res;
    ev.gains = gains;
    S.done = {};
    this.dirty = true;
  }

  hurtHearthOutside(n) {
    const S = this.S;
    S.hearth -= n;
    if (S.hearth <= 0) {
      if (this.has('phoenix') && !S.phoenix) { S.phoenix = true; S.hearth = Math.ceil(S.hearthMax * 0.3); this.note('🪶 The Phoenix Feather rekindles the Hearth!'); }
      else { S.hearth = 0; this.endRun(false); }
    }
  }

  endRun(win, quit = false, wipe = false) {
    const S = this.S;
    this.foldStats();
    S.phase = 'over';
    S.over = { win, quit, wipe, floor: S.pos ? S.pos.r + 1 : 0, boss: S.boss.map(id => ENEMIES[id].name).join(' & ') };
    this.C = null;
    this.dirty = true;
  }

  // ---------- Combat setup ----------
  startCombat(group, kind) {
    const S = this.S;
    const hpM = this.hpMult() * (kind === 'boss' ? 1 : 1 + 0.04 * (S.pos?.r || 0));
    const C = this.C = { t: 0, kind, enemies: [], heroes: {}, shield: this.has('banner') ? 12 : 0, ward: 0, wardT: 0, burnT: 0, eid: 1, end: 0, dm: this.dmgMult(), st: {}, wardBy: {} };
    for (const type of group) this.spawn(type, hpM, true);
    for (const p of S.players) {
      const cls = CLASSES[p.cls];
      const emax = BASE_MAX_E + (this.has('pouch') ? 1 : 0);
      const h = C.heroes[p.id] = {
        hp: Math.max(1, p.hp ?? cls.hp), max: p.maxHp ?? cls.hp, guard: 0, e: this.has('candle') ? emax : 2, emax,
        hand: [], draw: shuffle(p.deck.map(c => ({ ...c }))), disc: [], exh: [],
        ch: null, down: 0, haste: 0, slow: 0, empower: 0, cycleFree: 0, lastCh: -9,
        pw: { fury: 0, focus: 0, regen: 0, thorns: 0 },
      };
      for (let i = 0; i < HAND; i++) h.hand.push(this.drawCard(h));
    }
    S.phase = 'combat';
    S.stats.fights++;
    this.dirty = true;
  }

  spawn(type, hpM, opening) {
    const C = this.C, d = ENEMIES[type];
    const hp = Math.round(d.hp * (hpM ?? this.hpMult()));
    C.enemies.push({
      id: 'e' + C.eid++, type, hp, max: hp, block: 0, str: 0, vuln: 0, weak: 0, stun: 0, burn: 0, burnBy: {},
      taunt: null, act: null, next: 0, last: -1,
      rec: (opening ? rand(1.5, 3) + (this.has('lantern') ? 3 : 0) : 1.5) * TEMPO,
    });
  }

  drawCard(h) {
    if (!h.draw.length) { h.draw = shuffle(h.disc); h.disc = []; }
    return h.draw.pop() || null;
  }

  // ---------- Combat actions ----------
  play(pid, u, tgt) {
    const C = this.C, h = C?.heroes[pid];
    if (!h || h.down || h.ch || C.end) return;
    const slot = h.hand.findIndex(c => c?.u === u);
    if (slot < 0) return;
    const inst = h.hand[slot], c = cardDef(inst.id, inst.up);
    const cost = costFor(c, h);
    if (c.unplayable || h.e < cost - 1e-6) return;
    const alive = C.enemies.filter(e => e.hp > 0);
    if (c.tgt === 'enemy' && !alive.some(e => e.id === tgt)) tgt = alive[0]?.id;
    if (c.tgt === 'ally' && !C.heroes[tgt]) tgt = pid;
    h.e -= cost;
    h.hand[slot] = this.drawCard(h);
    if (h.pw.cuts) for (const e of alive) this.hitEnemy(e, h.pw.cuts, pid);
    this.S.stats.cards++;
    this.stat(pid, 'cards');
    if (c.cast > 0) h.ch = { inst, tgt, el: 0, dur: c.cast };
    else this.resolve(pid, inst, tgt, 0);
  }

  cycle(pid, u) {
    const h = this.C?.heroes[pid];
    if (!h || h.down || this.C.end) return;
    const slot = h.hand.findIndex(c => c?.u === u);
    if (slot < 0) return;
    const cost = h.cycleFree > 0 ? 0 : 1;
    if (h.e < cost - 1e-6) return;
    if (cost) h.e -= cost; else h.cycleFree--;
    const inst = h.hand[slot];
    (inst.id === 'hex' ? h.exh : h.disc).push(inst);
    h.hand[slot] = this.drawCard(h);
  }

  cancel(pid) {
    const h = this.C?.heroes[pid];
    if (!h?.ch) return;
    h.disc.push(h.ch.inst);
    h.ch = null;
  }

  // ---------- Damage ----------
  // Returns the HP damage done. `by` (a player id) gets credit for the damage and the kill.
  hitEnemy(e, amt, by) {
    if (e.hp <= 0) return 0;
    amt = Math.round(amt * (e.vuln > this.C.t ? 1.5 : 1));
    if (amt <= 0) return 0;
    const blocked = Math.min(e.block, amt);
    e.block -= blocked;
    const dmg = amt - blocked;
    e.hp -= dmg;
    const real = dmg + Math.min(0, e.hp);   // don't count overkill
    this.ev.push({ k: 'dmg', to: e.id, v: real, b: blocked });
    this.stat(by, 'dmg', real);
    if (e.hp <= 0) { e.hp = 0; e.act = null; e.taunt = null; this.ev.push({ k: 'die', to: e.id }); this.stat(by, 'kills'); }
    return real;
  }

  hitHearth(amt) {
    const C = this.C, S = this.S;
    if (C.invuln > C.t) { this.ev.push({ k: 'dmg', to: 'hearth', v: 0, b: Math.round(amt) }); return; }
    for (const [id, h] of Object.entries(C.heroes)) {
      if (!h.pw.aegis || h.down || h.guard <= 0 || amt <= 0) continue;
      const soak = Math.min(h.guard, amt);
      h.guard -= soak;
      amt -= soak;
      this.stat(id, 'tanked', soak);
      this.ev.push({ k: 'dmg', to: id, v: 0, b: Math.round(soak) });
    }
    if (amt <= 0) return;
    const blocked = Math.min(C.shield, amt);
    C.shield -= blocked;
    const dmg = Math.round(amt - blocked);
    S.hearth -= dmg;
    this.ev.push({ k: 'dmg', to: 'hearth', v: dmg, b: Math.round(blocked) });
    if (S.hearth <= 0) {
      if (this.has('phoenix') && !S.phoenix) { S.phoenix = true; S.hearth = Math.ceil(S.hearthMax * 0.3); this.note('🪶 The Phoenix Feather rekindles the Hearth!'); }
      else { S.hearth = 0; C.end = C.t + 1.5; C.lost = true; }
    }
    this.dirty = true;
  }

  hitHero(pid, amt, from) {
    const C = this.C, h = C.heroes[pid];
    if (!h || h.down) return this.hitHearth(amt);
    if (h.vanish > C.t) { this.ev.push({ k: 'txt', to: pid, x: 'Dodged' }); return; }
    const blocked = Math.min(h.guard, amt);
    h.guard -= blocked;
    const dmg = amt - blocked;
    h.hp -= dmg;
    this.ev.push({ k: 'dmg', to: pid, v: dmg, b: blocked });
    this.stat(pid, 'tanked', blocked + dmg + Math.min(0, h.hp));
    if (h.pw.thorns && from) this.hitEnemy(from, h.pw.thorns, pid);
    if (h.hp <= 0 && h.pw.undying > 0) {
      h.pw.undying--;
      h.hp = h.max;
      h.guard += 40;
      this.ev.push({ k: 'txt', to: pid, x: 'Undying!' });
      this.note(`${this.player(pid)?.name} refuses to fall!`);
    }
    if (h.hp <= 0) {
      h.hp = 0;
      this.stat(pid, 'downs');
      h.down = true; // until revived or the fight ends
      h.guard = 0;
      if (h.ch) { h.disc.push(h.ch.inst); h.ch = null; }
      this.ev.push({ k: 'down', to: pid });
      this.note(`${this.player(pid)?.name} is down!`);
    }
  }

  interrupt(e, n, by) {
    if (!e.act) return;
    if (e.act.poise >= 99) { this.ev.push({ k: 'txt', to: e.id, x: 'Unstoppable' }); return; }
    e.act.poise -= n;
    if (e.act.poise <= 0) {
      this.ev.push({ k: 'txt', to: e.id, x: 'Interrupted!', c: 'int' });
      this.stat(by, 'interrupts');
      e.act = null;
      e.rec = 1.5 * TEMPO;
      if (this.has('bell')) e.stun = Math.max(e.stun, this.C.t + 1.5 * TEMPO);
    } else this.ev.push({ k: 'txt', to: e.id, x: `Poise ${e.act.poise}`, c: 'int' });
  }

  // ---------- Card effects ----------
  resolve(pid, inst, tgt, combo) {
    const C = this.C, h = C.heroes[pid], p = this.player(pid);
    const c = cardDef(inst.id, inst.up);
    const fx = { ...c.fx };
    if (combo && c.combo) for (const [k, v] of Object.entries(c.combo)) fx[k] = (fx[k] || 0) + v;
    const mult = 1 + 0.25 * combo * (this.has('choir') ? 2 : 1);
    const foes = c.tgt === 'all' ? C.enemies.filter(e => e.hp > 0) : C.enemies.filter(e => e.id === tgt && e.hp > 0);
    const ally = c.tgt === 'ally' ? C.heroes[tgt] || h : h;
    const isAttack = ['dmg', 'guardDmg', 'shieldDmg', 'detonate', 'guardBlast', 'zap'].some(k => k in fx);
    const bonus = isAttack ? h.pw.fury + h.empower + (this.has('whet') ? 2 : 0) : 0;
    if (isAttack) h.empower = 0;

    for (const [k, v] of Object.entries(fx)) {
      switch (k) {
        case 'dmg':
          for (const e of foes) for (let i = 0; i < (fx.hits || 1); i++) {
            const ex = fx.exec && e.hp < e.max * 0.4 ? fx.exec : 0;
            this.hitEnemy(e, (v + bonus + ex) * mult, pid);
          }
          // Shadow Clone: one more strike at reduced damage.
          if (h.pw.echo) for (const e of foes) this.hitEnemy(e, (v + bonus) * mult * h.pw.echo / 100, pid);
          break;
        case 'zap':
          for (let i = 0; i < (fx.hits || 1); i++) {
            const alive = C.enemies.filter(e => e.hp > 0);
            if (!alive.length) break;
            this.hitEnemy(pick(alive), (v + bonus) * mult, pid);
          }
          break;
        case 'guardBlast': for (const e of foes) this.hitEnemy(e, (h.guard * v + bonus) * mult, pid); h.guard = 0; break;
        case 'rewind': for (const e of foes) if (e.act) e.act.el = 0; break;
        case 'vanish': ally.vanish = Math.max(ally.vanish || 0, C.t + v); break;
        case 'teamMend':
          for (const x of Object.values(C.heroes)) if (!x.down) { const was = x.hp; x.hp = Math.min(x.max, x.hp + v); this.stat(pid, 'healed', x.hp - was); }
          break;
        case 'invuln': C.invuln = Math.max(C.invuln || 0, C.t + v); this.ev.push({ k: 'txt', to: 'hearth', x: 'Protected!' }); break;
        case 'beacon': C.beacon = (C.beacon || 0) + v; break;
        case 'teamRegen': C.teamRegen = (C.teamRegen || 0) + v; break;
        case 'guardDmg': for (const e of foes) this.hitEnemy(e, (h.guard + bonus) * mult, pid); break;
        case 'shieldDmg': for (const e of foes) this.hitEnemy(e, (Math.floor(C.shield) + bonus) * mult, pid); break;
        case 'detonate': for (const e of foes) { const b = e.burn; e.burn = 0; e.burnBy = {}; this.hitEnemy(e, b * v + bonus, pid); } break;
        case 'interrupt': for (const e of foes) this.interrupt(e, v, pid); break;
        case 'stun': for (const e of foes) { e.stun = Math.max(e.stun, C.t + v); this.ev.push({ k: 'txt', to: e.id, x: 'Stunned' }); } break;
        case 'vuln': for (const e of foes) e.vuln = Math.max(e.vuln, C.t + v); break;
        case 'weak': for (const e of foes) e.weak = Math.max(e.weak, C.t + v); break;
        case 'burn': for (const e of foes) { const n = Math.round(v * mult * (1 + (h.pw.pyro || 0) / 100)); e.burn += n; e.burnBy[pid] = (e.burnBy[pid] || 0) + n; } break;
        case 'taunt':
          for (const e of foes) e.taunt = { pid, until: C.t + v + (this.has('lode') ? 2 * TEMPO : 0) };
          if (foes.length && this.has('collar')) { h.guard += 5; this.stat(pid, 'guard', 5); }
          this.ev.push({ k: 'txt', to: pid, x: 'Taunt!' });
          break;
        case 'shield': C.shield += Math.round(v * mult); this.stat(pid, 'shield', Math.round(v * mult)); this.ev.push({ k: 'heal', to: 'shield', v: Math.round(v * mult) }); break;
        case 'guard': ally.guard += Math.round(v * mult); this.stat(pid, 'guard', Math.round(v * mult)); break;
        case 'heal': this.stat(pid, 'healed', this.healHearth(Math.round(v * mult))); break;
        case 'mend': if (!ally.down) { const was = ally.hp; ally.hp = Math.min(ally.max, ally.hp + v); this.stat(pid, 'healed', ally.hp - was); } break;
        case 'energy': { const was = ally.e; ally.e = Math.min(ally.emax, ally.e + v); if (ally !== h) this.stat(pid, 'energyGiven', ally.e - was); break; }
        case 'teamEnergy':
          for (const x of Object.values(C.heroes)) if (!x.down) { const was = x.e; x.e = Math.min(x.emax, x.e + v); if (x !== h) this.stat(pid, 'energyGiven', x.e - was); }
          break;
        case 'haste': ally.haste = Math.max(ally.haste, C.t + v); break;
        case 'teamHaste': for (const x of Object.values(C.heroes)) x.haste = Math.max(x.haste, C.t + v); break;
        case 'empower': h.empower += v; break;
        case 'teamEmpower': for (const x of Object.values(C.heroes)) x.empower += v; break;
        case 'hurry': for (const x of Object.values(C.heroes)) if (x !== h && x.ch) x.ch.el += v; break;
        case 'revive':
          for (const [id, x] of Object.entries(C.heroes)) if (x.down) { x.down = false; x.hp = Math.ceil(x.max / 2); this.stat(pid, 'revives'); this.ev.push({ k: 'txt', to: id, x: 'Revived!' }); }
          break;
        case 'cleanse':
          for (const x of Object.values(C.heroes)) x.hand = x.hand.map(card => { if (card?.id !== 'hex') return card; x.exh.push(card); return this.drawCard(x); });
          break;
        case 'cycleFree': h.cycleFree += v; break;
        case 'gold': if (p) { p.gold += v; this.dirty = true; } break;
        case 'selfDmg': h.hp -= v; if (h.hp <= 0) { h.hp = 0; h.down = true; this.stat(pid, 'downs'); this.ev.push({ k: 'down', to: pid }); } break;
        case 'ward': C.ward += v; C.wardBy[pid] = (C.wardBy[pid] || 0) + v; break;
        case 'fury': case 'focus': case 'regen': case 'thorns':
        case 'aegis': case 'undying': case 'pyro': case 'discount': case 'echo': case 'cuts': h.pw[k] = (h.pw[k] || 0) + v; break;
      }
    }
    // Living Flame: attacks also set their targets alight.
    if (isAttack && h.pw.pyro && !('burn' in fx)) for (const e of foes.filter(e => e.hp > 0)) { e.burn += 3; e.burnBy[pid] = (e.burnBy[pid] || 0) + 3; }
    (c.ex ? h.exh : h.disc).push(inst);
    if (combo) this.stat(pid, 'combos');
    this.ev.push({ k: 'cast', by: pid, card: c.name, combo });
  }

  healHearth(n) {
    const S = this.S;
    const before = S.hearth;
    S.hearth = Math.min(S.hearthMax, S.hearth + n);
    if (S.hearth > before) this.ev.push({ k: 'heal', to: 'hearth', v: S.hearth - before });
    this.dirty = true;
    return S.hearth - before;
  }

  // ---------- Enemy actions ----------
  enemyAct(e) {
    const C = this.C, d = ENEMIES[e.type], a = d.acts[e.act.i];
    const weak = e.weak > C.t ? 0.7 : 1;
    const dmg = Math.round(((a.dmg || 0) + e.str) * weak * C.dm);
    const heroes = Object.entries(C.heroes).filter(([id, h]) => !h.down && this.player(id)?.on);
    const taunter = e.taunt && C.heroes[e.taunt.pid] && !C.heroes[e.taunt.pid].down ? e.taunt.pid : null;
    const scale = this.hpMult();
    switch (a.k) {
      case 'atk':
        for (let i = 0; i < (a.hits || 1); i++) taunter ? this.hitHero(taunter, dmg, e) : this.hitHearth(dmg);
        if (a.heal) e.hp = Math.min(e.max, e.hp + Math.round(a.heal * scale));
        break;
      case 'pounce': {
        const id = taunter || pick(heroes)?.[0];
        id ? this.hitHero(id, dmg, e) : this.hitHearth(dmg);
        break;
      }
      case 'wave': this.hitHearth(dmg); break;
      case 'quake':
        this.hitHearth(dmg);
        for (const [id] of heroes) this.hitHero(id, dmg, e);
        break;
      case 'block': e.block += Math.round(a.v * scale); break;
      case 'buff': e.str += a.v; break;
      case 'rally': for (const x of C.enemies) if (x.hp > 0) x.str += a.v; break;
      case 'heal': e.hp = Math.min(e.max, e.hp + Math.round(a.v * scale)); this.ev.push({ k: 'heal', to: e.id, v: Math.round(a.v * scale) }); break;
      case 'summon': if (C.enemies.filter(x => x.hp > 0).length < 5) this.spawn(a.v, this.hpMult() * 0.6); break;
      case 'hex':
        for (let i = 0; i < a.v; i++) {
          const [id, h] = pick(heroes) || [];
          if (!h) break;
          h.draw.splice(Math.max(0, h.draw.length - randInt(0, 2)), 0, this.inst('hex'));
          this.ev.push({ k: 'txt', to: id, x: 'Hexed', c: 'bad' });
        }
        break;
      case 'drain': for (const [id, h] of heroes) { h.e = Math.max(0, h.e - a.v); this.ev.push({ k: 'txt', to: id, x: `−${a.v}⚡`, c: 'bad' }); } break;
      case 'slow': for (const [, h] of heroes) h.slow = Math.max(h.slow, C.t + a.v * TEMPO); break;
    }
  }

  nextAction(e) {
    const d = ENEMIES[e.type];
    let i;
    if (d.pat === 'cycle') { i = e.next % d.acts.length; e.next++; }
    else { do i = randInt(0, d.acts.length - 1); while (d.acts.length > 1 && i === e.last); }
    e.last = i;
    const a = d.acts[i];
    const poise = a.poise || 1;
    e.act = { i, el: 0, dur: a.w * TEMPO * (this.has('glass') ? 1.1 : 1), poise, maxPoise: poise };
  }

  // ---------- The clock ----------
  tick(dt) {
    const C = this.C, S = this.S;
    if (!C || S.phase !== 'combat') return;
    setTempo(S.tempo ?? DEFAULT_TEMPO);
    C.t += dt;
    const t = C.t;

    if (C.end) {
      if (t >= C.end) C.lost ? this.endRun(false, false, C.lost === 'wipe') : this.winCombat();
      return;
    }

    // The Hearth's Barrier fades unless anchored; Wards top it up.
    if (!this.has('anchor')) C.shield = Math.max(0, C.shield - (0.4 + C.shield * 0.05) * dt / TEMPO);
    if (C.ward) {
      C.wardT += dt;
      if (C.wardT >= WARD_EVERY) {
        C.wardT -= WARD_EVERY;
        C.shield += C.ward;
        for (const [id, v] of Object.entries(C.wardBy || {})) this.stat(id, 'shield', v);
        this.ev.push({ k: 'heal', to: 'shield', v: C.ward });
      }
    }

    if (C.beacon) {
      C.beaconT = (C.beaconT || 0) + dt;
      if (C.beaconT >= WARD_EVERY) { C.beaconT -= WARD_EVERY; this.healHearth(C.beacon); }
    }

    // Burn ticks once a second.
    C.burnT += dt;
    const burnTick = C.burnT >= 1;
    if (burnTick) C.burnT -= 1;

    for (const e of C.enemies) {
      if (e.hp <= 0) continue;
      if (burnTick && e.burn > 0) {
        const b = e.burn + (this.has('tome') ? 1 : 0);
        e.burn--;
        const blk = e.block; e.block = 0;           // Burn ignores block
        const owners = Object.entries(e.burnBy || {});
        const total = owners.reduce((sum, [, n]) => sum + n, 0) || 1;
        const dealt = this.hitEnemy(e, b);
        e.block = blk;
        for (const [id, n] of owners) this.stat(id, 'burn', dealt * n / total);
        if (e.hp <= 0 && owners.length) this.stat(owners.reduce((a, c) => (c[1] > a[1] ? c : a))[0], 'kills');
        // The stack drops by one; shrink everyone's share to match.
        for (const [id, n] of owners) e.burnBy[id] = e.burn ? n * e.burn / (e.burn + 1) : 0;
        if (e.hp <= 0) continue;
      }
      if (e.taunt && (t >= e.taunt.until || !C.heroes[e.taunt.pid] || C.heroes[e.taunt.pid].down)) e.taunt = null;
      if (e.stun > t) continue;
      if (!e.act) {
        e.rec -= dt;
        if (e.rec <= 0) this.nextAction(e);
      } else {
        e.act.el += dt;
        if (e.act.el >= e.act.dur) {
          const name = ENEMIES[e.type].acts[e.act.i].n;
          this.ev.push({ k: 'eact', by: e.id, x: name });
          this.enemyAct(e);
          e.act = null;
          e.rec = 1 * TEMPO;
          if (C.end) return;
        }
      }
    }

    for (const [pid, h] of Object.entries(C.heroes)) {
      if (h.down) continue;
      if (!this.player(pid)?.on) continue;
      const rate = baseRegen() * (1 + (h.pw.regen + (C.teamRegen || 0)) / 100 + (this.has('quick') ? 0.12 : 0)) * (h.haste > t ? 2 : 1) * (h.slow > t ? 0.5 : 1);
      h.e = Math.min(h.emax, h.e + rate * dt);
      if (h.ch) {
        h.ch.el += dt * (1 + h.pw.focus / 100);
        if (h.ch.el >= h.ch.dur) {
          // Combo: other heroes mid-cast, or who just finished one, power this one up.
          const combo = Object.entries(C.heroes).filter(([id, x]) => id !== pid && !x.down && ((x.ch && x.ch.el > 0.2) || t - x.lastCh < 1.5)).length;
          const { inst, tgt } = h.ch;
          h.ch = null;
          h.lastCh = t;
          this.resolve(pid, inst, tgt, combo);
        }
      }
    }

    if (!C.end && C.enemies.every(e => e.hp <= 0)) C.end = t + 1.2;
    // With every hero here knocked out, nobody can act, so the run is over.
    const here = Object.entries(C.heroes).filter(([id]) => this.player(id)?.on);
    if (!C.end && here.length && here.every(([, h]) => h.down)) {
      C.end = t + 1.5;
      C.lost = 'wipe';
      this.note('The whole party is down!');
    }
  }

  winCombat() {
    const S = this.S, C = this.C;
    this.foldStats();
    if (C.kind === 'boss') { this.endRun(true); return; }
    // Wounds carry over. Anyone knocked out gets back up for the next fight, a little hurt.
    for (const p of S.players) {
      const h = C.heroes[p.id];
      if (h) p.hp = h.down ? Math.ceil(h.max * REVIVE_HP) : Math.max(1, Math.round(h.hp));
    }
    if (this.has('ember')) S.hearth = Math.min(S.hearthMax, S.hearth + 6);
    const elite = C.kind === 'elite';
    const gold = (elite ? randInt(30, 40) : randInt(14, 22)) + (this.has('tooth') ? 10 : 0) + (S.ambush ? 15 : 0);
    S.ambush = false;
    S.reward = {};
    for (const p of S.players) {
      p.gold += gold;
      S.reward[p.id] = { cards: this.cardChoices(p.cls, elite) };
    }
    S.rewardGold = gold;
    S.rewardRelic = elite ? this.randomRelic() : null;
    if (S.rewardRelic) S.relics.push(S.rewardRelic);
    S.done = {};
    S.phase = 'reward';
    this.C = null;
    this.dirty = true;
  }
}

// Player actions, run on the host. `this` is the Sim.
const ACTIONS = {
  cls(p, a) { if (this.S.phase === 'lobby' && CLASSES[a.c]) { p.cls = a.c; this.dirty = true; } },
  start(p) { if (p.id === this.hostId) this.startRun(); },
  deck(p, a) { if (this.S.phase === 'lobby' && p.cls && !deckProblem(p.cls, a.ids)) { p.loadout = [...a.ids]; this.dirty = true; } },
  diff(p, a) { if (p.id === this.hostId && this.S.phase === 'lobby' && DIFFICULTIES[a.v]) { this.S.diff = a.v; this.dirty = true; } },
  tempo(p, a) { if (p.id === this.hostId && this.S.phase === 'lobby' && PACES.some(x => x.v === a.v)) { this.S.tempo = a.v; this.dirty = true; } },
  // The host can give up on the run; everyone still sees the end screen and stats.
  abandon(p) { if (p.id === this.hostId && !['lobby', 'over'].includes(this.S.phase)) this.endRun(false, true); },
  lobby(p) { if (p.id === this.hostId && this.S.phase === 'over') this.backToLobby(); },
  vote(p, a) {
    const S = this.S;
    if (S.phase !== 'map' || !this.reachable().includes(a.n)) return;
    S.votes[p.id] = a.n;
    this.dirty = true;
    this.checkProgress();
  },
  play(p, a) { if (this.S.phase === 'combat') this.play(p.id, a.u, a.t); },
  cycle(p, a) { if (this.S.phase === 'combat') this.cycle(p.id, a.u); },
  cancel(p) { this.cancel(p.id); },
  reward(p, a) {
    const S = this.S, r = S.reward?.[p.id];
    if (S.phase !== 'reward' || !r || S.done[p.id] != null) return;
    if (a.c != null && r.cards.includes(a.c)) p.deck.push(this.inst(a.c));
    S.done[p.id] = a.c ?? 0;
    this.dirty = true;
    this.checkProgress();
  },
  rest(p, a) {
    const S = this.S;
    if (S.phase !== 'rest' || S.done[p.id] != null) return;
    if (a.u != null) {
      const c = p.deck.find(c => c.u === a.u && !c.up);
      if (!c) return;
      c.up = 1;
      S.done[p.id] = 'smith';
    } else {
      const heal = Math.ceil(S.hearthMax * 0.3 / Math.max(1, this.active().length));
      S.hearth = Math.min(S.hearthMax, S.hearth + heal);
      p.hp = p.maxHp;
      S.done[p.id] = 'rest';
    }
    this.dirty = true;
    this.checkProgress();
  },
  buy(p, a) {
    const S = this.S, shop = S.shop;
    if (S.phase !== 'shop' || S.done[p.id] != null) return;
    if (a.relic != null) {
      const r = shop.relics[a.relic];
      if (!r || r.sold || p.gold < r.price) return;
      p.gold -= r.price; r.sold = true; S.relics.push(r.id);
      this.ev.push({ k: 'gain', to: 'team', relic: r.id, by: p.id });
    } else {
      const it = shop.items[p.id]?.[a.i];
      if (!it || it.sold || p.gold < it.price) return;
      p.gold -= it.price; it.sold = true; p.deck.push(this.inst(it.id));
      this.ev.push({ k: 'gain', to: p.id, card: it.id, up: 0 });
    }
    this.dirty = true;
  },
  remove(p, a) {
    const S = this.S;
    if (S.phase !== 'shop' || S.shop.removed[p.id] || p.gold < REMOVE_PRICE || p.deck.length <= 5) return;
    const i = p.deck.findIndex(c => c.u === a.u);
    if (i < 0) return;
    p.deck.splice(i, 1);
    p.gold -= REMOVE_PRICE;
    S.shop.removed[p.id] = true;
    this.dirty = true;
  },
  done(p) {
    const S = this.S;
    if (!['shop', 'treasure', 'event', 'reward'].includes(S.phase)) return;
    if (S.phase === 'event' && !S.event.result) return;
    S.done[p.id] ??= 1;
    this.dirty = true;
    this.checkProgress();
  },
  evote(p, a) {
    const S = this.S;
    if (S.phase !== 'event' || S.event.result || ![0, 1].includes(a.o)) return;
    S.event.votes[p.id] = a.o;
    this.dirty = true;
    this.checkProgress();
  },
};

export { REMOVE_PRICE, ROWS };

// ---------- Map ----------
// Paths climb from the bottom row to the top; each step moves at most one column over.
function genMap() {
  const rows = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const edges = new Set();
  const starts = shuffle([0, 1, 2, 3, 4]).slice(0, 2);
  while (starts.length < 4) starts.push(randInt(0, COLS - 1));
  for (const s of starts) {
    let c = s;
    for (let r = 0; r < ROWS; r++) {
      rows[r][c] ??= { type: null, next: [] };
      if (r < ROWS - 1) {
        let n;
        // Don't cross an existing edge going the other way.
        for (let k = 0; k < 6; k++) {
          n = Math.min(COLS - 1, Math.max(0, c + randInt(-1, 1)));
          if (n === c || !edges.has(`${r},${n}>${c}`)) break;
          n = c;
        }
        edges.add(`${r},${c}>${n}`);
        c = n;
      }
    }
  }
  // Squash each row to its used columns but keep x for drawing.
  const out = rows.map(row => row.map((n, x) => n && { ...n, x }).filter(Boolean));
  for (const e of edges) {
    const [r, a, b] = e.split(/[,>]/).map(Number);
    const from = out[r].find(n => n.x === a);
    const to = out[r + 1].findIndex(n => n.x === b);
    if (!from.next.includes(to)) from.next.push(to);
  }
  for (const row of out) for (const n of row) n.next.sort((a, b) => a - b);
  // Room types.
  const parents = (r, i) => r ? out[r - 1].filter(n => n.next.includes(i)) : [];
  for (let r = 0; r < ROWS; r++) {
    out[r].forEach((n, i) => {
      if (r === 0) n.type = 'fight';
      else if (r === 6) n.type = 'treasure';
      else if (r === ROWS - 1) n.type = 'rest';
      else {
        for (let k = 0; k < 10; k++) {
          const x = Math.random();
          let t = x < 0.45 ? 'fight' : x < 0.65 ? 'event' : x < 0.78 ? 'elite' : x < 0.9 ? 'rest' : 'shop';
          if (r < 4 && (t === 'elite' || t === 'rest')) t = 'fight';
          if (r === ROWS - 2 && t === 'rest') continue;
          if (t !== 'fight' && t !== 'event' && parents(r, i).some(p => p.type === t)) continue;
          n.type = t;
          break;
        }
        n.type ??= 'fight';
      }
    });
  }
  return out;
}
