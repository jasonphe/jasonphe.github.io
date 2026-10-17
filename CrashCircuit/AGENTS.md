# Crash Circuit

A 3D combat racing game for 1 to 8 players in the browser. Players pick one of 12 vehicles, race on one of 6 themed maps, join a room by code, peer to peer, and the host can fill the grid with bots. There are no walls: cars can leave the road anywhere (off-road is slower), take alternate routes and fly off ramps. They take damage from scenery, bumps, hard landings and weapons, get wrecked at 0 HP, and respawn on the nearest road after a few seconds.

Lives at `jasonphe.github.io/CrashCircuit/`, linked under Games on the homepage (`../index.html`, thumbnail `../resources/crash-circuit.jpg`, a 1000×625 render of the canvas).

## Files

No build step. Plain ES modules. Three.js `0.160.0` comes from jsDelivr through the import map in `index.html` (`three`, plus `three/addons/` for `BufferGeometryUtils`).

| File | What it holds |
|---|---|
| `maps.js` | `MAPS`: each map's main loop (`ctrl`), `branches`, `ramps`, theme (incl. terrain and off-road handling), `layout(ctx)` and `decorate(ctx)`. |
| `track.js` | `buildTrack(scene, map)`: road paths (main loop + branches), a spatial hash for "nearest road" lookups, `probe()` (everything about the ground at a point), the terrain height map and mesh, ramps, solid scenery (`solidHit`), checkpoints, item box spots, roads, curbs and gantry, then the map's `decorate` with a helper `ctx`. Everything goes in `T.group`; `T.dispose()` tears it down. |
| `scenery.js` | Scenery toolkit: seeded `rng`, `noise2` (terrain noise), `xf` (bake a transform into a geometry), `merge`, prop parts for instancing (`PROPS`: trees, palms, ferns, cacti, rocks, lamps, fences, cows, snowmen…), and builders for textures, water, buildings and clouds. |
| `vehicles.js` | `VEHICLES`: every vehicle's stats and perk, plus derived collision circles and camera distance. `BUILD`: one low-poly model builder per vehicle. `makeVehicleMesh` wraps a model with the shared bits (shield bubble, tilt pivot). |
| `car.js` | `Car`: arcade physics (`step`) driven by `car.spec`: off-road handling, slopes, jumps and landings, bounces off solid scenery, and checkpoint/lap counting. `syncMesh`: copies state onto the model and shows damage (darker paint, crumpled body, and the detachable `part` falls off under 45% health), plus flashing police lights, the hovercraft fan and rocket flames. |
| `fx.js` | `Particles` (one `THREE.Points` pool with smoke, fire, sparks, explosions), `Weather` (snow, fireflies or dust in a box that follows the camera) and `Sound` (all synthesized with WebAudio, no files). |
| `game.js` | Scene setup, networking, host logic, items, damage, bots, input, camera, HUD, screens, main loop. |
| `index.html`, `style.css` | Page shell, menus, HUD, touch controls. |

## Track and physics

