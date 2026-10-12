# Hearthguard

A real-time co-op roguelike deckbuilder for 1–4 players, played in the browser. Players join a room by code, peer to peer. There are no turns: energy refills over time, cards can have cast times, and enemies wind up moves that hit a shared life pool, **the Hearth**, unless someone taunts or interrupts them. A run is a branching 13-floor map plus a boss.

Live at `jasonphe.github.io/Hearthguard/`, linked first under Games on the homepage (`../index.html`, thumbnail `../resources/hearthguard.jpg`).

## Files

No build step and no dependencies to install. Plain ES modules served as static files.

| File | What it holds |
|---|---|
| `data.js` | All content: classes, cards (with text generation), enemies, encounters, relics, events, rarities, difficulties, paces. |
| `sim.js` | The game rules (`Sim` class). Only the host runs it. |
| `game.js` | Networking, rendering, input, local progress, deck builder, debug menu. |
| `index.html`, `style.css` | Page shell, dialogs, all styles. |
| `tools/bots.mjs` | Balance-testing bots (Node only, never loaded by the game). See Testing. |
| `assets/` | Sliced `.webp` art (see Art). Source `*.png` sheets live here too but are gitignored. |
| `favicon.ico`, `favicon-32.png`, `apple-touch-icon.png` | Hearthguard's own icons, from the Hearth brazier art. |

## Architecture

- **Networking:** Trystero `0.25.4` from jsDelivr, `APP_ID = 'jasonphe-hearthguard'`, with the room code as the room. Copied from `../ScribbleParty`, including the id-prefix hack at the top of `game.js` (newer pages get smaller ids, so the newcomer starts each WebRTC connection). Actions: `hello`, `st`, `cb`, `ev`, `act`.
- **Host-authoritative:** the host is whoever has been in the room longest (earliest join time). The host runs `Sim`, ticks every 100ms, and broadcasts:
  - `st`: the run state **S** (lobby, map, decks, shop…), only when `sim.dirty`.
  - `cb`: the fight state **C**, every tick during combat.
  - `ev`: events (damage numbers, toasts, gains).
  - Clients send `act` messages to the host and just draw what comes back.
- **Host migration:** every client keeps the last S and C. If the host leaves, the next-oldest peer builds a `Sim` from them and carries on. C uses fight-time (`C.t`), never wall-clock time, so this works. Keep it that way.
- **Rejoining:** every page load gets a new peer id, and an old connection can take a long time to time out. Each tab sends a key in `hello` (`tabKey`, kept in `sessionStorage` across reloads), so the same tab takes its seat back straight away, even while its old id still looks connected. Otherwise, a player who rejoins with the same name takes back a seat whose player is offline. `Sim.join` remaps every per-player key; new per-player state needs adding to that remap.
- **Background tabs:** the host tick catches up in 0.1s steps (timers run about once a second in background tabs). Clients extrapolate bars between snapshots (`ahead()` in `game.js`).
- **Rendering:** phases outside combat re-render `#main` from HTML strings (`SCREENS[phase]`), skipping the render when the string is unchanged. Combat builds its DOM once and updates it in `frame()` (requestAnimationFrame) with `setText`/`setHTML`/`setW`/`tog` helpers that only touch the DOM on change. This keeps phones cool, so preserve it.
- **No layout shifts in combat:** nothing that comes and goes mid-fight may change the layout's size.
  - `#combat` is one `minmax(0, 1fr)` column, so a long single line (a cast name, a row of Powers) shrinks or clips instead of widening the page. On phones a wider page makes the browser zoom out.
  - Toggle with `visibility` (`.vacant`), not `display`, and give rows that gain icons a fixed height (`.hearth-label`).
  - Statuses overlay the figures; floating text is clamped on screen; `#fxLayer` clips.
  - To check, snapshot every panel's box in a calm state and a busy one (all heroes casting, many Powers and statuses), then compare.
