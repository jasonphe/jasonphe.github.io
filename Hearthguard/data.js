// All game content: classes, cards, enemies, encounters, relics and events.
// Card effects (fx) are applied in key order; see sim.js applyCard for what each key does.

export const CLASSES = {
  knight: { name: 'Knight', icon: '🛡️', hp: 45, color: '#e0b84a', blurb: 'Taunts enemies, soaks hits with Guard, and bashes to interrupt.' },
  mage: { name: 'Mage', icon: '🔮', hp: 24, color: '#7c8cff', blurb: 'Long casts, huge damage and Burn. Pairs well with combo casting.' },
  rogue: { name: 'Rogue', icon: '🗡️', hp: 30, color: '#4fd18b', blurb: 'Cheap, instant cards. Interrupts, weakens and finishes enemies off.' },
  cleric: { name: 'Cleric', icon: '🕯️', hp: 32, color: '#f2a1c7', blurb: 'Heals the Hearth, shields the team and gives allies energy.' },
};

// r: starter | common | uncommon | rare. tgt: enemy | all | ally | self | none.
// cast is in seconds (0 = instant). ex = exhaust (gone for the rest of the fight).
// up overrides fields when upgraded; otherwise numbers grow by about a third.
export const CARDS = {
  // ---------- Knight ----------
  k_strike: { name: 'Strike', cls: 'knight', r: 'starter', cost: 1, tgt: 'enemy', icon: '⚔️', fx: { dmg: 6 } },
  k_guard: { name: 'Raise Shield', cls: 'knight', r: 'starter', cost: 1, tgt: 'self', icon: '🛡️', fx: { guard: 8 } },
  k_provoke: { name: 'Provoke', cls: 'knight', r: 'starter', cost: 1, tgt: 'enemy', icon: '😤', fx: { taunt: 6, guard: 4 } },
  k_bash: { name: 'Shield Bash', cls: 'knight', r: 'starter', cost: 1, tgt: 'enemy', icon: '💥', fx: { dmg: 4, interrupt: 1 } },
  k_brace: { name: 'Brace', cls: 'knight', r: 'starter', cost: 1, tgt: 'none', icon: '🧱', fx: { shield: 6 } },
  k_cleave: { name: 'Cleave', cls: 'knight', r: 'common', cost: 1, tgt: 'all', icon: '🪓', fx: { dmg: 5 } },
  k_wall: { name: 'Shield Wall', cls: 'knight', r: 'common', cost: 2, tgt: 'none', icon: '🏰', fx: { shield: 14 } },
  k_challenge: { name: 'Challenge', cls: 'knight', r: 'common', cost: 1, tgt: 'all', icon: '📯', fx: { taunt: 5, guard: 6 } },
  k_heavy: { name: 'Heavy Blow', cls: 'knight', r: 'common', cost: 2, cast: 1.5, tgt: 'enemy', icon: '🔨', fx: { dmg: 16, stun: 1 } },
  k_iron: { name: 'Iron Skin', cls: 'knight', r: 'common', cost: 1, tgt: 'self', icon: '🪖', fx: { guard: 12 } },
  k_pommel: { name: 'Pommel Strike', cls: 'knight', r: 'common', cost: 1, tgt: 'enemy', icon: '🗡️', fx: { dmg: 7, interrupt: 1 } },
  k_slam: { name: 'Body Slam', cls: 'knight', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '🦬', fx: { guardDmg: 1 }, up: { cost: 0 } },
  k_warcry: { name: 'War Cry', cls: 'knight', r: 'uncommon', cost: 1, tgt: 'none', icon: '📣', fx: { teamEmpower: 4 } },
  k_thorns: { name: 'Thorned Armor', cls: 'knight', r: 'uncommon', cost: 1, tgt: 'self', icon: '🌵', ex: 1, power: 1, fx: { thorns: 3 } },
  k_sunder: { name: 'Sunder', cls: 'knight', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '🪨', fx: { dmg: 6, vuln: 5 } },
  k_hold: { name: 'Hold the Line', cls: 'knight', r: 'uncommon', cost: 2, tgt: 'all', icon: '🚧', fx: { taunt: 4, shield: 10 } },
  k_laststand: { name: 'Last Stand', cls: 'knight', r: 'uncommon', cost: 1, tgt: 'self', icon: '🩹', fx: { mend: 15, guard: 5 } },
  k_bulwark: { name: 'Bulwark', cls: 'knight', r: 'uncommon', cost: 2, tgt: 'enemy', icon: '🛡️', fx: { shieldDmg: 1 }, up: { cost: 1 } },
  k_unbreak: { name: 'Unbreakable', cls: 'knight', r: 'rare', cost: 3, tgt: 'none', icon: '💠', ex: 1, power: 1, fx: { ward: 4 } },
  k_jugg: { name: 'Juggernaut', cls: 'knight', r: 'rare', cost: 2, tgt: 'self', icon: '🐂', ex: 1, power: 1, fx: { fury: 3 } },
  k_quake: { name: 'Earthshaker', cls: 'knight', r: 'rare', cost: 3, cast: 2, tgt: 'all', icon: '🌋', fx: { dmg: 12, stun: 2 }, combo: { stun: 2 } },
  k_fortress: { name: 'Fortress', cls: 'knight', r: 'rare', cost: 2, tgt: 'all', icon: '🏯', fx: { guard: 20, taunt: 6 } },
  k_wind: { name: 'Second Wind', cls: 'knight', r: 'rare', cost: 0, tgt: 'self', icon: '🌬️', ex: 1, fx: { energy: 2, mend: 6 } },

  // ---------- Mage ----------
  m_bolt: { name: 'Firebolt', cls: 'mage', r: 'starter', cost: 1, cast: 1, tgt: 'enemy', icon: '🔥', fx: { dmg: 8 } },
  m_ward: { name: 'Frost Ward', cls: 'mage', r: 'starter', cost: 1, cast: 0.5, tgt: 'none', icon: '❄️', fx: { shield: 6 } },
  m_fireball: { name: 'Fireball', cls: 'mage', r: 'starter', cost: 2, cast: 2.5, tgt: 'enemy', icon: '☄️', fx: { dmg: 20, burn: 3 }, combo: { burn: 4 } },
  m_counter: { name: 'Counterspell', cls: 'mage', r: 'starter', cost: 1, tgt: 'enemy', icon: '🚫', fx: { interrupt: 1 } },
  m_spark: { name: 'Arcane Spark', cls: 'mage', r: 'starter', cost: 0, tgt: 'enemy', icon: '✨', fx: { dmg: 3 } },
  m_lance: { name: 'Ice Lance', cls: 'mage', r: 'common', cost: 1, cast: 0.5, tgt: 'enemy', icon: '🧊', fx: { dmg: 7, weak: 4 } },
  m_wave: { name: 'Flame Wave', cls: 'mage', r: 'common', cost: 2, cast: 1.5, tgt: 'all', icon: '🌊', fx: { dmg: 9 } },
  m_ignite: { name: 'Ignite', cls: 'mage', r: 'common', cost: 1, tgt: 'enemy', icon: '🕯️', fx: { burn: 6 } },
  m_barrier: { name: 'Arcane Barrier', cls: 'mage', r: 'common', cost: 1, cast: 1, tgt: 'none', icon: '🔷', fx: { shield: 10 } },
  m_missile: { name: 'Magic Missile', cls: 'mage', r: 'common', cost: 1, tgt: 'enemy', icon: '🎇', fx: { dmg: 3, hits: 3 } },
  m_channel: { name: 'Channel Mana', cls: 'mage', r: 'common', cost: 0, cast: 2, tgt: 'self', icon: '🌀', fx: { energy: 2 } },
  m_chain: { name: 'Chain Lightning', cls: 'mage', r: 'uncommon', cost: 2, cast: 1, tgt: 'all', icon: '⚡', fx: { dmg: 5, hits: 2 } },
  m_haste: { name: 'Haste', cls: 'mage', r: 'uncommon', cost: 2, tgt: 'none', icon: '⏩', fx: { teamHaste: 5 } },
  m_silence: { name: 'Silence', cls: 'mage', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '🤫', fx: { interrupt: 2 } },
  m_nova: { name: 'Frost Nova', cls: 'mage', r: 'uncommon', cost: 2, cast: 1, tgt: 'all', icon: '💠', fx: { stun: 2, weak: 5 } },
  m_detonate: { name: 'Detonate', cls: 'mage', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '💣', fx: { detonate: 3 } },
  m_focus: { name: 'Arcane Focus', cls: 'mage', r: 'uncommon', cost: 1, tgt: 'self', icon: '🧿', ex: 1, power: 1, fx: { focus: 30 } },
  m_inferno: { name: 'Inferno', cls: 'mage', r: 'uncommon', cost: 2, cast: 1, tgt: 'all', icon: '🔥', fx: { burn: 5 } },
  m_mirror: { name: 'Mirror Shield', cls: 'mage', r: 'uncommon', cost: 2, cast: 1, tgt: 'none', icon: '🪞', fx: { shield: 18 }, combo: { shield: 8 } },
  m_meteor: { name: 'Meteor', cls: 'mage', r: 'rare', cost: 3, cast: 3, tgt: 'all', icon: '🌠', fx: { dmg: 22 } },
  m_pyro: { name: 'Pyroblast', cls: 'mage', r: 'rare', cost: 3, cast: 4, tgt: 'enemy', icon: '🌞', fx: { dmg: 42, burn: 6 }, combo: { dmg: 15 } },
  m_font: { name: 'Mana Font', cls: 'mage', r: 'rare', cost: 2, tgt: 'self', icon: '⛲', ex: 1, power: 1, fx: { regen: 30 } },
  m_overload: { name: 'Overload', cls: 'mage', r: 'rare', cost: 0, tgt: 'self', icon: '🔋', ex: 1, fx: { energy: 3 } },

  // ---------- Rogue ----------
  r_stab: { name: 'Stab', cls: 'rogue', r: 'starter', cost: 1, tgt: 'enemy', icon: '🗡️', fx: { dmg: 6 } },
  r_kick: { name: 'Kick', cls: 'rogue', r: 'starter', cost: 1, tgt: 'enemy', icon: '🦶', fx: { dmg: 2, interrupt: 1 } },
  r_smoke: { name: 'Smokescreen', cls: 'rogue', r: 'starter', cost: 1, tgt: 'none', icon: '💨', fx: { shield: 5 } },
  r_hamstring: { name: 'Hamstring', cls: 'rogue', r: 'starter', cost: 1, tgt: 'enemy', icon: '🦵', fx: { dmg: 3, weak: 4 } },
  r_twin: { name: 'Twin Blades', cls: 'rogue', r: 'starter', cost: 1, tgt: 'enemy', icon: '⚔️', fx: { dmg: 3, hits: 2 } },
  r_quick: { name: 'Quick Slash', cls: 'rogue', r: 'common', cost: 0, tgt: 'enemy', icon: '🔪', fx: { dmg: 4 } },
  r_venom: { name: 'Envenom', cls: 'rogue', r: 'common', cost: 1, tgt: 'enemy', icon: '🧪', fx: { dmg: 2, burn: 5 } },
  r_expose: { name: 'Expose', cls: 'rogue', r: 'common', cost: 1, tgt: 'enemy', icon: '🎯', fx: { vuln: 6 } },
  r_feint: { name: 'Feint', cls: 'rogue', r: 'common', cost: 1, tgt: 'enemy', icon: '🌀', fx: { interrupt: 1, cycleFree: 1 } },
  r_flurry: { name: 'Flurry', cls: 'rogue', r: 'common', cost: 1, tgt: 'enemy', icon: '🌪️', fx: { dmg: 2, hits: 4 } },
  r_distract: { name: 'Distract', cls: 'rogue', r: 'common', cost: 1, tgt: 'enemy', icon: '🪃', fx: { taunt: 3, guard: 7 } },
  r_fan: { name: 'Fan of Knives', cls: 'rogue', r: 'common', cost: 1, tgt: 'all', icon: '🪭', fx: { dmg: 4 } },
  r_evade: { name: 'Evasion', cls: 'rogue', r: 'common', cost: 1, tgt: 'self', icon: '🤸', fx: { guard: 14 } },
  r_backstab: { name: 'Backstab', cls: 'rogue', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '🔪', fx: { dmg: 9, exec: 9 } },
  r_bomb: { name: 'Smoke Bomb', cls: 'rogue', r: 'uncommon', cost: 1, tgt: 'all', icon: '💣', fx: { weak: 4, shield: 5 } },
  r_adren: { name: 'Adrenaline', cls: 'rogue', r: 'uncommon', cost: 0, tgt: 'self', icon: '💉', fx: { energy: 1, haste: 4 } },
  r_garrote: { name: 'Garrote', cls: 'rogue', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '🪢', fx: { interrupt: 1, stun: 2 } },
  r_dance: { name: 'Dance of Blades', cls: 'rogue', r: 'uncommon', cost: 2, tgt: 'enemy', icon: '💃', fx: { dmg: 4, hits: 5 } },
  r_toxin: { name: 'Toxin Vial', cls: 'rogue', r: 'uncommon', cost: 2, tgt: 'enemy', icon: '⚗️', fx: { burn: 14 } },
  r_cheap: { name: 'Cheap Shot', cls: 'rogue', r: 'uncommon', cost: 0, tgt: 'enemy', icon: '👊', fx: { stun: 1, weak: 3 } },
  r_pick: { name: 'Pickpocket', cls: 'rogue', r: 'uncommon', cost: 1, tgt: 'enemy', icon: '👛', fx: { dmg: 6, gold: 4 } },
  r_assassin: { name: 'Assassinate', cls: 'rogue', r: 'rare', cost: 3, cast: 1.5, tgt: 'enemy', icon: '☠️', fx: { dmg: 30, exec: 20 }, combo: { dmg: 10 } },
  r_prep: { name: 'Preparation', cls: 'rogue', r: 'rare', cost: 0, tgt: 'self', icon: '🎒', ex: 1, fx: { energy: 2, cycleFree: 4 } },
  r_shadow: { name: 'Shadow Dance', cls: 'rogue', r: 'rare', cost: 2, tgt: 'self', icon: '🌑', ex: 1, power: 1, fx: { fury: 2, regen: 15 } },

  // ---------- Cleric ----------
  c_smite: { name: 'Smite', cls: 'cleric', r: 'starter', cost: 1, tgt: 'enemy', icon: '✝️', fx: { dmg: 6 } },
  c_prayer: { name: 'Prayer', cls: 'cleric', r: 'starter', cost: 2, cast: 2, tgt: 'none', icon: '🙏', fx: { heal: 5 }, combo: { heal: 3 } },
  c_sanct: { name: 'Sanctuary', cls: 'cleric', r: 'starter', cost: 1, cast: 1, tgt: 'none', icon: '⛪', fx: { shield: 8 } },
  c_rebuke: { name: 'Rebuke', cls: 'cleric', r: 'starter', cost: 1, tgt: 'enemy', icon: '✋', fx: { dmg: 3, interrupt: 1 } },
  c_bless: { name: 'Blessing', cls: 'cleric', r: 'starter', cost: 1, tgt: 'ally', icon: '🌟', fx: { energy: 2 } },
  c_light: { name: 'Holy Light', cls: 'cleric', r: 'common', cost: 2, cast: 2, tgt: 'none', icon: '☀️', fx: { heal: 8 } },
  c_divine: { name: 'Divine Shield', cls: 'cleric', r: 'common', cost: 2, cast: 1, tgt: 'none', icon: '🔆', fx: { shield: 16 } },
  c_purify: { name: 'Purify', cls: 'cleric', r: 'common', cost: 1, tgt: 'none', icon: '💧', fx: { cleanse: 1, shield: 5 } },
  c_judge: { name: 'Judgment', cls: 'cleric', r: 'common', cost: 1, tgt: 'enemy', icon: '⚖️', fx: { dmg: 7, vuln: 4 } },
  c_mend: { name: 'Mend Wounds', cls: 'cleric', r: 'common', cost: 1, tgt: 'ally', icon: '🩹', fx: { mend: 14, guard: 5 } },
  c_hush: { name: 'Hush', cls: 'cleric', r: 'common', cost: 1, tgt: 'enemy', icon: '🤐', fx: { interrupt: 1, weak: 4 } },
  c_holyfire: { name: 'Holy Fire', cls: 'cleric', r: 'common', cost: 1, cast: 1, tgt: 'enemy', icon: '🔥', fx: { dmg: 3, burn: 7 } },
  c_res: { name: 'Resurrection', cls: 'cleric', r: 'uncommon', cost: 1, cast: 2, tgt: 'none', icon: '🕊️', fx: { revive: 1, heal: 3 } },
  c_hymn: { name: 'Hymn', cls: 'cleric', r: 'uncommon', cost: 2, cast: 1.5, tgt: 'none', icon: '🎶', fx: { teamEnergy: 1, teamHaste: 3 }, combo: { teamEnergy: 1 } },
  c_consecrate: { name: 'Consecrate', cls: 'cleric', r: 'uncommon', cost: 2, cast: 1, tgt: 'all', icon: '🌅', fx: { dmg: 6, burn: 3 } },
  c_angel: { name: 'Guardian Angel', cls: 'cleric', r: 'uncommon', cost: 1, tgt: 'ally', icon: '👼', fx: { guard: 15 } },
  c_bene: { name: 'Benediction', cls: 'cleric', r: 'uncommon', cost: 0, tgt: 'none', icon: '🙌', fx: { teamEmpower: 2, shield: 3 } },
  c_smiteevil: { name: 'Smite Evil', cls: 'cleric', r: 'uncommon', cost: 2, cast: 1, tgt: 'enemy', icon: '⚡', fx: { dmg: 20 } },
  c_quicken: { name: 'Quickening', cls: 'cleric', r: 'uncommon', cost: 1, tgt: 'none', icon: '⏱️', fx: { hurry: 2, shield: 5 } },
  c_ground: { name: 'Hallowed Ground', cls: 'cleric', r: 'rare', cost: 3, tgt: 'none', icon: '🌄', ex: 1, power: 1, fx: { ward: 3 } },
  c_circle: { name: 'Prayer Circle', cls: 'cleric', r: 'rare', cost: 3, cast: 3, tgt: 'none', icon: '⭕', fx: { heal: 12, shield: 12 }, combo: { heal: 6 } },
  c_martyr: { name: 'Martyrdom', cls: 'cleric', r: 'rare', cost: 1, tgt: 'none', icon: '🩸', ex: 1, fx: { selfDmg: 12, heal: 12 } },
  c_grace: { name: 'Grace', cls: 'cleric', r: 'rare', cost: 1, tgt: 'none', icon: '🪽', fx: { teamEnergy: 2 }, ex: 1 },

  // ---------- Curses ----------
  hex: { name: 'Hex', cls: 'curse', r: 'curse', cost: 0, tgt: 'none', icon: '🧿', fx: {}, unplayable: 1 },
};

