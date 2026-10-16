# Crash Circuit

A 3D combat racing game for 1 to 8 players in the browser. Players pick one of 12 vehicles, race on one of 6 themed maps, join a room by code, peer to peer, and the host can fill the grid with bots. Cars take damage from walls, bumps and weapons, get wrecked at 0 HP, and respawn on the track after a few seconds.

Lives at `jasonphe.github.io/CrashCircuit/`, linked under Games on the homepage (`../index.html`, thumbnail `../resources/crash-circuit.jpg`, a 1000×625 render of the canvas).

## Files

No build step. Plain ES modules. Three.js `0.160.0` comes from jsDelivr through the import map in `index.html` (`three`, plus `three/addons/` for `BufferGeometryUtils`).

| File | What it holds |
|---|---|
| `maps.js` | `MAPS`: each map's track shape (`ctrl`), theme and `decorate(ctx)` scenery. |
| `track.js` | `buildTrack(scene, map)`: samples the map's spline (`N` = 1200 points), the `project()` / `nearest()` queries, item box spots, the themed road, curbs, barriers, banks, ground and gantry, then runs the map's `decorate` with a helper `ctx`. Everything goes in `T.group`; `T.dispose()` tears it down. |
| `scenery.js` | Scenery toolkit: seeded `rng`, `xf` (bake a transform into a geometry), `merge`, prop parts for instancing (`PROPS`: trees, palms, ferns, cacti, rocks, lamps, fences, cows, snowmen…), and builders for textures, water, buildings and clouds. |
| `vehicles.js` | `VEHICLES`: every vehicle's stats and perk, plus derived collision circles and camera distance. `BUILD`: one low-poly model builder per vehicle. `makeVehicleMesh` wraps a model with the shared bits (shield bubble, tilt pivot). |
| `car.js` | `Car`: arcade physics (`step`) driven by `car.spec`, lap counting, wall bounces checked along the whole length. `syncMesh`: copies state onto the model and shows damage (darker paint, crumpled body, and the detachable `part` falls off under 45% health), plus flashing police lights, the hovercraft fan and rocket flames. |
| `fx.js` | `Particles` (one `THREE.Points` pool with smoke, fire, sparks, explosions), `Weather` (snow, fireflies or dust in a box that follows the camera) and `Sound` (all synthesized with WebAudio, no files). |
| `game.js` | Scene setup, networking, host logic, items, damage, bots, input, camera, HUD, screens, main loop. |
| `index.html`, `style.css` | Page shell, menus, HUD, touch controls. |

## Track and physics

- Heading `h`: forward is `(sin h, cos h)` in x/z, and turning left increases `h`. Track normals (`nx`, `nz`) point left, so a positive lateral offset is left of the centerline.
- Sample 0 is the start line. The grid is behind it, so cars start on `lap = -1`, and crossing the line forward makes it lap 0 ("LAP 1"). A car finishes when `lap` reaches `G.laps`. `prog = lap + idx / N` ranks unfinished cars.
- `project()` searches ±40 samples around a hint and falls back to the whole lap. It assumes no two parts of the track come within ~30 m of each other. Keep that true for every map, and keep the tightest corner radius above `WALL` (12.4 m). Today the tightest corner on any map is 21 m and the closest pass between separate stretches is 100 m.
- Walls are at `WALL` from the center. Cars are pushed back inside and bounce. Impacts over 9 m/s cost HP.
- Physics runs at a fixed 60 Hz (`STEP`) in `simStep`. Rendering is separate (`frame`).

## Maps

| Map | Theme | Notes |
|---|---|---|
| Green Valley | Day, farmland | Barn, silo, windmill, cows, fences, pond, grandstand |
| Neon City | Night, downtown | Square corners (`rounded()`), lit skyscrapers, neon signs, street lamps with light pools, billboards, parked cars, starry sky |
| Sunset Cliffs | Sunset, coast | Elevated cliff road, animated sea, beach, palms, lighthouse with a sweeping beam, sailboats, pier |
| Jungle Ruins | Hazy day, jungle | Dirt road (grip ×0.88), dense trees and ferns, stepped temple, stone heads, vines over the road, fireflies |
| Canyon Run | Bright desert | Long, fast sweepers, layered mesas, two stone arches over the road, cacti, tumbleweeds, dust |
| Frostbite Peaks | Overcast, snow | Icy road (grip ×0.7), falling snow, snowy pines, frozen lake, cabins, a moving ski lift |

