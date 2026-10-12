// Balance-testing bots for Hearthguard. Not loaded by the game.
//
//   node Hearthguard/tools/bots.mjs [fights per party] [--parties=solo,2,3,4] [--data=<dir>]
//
// Each bot reads the fight the way a decent player would: it estimates how much every
// enemy wind-up will hurt, interrupts moves that can be interrupted (sharing out who
// interrupts what), taunts the hardest hitters onto the knight, raises Barrier and Armor
// before hits land, focuses damage, saves energy when nothing is worth it, and reacts
// with a short human-like delay. It is a heuristic, not an optimal player.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')));
const FIGHTS = Number(process.argv.slice(2).find(a => !a.startsWith('--')) || 200);
const dir = args.data ? path.resolve(args.data) : path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const D = await import(pathToFileURL(path.join(dir, 'data.js')).href);
const M = await import(pathToFileURL(path.join(dir, 'sim.js')).href);
const { CARDS, ENEMIES, ENCOUNTERS, DEFAULT_DECK, DEFAULT_TEMPO, setTempo, cardDef, costFor } = D;
const { Sim, newLobby, baseRegen } = M;

const tri = n => n * (n + 1) / 2;
const pick = a => a[Math.floor(Math.random() * a.length)];
const alive = C => C.enemies.filter(e => e.hp > 0);
const heroesUp = (sim) => Object.entries(sim.C.heroes).filter(([id, h]) => !h.down && sim.player(id)?.on);

// ---------- Reading the fight ----------
// Roughly how much one landing of this enemy's current move costs the party, in Hearth HP.
function moveThreat(sim, e, a = ENEMIES[e.type].acts[e.act?.i ?? 0]) {
  const C = sim.C, n = heroesUp(sim).length;
  const weak = e.weak > C.t ? 0.7 : 1;
  const base = ((a.dmg || 0) + e.str) * weak, hits = a.hits || 1;
  const taunted = e.taunt && C.heroes[e.taunt.pid] && !C.heroes[e.taunt.pid].down;
  switch (a.k) {
    case 'atk': return taunted ? base * C.hdm * hits * 0.4 : base * C.dm * hits;
    case 'pounce': return base * C.hdm * 0.5;
    case 'wave': return base * C.dm;
    case 'quake': return base * C.dm + base * C.hdm * n * 0.4;
    case 'buff': return a.v * 3 * C.dm;
    case 'rally': return a.v * alive(C).length * 2.5 * C.dm;
    case 'heal': return a.v * sim.hpMult() * 0.6;
    case 'summon': return 22 * C.dm;
    case 'hex': return 5 * a.v;
    case 'drain': return 5 * a.v * n;
    case 'slow': return 5 * n;
    case 'block': return a.v * sim.hpMult() * 0.4;
    case 'shatter': return C.shield * (a.v ?? 1) * 0.8 + (a.dmg ? base * C.dm : 0);
    case 'sunder': return heroesUp(sim).reduce((s, [, h]) => s + h.guard * (a.v ?? 1) * 0.5, 0) + (a.dmg ? base * C.hdm * n * 0.4 : 0);
    case 'defy': return 8 + (a.dmg ? base * C.dm : 0);
    default: return 0;
  }
}
const timeLeft = e => e.act ? Math.max(0.1, e.act.dur - e.act.el) : 99;
const interruptible = e => e.act && e.act.poise > 0 && e.act.poise < 99;
// Average threat per second from an enemy over its whole move cycle.
function enemyDps(sim, e) {
  const acts = ENEMIES[e.type].acts;
  const t = acts.reduce((s, a) => s + moveThreat(sim, e, a), 0) / acts.length;
  const cycle = acts.reduce((s, a) => s + a.w, 0) / acts.length * D.TEMPO + D.TEMPO;
  return t / cycle;
}
// Hearth damage that will land in the next `win` seconds, not counting taunted hits.
function incomingHearth(sim, win) {
  let sum = 0;
  for (const e of alive(sim.C)) {
    if (!e.act || e.stun > sim.C.t || timeLeft(e) > win) continue;
    const a = ENEMIES[e.type].acts[e.act.i];
    if (['atk', 'wave', 'quake', 'shatter', 'defy'].includes(a.k) && a.dmg && !(a.k === 'atk' && e.taunt)) sum += ((a.dmg || 0) + e.str) * sim.C.dm;
  }
  return sum;
}
function incomingHero(sim, pid, win) {
  let sum = 0;
  for (const e of alive(sim.C)) {
    if (!e.act || timeLeft(e) > win) continue;
    const a = ENEMIES[e.type].acts[e.act.i], base = ((a.dmg || 0) + e.str) * sim.C.hdm;
    if (e.taunt?.pid === pid && ['atk', 'pounce'].includes(a.k)) sum += base * (a.hits || 1);
    else if (a.k === 'quake') sum += base;
    else if (a.k === 'pounce' && !e.taunt) sum += base / heroesUp(sim).length;
  }
  return sum;
}