export const STARTER = {
  knight: ['k_strike', 'k_strike', 'k_strike', 'k_guard', 'k_guard', 'k_provoke', 'k_bash', 'k_brace'],
  mage: ['m_bolt', 'm_bolt', 'm_bolt', 'm_ward', 'm_ward', 'm_fireball', 'm_counter', 'm_spark'],
  rogue: ['r_stab', 'r_stab', 'r_stab', 'r_kick', 'r_smoke', 'r_smoke', 'r_hamstring', 'r_twin'],
  cleric: ['c_smite', 'c_smite', 'c_smite', 'c_prayer', 'c_sanct', 'c_sanct', 'c_rebuke', 'c_bless'],
};

const UPG_SCALE = ['dmg', 'shield', 'guard', 'heal', 'mend', 'burn', 'thorns', 'ward', 'fury', 'empower', 'teamEmpower', 'detonate', 'exec', 'gold', 'focus', 'regen'];
const UPG_TIME = ['taunt', 'stun', 'vuln', 'weak', 'haste', 'teamHaste'];

// The card definition as it plays, with the upgrade applied.
const cardCache = new Map();
export function cardDef(id, up) {
  const key = id + (up ? '+' : '');
  if (cardCache.has(key)) return cardCache.get(key);
  const base = CARDS[id] || CARDS.hex;
  let c = { ...base, id, cast: base.cast || 0, fx: { ...base.fx } };
  if (up && base.r !== 'curse') {
    if (base.up) c = { ...c, ...base.up, fx: { ...c.fx, ...(base.up.fx || {}) } };
    else {
      for (const k of Object.keys(c.fx)) {
        if (UPG_SCALE.includes(k)) c.fx[k] = Math.ceil(c.fx[k] * 1.35);
        else if (UPG_TIME.includes(k)) c.fx[k] = c.fx[k] + 1;
      }
      if (c.cast) c.cast = Math.round(c.cast * 0.7 * 10) / 10;
    }
    c.name += '+';
    c.upgraded = true;
  }
  cardCache.set(key, c);
  return c;
}

