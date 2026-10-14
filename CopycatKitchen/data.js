// Copycat Kitchen content: ingredients, how they can be cut and cooked, seasonings, and the dishes to copy.

export const FLAVORS = ['salty', 'sour', 'sweet', 'spicy', 'savory'];
export const FLAVOR_NAMES = { salty: 'Salty', sour: 'Sour', sweet: 'Sweet', spicy: 'Spicy', savory: 'Savory' };

// ---------- Cuts ----------
// game: the board minigame for the cut, and its settings (see games.js).
// speed: cooking time relative to whole (smaller pieces cook faster).
export const PREPS = {
  whole: { name: 'Whole', done: 'whole', speed: 1, say: (n) => n },
  slice: { name: 'Slice', done: 'sliced', game: ['knife', { cuts: 5, speed: 2.4 }], speed: 0.6, say: (n) => `slice the ${n}` },
  dice: { name: 'Dice', done: 'diced', game: ['knife', { cuts: 4, turns: true, speed: 2.8 }], speed: 0.45, say: (n) => `dice the ${n}` },
  mince: { name: 'Mince', done: 'minced', game: ['rock', {}], speed: 0.3, say: (n) => `mince the ${n}` },
  wedge: { name: 'Wedges', done: 'in wedges', game: ['knife', { cuts: 3, speed: 2 }], speed: 0.75, say: (n) => `cut the ${n} into wedges` },
  grate: { name: 'Grate', done: 'grated', game: ['grate', { strokes: 10 }], speed: 0.35, say: (n) => `grate the ${n}` },
  tear: { name: 'Tear', done: 'torn', game: ['tear', { pieces: 4 }], speed: 0.6, say: (n) => `tear the ${n}` },
  crack: { name: 'Crack', done: 'cracked', game: ['crack', {}], speed: 1, say: (n) => `crack the ${n}` },
  whisk: { name: 'Whisk', done: 'whisked', game: ['circle', { turns: 3, tool: 'whisk' }], speed: 0.8, say: (n) => `whisk the ${n}` },
};

// The minigame for cutting this ingredient this way. Ingredients can change the number of cuts (a loaf takes 3).
export function prepGame(ing, prep) {
  const [kind, opts] = PREPS[prep].game, cuts = INGS[ing].cuts?.[prep];
  return [kind, cuts ? { ...opts, cuts } : opts];
}

// A cut item can only be cut finer. Anything whole can take any of its ingredient's cuts.
const FINER = { slice: ['dice', 'mince'], dice: ['mince'] };
export function nextPreps(ing, prep) {
  const all = INGS[ing].preps;
  return prep === 'whole' ? all : all.filter((p) => (FINER[prep] || []).includes(p));
}

const PREP_NEAR = {
  'dice|mince': 0.6, 'slice|wedge': 0.5, 'dice|slice': 0.4, 'grate|mince': 0.5, 'dice|wedge': 0.3,
  'mince|slice': 0.2, 'mince|tear': 0.3, 'slice|tear': 0.3, 'crack|whisk': 0.2,
};
export function prepSim(a, b) {
  if (a === b) return 1;
  if (a === 'whole' || b === 'whole') return 0.1;
  return PREP_NEAR[[a, b].sort().join('|')] || 0;
}

// ---------- Cooking ----------
export const METHODS = {
  raw: { name: 'raw', verb: (x) => `serve ${x} raw` },
  pan_low: { name: 'cooked gently', verb: (x) => `cook ${x} gently in a pan over low heat` },
  pan_med: { name: 'pan-fried', verb: (x) => `fry ${x} in a pan over medium heat` },
  pan_high: { name: 'seared', verb: (x) => `sear ${x} over high heat` },
  pot: { name: 'boiled', verb: (x) => `boil ${x}` },
  oven: { name: 'roasted', verb: (x) => `roast ${x} in the oven` },
};
export const DRY = (m) => m !== 'raw' && m !== 'pot';

const PAN_STEP = { pan_low: 0, pan_med: 1, pan_high: 2 };
export function methodSim(a, b) {
  if (a === b) return 1;
  if (a === 'raw' || b === 'raw') return 0;
  const pa = a in PAN_STEP, pb = b in PAN_STEP;
  if (pa && pb) return Math.abs(PAN_STEP[a] - PAN_STEP[b]) === 1 ? 0.6 : 0.3;
  if ((pa && b === 'oven') || (pb && a === 'oven')) return 0.4;
  return 0.15;
}

// Cooking speed per heat setting (index 0 is off).
export const HEAT = { pan: [0, 0.5, 1, 1.8], pot: [0, 0.5, 1, 1.4], oven: [0, 0.7, 1, 1.35] };
export const HEAT_LABELS = {
  pan: ['Off', 'Low', 'Med', 'High'],
  pot: ['Off', 'Low', 'Med', 'High'],
  oven: ['Off', '160°', '200°', '240°'],
};
export const PAN_KEY = ['', 'pan_low', 'pan_med', 'pan_high'];

