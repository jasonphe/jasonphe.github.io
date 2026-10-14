# Copycat Kitchen

A single-player cooking game. The player studies a "photo" of a finished dish, then cooks it from scratch in a 2D kitchen. They're judged on how close their plate is to the original. There's no recipe, so the photo, the diner's one-line description, and three taste tests are the only clues.

Lives at `jasonphe.github.io/CopycatKitchen/`, linked under Games on the homepage (`../index.html`, thumbnail `../resources/copycat-kitchen.jpg`, a capture of the verdict screen).

## Files

No build step and no dependencies. Plain ES modules.

| File | What it holds |
|---|---|
| `data.js` | All content: cuts (`PREPS`), cooking methods, heat levels, ingredients (`INGS`), seasonings and dishes (`DISHES`), plus the similarity tables used in judging. |
| `draw.js` | Placeholder art drawn in code: every ingredient in every cut and cooking stage, the plate layout, and the stations (pan, pot, oven, board, table). Also `stageName` (raw, golden, charred…). |
| `score.js` | Judging (`judge`), the flavor model (`flavorOf`), and the written recipe shown after serving (`recipeSteps`). |
| `games.js` | The prep minigames (cutting, mincing, grating, tearing, cracking, whisking, stirring, tossing). |
| `game.js` | Screens, the kitchen simulation, input (tap and drag), station drawing, sound, results. |
| `index.html`, `style.css` | Page shell and styles. |
| `art-prompts.md` | The plan and prompts for swapping in AI-generated art. |

## How it plays

- **Stations** are tabs: Pantry, Board, Bowl, Stove (pan and pot), Oven, Plate. Food keeps cooking while you're on another tab. The tab gets a dot when its heat is on, and a pulsing red dot plus a toast when something starts to char.
- **Moving food:** drag a counter chip onto a station, or tap the chip and then tap the station (or use the action bar). Items in a pan, pot or oven can be tapped to select them, then taken out or plated directly.
- **Board:** pick a cut and play its minigame. Cuts only get finer: whole → slice → dice → mince.
- **Minigames (`games.js`):** each prep action has one, set by `PREPS[*].game` (an ingredient can change the number of cuts with `cuts`, see `prepGame`). Knife (slice, wedges, dice): tap when the sweeping knife is on a guide line, then the other way for dice. Mince: tap fast before the meter drains. Grate: drag up and down. Tear: drag outward. Crack: stop the swinging meter in the green; too hard leaves shell in. Whisk and the bowl's stir: drag in circles. The pan's toss: flick upward. A game takes pointer input in canvas coordinates and sets `done` and `q` (quality, 0 to 1). `q` is stored on the item: sloppy cuts are drawn uneven and cost knife-work points, and shell (a cracked egg with `q` < 0.6) shows on the plate and costs 6 points. A game belongs to a place (board, bowl, pan) and stops if you leave its station or move its food.
- **Several pieces, new ingredients:** `yields` makes extra pieces (a loaf sliced 3 times gives 3 slices; the others go to the counter). `cutsInto` turns an ingredient into another when cut (pasta dough → pasta).
- **Cooking:** each item has a `cook` level. 1 means cooked through, and past that dry heat browns it (golden ~1.15, browned ~1.5, charred 2.0, burnt 2.5). Water never browns; it goes soft and then mushy. Speed is `HEAT[vessel][level] / (ingredient.time × prep.speed)`, so smaller cuts cook faster. `it.by` records how much cooking each method did, and the biggest one is the item's method.
- **Mixes:** **Toss together** (pan) and **Mix together** (bowl) give everything there the same `it.mix` id. From then on they're one *unit*: one counter chip, one spot in a station, one heap on the plate, moved and binned together, and they can't be separated or cut. Each part still cooks at its own rate. `unitOf` / `unitsAt` in `game.js` work in units; anything that moves or draws food should too.
- **Recipes in the bowl (`TRANSFORMS`):** mixing exactly the listed ingredients makes a new one instead of a mix. Flour + cracked egg + yeast make dough, and flour + cracked egg make pasta dough (an uncracked egg gets a hint instead). Dough has `bakesInto: 'bread'`: once it bakes through in the oven it becomes a fresh loaf (cook reset to 0, so toasting it later is judged like any bread). Pasta dough is cut into fresh pasta on the board. Neither bread nor pasta is in the pantry; you make them.
- **Melting:** ingredients with `melt` turn into a puddle or sauce past a cook level (diced tomato → sauce, butter, cheese). Melted things sit in the `sauce` role on the plate.
- **Seasoning** happens only on the plate. Pepper and chili show as specks and soy as a drizzle. Salt is invisible, so taste tests are the only way to find it.
- **Taste tests:** 3 per dish. Each one reveals one flavor dimension of the original. Tasting your own plate is free.

## The plate is the photo

The "photo" of the target and the player's plate are drawn by the same `drawPlate`. Things in the same group (a mix, or a dish's `group`) are laid out and drawn as one heap (`drawMix`). The layout (`layoutPlate`) depends only on what's on the plate, never on the order it was added, and each item's random seed comes from its ingredient, cut and cook level. So a perfect copy is pixel-identical to the original, and every target can be reached. Keep it that way: never give a dish a separately made hero image.

## Judging (`score.js`)

Target items are greedily matched to the player's items (same ingredient first, then the same family, e.g. onion for garlic). Six weighted categories (`CATEGORIES`): ingredients 25, knife work 15, technique 15, doneness 20, flavor 15, mixed together 10. Extras only cost ingredient points. "Mixed together" compares which pairs of ingredients were tossed or mixed into one (overlap of the original's pairs and yours), so leaving out a toss and tossing the wrong things both cost points. Cooking things side by side in a pan without tossing them is not mixing. Raw chicken costs 15 points. Notes are the three most costly mistakes. Stars at 55, 75 and 90.

## Adding a dish

Add it to `DISHES` in `data.js`. Each part is `{ ing, prep, method, cook, group? }`. `method` is `raw`, `pan_low`, `pan_med`, `pan_high`, `pot` or `oven`. Parts that share a `group` were tossed together, and the player has to toss them too. Check that the target is reachable in a sensible time (seconds = cook × time × prep.speed / heat), and look at it on the menu to make sure the photo actually shows what matters.

## Testing

Add `#dev` to the URL. The game loop then runs on a timer instead of `requestAnimationFrame` (which stalls in a hidden preview pane), and `window.ck` exposes `S` (the cook's state), `stateOf` and `start`. With it you can set up any kitchen state from the console. Best scores are in `localStorage` (`copycat-best`); sound on or off is `copycat-muted`.