const say = (fx, k, tgt, all) => {
  const v = fx[k];
  const ally = tgt === 'ally';
  switch (k) {
    case 'dmg': return `Deal <b>${v}</b> damage${fx.hits > 1 ? ` ${fx.hits} times` : ''}${all ? ' to ALL enemies' : ''}.`;
    case 'guardDmg': return 'Deal damage equal to your Guard.';
    case 'shieldDmg': return "Deal damage equal to the Hearth's Shield.";
    case 'exec': return `+<b>${v}</b> if the target is under 40% HP.`;
    case 'detonate': return `Deal <b>${v}×</b> the target's Burn, then clear it.`;
    case 'interrupt': return `<b>Interrupt</b>${all ? ' ALL' : ''}${v > 1 ? ` (breaks ${v} poise)` : ''}.`;
    case 'stun': return `Stun${all ? ' ALL' : ''} ${v}s.`;
    case 'vuln': return `Vulnerable${all ? ' to ALL' : ''} ${v}s.`;
    case 'weak': return `Weaken${all ? ' ALL' : ''} ${v}s.`;
    case 'burn': return `Apply <b>${v}</b> Burn${all ? ' to ALL' : ''}.`;
    case 'taunt': return `<b>Taunt</b>${all ? ' ALL enemies' : ''} for ${v}s.`;
    case 'shield': return `Shield the Hearth <b>${v}</b>.`;
    case 'guard': return ally ? `Give an ally <b>${v}</b> Guard.` : `Gain <b>${v}</b> Guard.`;
    case 'heal': return `Heal the Hearth <b>${v}</b>.`;
    case 'mend': return ally ? `Restore <b>${v}</b> HP to an ally.` : `Restore <b>${v}</b> of your HP.`;
    case 'energy': return ally ? `Give an ally <b>${v}</b> ⚡.` : `Gain <b>${v}</b> ⚡.`;
    case 'teamEnergy': return `Everyone gains <b>${v}</b> ⚡.`;
    case 'haste': return `Double your ⚡ regen for ${v}s.`;
    case 'teamHaste': return `Everyone regens ⚡ twice as fast for ${v}s.`;
    case 'empower': return `Your next attack deals +${v}.`;
    case 'teamEmpower': return `Everyone's next attack deals +<b>${v}</b>.`;
    case 'hurry': return `Allies' casts jump ${v}s ahead.`;
    case 'revive': return 'Revive downed allies.';
    case 'cleanse': return 'Remove Hexes from every hand.';
    case 'cycleFree': return `Your next ${v} discard${v > 1 ? 's are' : ' is'} free.`;
    case 'gold': return `Gain ${v} gold.`;
    case 'selfDmg': return `Lose ${v} of your HP.`;
    case 'ward': return `<b>Power:</b> the Hearth gains ${v} Shield every 4s.`;
    case 'fury': return `<b>Power:</b> your attacks deal +${v}.`;
    case 'focus': return `<b>Power:</b> you cast ${v}% faster.`;
    case 'regen': return `<b>Power:</b> +${v}% ⚡ regen.`;
    case 'thorns': return `<b>Power:</b> when you're hit, deal ${v} back.`;
    default: return '';
  }
};
const fxText = (fx, tgt) => Object.keys(fx).map(k => say(fx, k, tgt, tgt === 'all')).filter(Boolean).join(' ');