// ---------- Valuing a card ----------
// Value is in Hearth-HP-equivalent points. `claims` is shared by the party so two bots
// don't both spend interrupts on a move one interrupt already covers.
function cardValue(sim, pid, c, tgt, claims) {
  const C = sim.C, h = C.heroes[pid], fx = c.fx, t = C.t;
  const foes = c.tgt === 'all' ? alive(C) : c.tgt === 'enemy' ? [C.enemies.find(e => e.id === tgt)].filter(Boolean) : c.tgt === 'random' ? alive(C) : [];
  const ally = c.tgt === 'ally' ? C.heroes[tgt] || h : h;
  const n = heroesUp(sim).length;
  const half = c.share && ally === h ? 0.5 : 1;
  let v = 0, counted = false;
  const bonus = ('dmg' in fx || 'zap' in fx) ? h.pw.fury + h.empower : 0;
  const hitFoe = (e, dmg) => {
    const real = Math.max(0, dmg * (e.vuln > t ? 1.5 : 1) - e.block);
    const done = Math.min(real, e.hp);
    let val = done;
    if (real >= e.hp) val += (e.act ? moveThreat(sim, e) * 0.8 : 0) + enemyDps(sim, e) * 6;
    return val;
  };
  for (const [k, x] of Object.entries(fx)) {
    switch (k) {
      case 'dmg': for (const e of foes) for (let i = 0; i < (fx.hits || 1); i++) v += hitFoe(e, x + bonus + (fx.exec && e.hp < e.max * 0.4 ? fx.exec : 0)); break;
      case 'zap': v += x * (fx.hits || 1) * 0.9; break;
      case 'burn': case 'poison': for (const e of foes) { const have = e[k] || 0; v += Math.min(e.hp, (tri(have + x) - tri(have)) * 0.8); } break;
      case 'detonate': for (const e of foes) v += Math.min(e.hp, (e.burn || 0) * x); break;
      case 'guardDmg': for (const e of foes) v += hitFoe(e, h.guard + bonus); v -= h.guard * 0.25; break;
      case 'shieldDmg': for (const e of foes) v += hitFoe(e, C.shield + bonus); break;
      case 'guardBlast': for (const e of foes) v += hitFoe(e, h.guard * x); v -= h.guard * 0.5; break;
      case 'interrupt':
        for (const e of foes) {
          if (!interruptible(e)) continue;
          // Interrupts a teammate is still casting count as on their way.
          const key = e.id + ':' + e.act.i + ':' + Math.round(e.act.dur);
          const inFlight = (claims[key] || []).filter(cl => cl.until > t).reduce((s2, cl) => s2 + cl.n, 0);
          const need = e.act.poise - inFlight;
          if (need <= 0) continue;
          const threat = moveThreat(sim, e);
          v += x >= need ? threat : threat * 0.55 * x / need;
        }
        break;
      case 'stun':
        for (const e of foes) if (!(e.stun > t) && !(e.stunImmune > t)) v += x * enemyDps(sim, e) * (e.act ? 1 : 0.7);
        break;
      case 'weak': for (const e of foes) if (!(e.weak > t)) v += 0.3 * x * enemyDps(sim, e); break;
      case 'vuln': for (const e of foes) if (!(e.vuln > t)) v += 0.5 * Math.min(x, 12) * n * 2.2 / Math.max(1, alive(C).length); break;
      case 'taunt': {
        if (h.hp + h.guard < 15) break;
        for (const e of foes) {
          if ((e.taunt && e.taunt.until > t + 2) || e.defiant > t) continue;
          const acts = ENEMIES[e.type].acts.filter(a => a.k === 'atk' || a.k === 'pounce');
          if (!acts.length) continue;
          const per = acts.reduce((s, a) => s + ((a.dmg || 0) + e.str) * (a.hits || 1) * (a.k === 'atk' ? C.dm - C.hdm * 0.4 : 0), 0) / ENEMIES[e.type].acts.length;
          const cycle = ENEMIES[e.type].acts.reduce((s, a) => s + a.w, 0) / ENEMIES[e.type].acts.length * D.TEMPO + D.TEMPO;
          v += per * Math.min(3, x / cycle + (e.act ? 0.5 : 0));
        }
        break;
      }
      case 'shield': v += Math.min(x, Math.max(incomingHearth(sim, 8) - C.shield, x * 0.35)) * 0.9; break;
      case 'guard': { const need = incomingHero(sim, tgt && c.tgt === 'ally' ? tgt : pid, 10) - ally.guard; v += Math.min(x * half, Math.max(need, x * 0.12)) * 0.6; break; }
      case 'guardSelf': v += Math.min(x, Math.max(incomingHero(sim, pid, 10) - h.guard, x * 0.12)) * 0.6; break;
      case 'heal': v += Math.min(x, sim.S.hearthMax - sim.S.hearth) * 1.1 + x * 0.1; break;
      case 'mend': if (!ally.down && ally.hp < ally.max * 0.7) v += Math.min(x * half, ally.max - ally.hp) * 0.35; break;
      case 'teamMend': for (const [, a] of heroesUp(sim)) if (a.hp < a.max * 0.7) v += Math.min(x, a.max - a.hp) * 0.3; break;
      case 'energy': v += Math.max(0, Math.min(x * half, ally.emax - ally.e + (ally === h ? costFor(c, h) : 0))) * 5; break;
      case 'teamEnergy': for (const [, a] of heroesUp(sim)) v += Math.max(0, Math.min(x, a.emax - a.e)) * 5; break;
      case 'haste': v += x / 1.5 / D.TEMPO * 5 * (h.haste > t ? 0.3 : 1); break;
      case 'teamHaste': for (const [, a] of heroesUp(sim)) v += x / 1.5 / D.TEMPO * 5 * (a.haste > t ? 0.3 : 1); break;
      case 'empower': v += x * 0.8; break;
      case 'teamEmpower': v += x * n * 0.7; break;
      case 'cycleFree': v += 1.5 * x; break;
      case 'revive': v += heroesUp(sim).length < Object.keys(C.heroes).length ? 60 : 0; break;
      case 'cleanse': for (const [, a] of heroesUp(sim)) v += a.hand.filter(i => i?.id === 'hex').length * 8; break;
      case 'invuln': v += incomingHearth(sim, x) * 1.0; break;
      case 'vanish': v += incomingHero(sim, c.tgt === 'ally' ? tgt : pid, x) * 0.8; break;
      case 'cover': if (c.tgt === 'ally' && tgt !== pid) v += incomingHero(sim, tgt, x) * 0.5; break;
      case 'shelter': v += Math.min(h.guard, incomingHearth(sim, x)) * 0.8; break;
      case 'bastion': v += (h.guard + x) * 0.6; break;
      case 'hurry': for (const [id, a] of heroesUp(sim)) if (id !== pid && a.ch) v += 6; break;
      case 'refund': v += 3; break;
      case 'killEnergy': break;
      case 'rewind': for (const e of foes) if (e.act) v += moveThreat(sim, e) * e.act.el / e.act.dur; break;
      case 'twin': v += 12; break;
      case 'selfDmg': v -= h.hp - x <= 0 ? 999 : x * 0.4; break;
      case 'gold': v += x * 0.2; break;
      // Powers: worth more the earlier they go out.
      case 'fury': case 'focus': case 'regen': case 'thorns': case 'aegis': case 'undying': case 'pyro': case 'discount':
      case 'echo': case 'cuts': case 'rally': case 'caltrops': case 'retri': case 'ward': case 'beacon': case 'teamRegen':
        if (!counted) { v += Math.max(8, 32 - t * 0.4); counted = true; } break;
      case 'selfSlow': v -= x / 1.5 / D.TEMPO * 2.5; break;
      default: break;
    }
  }
  // A cast that lands with a teammate's is stronger; a long cast ties you up.
  if (c.cast > 0) {
    const partners = heroesUp(sim).filter(([id, a]) => id !== pid && (a.ch || t - a.lastCh < M.comboWindow())).length;
    v *= 1 + 0.25 * partners;
    v -= c.cast * 1.5;
  }
  return v;
}