- A map is `{ id, name, icon, blurb, seed, ctrl, theme, decorate }`. `ctrl` is `[x, z, height]` points for a closed centripetal Catmull-Rom spline; the first point is the start line, so put it on a straight with ~50 m of straight behind it for the grid.
- `theme`: `sky` [top, horizon] (the horizon is also the fog color), `fogNear`/`fogFar`, `sun` { color, intensity, dir }, `hemi` [sky, ground, intensity], `exposure`, `ground`/`groundDots`/`groundY`, `bank`, `road` { base, speck, edge, center, solid, ruts, rough }, `curb`/`wall` stripe colors, `wallTop`, `banner`, and optional `night`, `stars`, `sunGlow`, `weather` ('snow' | 'fireflies' | 'dust') and `grip` (multiplies every car's grip).
- `decorate(ctx)` places scenery. Useful bits of `ctx` (see `track.js`): `scatter(n, fn, { clear, near, area, test })` picks spots at least `clear` and at most `near` m from the track's banks; `inst(parts, items)` instances a prop; `along(every, fn)`, `beside(i, side, off)`, `onWall(i, side)` and `findSpot(x, z, need)` place things relative to the road; `ring` for far-away shapes; `animate(fn)` for moving scenery; `grandstand`, `sign`. Use `ctx.r` (seeded) for randomness, never `Math.random`, so every player gets the same map.
- Big things must stay clear of the track; `clearance(x, z)` measures from the outer edge of the banks.
- **Choosing:** the host picks a map (or 🎲 Random) in the waiting room. `G.map` is the choice and `G.cur` the map actually loaded; Random picks a new `cur` each race. Every page calls `loadMap(G.cur)` in `applyPh`, which tears down the old map and applies the new theme. The menu shows a random map.
- **Checking a new map:** in `?dev`, `cc.loadMap(id)` then measure `cc.track` (tightest corner, closest pass), and run a bot time trial with `cc.Car` + `cc.botDrive` (see Vehicles → Balance). Bots currently lap every map without touching a wall.

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
- **Long vehicles** get more collision circles (`spec.circles`), used for car-on-car hits, walls, pickups and weapon hits (`Car.near`).
- **Speed:** stats in `VEHICLES` are the balance numbers; `SPEED` (×1.15) and `ACCEL` (×1.1) in `vehicles.js` scale everything for feel.
- **Balance:** on Green Valley a bot driving alone laps in about 25 s (Formula) to 30 s (Bus/Tank). Keep the spread well under `FINISH_GRACE` / 3 laps, or slow vehicles DNF. To re-check, run a time trial in `?dev` with `cc.Car` and `cc.botDrive` (create a car, call `step` in a loop, time lap 0 to lap 1).
- **Adding one:** add a `VEHICLES` entry and a `BUILD` function (face +z, ground at y = 0, return `{ body, part }`). The garage thumbnail, stats bars and bots pick it up automatically.
- The garage (paint and vehicle) is one `#ride` element that `renderUI` moves between the start screen and the waiting room. Thumbnails are rendered once per paint color by a separate small `WebGLRenderer`. Changing your ride in the waiting room re-sends `hello`, so the host uses it next race. Bots get a shuffled set of different vehicles.

## Items

Boxes respawn after 4 s. Item odds depend on race position (`rollItem`): leaders get more mines, people at the back get more nitro, missiles and repairs.

- 🚀 Missile: homes on the nearest car ahead within a 0.7 rad cone, otherwise follows the road. 34 damage, spin and a hop.
- 💣 Mine: dropped behind, arms after 0.8 s (it can catch its owner too), lasts 45 s. 28 damage and a big hop.
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
- The race ends when everyone has finished, 8 s after the last human finishes, or 30 s after the first finisher.
- If Trystero can't load, the game drops to offline mode (`selfId = 'me'`) so you can still race bots.

## Sound

All synthesized in `fx.js`. The engine is a quiet triangle plus a sine an octave down through a lowpass, with a narrow pitch range and slow glides. Heavier vehicles hum lower. It was made deliberately soft after the first version (two sawtooth waves) was too harsh, so keep it subtle.

## Controls

WASD or arrows to drive, Space (or E) for an item, R to get back on the track, M to mute. Gamepads work too (left stick, RT/A for gas, LT to brake, X/RB for an item). Touch screens get on-screen buttons; the item slot moves to the right on phones.

## Testing

- `?dev` runs the loop on `setInterval` (the preview pane stalls `requestAnimationFrame`) and exposes `window.cc` (`G`, `cars`, `me`, `track`, `hostStart`, `useItem`, `ranking`, `renderer`, `scene`, `dev`).
- `?dev&solo` makes a room and starts a race with bots straight away. Add `&offline` to skip networking, `&auto` (or `cc.dev.auto = true`) to let a bot drive your car, `&veh=bus` to pick your vehicle, `&map=city` to pick the map, and `&bots=7` for a full grid.
- Multiplayer: two tabs on the same room code. Set the name per tab, since `localStorage` is shared.
- Settings saved in `localStorage`: `crash-name`, `crash-color`, `crash-muted`.

## Working with the user

- Commits are fine without asking. Ask before pushing, because `master` goes straight to GitHub Pages. End commit messages with the Co-Authored-By line.
