// Judging: match each item on the player's plate to the original, then score six categories and write notes.
import { INGS, PREPS, METHODS, SEASONINGS, FLAVORS, DRY, prepSim, methodSim, ingSim } from './data.js';
import { stageName } from './draw.js';

export const CATEGORIES = [
  { key: 'ingredients', name: 'Ingredients', w: 0.25 },
  { key: 'prep', name: 'Knife work', w: 0.15 },
  { key: 'technique', name: 'Technique', w: 0.2 },
  { key: 'doneness', name: 'Doneness', w: 0.2 },
  { key: 'flavor', name: 'Flavor', w: 0.15 },
  { key: 'combo', name: 'Cooked together', w: 0.05 },
];

const nm = (ing) => INGS[ing].name.toLowerCase();
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pinches = (n) => `${n} pinch${n === 1 ? '' : 'es'}`;

export function targetComps(dish) {
  return dish.parts.map((p) => ({ ing: p.ing, prep: p.prep, cook: p.cook, method: p.method, dry: DRY(p.method) ? 1 : 0, group: p.group }));
}

// Pairs of ingredients that share a pan, as "a|b" keys.
export function targetPairs(dish) {
  const out = new Set();
  dish.parts.forEach((a, i) => dish.parts.forEach((b, j) => {
    if (i < j && a.group && a.group === b.group) out.add([a.ing, b.ing].sort().join('|'));
  }));
  return out;
}

export function flavorOf(comps, season) {
  const f = Object.fromEntries(FLAVORS.map((k) => [k, 0]));
  const add = (fl, k = 1) => { for (const key in fl) f[key] += fl[key] * k; };
  for (const c of comps) {
    const d = INGS[c.ing];
    add(c.cook > 0.6 && d.flc ? d.flc : d.fl);
    if (c.dry > 0.5 && c.cook > 1.15 && c.cook < 2.1) f.savory += 0.3;
    if (c.dry > 0.5 && c.cook >= 2.5) f.savory -= 0.2;
  }
  for (const k in season) if (season[k]) add(SEASONINGS[k].fl, season[k]);
  for (const k of FLAVORS) f[k] = Math.max(0, f[k]);
  return f;
}

const doneSim = (a, b) => Math.max(0, 1 - Math.abs(a.cook - b.cook));