// ---------- Ingredients ----------
// fam: close substitutes share a family. role: where it sits on the plate.
// time: seconds to cook through (cook level 1) whole, on medium heat.
// a/ac: outer colour raw/cooked (skin, crust). b/bc: inner colour raw/cooked (flesh, crumb).
// skin: cut pieces show a rim of the outer colour. fl/flc: flavour raw/cooked.
// melt: from this cook level (for these cuts) it turns into a sauce or puddle.
export const INGS = {
  egg: { name: 'Egg', fam: 'egg', role: 'main', time: 9, preps: ['crack', 'whisk'], a: '#f1e2c9', ac: '#f1e2c9', b: '#f6b21b', bc: '#f3bf3a', fl: { savory: 0.4 } },
  bread: { name: 'Bread', fam: 'starch', role: 'base', time: 10, preps: ['slice'], rawName: 'fresh', warmName: 'warm', from: 'dough', fromHow: 'bake', cuts: { slice: 3 }, yields: { slice: 3 }, a: '#b8773a', ac: '#b8773a', b: '#f1dcae', bc: '#f1dcae', fl: { sweet: 0.2 } },
  flour: { name: 'Flour', fam: 'baking', role: 'garnish', time: 20, preps: [], a: '#f4efe6', ac: '#efe2c6', b: '#ffffff', bc: '#f4ead6', fl: {} },
  yeast: { name: 'Yeast', fam: 'baking', role: 'garnish', time: 10, preps: [], a: '#d4a85e', ac: '#c79a50', b: '#e3c48a', bc: '#d6b273', fl: { savory: 0.1 } },
  // Made in the bowl. Baking it in the oven turns it into a loaf of bread.
  dough: {
    name: 'Dough', fam: 'baking', role: 'base', time: 26, preps: [], bakesInto: 'bread',
    stages: [[0.05, 'raw'], [0.5, 'rising'], [Infinity, 'baking']],
    a: '#efdcb4', ac: '#e2b46e', b: '#f4e6c6', bc: '#e9c88f', fl: {},
  },
  // Made in the bowl. Cutting it on the board turns it into fresh pasta.
  pastadough: {
    name: 'Pasta dough', fam: 'baking', role: 'base', time: 30, preps: ['slice'], cutsInto: { slice: 'pasta' },
    prepNames: { slice: 'Cut noodles' }, cuts: { slice: 6 },
    a: '#f2d27a', ac: '#e8c060', b: '#f6dc8e', bc: '#eccb72', fl: {},
  },
  tomato: {
    name: 'Tomato', fam: 'fruit', role: 'side', time: 16, preps: ['slice', 'dice', 'wedge'], skin: true, slice: 'round', pattern: 'seeds',
    a: '#e0392b', ac: '#c8301f', b: '#ef5b45', bc: '#d23a26',
    melt: { at: 1.25, preps: ['dice', 'mince'], name: 'saucy', color: '#c4301e', brown: 0.45 },
    fl: { sour: 0.6, sweet: 0.2 }, flc: { sour: 0.3, sweet: 0.5, savory: 0.2 },
  },
  onion: { name: 'Onion', fam: 'allium', role: 'side', time: 18, preps: ['slice', 'dice', 'mince'], slice: 'round', pattern: 'rings', a: '#c98a4b', ac: '#b8803f', b: '#f4ece0', bc: '#ecd49a', fl: { spicy: 0.3 }, flc: { sweet: 0.5, savory: 0.2 } },
  garlic: { name: 'Garlic', fam: 'allium', role: 'garnish', time: 10, preps: ['slice', 'mince'], slice: 'chip', a: '#efe7da', ac: '#e8d6ad', b: '#f6f0dc', bc: '#ecd8a0', fl: { spicy: 0.4, savory: 0.2 }, flc: { savory: 0.7 } },
  bellpepper: { name: 'Bell pepper', fam: 'veg', role: 'side', time: 16, preps: ['slice', 'dice'], skin: true, slice: 'strip', a: '#d8332a', ac: '#b92a20', b: '#e9533f', bc: '#cf3f2d', fl: { sweet: 0.4 }, flc: { sweet: 0.5 } },
  carrot: { name: 'Carrot', fam: 'veg', role: 'side', time: 22, preps: ['slice', 'dice'], skin: true, slice: 'round', pattern: 'core', a: '#ee7a22', ac: '#e06c1c', b: '#f39a3c', bc: '#ec8a33', fl: { sweet: 0.5 }, flc: { sweet: 0.6 } },
  mushroom: { name: 'Mushroom', fam: 'veg', role: 'side', time: 14, preps: ['slice'], slice: 'profile', a: '#b48a64', ac: '#7f5a3b', b: '#ecdcc4', bc: '#b8916a', fl: { savory: 0.5 }, flc: { savory: 0.8 } },
  potato: { name: 'Potato', fam: 'starch', role: 'side', time: 34, preps: ['wedge', 'dice', 'slice'], skin: true, slice: 'round', pattern: 'plain', a: '#c9a46a', ac: '#c49a5c', b: '#f2e2b0', bc: '#f6e4ad', fl: {}, flc: { savory: 0.2 } },
  lemon: { name: 'Lemon', fam: 'fruit', role: 'side', time: 14, preps: ['wedge', 'slice'], skin: true, slice: 'round', pattern: 'segments', a: '#f4d23b', ac: '#e9c432', b: '#f8e48a', bc: '#f2d878', fl: { sour: 1.5 }, flc: { sour: 1.2 } },
  basil: { name: 'Basil', fam: 'herb', role: 'garnish', time: 5, preps: ['tear'], a: '#3f8f3a', ac: '#2c6229', b: '#7cc06f', bc: '#4f8a45', fl: { sweet: 0.1, savory: 0.1 } },
  cheese: {
    name: 'Cheese', fam: 'dairy', role: 'garnish', time: 6, preps: ['grate'], a: '#e9b93a', ac: '#e2a92e', b: '#f3cf5c', bc: '#efbc3e',
    melt: { at: 0.5, preps: ['grate', 'whole'], name: 'melted', color: '#f1bd3c' }, fl: { salty: 0.8, savory: 0.6 },
  },
  butter: {
    name: 'Butter', fam: 'dairy', role: 'garnish', time: 8, preps: [], a: '#f3dc84', ac: '#f3dc84', b: '#f8e7a2', bc: '#f8e7a2',
    melt: { at: 0.3, preps: ['whole'], name: 'melted', color: '#f0c95a', alpha: 0.62 }, fl: { savory: 0.4, salty: 0.2 },
  },
  pasta: { name: 'Pasta', fam: 'starch', role: 'base', time: 9, preps: [], from: 'pastadough', fromHow: 'cut', a: '#eccb73', ac: '#f4dc98', b: '#eccb73', bc: '#f4dc98', fl: {} },
  rice: { name: 'Rice', fam: 'starch', role: 'base', time: 18, preps: [], a: '#efe9da', ac: '#fbf9f2', b: '#efe9da', bc: '#fbf9f2', fl: { sweet: 0.1 } },
  steak: { name: 'Steak', fam: 'meat', role: 'main', time: 18, preps: ['slice', 'dice'], slice: 'strip', a: '#b3303a', ac: '#7a4632', b: '#c94650', bc: '#9a6450', fl: { savory: 1 }, flc: { savory: 1.1 } },
  chicken: { name: 'Chicken', fam: 'meat', role: 'main', time: 18, preps: ['slice', 'dice'], slice: 'strip', a: '#f0b0a3', ac: '#f0dfc6', b: '#f4c1b6', bc: '#f6e8d4', fl: { savory: 0.6 } },
  salmon: { name: 'Salmon', fam: 'fish', role: 'main', time: 16, preps: ['slice', 'dice'], slice: 'strip', a: '#f27a4b', ac: '#f4a57f', b: '#f58e62', bc: '#f7b896', fl: { savory: 0.8 } },
};

