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
- **Player actions** are validated in the `ACTIONS` table at the bottom of `sim.js`. Host-only actions check `p.id === this.hostId`.

## Game rules worth knowing

- **Pace (`TEMPO`):** the host picks Fast (1.5), Normal (2, default) or Relaxed (2.5). Energy regen (`baseRegen()`), enemy wind-ups, the combo window and every duration in seconds scale together. Durations are multiplied by `TEMPO` in `cardDef` (`UPG_TIME` keys) and in timed relic text. When adding anything timed, scale it with `TEMPO` or it'll drift out of step.
- **Hearth and heroes:** Hearth HP by party size is in `HEARTH`. Hero HP carries over between fights. A knocked-out hero stays down until a Resurrection or the end of the fight. If the whole party is down, the run ends (a "wipe").
- **Barrier vs Armor:** **Barrier** shields the Hearth and fades. **Armor** shields one hero. Card keys: `shield` = Barrier, `guard` = Armor.
- **Taunt:** sends an enemy's attacks to the taunter. **Interrupt** breaks poise. A move is cancelled when its poise hits 0, and `poise: 99` means unstoppable.
- **Party-size scaling** (tables at the top of `sim.js`, indexed by player count):
  - `HP_SCALE`: enemy HP.
  - `DMG_SCALE`: hits on the Hearth.
  - `HERO_DMG_SCALE`: hits on heroes.
  - `POISE_SCALE`: bigger parties carry more interrupts, so moves need more of them. Fractions round up at random.
  - These were tuned together with bots so every party size loses about 60% of the Hearth per fight and about two-thirds of enemy moves land. Retune them together.
- **Combo:** a cast-time spell that lands while a teammate is mid-cast, or within `comboWindow()` after theirs landed, is 25% stronger per partner, plus the card's own `combo` bonus. The UI predicts combos: hand badges, glowing cast bars, a shrinking "Combo window" bar.
- **Cards:**
  - Each card's `fx` keys are applied in order in `Sim.resolve`, and card text is generated from them by `say()` in `data.js`.
  - A new effect needs all three: a case in `resolve`, a `say()` line, and an entry in `UPG_SCALE`/`UPG_TIME` if it should grow when upgraded.
  - Powers (`power: 1`) add to `h.pw`. Write ⚡ in text, and `iconize()` swaps it for the painted energy icon.
- **Upgrades:** numbers grow about 35%, durations +1, cast time −30%, or the card's own `up` override. These cards currently gain nothing when upgraded: Counterspell, Feint, Blessing, Grace, Overload, Preparation and Titan's Wrath. That was flagged but not fixed.
- **Rarities and unlocks:**
  - The six rarities are common through mythic. Decks are 10 cards, one copy each (`deckProblem`).
  - Commons are always unlocked. Other cards must first be *seen* in a run, then bought with Embers.
  - Buying a rarity tier needs a win on the difficulty whose `cap` it is. Difficulties are Normal, Hard, Brutal and Nightmare, and each win opens the next.
- **Progress:** stored per browser in `localStorage` (`hearthguard-progress`). There are no accounts. The host doesn't check unlocks; the deck builder does.
- **Debug menu:** open it with Ctrl+Shift+D or `?debug`. It stores cheats separately (`hearthguard-cheats`, with its own deck slot). While cheats are on, runs don't touch real progress. Never let cheats write to `progress`.

## Art

- **Style** (reuse in every prompt): *dark fantasy game illustration in a hand-painted gouache style, bold dark ink outlines, chunky readable silhouettes, warm orange-amber firelight rim lighting against deep umber, charcoal and slate-blue shadows, textured brush strokes, muted palette with one saturated accent, no text/labels/watermarks.* Class glow colors: Knight gold `#e0b84a`, Mage blue-violet `#7c8cff`, Rogue emerald `#4fd18b`, Cleric rose `#f2a1c7`, Hex purple `#8b3bbf`.
- **How it's made:** the user generates sprite sheets in ChatGPT and saves them in `assets/`. Cutouts (enemies, classes, relics, icons) go on flat `#00FF00` green. Card art and scenes are full paintings.
- **Slicing:** each sheet is cut into `assets/<folder>/<id>.webp`, named after the game's id. The grid lines are found by looking for the darkest line near each even split. Each cell is inset a few pixels.
  - **Green sheets:** green is keyed out (alpha from how much G exceeds max(R,B)) and the cutout is trimmed to what's left.
  - **Leftover green tint:** remove it **fully** on sheets with no intended green (relics, icons). Remove it **only on semi-transparent edges** where green is intended (Rogue cloak, rat, necromancer fire), or those greens get washed out.
  - **Sizes:** 512px for portraits and enemies, 320px for card art, 256px for icons and relics, about 768px for scenes.
  - Scripts used Pillow and numpy from a scratch folder. They aren't in the repo.
- **Fallback:** every image is loaded with its emoji as the fallback (`pic()`, `ico()`), so a missing file degrades gracefully.
- **Check sheets before slicing.** Sheets have arrived as duplicates of each other (identical checksums) and with a painted background instead of green (the Ash Wyrm, faded with an oval mask).
- **UI icons:** `assets/ui/*.webp`, mapped in `ICONS` in `game.js`. Prefer `ico('name')` over emoji wherever a painted icon exists.

## Testing

- **Headless:** import `sim.js` in Node (`node` with `import('file:///…/Hearthguard/sim.js')`), build a `Sim`, `join` and `act` players, `startCombat`, `tick`, and assert. This is how new mechanics and balance were checked. For balance, bots that interrupt at every chance give a worst case. Measure how often enemy moves land and how much Hearth damage a fight costs, per party size.
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
