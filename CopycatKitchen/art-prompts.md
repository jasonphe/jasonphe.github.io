# Copycat Kitchen: AI art plan

All the art is drawn in code for now (`draw.js`). This is the plan for replacing it with AI-generated sprites, made in ChatGPT and sliced the same way as Hearthguard's (flat green background, keyed out, cut into `assets/<folder>/<id>.webp`).

## What needs art, and what doesn't

The expensive part would be one sprite per ingredient × cut × doneness, which is hundreds. Most of that can be avoided:

- **Shape changes get art.** Each ingredient needs a sprite for every *form* it can take: whole, each cut, and the few cooked forms that change shape (fried egg, scrambled curds, cooked spaghetti, cooked rice, sauces and melted puddles).
- **Color changes are done in code.** Raw → cooked → golden → browned → charred → burnt is a tint laid over the sprite (`cookColor` in `draw.js` already computes it): multiply toward gold, then brown, then near black, only where the sprite is opaque. The same goes for boiled food going pale. This is what keeps the count near 70 sprites instead of 400.
- **The target photo is never separate art.** It's drawn from the same sprites as the player's plate (see `AGENTS.md`). That's what makes every dish fair.

Wiring it up: an `ART` map from `ingredient:form` to an image. `drawItem` draws the image when it has loaded and falls back to the code drawing otherwise, so sprites can arrive one sheet at a time.

## Style (paste at the start of every prompt)

> Cozy hand-painted gouache food illustration for a cooking game. Seen from slightly above (three-quarter top-down), soft warm daylight from the top left, a clean dark-brown ink outline around each object, gentle texture, appetizing but simple shapes that read at small sizes. Each object centered in its own grid cell with generous padding, nothing touching the cell edges. Flat pure #00FF00 green background, no shadows on the background, no text, labels or watermarks.

For the basil sheet (it's green), swap the background for flat pure #FF00FF magenta.

## Sheets

Each sheet is a grid; list the cells left to right, top to bottom in the prompt.

**1. `whole-a.png` (3×3):** a raw egg in its shell; a crusty loaf of white bread; a bundle of dry spaghetti tied loosely; a small pile of uncooked white rice grains; a russet potato; a ripe red tomato with green stem; a brown onion; a garlic bulb; a red bell pepper with green stem.

**2. `whole-b.png` (3×3):** a carrot with leafy top, lying diagonally; a brown cremini mushroom; a lemon; a wedge of yellow cheese with holes; a stick of butter on its paper; a raw ribeye steak; a raw chicken breast; a raw salmon fillet, skin side down; a paper bag of flour.

**2b. `baking.png` (3×2):** a small paper packet of dried yeast; a ball of raw bread dough, lightly floured; the same dough risen and half-baked, pale gold; a freshly baked round loaf; a bowl's worth of shaggy, just-mixed dough; *(leave the last cell empty)*.

**3. `basil.png` (2×1, magenta):** a sprig of fresh basil; a small scatter of torn basil leaves.

**4. Cut sheets (3×2 each, one per ingredient).** Each cell is the *raw* cut, as a small pile like you'd scrape off a board:
- `cut-tomato.png`: five round slices showing seeds; a pile of small dice; four wedges; a pool of tomato sauce with chunks.
- `cut-onion.png`: rings; dice; fine mince.
- `cut-garlic.png`: thin chips; fine mince.
- `cut-pepper.png`: thin strips; dice.
- `cut-carrot.png`: coins; dice.
- `cut-mushroom.png`: slices showing the cap profile.
- `cut-potato.png`: wedges; dice; round slices.
- `cut-lemon.png`: wedges; wheels.
- `cut-meat.png`: steak strips; steak dice; chicken strips; chicken dice; salmon strips; salmon dice.
- `cut-dairy.png`: a pile of grated cheese; a pool of melted cheese; a pool of melted butter.
- `cut-bread.png`: one slice of white bread, untoasted.

**5. `cooked-forms.png` (3×2):** a sunny-side-up fried egg, runny yolk; a raw cracked egg (clear white, bright yolk); soft scrambled egg curds; a glossy raw whisked egg puddle; a nest of cooked spaghetti; a fluffy mound of cooked white rice.

**6. Stations (one image each, full paintings, no green):**
- `stovetop.png`: a dark steel stovetop seen from slightly above, two burners, tiled wall at the very top. Wide 16:10.
- `pan.png`: an empty black frying pan from three-quarter view, handle pointing left, on green.
- `pot.png`: a stainless steel pot of water, three-quarter view, on green.
- `oven.png`: the front of a cream retro enamel oven with a large dark glass window and three knobs. The window is empty and dark.
- `board.png`: a wooden cutting board on a marble counter, from above.
- `plate.png`: an empty white ceramic plate from above, on green.
- `bowl.png`: an empty blue ceramic mixing bowl from three-quarter view, on green. Also ask for the front rim on its own, so food can sit inside it.
- `tablecloth.png`: a seamless red-and-white gingham tablecloth tile.

## Slicing

Use Hearthguard's slicer settings: find grid lines by the darkest line near each even split, inset each cell a few pixels, key the green out by how much G exceeds max(R, B), and trim. Sizes: 256px for ingredient sprites, full width for stations. Keep the source PNGs out of git (add `CopycatKitchen/assets/**/*.png` to `.gitignore`) and commit only the `.webp` slices.