- **Combat stage:** heroes stand on the left of `.stage` and enemies on the right, like Slay the Spire. Each `.side` lays out its units by count (`data-n`, set by `setCount`): one row on desktop, two per row on phones. In boss fights the enemy side gets 1.4× the width (`.stage:has(.enemy.boss)`), because the Ash Wyrm and the Hollow King's swing are wide. Each unit is a `.fig` (art, status chips overlaid at the bottom, a ground shadow that lights up when the unit can be targeted) above a slim `.plate` (name, HP, cast bar). An enemy's intent is a compact bubble over its head. Tapping it shows the full details, because phones hide the move name and target. Hero figures use full-body pose art where it exists (see Art), or else the class bust (`img.bust`). On phones, the zoomed card pops up over the side the card doesn't target.
- **Player actions** are validated in the `ACTIONS` table at the bottom of `sim.js`. Host-only actions check `p.id === this.hostId`.

## Game rules worth knowing

- **Pace (`TEMPO`):** the host picks Fast (1.5), Normal (2, default) or Relaxed (2.5). Energy regen (`baseRegen()`), enemy wind-ups, the combo window and every duration in seconds scale together. Durations are multiplied by `TEMPO` in `cardDef` (`UPG_TIME` keys) and in timed relic text. When adding anything timed, scale it with `TEMPO` or it'll drift out of step.
- **Hearth and heroes:** Hearth HP by party size is in `HEARTH`. Hero HP carries over between fights. A knocked-out hero stays down until a Resurrection or the end of the fight. If the whole party is down, the run ends (a "wipe").
- **Burn vs Poison:** both deal their stack in damage each second (ignoring block), then drop by 1. They stack separately and have separate stats. Mage and cleric cards apply Burn; rogue cards apply Poison. Only Burn has synergies (Detonate, Combustion, Living Flame, Grim Tome). Both go through `addDot`/`dotTick` in `sim.js`.
  - **Detonate and Combustion** deal their multiplier × the Burn stack and **leave the Burn in place**. They used to clear it, which made them worth less than waiting once a stack passed 9 (Detonate) or 5 (Combustion), since a stack of N still holds N(N+1)/2 damage.