// target and mine: [{ ing, prep, cook, method, dry }]. Pairs: Sets of "a|b".
export function judge(dish, mine, mineSeason, minePairs) {
  const target = targetComps(dish);
  const cand = [];
  target.forEach((t, i) => mine.forEach((m, j) => {
    const s = ingSim(t.ing, m.ing);
    if (s > 0) cand.push({ i, j, k: s * 10 + prepSim(t.prep, m.prep) + methodSim(t.method, m.method) + doneSim(t, m) });
  }));
  cand.sort((a, b) => b.k - a.k);
  const match = new Array(target.length).fill(-1), used = new Set();
  for (const c of cand) if (match[c.i] < 0 && !used.has(c.j)) { match[c.i] = c.j; used.add(c.j); }

  const notes = [];
  const note = (impact, text) => notes.push({ impact, text });
  const nT = target.length, n = Math.max(nT, mine.length, 1);
  let ing = 0, prep = 0, tech = 0, done = 0;

  target.forEach((t, i) => {
    if (match[i] < 0) { note(0.6 / nT, `Missing: ${nm(t.ing)}.`); return; }
    const m = mine[match[i]], s = ingSim(t.ing, m.ing);
    const ps = prepSim(t.prep, m.prep), ms = methodSim(t.method, m.method), ds = doneSim(t, m);
    ing += s; prep += ps * s; tech += ms * s; done += ds * s;
    if (s < 1) note(0.3 / nT, `You used ${nm(m.ing)} where the dish had ${nm(t.ing)}.`);
    if (ps < 1) note(0.15 * (1 - ps) / nT, `The ${nm(t.ing)} should be ${PREPS[t.prep].done}, not ${PREPS[m.prep].done}.`);
    if (ms < 1) {
      const said = (c) => (c.method === 'raw' ? 'served raw' : METHODS[c.method].name);
      note(0.25 * (1 - ms) / nT, `The ${nm(t.ing)} was ${said(t)}, not ${said(m)}.`);
    } else if (Math.abs(t.cook - m.cook) > 0.18) {
      const want = stageName(t), got = stageName(m), more = t.cook > m.cook;
      let text;
      if (t.method === 'pan_high' && more) text = `The ${nm(t.ing)} wanted a harder sear.`;
      else if (want !== got) text = `The ${nm(t.ing)} should be ${want}. Yours was ${got}.`;
      else text = `The ${nm(t.ing)} needed ${more ? 'a little longer' : 'a little less time'}.`;
      note(0.2 * (1 - ds) / nT + 0.01, text);
    }
  });
  mine.forEach((m, j) => { if (!used.has(j)) note(0.25 / n, `The dish didn't have ${nm(m.ing)}.`); });

  // Flavor: compare each dimension, judged on a scale of about 1.5.
  const ft = flavorOf(target, dish.season), fm = flavorOf(mine, mineSeason);
  let fd = 0, worst = null;
  for (const k of FLAVORS) {
    const d = ft[k] - fm[k];
    fd += Math.min(1, Math.abs(d) / 1.5);
    if (Math.abs(d) > 0.45 && (!worst || Math.abs(d) > Math.abs(worst.d))) worst = { k, d };
  }
  const flavor = 1 - fd / FLAVORS.length;
  if (worst) {
    const MORE = { salty: 'more salt', sour: 'more acidity', sweet: 'more sweetness', spicy: 'more heat', savory: 'more savory depth' };
    note(0.15 * Math.min(1, Math.abs(worst.d) / 1.5), worst.d > 0 ? `It needed ${MORE[worst.k]}.` : `A little too ${worst.k}.`);
  }

  // Cooked together: only the original's pairs count, so cooking extra things side by side is never punished.
  const tp = targetPairs(dish);
  let hit = 0;
  for (const p of tp) {
    if (minePairs.has(p)) hit++;
    else { const [a, b] = p.split('|'); note(0.05 / tp.size, `The ${nm(a)} and ${nm(b)} should cook together in the same pan.`); }
  }
  const combo = tp.size ? hit / tp.size : 1;

  const cats = { ingredients: ing / n, prep: prep / nT, technique: tech / nT, doneness: done / nT, flavor, combo };
  let total = CATEGORIES.reduce((sum, c) => sum + c.w * cats[c.key], 0) * 100;

  if (mine.some((m) => m.ing === 'chicken' && m.cook < 0.8)) { total -= 15; note(1, 'Raw chicken! The judges are concerned.'); }
  total = Math.max(0, Math.min(100, Math.round(total)));

  notes.sort((a, b) => b.impact - a.impact);
  let lines = notes.slice(0, 3).map((x) => x.text);
  if (total >= 97) lines = ['Indistinguishable from the original. Are you the chef?'];
  else if (!lines.length) lines = ['Very close. Only the smallest details are off.'];
  const stars = total >= 90 ? 3 : total >= 75 ? 2 : total >= 55 ? 1 : 0;
  return { total, stars, cats, notes: lines, flavors: { target: ft, mine: fm } };
}

// The original recipe, in plain steps.
export function recipeSteps(dish) {
  const steps = [], parts = targetComps(dish);
  const cut = (p) => (p.prep === 'whole' ? '' : PREPS[p.prep].say(nm(p.ing)));
  const groups = new Map();
  for (const p of parts) if (p.group) { if (!groups.has(p.group)) groups.set(p.group, []); groups.get(p.group).push(p); }
  for (const g of groups.values()) {
    const cuts = g.map(cut).filter(Boolean);
    const names = g.map((p) => nm(p.ing));
    const list = (a) => (a.length < 2 ? a[0] : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
    const doing = METHODS[g[0].method].verb(`the ${list(names)} together`);
    const untils = g.map((p) => `the ${nm(p.ing)} is ${stageName(p)}`);
    steps.push(`${cuts.length ? `${cap(list(cuts))}, then ${doing}` : cap(doing)} until ${list(untils)}.`);
  }
  for (const p of parts) {
    if (p.group) continue;
    const c = cut(p);
    if (p.method === 'raw') steps.push(c ? `${cap(c)} and add it fresh.` : `Add the ${nm(p.ing)} fresh.`);
    else steps.push(c ? `${cap(c)}, then ${METHODS[p.method].verb('it')} until ${stageName(p)}.` : `${cap(METHODS[p.method].verb(`the ${nm(p.ing)}`))} until ${stageName(p)}.`);
  }
  const s = Object.entries(dish.season).filter(([, v]) => v).map(([k, v]) => `${pinches(v)} of ${SEASONINGS[k].name.toLowerCase()}`);
  if (s.length) steps.push(`Season with ${s.length < 2 ? s[0] : `${s.slice(0, -1).join(', ')} and ${s[s.length - 1]}`}.`);
  return steps;
}