// Pantry shelf order.
export const PANTRY = ['flour', 'yeast', 'egg', 'rice', 'potato', 'tomato', 'onion', 'garlic', 'bellpepper', 'carrot', 'mushroom', 'lemon', 'basil', 'cheese', 'butter', 'steak', 'chicken', 'salmon'];

// Mixing exactly these in the bowl makes something new. Anything else just becomes a mix.
export const TRANSFORMS = [
  {
    makes: 'dough', turns: 4,
    needs: [{ ing: 'flour' }, { ing: 'egg', preps: ['crack', 'whisk'], hint: 'Crack the egg before it goes in the dough.' }, { ing: 'yeast' }],
  },
  {
    makes: 'pastadough', turns: 3,
    needs: [{ ing: 'flour' }, { ing: 'egg', preps: ['crack', 'whisk'], hint: 'Crack the egg before it goes in the dough.' }],
  },
];

export function ingSim(a, b) {
  if (a === b) return 1;
  return INGS[a].fam === INGS[b].fam ? 0.4 : 0;
}

// ---------- Seasonings ----------
// Added on the plate. Pepper and chili show as specks, soy as a glaze; salt can only be tasted.
export const SEASONINGS = {
  salt: { name: 'Salt', fl: { salty: 1 } },
  pepper: { name: 'Pepper', fl: { spicy: 0.4, savory: 0.1 } },
  chili: { name: 'Chili', fl: { spicy: 1.1 } },
  soy: { name: 'Soy', fl: { salty: 0.9, savory: 0.5 } },
};