// ---------- The bot ----------
export class SmartBot {
  constructor(sim, pid, claims) { this.sim = sim; this.pid = pid; this.claims = claims; this.next = 0.6 + Math.random() * 0.6; }
  think() {
    const sim = this.sim, C = sim.C, h = C.heroes[this.pid];
    if (!h || h.down || h.ch || C.end || C.t < this.next) return;
    this.next = C.t + 0.35 + Math.random() * 0.35;        // human-ish reaction time
    const foes = alive(C);
    if (!foes.length) return;
    const hex = h.hand.find(i => i?.id === 'hex');
    if (hex && (h.cycleFree || h.e >= 1)) { sim.act(this.pid, { k: 'cycle', u: hex.u }); return; }
    const full = h.e >= h.emax - 0.4;
    const price = full ? 1.5 : 4.5;                        // what an energy is worth right now
    let best = null;
    for (const inst of h.hand) {
      if (!inst) continue;
      const c = cardDef(inst.id, inst.up);
      if (c.unplayable) continue;
      const cost = costFor(c, h);
      if (cost > h.e + 1e-6) continue;
      const targets = c.tgt === 'enemy' ? foes.map(e => e.id) : c.tgt === 'ally' ? heroesUp(sim).map(([id]) => id) : [null];
      for (const tgt of targets) {
        const s = cardValue(sim, this.pid, c, tgt, this.claims) - cost * price;
        if (!best || s > best.s) best = { s, inst, c, tgt };
      }
    }
    if (best && best.s > 0) {
      // An interrupt with a cast time is "in flight" until it lands; instant ones change
      // the move's poise straight away, so they need no claim.
      if ('interrupt' in best.c.fx && best.c.cast > 0) for (const e of best.c.tgt === 'all' ? foes : foes.filter(e => e.id === best.tgt)) {
        if (interruptible(e)) { const key = e.id + ':' + e.act.i + ':' + Math.round(e.act.dur); (this.claims[key] ??= []).push({ n: best.c.fx.interrupt, until: C.t + best.c.cast + 0.2 }); }
      }
      sim.act(this.pid, { k: 'play', u: best.inst.u, t: best.tgt ?? undefined });
      return;
    }
    // Nothing worth it and energy is about to overflow: swap out the weakest card.
    if (full && h.hand.some(Boolean)) {
      const worst = h.hand.filter(Boolean).map(inst => ({ inst, s: cardValue(sim, this.pid, cardDef(inst.id, inst.up), foes[0].id, this.claims) })).sort((a, b) => a.s - b.s)[0];
      sim.act(this.pid, { k: 'cycle', u: worst.inst.u });
    }
  }
}

