# Copycat Kitchen

A single-player cooking game. The player studies a "photo" of a finished dish, then cooks it from scratch in a 2D kitchen. They're judged on how close their plate is to the original. There's no recipe, so the photo, the diner's one-line description, and three taste tests are the only clues.

Lives at `jasonphe.github.io/CopycatKitchen/`. **Not linked from the homepage yet.**

## Files

No build step and no dependencies. Plain ES modules.

| File | What it holds |
|---|---|
| `data.js` | All content: cuts (`PREPS`), cooking methods, heat levels, ingredients (`INGS`), seasonings and dishes (`DISHES`), plus the similarity tables used in judging. |
| `draw.js` | Placeholder art drawn in code: every ingredient in every cut and cooking stage, the plate layout, and the stations (pan, pot, oven, board, table). Also `stageName` (raw, golden, charred…). |
| `score.js` | Judging (`judge`), the flavor model (`flavorOf`), and the written recipe shown after serving (`recipeSteps`). |
| `game.js` | Screens, the kitchen simulation, input (tap and drag), station drawing, sound, results. |
| `index.html`, `style.css` | Page shell and styles. |
| `art-prompts.md` | The plan and prompts for swapping in AI-generated art. |

## How it plays

- **Stations** are tabs: Pantry, Board, Stove (pan and pot), Oven, Plate. Food keeps cooking while you're on another tab. The tab gets a dot when its heat is on, and a pulsing red dot plus a toast when something starts to char.
- **Moving food:** drag a counter chip onto a station, or tap the chip and then tap the station (or use the action bar). Items in a pan, pot or oven can be tapped to select them, then taken out or plated directly.
- **Board:** pick a cut, then tap anywhere on the canvas to chop (`PREPS[*].taps` taps). Cuts only get finer: whole → slice → dice → mince.
- **Cooking:** each item has a `cook` level. 1 means cooked through, and past that dry heat browns it (golden ~1.15, browned ~1.5, charred 2.0, burnt 2.5). Water never browns; it goes soft and then mushy. Speed is `HEAT[vessel][level] / (ingredient.time × prep.speed)`, so smaller cuts cook faster. `it.by` records how much cooking each method did, and the biggest one is the item's method. `it.with` records seconds spent in the same vessel as each other item; that's how "cooked together" is judged.
- **Melting:** ingredients with `melt` turn into a puddle or sauce past a cook level (diced tomato → sauce, butter, cheese). Melted things sit in the `sauce` role on the plate.
- **Seasoning** happens only on the plate. Pepper and chili show as specks and soy as a drizzle. Salt is invisible, so taste tests are the only way to find it.
- **Taste tests:** 3 per dish. Each one reveals one flavor dimension of the original. Tasting your own plate is free.

## The plate is the photo

The "photo" of the target and the player's plate are drawn by the same `drawPlate`. The layout (`layoutPlate`) depends only on what's on the plate, never on the order it was added, and each item's random seed comes from its ingredient, cut and cook level. So a perfect copy is pixel-identical to the original, and every target can be reached. Keep it that way: never give a dish a separately made hero image.

## Judging (`score.js`)

Target items are greedily matched to the player's items (same ingredient first, then the same family, e.g. onion for garlic). Six weighted categories (`CATEGORIES`): ingredients 25, knife work 15, technique 20, doneness 20, flavor 15, cooked together 5. Extras only cost ingredient points. "Cooked together" only checks the original's pairs, so cooking extra things side by side is never punished. Raw chicken costs 15 points. Notes are the three most costly mistakes. Stars at 55, 75 and 90.

## Adding a dish

Add it to `DISHES` in `data.js`. Each part is `{ ing, prep, method, cook, group? }`. `method` is `raw`, `pan_low`, `pan_med`, `pan_high`, `pot` or `oven`. Parts that share a `group` were cooked together. Check that the target is reachable in a sensible time (seconds = cook × time × prep.speed / heat), and look at it on the menu to make sure the photo actually shows what matters.

## Testing

Add `#dev` to the URL. The game loop then runs on a timer instead of `requestAnimationFrame` (which stalls in a hidden preview pane), and `window.ck` exposes `S` (the cook's state), `stateOf` and `start`. With it you can set up any kitchen state from the console. Best scores are in `localStorage` (`copycat-best`); sound on or off is `copycat-muted`.