- **Barrier vs Armor:** **Barrier** shields the Hearth and fades. **Armor** shields one hero. Card keys: `shield` = Barrier, `guard` = Armor.
- **Taunt:** sends an enemy's attacks (`atk`, `pounce`) to the taunter. `wave` and `quake` moves ignore taunts; only the Ash Wyrm's Flame Breath is a wave now.
- **Interrupt** breaks poise, and a move is cancelled when its poise hits 0. Only moves with `poise` in their data can be interrupted (they show a poise bar); the rest can only be stunned, taunted or blocked. Signature moves (buffs, heals, summons, hexes, drains, the big hits) have poise; basic attacks don't.
- **Stun** pauses a wind-up. Stuns don't chain: a stunned enemy resists new stuns, and after it wakes it is "Steadfast" for `STUN_IMMUNE × TEMPO` seconds (`stunEnemy` in `sim.js`). Elites and bosses take half-length stuns.
- **Party-size scaling** (tables at the top of `sim.js`, indexed by player count):
  - `HP_SCALE`: enemy HP.
  - `DMG_SCALE`: hits on the Hearth.
  - `HERO_DMG_SCALE`: hits on heroes.
  - `POISE_ADD`: bigger parties carry more interrupts, so moves with poise get this much extra (added, not multiplied, so 3-poise boss moves stay stoppable). Fractions round up at random.
  - `BOSS`: extra HP and damage multipliers for boss fights, so one big hit can't take the whole Hearth.
  - `WIND_SCALE`: enemies wind up (and recover) faster in bigger parties.
  - `MINION_CHANCE`: chance a normal or elite fight brings an extra minion (rat, bat or goblin).
  - Moves with `minP: 3` only come out against parties of 3+: `shatter` (breaks the Hearth's Barrier, then hits it), `sunder` (strips heroes' Armor, then hits each) and `defy` (shakes off taunts; the enemy is Defiant and can't be taunted for a while). None of them can be interrupted. They counter the tricks big parties lean on.
  - Prefer these mechanical levers over raising HP and damage further. Elites and bosses also take half-length stuns.
  - Tuned together with `tools/bots.mjs` (smart bots, starter and CC decks) so 2, 3 and 4 players lose about the same share of the Hearth per fight (roughly 15–25% in mid-run normal fights, 40–55% in elites) and bosses are winnable. Retune them together.
- **Combo:** a cast-time spell that lands while a teammate is mid-cast, or within `comboWindow()` after theirs landed, is 25% stronger per partner, plus the card's own `combo` bonus. The UI predicts combos: hand badges, glowing cast bars, a shrinking "Combo window" bar.
- **Cards:**
  - Each card's `fx` keys are applied in order in `Sim.resolve`, and card text is generated from them by `say()` in `data.js`.
  - A new effect needs all three: a case in `resolve`, a `say()` line, and an entry in `UPG_SCALE`/`UPG_TIME` if it should grow when upgraded.
  - Powers (`power: 1`) add to `h.pw`. Write ⚡ in text, and `iconize()` swaps it for the painted energy icon.
- **Upgrades:** numbers grow about 35%, durations +1, cast time −30%, or the card's own `up` override. These cards currently gain nothing when upgraded: Feint, Blessing, Grace, Preparation and Titan's Wrath. That was flagged but not fixed.
- **Rarities and unlocks:**
  - The six rarities are common through mythic. Decks are 10 cards, one copy each (`deckProblem`).
  - Commons are always unlocked. Other cards must first be *seen* in a run, then bought with Embers.
  - Buying a rarity tier needs a win on the difficulty whose `cap` it is. Difficulties are Normal, Hard, Brutal and Nightmare, and each win opens the next.
- **Progress:** stored per browser in `localStorage` (`hearthguard-progress`). There are no accounts. The host doesn't check unlocks; the deck builder does.
- **Debug menu:** open it with Ctrl+Shift+D or `?debug`. It stores cheats separately (`hearthguard-cheats`, with its own deck slot). While cheats are on, runs don't touch real progress. Never let cheats write to `progress`.

## Art

- **Style** (reuse in every prompt): *dark fantasy game illustration in a hand-painted gouache style, bold dark ink outlines, chunky readable silhouettes, warm orange-amber firelight rim lighting against deep umber, charcoal and slate-blue shadows, textured brush strokes, muted palette with one saturated accent, no text/labels/watermarks.* Class glow colors: Knight gold `#e0b84a`, Mage blue-violet `#7c8cff`, Rogue emerald `#4fd18b`, Cleric rose `#f2a1c7`, Hex purple `#8b3bbf`.
- **How it's made:** the user generates sprite sheets in ChatGPT and saves them in `assets/`. Cutouts (enemies, classes, relics, icons) go on flat `#00FF00` green. A subject that is itself green (the poison icon) goes on flat `#FF00FF` magenta instead, keyed the same way with red and blue swapped for green. Card art and scenes are full paintings.
- **Slicing:** each sheet is cut into `assets/<folder>/<id>.webp`, named after the game's id. The grid lines are found by looking for the darkest line near each even split. Each cell is inset a few pixels.
  - **Green sheets:** green is keyed out (alpha from how much G exceeds max(R,B)) and the cutout is trimmed to what's left.
  - **Leftover green tint:** remove it **fully** on sheets with no intended green (relics, icons). Remove it **only on semi-transparent edges** where green is intended (Rogue cloak, rat, necromancer fire), or those greens get washed out.
  - **Sizes:** 512px for portraits and enemies, 320px for card art, 256px for icons and relics, about 768px for scenes.
  - Scripts used Pillow and numpy from a scratch folder. They aren't in the repo.
- **Hero poses:** each class has a 2×2 sheet `assets/heroes-<cls>.png` (idle, attack / cast, down), full body, facing right, made by attaching the class bust as the reference. It's sliced to `assets/heroes/<cls>-<pose>.webp`, 512px tall. All four cells are cropped with **one shared rectangle**, so the figure keeps its scale and foot line when the pose swaps. Then add the class to `HERO_ART` in `game.js`; classes not listed stand in with their bust. The Rogue's sheet goes on magenta because of the green cloak.
  - **Redrawn poses:** a pose redrawn as its own image (like `heroes-knight-attack.png`, because the lunge didn't fit a cell) is scaled to the height of the cell it replaces. All poses then go on one shared canvas aligned on the feet: same lowest pixel, and the same middle of the feet. The hero stays planted and a wide pose just reaches further.
  - **Attack motions:** classes in `HERO_MOVES` play a three-frame motion on attacks instead of the single attack pose: anticipation, impact, follow-through, held for `MOVE_MS`.
    - The card's effect waits until the impact frame (`MOVE_HIT`).
    - `motionFor` picks the motion. The Knight bashes with `SHIELD_ATTACKS` (Shield Bash, Body Slam, Bulwark, Crushing Charge, Parry, Shield Toss, Titan's Wrath) and slashes with everything else.
    - His frames came from a 3×2 sheet (`assets/heroes-knights-frames.png`) and were scaled to match his other poses **by head height**. Lunges vary in depth, so matching on overall height made him 20% too big.
  - **Sizing:** hero pose images are sized by height (`.hero .art.posed img.pose`), not fitted into the box, so a wide canvas doesn't shrink the hero. The overhang ignores taps.
- **Poses in combat:** `setPose` picks down, then a pose flashed by a card that just landed (`poseFlash`: attack for attacks, cast for everything else), then cast while casting, then idle. The `cast` event carries the card `id`, target `t` and `atk`, for poses and effects.
- **Enemy motion and poses:** every enemy breathes and leans back as a move winds up. `--wind` (0–1, in steps of 0.05) and `data-move` (`atk`/`skill`) are set in `frame()`. Attacks (`ENEMY_ATTACKS`) flare red under the enemy's feet in the last quarter of the wind-up (`.imminent`) and lunge when they land; other moves rear up. Hits knock units back with a flash (`.hit .fig`), and stunned enemies sway.
  - **Pose art:** enemies listed in `ENEMY_ART` swap poses (`ENEMY_POSES`: idle, windup / attack, skill), which are sliced from a 2×2 `assets/enemies-<id>.png` to `assets/enemies/<id>-<pose>.webp` with the hero slicer (`--poses idle,windup,attack,skill`).
  - **Backgrounds:** green, magenta or cyan, whichever the creature doesn't use. Necromancer is cyan (purple robes and green fire), and the green or blue creatures are magenta.
  - **Prompts:** in `enemy-pose-prompts.md`. They describe each enemy from scratch, so nothing needs attaching.
  - **Slicing:** slice with `--main` so the idle pose also replaces `assets/enemies/<id>.webp` (the stand-in and the boss icon on the map). Slice with `--flip` for a sheet that came back facing right.
- **Effects:** seven 3×3 sheets painted on black are sliced to `assets/vfx/<name>.webp`, 256px. The sheets are `vfx-1`, `vfx-2`, `vfx-knight`, `vfx-rogue`, `vfx-mage`, `vfx-cleric` and `vfx-shared`; the names per set are in `VFX_SETS`.
  - **Keying:** black becomes alpha. Alpha is the brightest channel and the colour is un-premultiplied, so sprites need no blend modes. Painted objects (shields, banner, knives, vial, caltrops, coins, thorns) are cut "solid": they only fade near black, so dark tones stay opaque.
  - **Direction:** projectiles head right, except `shadow`, which heads left. Ground decals (`fissure`, `caltrops`, `frostnova`, `consecrate`, `powerrune`) are painted flattened.
  - **Preloading:** `preloadVfx` (from `buildCombat`) loads the base and shared sets plus the party's classes only.
  - **Melee never flies:** melee attacks appear on the target. Only spells and thrown things (`ROGUE_THROWN`) are projectiles.
  - `castFx`: most cards have a recipe in `CARD_FX` written against a small helper `f`:
    - `f.on` bursts on each target, and `f.feet` lays a decal under each.
    - `f.shot`, `f.drop` (meteor, sword of light) and `f.chain` (lightning hopping) come from the caster.
    - `f.self`, `f.ally`, `f.hearth` and `f.heroes` place effects on the party side.
    - `f.hits` and `f.stab` play one effect per hit, and `f.shake` jolts the stage.
    - `f.no(key)` skips that key's generic effect.
    
    Cards without a recipe get `classHit`. Overlays from the card's `fx` keys run either way:
    - on enemies: poison, interrupt, stun, `weaken`, `vulnerable`;
    - on the party: barrier, heal, armor, energy, `empower`, `haste`, thorns;
    - `powerrune` under the caster for every Power.
  - **Placement** (`at` on bursts): `'mid'` centres on the figure, `'feet'` lays a decal on the ground, and `'stand'` stands the sprite on the ground.
  - **Events:**
    - Enemy deaths show `soul`, plus `killblow` if an execute card hit them in the last 1.5s (`execHits`).
    - A `txt` event of "Revived!" brings down a `pillar`.
  - `enemyFx` uses the `eact` event's `kk` (move kind) and `to` (hero id or `'hearth'`, returned by `Sim.enemyAct`). Only ranged moves throw a projectile (`ENEMY_SHOT`, keyed by move name). Every other attack claws on its target, and quakes crack the ground under the heroes.
  - **Rendering:** sprites are short-lived `<img>`s in `#fxLayer`, animated with the Web Animations API (transform, opacity and an optional hue `filter`), capped at `VFX_MAX`. In the browser pane, animations sit at their first frame while the pane isn't drawing. To check one, pause it and set `currentTime`; to run callbacks that fire on landing, `finish()` it.
- **Fallback:** every image is loaded with its emoji as the fallback (`pic()`, `ico()`), so a missing file degrades gracefully.
- **Check sheets before slicing.** Sheets have arrived as duplicates of each other (identical checksums) and with a painted background instead of green (the Ash Wyrm, faded with an oval mask). Also check every cell for a figure **cut off at its cell edge** (tails, wings, cloaks, capes and weapons in attack poses are the usual victims): key the cell and look for a run of figure pixels along any edge just inside the gutter, then confirm by eye, since a sword tip or boot sole merely touching is fine. Gutters can wander between a sheet's halves, so the slicers find each cell's gutters within its own row and column band; otherwise a strip of gutter line ends up in a sprite. A clipped pose is redrawn alone as one image with wide margins (prompts in `sprite-fix-prompts.md`) and scaled to match the others by head size.
- **UI icons:** `assets/ui/*.webp`, mapped in `ICONS` in `game.js`. Prefer `ico('name')` over emoji wherever a painted icon exists.

## Testing

- **Headless:** import `sim.js` in Node (`node` with `import('file:///…/Hearthguard/sim.js')`), build a `Sim`, `join` and `act` players, `startCombat`, `tick`, and assert. This is how new mechanics are checked.
- **Balance bots:** `node Hearthguard/tools/bots.mjs [fights] [--parties=solo_knight,2p,4p] [--kinds=normal9,elite,boss] [--decks=cc]`. Smart bots read wind-ups, interrupt only poise moves (sharing them out), taunt big hitters, raise Barrier/Armor before hits, focus fire and react with a short delay. The table reports Hearth lost per fight, fight length, wins, how many enemy moves land or get cancelled, stun uptime, taunted hits, hero damage, downs and timeouts. `--decks=cc` uses interrupt- and stun-heavy decks, which is how strong human parties play. The scaling arrays are exported, so a script can override them in memory to try values. The bots are weaker than good humans, so compare party sizes and before/after rather than chasing absolute numbers.
- **Browser:** `.claude/launch.json` → `site` (python http.server on port 8766, repo root). Open `http://localhost:8766/Hearthguard/`.
  - The pane caches ES modules hard, so after edits run `fetch(f, {cache: 'reload'})` on the changed files, then reload.
  - `requestAnimationFrame` pauses when the pane isn't drawing, so DOM checks can read stale combat UI. Take a screenshot to force a frame.
- **Debug hook:** to drive the game, temporarily append `window.hgDbg = () => ({ sim });` to `game.js`. **Remove it before committing.**
- **Multiplayer:** two browser tabs on the same room code. Both share `localStorage`, so set the name per tab. Background tabs throttle the host.

## Working with the user

- **Always ask before committing or pushing.** Pushing to `master` publishes straight to GitHub Pages. Workflow: branch → commit → `git merge --ff-only` into `master` → push → delete the branch. End commit messages with the Co-Authored-By line.
- Don't commit the source `*.png` sheets (they're gitignored). Commit only the sliced `.webp` files.
- Other sessions also edit this game, so re-read files before changing them rather than relying on memory.
- When a balance change shifts difficulty, measure it with bots and report the numbers before shipping.