// ---------- Running fights ----------
const PARTIES = {
  solo_knight: ['knight'], solo_mage: ['mage'], solo_rogue: ['rogue'], solo_cleric: ['cleric'],
  '2p': ['knight', 'mage'], '3p': ['knight', 'mage', 'cleric'], '4p': ['knight', 'mage', 'rogue', 'cleric'],
};
// Decks built around interrupts and stuns, the way an experienced party plays.
const CC_DECKS = {
  knight: ['k_bash', 'k_pommel', 'k_parry', 'k_heavy', 'k_quake', 'k_charge', 'k_provoke', 'k_challenge', 'k_fortress', 'k_strike'],
  mage: ['m_counter', 'm_silence', 'm_frostbite', 'm_nova', 'm_blizzard', 'm_rewind', 'm_steal', 'm_bolt', 'm_fireball', 'm_lance'],
  rogue: ['r_kick', 'r_feint', 'r_garrote', 'r_cheap', 'r_stab', 'r_quick', 'r_backstab', 'r_twin', 'r_venom', 'r_evade'],
  cleric: ['c_rebuke', 'c_hush', 'c_peal', 'c_smite', 'c_judge', 'c_prayer', 'c_sanct', 'c_bless', 'c_divine', 'c_holyfire'],
};
const KINDS = (args.kinds || 'normal4,normal9,elite,boss').split(',').map(k => k.startsWith('normal') ? ['normal', Number(k.slice(6)), 'fight'] : [k, k === 'boss' ? 13 : 7, k]);