- Heading `h`: forward is `(sin h, cos h)` in x/z, and turning left increases `h`. Path normals (`nx`, `nz`) point left, so a positive lateral offset is left of the centerline.
- **Paths:** `T.paths[0]` is the main loop (`N` = 1200 samples). Branches (`T.paths[1..]`) are open paths that leave the loop at main sample `from` and rejoin at `to`; their samples are spaced like the main loop's, and `prog[k]` maps each one to a main-loop index so progress works the same on either route. Where a branch overlaps the main road (near the forks) it takes the main road's height (`smooth(gap / 2.5 HALF_W)`), and its ribbon is clipped to the part outside the main road's edge (`p.gap`, `p.away`), with UVs kept so its lines stay put. Its curb on the main road's side only appears once the roads have split. So the forks read as one road widening, not a slab on top. It still draws with a polygon offset to win where the edges meet.
- **Probe:** `T.probe(x, z, out)` finds the nearest road sample on any path (spatial hash, `CELL` = 20 m) and returns `path`, `i`, `idx` (main-loop index), `lat`, `dist`, `onRoad` (within `EDGE`, road plus curbs), `roadY` and `ground` (road height plus any ramp, or the terrain height off-road). Cars, missiles, mines, bots and scenery all use it.
- **Terrain:** a height grid (`GRID` = 5 m) reaching `MARGIN` past the roads. It's the map's natural terrain, sitting 8 cm under the road out to `FLAT` from any road, blended to the natural height over 16–60 m (steeper differences blend wider), then flattened where `layout` asked, then eased to the base height at the edges. `terrainAt()` reads it exactly as the mesh is triangulated. A flat plane under everything reaches the horizon; it sits below the lowest terrain, so it can never cover a road. (A fixed-height ground plane is what made grass poke through the road on Green Valley, where the spline dips below 0.)
- **Off-road:** off the road, `T.off` (from the theme) cuts top speed (`top`), grip and adds drag; cars throw up `dust`.
- **Air:** cars follow the ground while it doesn't fall away faster than `STICK` (14 m/s). Ramp lips, cliffs and steep crests launch them; gravity is 30. Landing faster than 21 m/s hurts. Slopes pull cars along them. Car-on-car hits skip cars more than 1.8 m apart vertically, so you can jump over people (and mines).
- **Solids:** big scenery registers circles or boxes with a height (`solidCircle`, `solidBox`, or `inst(..., { solid })`). Cars bounce off them like walls used to (impacts over 9 m/s cost HP) unless they're above `top`. Missiles explode on them.
- **Out of bounds:** a car that sinks below `theme.waterY` (Sunset Cliffs' sea) is wrecked with a splash; one more than 160 m from any road is put back on it.
- **Laps and checkpoints:** shortcuts are encouraged, so checkpoints are forgiving. `CHECKPOINTS` = 4 gates (the line plus three) at main indices `k × N / 4`. `car.next` is the next one to pass (0 = the line). A gate counts anywhere in the stretch after it, up to 30 samples before the next gate (`CP_WINDOW`), as long as the car is within 90 m of some road (`NEAR_ROAD`). So any shortcut counts unless it skips a whole quarter of the lap; then the HUD says "Missed a checkpoint" and the minimap marks the gate. The line counts only once the other three are passed. Cars start behind the line on `lap = -1`. `prog` (for ranking) is held to the stretch before the next gate.
- **Handling:** at speed, steering responds slower and turns less (`HI_TURN`), the car's momentum only partly follows the turn and the rest becomes a slide the tires scrub off (`HI_SLIDE`), and hard steering costs grip (`HI_GRIP`). Full-lock circles for a Racer: about 22 m at 72 km/h, 51 m at 144 km/h, 124 m at top speed, so corners need braking. All three constants are at the top of `car.js`.
- Respawning (wreck, R key, lost) puts the car on the nearest road sample, on whichever path that is.
- Physics runs at a fixed 60 Hz (`STEP`) in `simStep`. Rendering is separate (`frame`).

## Maps

| Map | Theme | Branch | Notes |
|---|---|---|---|
| Green Valley | Day, farmland, rolling hills | Jump shortcut (big ramp) | Barn, silo, windmill, cows, fences, pond, grandstand |
| Neon City | Night, downtown hills | Alley | Square corners (`rounded()`), lit skyscrapers (solid), neon signs, street lamps with light pools, billboards, parked cars, starry sky |
| Sunset Cliffs | Sunset, coast | Beach run | Cliff road above the sea (fall in and you're wrecked), beach, palms, lighthouse with a sweeping beam, sailboats, pier |
| Jungle Ruins | Hazy day, hilly jungle | Temple cut | Dirt road (grip ×0.88), off-road is thick undergrowth, dense trees and ferns, stepped temple, stone heads, vines over the road, fireflies |
| Canyon Run | Bright desert dunes | Mesa jump | Long, fast sweepers, layered mesas, two stone arches over the road, cacti, tumbleweeds, dust |
| Frostbite Peaks | Overcast, snowy mountains | Ridge jump | Icy road (grip ×0.7), deep snow off-road, falling snow, snowy pines, frozen lake, cabins, a moving ski lift |

- A map is `{ id, name, icon, blurb, seed, ctrl, branches, ramps, theme, layout, decorate }`. `ctrl` is `[x, z, height]` points for a closed centripetal Catmull-Rom spline; the first point is the start line, so put it on a straight with ~50 m of straight behind it for the grid.
- **Branches:** `{ name, from: [x, z], to: [x, z], via: [[x, z, height], ...] }`. `from`/`to` snap to the nearest main samples; the spline also runs through main points 30 samples beyond each end so the forks are smooth. Keep a branch's middle at least ~25 m from the main road and merge at a shallow angle. Each branch gets a row of item boxes in its middle.
- **Ramps:** `{ path, near: [x, z] | at: 0..1, lat, w, len, h }`, on a straight. A wedge of height `h` over `len` m, `w` wide; cars launch off the lip. Full-width ones are on branches; half-width optional ones on the main road.
- **Grades:** keep roads under ~15% (the steepest today is 18%, briefly, on the Mesa jump). Check with the snippet in Testing.
- `theme`: `sky` [top, horizon] (the horizon is also the fog color), `fogNear`/`fogFar`, `sun` { color, intensity, dir }, `hemi` [sky, ground, intensity], `exposure`, `ground` (terrain color), `terrain` { amp, scale, base, height(x, z, noise), colors { steep, low, lowY, high, highY } }, `offroad` { top, grip, drag, dust }, `waterY`, `road` { base, speck, edge, center, solid, ruts, rough }, `curb` stripe colors, `banner`, and optional `night`, `stars`, `sunGlow`, `weather` ('snow' | 'fireflies' | 'dust') and `grip` (multiplies every car's grip on the road).
- `layout(ctx)` runs before the terrain is built: pick spots (`findSpot`) and `flatten(x, z, r, h)` ground for ponds, farms, temples. Store spots on `ctx.spots`.
- `decorate(ctx)` places scenery. Useful bits of `ctx` (see `track.js`): `scatter(n, fn, { clear, near, area, test })` picks spots at least `clear` and at most `near` m from any road's edge; `inst(parts, items, { solid })` instances a prop on the ground (`y` is above the ground unless `abs`) and can make each one solid; `solidCircle`/`solidBox`; `ground(x, z)`; `along(every, fn, from, path)`, `edge(i, side, off, path)` and `findSpot(x, z, need)` place things relative to a road; `ring` for far-away shapes; `animate(fn)` for moving scenery; `grandstand`, `sign`. Use `ctx.r` (seeded) for randomness, never `Math.random`, so every player gets the same map.
- Anything a car would visibly drive through should be solid: trees, rocks, buildings, posts, cows. Small stuff (ferns, flowers, bushes, umbrellas) isn't.
- **Choosing:** the host picks a map (or 🎲 Random) in the waiting room. `G.map` is the choice and `G.cur` the map actually loaded; Random picks a new `cur` each race. Every page calls `loadMap(G.cur)` in `applyPh`, which tears down the old map and applies the new theme. The menu shows a random map.
- **Checking a new map:** in `?dev`, `cc.loadMap(id)` then measure `cc.track` (tightest corner, closest pass between paths, steepest grade), and run a bot time trial with `cc.Car` + `cc.botDrive`, once with `ai.take = { 1: false }` and once with `true` (see Vehicles → Balance). Bots currently lap every map both ways and stay on the road.

## Vehicles

`VEHICLES` in `vehicles.js` is the whole roster. Stats: `top`, `accel`, `turn`, `grip`, `hp`, `mass`, and size `w`/`l`/`h`. Perks are optional flags: `armor` (damage taken ×), `boostLen`, `heal`, `mineProof`, `spinProof`, `startItem`.

| Vehicle | Character |
|---|---|
| Racer | All-rounder |
| Formula | Fastest, 65 HP |
| Muscle Car | Fast, low grip (drifts) |
| Go-Kart | Light, best acceleration and handling |
| Cop Car | Starts with a missile; flashing lights |
| Night Bat | Bat-styled jet car; nitro lasts 60% longer |
| Monster Truck | Heavy, never spins out |
| School Bus | 10 m long, 250 HP, heaviest rammer |
| Ice Cream Truck | Repair kits heal double |
| Tank | 40% armor, never spins out, slowest |
| Hovercraft | Very low grip, floats over mines |
| Rocket Couch | Starts with nitro, huge acceleration |

- **Mass** drives bumps: the impulse is split by mass and so is the damage (`2 × other / (mine + other)`), so a bus ramming a kart hurts the kart about 6× more. Missile, mine and shockwave knockback is divided by mass.
- **Long vehicles** get more collision circles (`spec.circles`), used for car-on-car hits, scenery, pickups and weapon hits (`Car.near`).
- **Speed:** stats in `VEHICLES` are the balance numbers; `SPEED` (×1.15) and `ACCEL` (×1.1) in `vehicles.js` scale everything for feel.
- **Balance:** on Green Valley a bot driving alone laps in about 28 s (Formula) to 36 s (Hovercraft). Keep the spread well under `FINISH_GRACE` / 3 laps, or slow vehicles DNF. To re-check, run a time trial in `?dev` with `cc.Car` and `cc.botDrive` (create a car, call `step` in a loop, time lap 0 to lap 1).
- **Adding one:** add a `VEHICLES` entry and a `BUILD` function (face +z, ground at y = 0, return `{ body, part }`). The garage thumbnail, stats bars and bots pick it up automatically.
- The garage (paint and vehicle) is one `#ride` element that `renderUI` moves between the start screen and the waiting room. Thumbnails are rendered once per paint color by a separate small `WebGLRenderer`. Changing your ride in the waiting room re-sends `hello`, so the host uses it next race. Bots get a shuffled set of different vehicles.

## Bots

- Bots steer at a point ahead on their **route**, with a lane offset that drifts. For speed they look 12–115 m ahead, turn each heading change into a corner radius, and slow to `sqrt(lat × radius)` (`BOT_LAT` = 20 m/s², scaled by the car's and the road's grip), braking early enough to get there. Higher `BOT_LAT` makes them faster but they start running wide around 21–26. `followRoute` tracks where each bot is along its own route (`ai.route` = { path, i }), because near a fork the nearest road can be either one; trusting the nearest road made bots swerve between them. `stepRoute` takes a branch when `botTakes` says so (a coin flip per branch per lap, forgotten once well past it).
- They brake for bends ahead, dodge mines, back out when stuck, and use items when it makes sense (`botItem`).
- The host's bots get a small speed boost when far behind the leading human.

## Items

Boxes respawn after 4 s. Item odds depend on race position (`rollItem`): leaders get more mines, people at the back get more nitro, missiles and repairs.

- 🚀 Missile: homes on the nearest car ahead within a 0.7 rad cone, otherwise follows the nearest road. Flies just above the ground and explodes on solid scenery. 34 damage, spin and a hop.
- 💣 Mine: dropped behind, arms after 0.8 s (it can catch its owner too), lasts 45 s. 28 damage and a big hop. Cars in the air pass over it.
- 🛡️ Shield: 6 s of no damage. A missile or mine hit pops it early.
- ⚡ Nitro: 2.4 s, top speed ×1.45.
- 🔧 Repair: +45 HP.
- 💥 Shockwave: damages and shoves everyone within 16 m.

## Networking

- Trystero `0.25.4` from jsDelivr, loaded only when you enter a room, with the same id-prefix trick as `../ScribbleParty` (see `loadNet`). `APP_ID = 'jasonphe-crash-circuit'`. Actions: `hello`, `ph`, `car`, `fx`.
- **Each page drives its own car**, and the host also drives the bots. Pages broadcast their cars 15 times a second (`car`). Other pages predict from position plus velocity and glide toward it (`smoothRemote`).
- **The victim decides.** Hits are checked only against cars the page drives: missiles, mines and shockwaves are simulated on every page, but only the victim's page applies damage, then broadcasts `fx` `boom` so everyone removes the projectile. Car-on-car bumps work the same way: each page pushes and damages only its own cars, so both sides of a crash feel it. Ramming nose first costs you 40% of the damage.
- `lastHit` remembers who hurt a car in the last 6 s, so a wreck (`fx` `ko`) credits them with a KO.
- **Host:** whoever has been in the room longest. It owns the race state `G` (phase `lobby` → `race` → `res`, laps, bot count, grid, results) and sends it as `ph`. Every host change goes through `hostBroadcast(next)`, which runs `applyPh` locally too. Don't assign `G` directly on the host, or `applyPh` won't see the phase change.
- **Host migration:** if the host leaves, the next-oldest peer adopts the bots from where they are (`takeOver`) and carries on.
- Players who join mid-race watch the leader until the next race.
- `hello` carries the vehicle (`v`), and so do grid entries and results.
- `car` entries: `[id, x, y, z, h, vx, vz, hp, flags, lap, idx, vy, steer, next]`. Flags: 1 nitro, 2 shield, 4 wrecked, 8 ghost, 16 spinning, 32 airborne, 64 off-road. `y` is the absolute height. Remote cars work out their tilt from the ground in `syncMesh`.
- `fx` `ko` has `w: 1` for a splashdown.
- The race ends when everyone has finished, 8 s after the last human finishes, or 30 s after the first finisher.
- If Trystero can't load, the game drops to offline mode (`selfId = 'me'`) so you can still race bots.

## Sound

All synthesized in `fx.js`. The engine is a quiet triangle plus a sine an octave down through a lowpass, with a narrow pitch range and slow glides. Heavier vehicles hum lower. It was made deliberately soft after the first version (two sawtooth waves) was too harsh, so keep it subtle.

## Controls

WASD or arrows to drive, Space (or E) for an item, R to get back on the nearest road, M to mute. Gamepads work too (left stick, RT/A for gas, LT to brake, X/RB for an item). Touch screens get on-screen buttons; the item slot moves to the right on phones.

## Testing

- `?dev` runs the loop on `setInterval` (the preview pane stalls `requestAnimationFrame`) and exposes `window.cc` (`G`, `cars`, `me`, `track`, `MAPS`, `loadMap`, `Car`, `botDrive`, `hostStart`, `useItem`, `ranking`, `renderer`, `scene`, `dev`).
- Steepest grade per path: `for (const p of cc.track.paths) { let mx = 0; for (let i = 0; i < p.n - 8; i++) mx = Math.max(mx, Math.abs(p.py[i + 8] - p.py[i]) / (8 * p.step)); console.log(p.id, mx); }`
- Off-road on Green Valley: a Racer tops out around 137 km/h vs 218 on the road. A ground probe costs about 2 µs.
- `?dev&solo` makes a room and starts a race with bots straight away. Add `&offline` to skip networking, `&auto` (or `cc.dev.auto = true`) to let a bot drive your car, `&veh=bus` to pick your vehicle, `&map=city` to pick the map, and `&bots=7` for a full grid.
- Multiplayer: two tabs on the same room code. Set the name per tab, since `localStorage` is shared.
- Settings saved in `localStorage`: `crash-name`, `crash-color`, `crash-muted`.

## Working with the user

- Commits are fine without asking. Ask before pushing, because `master` goes straight to GitHub Pages. End commit messages with the Co-Authored-By line.