export function cardText(c) {
  if (c.unplayable) return 'Unplayable. Discard it for ⚡. Gone after the fight.';
  let t = fxText(c.fx, c.tgt);
  if (c.combo) t += ` <i>Combo: ${fxText(c.combo, c.tgt)}</i>`;
  if (c.ex && !c.power) t += ' <i>Exhaust.</i>';
  return t;
}

// ---------- Enemies ----------
// Action kinds:
//  atk   hits the Hearth, or the taunter if taunted
//  pounce hits a random hero (or the taunter)
//  wave  hits the Hearth and can't be taunted
//  quake hits the Hearth and every hero
//  block, buff (+str to self), rally (+str to all), heal, summon, hex, drain (⚡), slow
// w = wind-up seconds; poise = interrupts needed (99 = can't be interrupted).
export const ENEMIES = {
  rat: { name: 'Plague Rat', icon: '🐀', hp: 18, pat: 'random', acts: [{ n: 'Gnaw', k: 'atk', dmg: 4, w: 2.5 }, { n: 'Leap', k: 'pounce', dmg: 5, w: 3 }] },
  skeleton: { name: 'Skeleton', icon: '💀', hp: 40, pat: 'cycle', acts: [{ n: 'Slash', k: 'atk', dmg: 8, w: 3.5 }, { n: 'Bone Wall', k: 'block', v: 10, w: 2 }, { n: 'Heavy Swing', k: 'atk', dmg: 17, w: 5.5, poise: 2 }] },
  cultist: { name: 'Cultist', icon: '🧙', hp: 32, pat: 'cycle', acts: [{ n: 'Dark Chant', k: 'buff', v: 3, w: 4 }, { n: 'Shadow Bolt', k: 'atk', dmg: 7, w: 3 }, { n: 'Hex', k: 'hex', v: 1, w: 3.5 }, { n: 'Shadow Bolt', k: 'atk', dmg: 7, w: 3 }] },
  goblin: { name: 'Goblin Archer', icon: '👺', hp: 24, pat: 'random', acts: [{ n: 'Volley', k: 'atk', dmg: 3, hits: 3, w: 3.5 }, { n: 'Snipe', k: 'pounce', dmg: 8, w: 3 }] },
  wolf: { name: 'Dire Wolf', icon: '🐺', hp: 30, pat: 'random', acts: [{ n: 'Bite', k: 'pounce', dmg: 6, w: 2.5 }, { n: 'Howl', k: 'rally', v: 2, w: 3 }, { n: 'Lunge', k: 'atk', dmg: 11, w: 4 }] },
  bat: { name: 'Vampire Bat', icon: '🦇', hp: 14, pat: 'random', acts: [{ n: 'Screech', k: 'drain', v: 1, w: 3 }, { n: 'Nip', k: 'atk', dmg: 3, w: 2 }] },
  spider: { name: 'Crypt Spider', icon: '🕷️', hp: 28, pat: 'cycle', acts: [{ n: 'Web', k: 'slow', v: 5, w: 3 }, { n: 'Venom Spray', k: 'wave', dmg: 6, w: 4 }, { n: 'Bite', k: 'atk', dmg: 6, w: 2.5 }] },
  zombie: { name: 'Ghoul', icon: '🧟', hp: 50, pat: 'cycle', acts: [{ n: 'Claw', k: 'atk', dmg: 10, w: 4.5 }, { n: 'Lurch', k: 'pounce', dmg: 7, w: 3.5 }] },
  wraith: { name: 'Wraith', icon: '👻', hp: 36, pat: 'cycle', acts: [{ n: 'Soul Rend', k: 'wave', dmg: 9, w: 4.5 }, { n: 'Fade', k: 'block', v: 12, w: 2.5 }, { n: 'Chill', k: 'pounce', dmg: 7, w: 3 }] },
  // Elites
  ogre: { name: 'Ogre Brute', icon: '👹', hp: 130, elite: 1, pat: 'cycle', acts: [{ n: 'Roar', k: 'buff', v: 4, w: 3 }, { n: 'Smash', k: 'atk', dmg: 22, w: 6, poise: 2 }, { n: 'Stomp', k: 'quake', dmg: 5, w: 4 }, { n: 'Smash', k: 'atk', dmg: 22, w: 6, poise: 2 }] },
  necro: { name: 'Necromancer', icon: '🧛', hp: 95, elite: 1, pat: 'cycle', acts: [{ n: 'Raise Dead', k: 'summon', v: 'skeleton', w: 5, poise: 2 }, { n: 'Soul Drain', k: 'atk', dmg: 10, heal: 10, w: 4 }, { n: 'Curse', k: 'hex', v: 2, w: 3.5 }, { n: 'Bone Spear', k: 'pounce', dmg: 13, w: 3.5 }] },
  gargoyle: { name: 'Gargoyle', icon: '🗿', hp: 110, elite: 1, pat: 'cycle', acts: [{ n: 'Stone Skin', k: 'block', v: 20, w: 3 }, { n: 'Dive', k: 'atk', dmg: 18, w: 5 }, { n: 'Crushing Weight', k: 'wave', dmg: 15, w: 6, poise: 3 }] },
  dread: { name: 'Dread Knight', icon: '🐴', hp: 120, elite: 1, pat: 'cycle', acts: [{ n: 'Charge', k: 'atk', dmg: 20, w: 4.5, poise: 2 }, { n: 'Dark Cleave', k: 'quake', dmg: 6, w: 4 }, { n: 'Shield Up', k: 'block', v: 15, w: 2.5 }] },
  // Bosses
  king: { name: 'The Hollow King', icon: '👑', hp: 380, boss: 1, pat: 'cycle', acts: [{ n: "Crown's Will", k: 'block', v: 25, w: 3 }, { n: 'Royal Decree', k: 'summon', v: 'skeleton', w: 5, poise: 2 }, { n: 'Executioner', k: 'atk', dmg: 30, w: 7, poise: 3 }, { n: 'Shadow Wave', k: 'quake', dmg: 7, w: 5, poise: 2 }, { n: 'Rally the Dead', k: 'rally', v: 3, w: 3.5 }, { n: 'Executioner', k: 'atk', dmg: 30, w: 7, poise: 3 }] },
  wyrm: { name: 'Ash Wyrm', icon: '🐉', hp: 420, boss: 1, pat: 'cycle', acts: [{ n: 'Claw', k: 'atk', dmg: 13, w: 3 }, { n: 'Flame Breath', k: 'wave', dmg: 16, w: 6, poise: 3 }, { n: 'Tail Swipe', k: 'quake', dmg: 6, w: 4 }, { n: 'Terrify', k: 'drain', v: 2, w: 3 }, { n: 'Molt', k: 'heal', v: 25, w: 4, poise: 2 }, { n: 'Flame Breath', k: 'wave', dmg: 16, w: 6, poise: 3 }] },
};