export function runFight(classes, kind, row, decks = {}) {
  const S = newLobby(), sim = new Sim(S);
  const ids = classes.map((_, i) => 'p' + i);
  ids.forEach(id => { sim.join(id, id); sim.hostId ??= id; });
  ids.forEach((id, i) => { sim.act(id, { k: 'cls', c: classes[i] }); if (decks[classes[i]]) sim.act(id, { k: 'deck', ids: decks[classes[i]] }); });
  sim.act(ids[0], { k: 'start' });
  setTempo(S.tempo ?? DEFAULT_TEMPO);
  S.pos = { r: Math.min(row, 12), i: 0 };
  const group = kind === 'boss' ? pick(ENCOUNTERS.boss) : pick(ENCOUNTERS[kind]);
  sim.startCombat(group, kind === 'boss' ? 'boss' : kind === 'elite' ? 'elite' : 'fight');
  // Count what happens to enemy moves.
  const st = { landed: 0, cancelled: 0, started: 0, tauntedHits: 0, stunT: 0, enemyT: 0, interruptible: 0, downs: 0, heroLost: 0, timeout: 0 };
  const act0 = sim.enemyAct.bind(sim), next0 = sim.nextAction.bind(sim), int0 = sim.interrupt.bind(sim);
  sim.enemyAct = e => { st.landed++; if (e.taunt) st.tauntedHits++; return act0(e); };
  sim.nextAction = e => { next0(e); st.started++; if (interruptible(e)) st.interruptible++; };
  sim.interrupt = (e, n, by) => { const r = int0(e, n, by); if (r) st.cancelled++; return r; };
  const claims = {}, bots = ids.map(id => new SmartBot(sim, id, claims));
  const start = S.hearth;
  let t = 0;
  let last = sim.C;
  while (S.phase === 'combat' && t < 300) {
    for (const b of bots) b.think();
    last = sim.C;
    sim.tick(0.1); sim.ev.length = 0; t += 0.1;
    for (const e of alive(sim.C || { enemies: [] })) { st.enemyT += 0.1; if (e.stun > sim.C.t) st.stunT += 0.1; }
  }
  // A boss win ends the run too, so check how it ended. Running out the clock isn't a win.
  const win = S.phase === 'reward' || (S.phase === 'over' && !!S.over?.win);
  st.timeout = S.phase === 'combat' ? 1 : 0;
  const hs = Object.values((sim.C || last).heroes);
  st.downs = hs.filter(x => x.down).length;
  st.heroLost = hs.reduce((a, x) => a + (x.max - Math.max(0, x.hp)) / x.max, 0) / hs.length;
  return { lost: (start - Math.max(0, S.hearth)) / S.hearthMax, secs: t, win, ...st };
}

export async function main() {
  const want = args.parties ? args.parties.split(',') : Object.keys(PARTIES);
  console.log(`${FIGHTS} fights per row; ${args.decks === 'cc' ? 'CC' : 'starter'} decks; data from ${dir}`);
  console.log('party        kind     hearth lost  fight   won   moves landed  cancelled  interruptible  stunned  hits taunted  hero HP lost  downs/fight  timeouts');
  for (const p of want) {
    const classes = PARTIES[p] || PARTIES[p + 'p'];
    for (const [kind, row] of KINDS) {
      const agg = { lost: 0, secs: 0, win: 0, landed: 0, cancelled: 0, started: 0, tauntedHits: 0, stunT: 0, enemyT: 0, interruptible: 0, downs: 0, heroLost: 0, timeout: 0 };
      const n = kind === 'normal' ? FIGHTS : Math.ceil(FIGHTS / 2);
      for (let i = 0; i < n; i++) { const r = runFight(classes, kind, row, args.decks === 'cc' ? CC_DECKS : {}); for (const k in agg) agg[k] += Number(r[k]); }
      const pct = x => (100 * x).toFixed(0).padStart(3) + '%';
      console.log(`${p.padEnd(12)} ${(kind + (kind === 'normal' ? row : '')).padEnd(8)} ${pct(agg.lost / n).padStart(11)}  ${(agg.secs / n).toFixed(0).padStart(4)}s  ${pct(agg.win / n)}  ${pct(agg.landed / Math.max(1, agg.started)).padStart(12)}  ${pct(agg.cancelled / Math.max(1, agg.started)).padStart(9)}  ${pct(agg.interruptible / Math.max(1, agg.started)).padStart(13)}  ${pct(agg.stunT / Math.max(1, agg.enemyT)).padStart(7)}  ${pct(agg.tauntedHits / Math.max(1, agg.landed)).padStart(12)}  ${pct(agg.heroLost / n).padStart(12)}  ${(agg.downs / n).toFixed(2).padStart(11)}  ${pct(agg.timeout / n).padStart(8)}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