// ---------- Dishes ----------
// Each part is one item on the finished plate. Parts sharing a group were cooked together in the same pan.
export const DISHES = [
  {
    id: 'toast', name: 'Sunny Toast', level: 1,
    diner: 'Crunchy golden toast, a runny yolk, and a crack of pepper.',
    parts: [
      { ing: 'bread', prep: 'slice', method: 'pan_med', cook: 1.35 },
      { ing: 'egg', prep: 'crack', method: 'pan_med', cook: 1.0 },
    ],
    season: { salt: 1, pepper: 1 },
  },
  {
    id: 'scramble', name: 'Garden Scramble', level: 1,
    diner: 'Soft, creamy eggs with fresh tomato, basil and cheese scattered over the top.',
    parts: [
      { ing: 'egg', prep: 'whisk', method: 'pan_low', cook: 1.0 },
      { ing: 'tomato', prep: 'dice', method: 'raw', cook: 0 },
      { ing: 'basil', prep: 'tear', method: 'raw', cook: 0 },
      { ing: 'cheese', prep: 'grate', method: 'raw', cook: 0 },
    ],
    season: { salt: 1 },
  },
  {
    id: 'pasta', name: 'Tomato Basil Pasta', level: 3,
    diner: 'A bright tomato sauce with plenty of garlic, a little heat, and fresh basil.',
    parts: [
      { ing: 'pasta', prep: 'whole', method: 'pot', cook: 1.0 },
      { ing: 'tomato', prep: 'dice', method: 'pan_med', cook: 1.5, group: 1 },
      { ing: 'garlic', prep: 'mince', method: 'pan_med', cook: 1.3, group: 1 },
      { ing: 'basil', prep: 'tear', method: 'raw', cook: 0 },
      { ing: 'cheese', prep: 'grate', method: 'raw', cook: 0 },
    ],
    season: { salt: 1, chili: 1 },
  },
  {
    id: 'mushtoast', name: 'Mushroom Toast', level: 2,
    diner: 'Deeply browned mushrooms and crisp garlic piled on toast. Earthy, peppery, a little cheesy.',
    parts: [
      { ing: 'bread', prep: 'slice', method: 'pan_med', cook: 1.3 },
      { ing: 'mushroom', prep: 'slice', method: 'pan_high', cook: 1.65, group: 1 },
      { ing: 'garlic', prep: 'slice', method: 'pan_high', cook: 1.3, group: 1 },
      { ing: 'cheese', prep: 'grate', method: 'raw', cook: 0 },
    ],
    season: { salt: 1, pepper: 1 },
  },
  {
    id: 'salmon', name: 'Lemon Salmon & Rice', level: 2,
    diner: 'Flaky roasted salmon on fluffy rice, with a lemon wedge to squeeze over.',
    parts: [
      { ing: 'salmon', prep: 'whole', method: 'oven', cook: 1.15 },
      { ing: 'rice', prep: 'whole', method: 'pot', cook: 1.0 },
      { ing: 'lemon', prep: 'wedge', method: 'raw', cook: 0 },
    ],
    season: { salt: 1, pepper: 1 },
  },
  {
    id: 'steak', name: 'Steak & Roast Potatoes', level: 3,
    diner: 'A hard sear, basted in butter, with crisp roast potatoes. Lots of black pepper.',
    parts: [
      { ing: 'steak', prep: 'whole', method: 'pan_high', cook: 1.55, group: 1 },
      { ing: 'butter', prep: 'whole', method: 'pan_high', cook: 1.0, group: 1 },
      { ing: 'potato', prep: 'wedge', method: 'oven', cook: 1.7 },
    ],
    season: { salt: 2, pepper: 2 },
  },
  {
    id: 'stirfry', name: 'Chicken Stir-fry', level: 3,
    diner: 'Glossy, salty and a little sweet, with some heat. Everything tossed together in a very hot pan.',
    parts: [
      { ing: 'rice', prep: 'whole', method: 'pot', cook: 1.0 },
      { ing: 'chicken', prep: 'dice', method: 'pan_high', cook: 1.3, group: 1 },
      { ing: 'bellpepper', prep: 'slice', method: 'pan_high', cook: 1.2, group: 1 },
      { ing: 'onion', prep: 'slice', method: 'pan_high', cook: 1.3, group: 1 },
      { ing: 'carrot', prep: 'slice', method: 'pan_high', cook: 1.1, group: 1 },
    ],
    season: { soy: 2, chili: 1 },
  },
];