export const ENCOUNTERS = {
  easy: [['rat', 'rat'], ['skeleton'], ['cultist'], ['goblin', 'bat'], ['wolf'], ['zombie']],
  normal: [['skeleton', 'cultist'], ['wolf', 'wolf'], ['goblin', 'goblin', 'bat'], ['spider', 'rat', 'rat'], ['zombie', 'cultist'], ['wraith', 'bat'], ['spider', 'skeleton'], ['zombie', 'zombie'], ['wraith', 'goblin']],
  elite: [['ogre'], ['necro', 'skeleton'], ['gargoyle'], ['dread']],
  boss: [['king'], ['wyrm']],
};

// ---------- Relics (shared by the team) ----------
export const RELICS = {
  ember: { name: 'Ember Heart', icon: '❤️‍🔥', text: 'The Hearth heals 6 after each fight.' },
  banner: { name: 'Iron Banner', icon: '🚩', text: 'Start each fight with 12 Shield.' },
  quick: { name: 'Quicksilver', icon: '⚗️', text: 'Everyone regenerates ⚡ 12% faster.' },
  whet: { name: 'Whetstone', icon: '🪨', text: 'All attacks deal +1 damage.' },
  bell: { name: 'Tower Bell', icon: '🔔', text: 'Interrupts also stun for 1.5s.' },
  lode: { name: 'Lodestone', icon: '🧲', text: 'Taunts last 2s longer.' },
  choir: { name: 'Choir Stone', icon: '🎶', text: 'Combo bonuses are doubled.' },
  tooth: { name: 'Gold Tooth', icon: '🦷', text: 'Everyone gets +10 gold after fights.' },
  pouch: { name: 'Spare Pouch', icon: '👝', text: 'Everyone has +1 max ⚡.' },
  collar: { name: 'Thorned Collar', icon: '⛓️', text: 'Taunting grants 5 Guard.' },
  phoenix: { name: 'Phoenix Feather', icon: '🪶', text: 'Once: if the Hearth would fall, it returns at 30%.' },
  glass: { name: 'Hourglass', icon: '⏳', text: 'Enemies wind up 10% slower.' },
  lantern: { name: 'Watch Lantern', icon: '🏮', text: 'Enemies start each fight 3s later.' },
  tome: { name: 'Grim Tome', icon: '📕', text: 'Burn deals +1 damage per tick.' },
  anchor: { name: 'Anchor', icon: '⚓', text: 'The Hearth\'s Shield no longer decays.' },
  candle: { name: 'Vigil Candle', icon: '🕯️', text: 'Everyone starts fights with full ⚡.' },
};

// ---------- Events (the team votes on an option) ----------
export const EVENTS = {
  shrine: { name: 'Bloodied Shrine', icon: '⛩️', text: 'A shrine slick with old blood hums with power. It wants a tithe.', opts: [{ t: 'Pray', d: 'Hearth loses 10. Gain a relic.' }, { t: 'Leave', d: 'Nothing happens.' }] },
  smith: { name: 'Wandering Smith', icon: '⚒️', text: 'A dwarf with a portable anvil offers a hand, or a coin purse.', opts: [{ t: 'Sharpen', d: 'Everyone upgrades a random card.' }, { t: 'Sell scrap', d: 'Everyone gains 25 gold.' }] },
  fountain: { name: 'Moonlit Fountain', icon: '⛲', text: 'Silver water bubbles up from the stone.', opts: [{ t: 'Drink', d: 'Hearth heals 15.' }, { t: 'Fill flasks', d: 'Hearth max +8.' }] },
  dice: { name: 'Bone Dice', icon: '🎲', text: 'A skeleton rattles a cup of dice. "Twenty each to play."', opts: [{ t: 'Roll', d: 'Everyone pays 20 gold. 50%: gain a relic.' }, { t: 'Leave', d: 'Nothing happens.' }] },
  library: { name: 'Forgotten Library', icon: '📚', text: 'Dusty tomes line the walls. Some still glow.', opts: [{ t: 'Study', d: 'Everyone gains a random uncommon card.' }, { t: 'Nap', d: 'Hearth heals 8.' }] },
  trader: { name: 'Ghostly Trader', icon: '👤', text: '"Your warmth, for my wares," it whispers.', opts: [{ t: 'Trade', d: 'Hearth max −12. Everyone gains a random rare card.' }, { t: 'Leave', d: 'Nothing happens.' }] },
  ambush: { name: 'Ambush!', icon: '⚠️', text: 'Eyes glint from the dark. You could fight, or run and take some hits.', opts: [{ t: 'Fight', d: 'A fight with extra gold.' }, { t: 'Flee', d: 'Hearth loses 9.' }] },
};
