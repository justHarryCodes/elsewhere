# Web Game

Monorepo for a browser-based multiplayer game (npm workspaces).

```
apps/
  server/   NestJS API + Colyseus multiplayer server (port 3000)
  client/   React + Vite + Tailwind, rendering with Babylon.js or Three.js (port 5173)
packages/
  shared/   Constants and message types used by both sides
```

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 in two tabs and move with WASD — both tabs share the same room.
The header toggle switches between the Babylon.js and Three.js renderers.

## Scripts

| Command             | What it does                                                      |
| ------------------- | ----------------------------------------------------------------- |
| `npm run dev`       | Builds `shared`, then runs shared (watch), server and client      |
| `npm run sandbox`   | Client only, opens the offline Babylon movement sandbox (`/sandbox`) |
| `npm run build`     | Production build of all packages                                  |
| `npm start`         | Runs the built server, which also serves `apps/client/dist`       |
| `npm run typecheck` | Type-checks every workspace                                       |

## How it fits together

- `apps/server/src/main.ts` boots Nest, then attaches Colyseus to the same HTTP server, so the REST API
  (`/api/...`), matchmaking and WebSockets all share port 3000.
- `apps/server/src/game/rooms/game.room.ts` is the authoritative room: clients send movement input,
  the server simulates at `TICK_RATE` and syncs `GameState` (`schema/game.state.ts`).
- `apps/client/src/net/useGameRoom.ts` joins the room and exposes live player objects that both
  renderers read every frame.
- Game models go in `apps/client/public/assets/` and load from `/assets/...`.

## Humans & animation

- Every human is a **Universal Base Character** (`public/assets/characters/base`, male/female) animated by the
  **Universal Animation Library** (`public/assets/animations`). They share one skeleton, so clips are
  retargeted by bone name. Clips only rotate bones (plus the root and pelvis movement), so each body keeps its
  own proportions.
- **Slimmer bodies**: `node scripts/characters/reshape_bodies.mjs` rebuilds Quaternius' bodybuilder "Superhero"
  bases as `Body_Male` / `Body_Female`. The script narrows the shoulders (the arm joints and bind matrices
  move in), thins the chest, arms and legs, and smooths out the muscle definition.
  `scripts/characters/toon_skin.py` (Blender) paints the muscle shading out of the skin texture.
- **Relaxed movement**: `node scripts/characters/relax_clips.mjs` writes `UAL_Relaxed.glb`, with calmer idle,
  walk, jog and sprint clips: arms hang by the body, smaller swing, open hands, less bounce.
- **Clothes** (`CLOTHING`, `OUTFITS` in `humans.ts`): 22 mix-and-match pieces in 11 slots, including
  T-shirt, tank, crop top, track jacket, field shirt, hoodie, cargo joggers, track pants, shorts, ripped jeans,
  pleated skirt, sundress, three kinds of shoes, gloves, knee pads, backpack, headband, belt, wristbands and
  choker. Each piece has main, trim and detail colours you can change.
  - **How they're made:** `scripts/characters/build_clothes.py` builds them in Blender (Blender 5.2, run it
    with `blender -b -P scripts/characters/build_clothes.py -- <Body_X.gltf> <Clothes_X.glb> <Clothes_X.json>`).
    Most pieces are cut from the body's own surface, so they share its skin weights and follow every
    animation; pockets, skirts and the backpack are modelled and skinned from the nearest body surface.
  - **Hidden skin:** the JSON lists the body vertices each piece covers, and that skin is hidden.
  - **Picking clothes:** in the sandbox's Clothes panel (outfits, pieces, colours, Shuffle). Players and
    characters get a repeatable random look from their id (`randomAppearance`).
- **Look**: skin and clothes are matte PBR (lit like the rest of the scene) with a thin dark outline.
- **Furniture actions** (`world/interactions.ts`): inside a place, tap a bed, couch, chair, toilet, bath, shower,
  desk, TV, cooker, sink, game or the club's dance floor; a sheet slides up with its actions. The character walks
  over, settles into a pose in contact with it (hips on the seat, back on the mattress) for 10 seconds, then gets
  up; moving cancels it. Doors between rooms swing open and shut when tapped (shut ones block the way).
  - **Clips**: lying, bath, shower, typing, counter work and playing a game are authored on the same rig by
    `node scripts/characters/pose_clips.mjs` (`UAL_Actions.glb`), posing limbs by direction (`scripts/characters/rig.mjs`).
  - **Effects** (`world/babylon/effects.ts`, Babylon only so far): shower downpour and splashes, bath water,
    steam, cooker heat, a running tap, floating Zzz with a dimmed room, screen glow, and the club's sweeping RGB
    beams and haze. Light from effects stays dim and short-ranged, so nothing round it is washed out.
- `packages/shared/src/humans.ts` maps game names (`idle`, `jog`, `swordCombo`, ...) to clips. UAL2 is the
  primary library; core locomotion (idle/walk/jog/sprint/jump) comes from UAL1 because UAL2 has none.
- **Six body types** (`HUMAN_BODIES`): man, woman, slim man, slim woman, teen boy, teen girl. Slim and teen
  bodies are made from the two bases by thinning the mesh around each bone (`BODY_SHAPES`, applied in
  `reshapeSkinnedMesh`); teens are also scaled to teen height with a slightly larger head.
- **Appearance** (`HumanAppearance`): 8 skin tones, 6 hairstyles (or bald), 8 hair colours, and a beard for male
  bodies. Hairstyles share the body skeleton, so they follow every animation.
- Server sets `animation` from movement speed; clients send `Messages.Action` for emotes/attacks (keys 1-5).
- Renderers: `game/babylon/humans.ts` and `game/three/humans.ts` (`HumanLibrary.load()` then `createHuman()`).
  The Babylon renderer supports body shapes and appearance; the Three.js one draws the base body at the
  right height.

## Vehicles

- **Six drivable cars**, the low-poly Quaternius set (police car, sports car, SUV, taxi, hatchback, sedan). The
  catalog generator also knows the detailed models in `public/assets` (Camaro, F40, Dodge Challenger, Nissans,
  trucks, buses, bikes...) but they're switched off in `DISABLED` until there are models with interiors and seats
  for the driver. Per-model data (facing, body and wheel bounds, paint / lamp / glass materials) is generated into
  `packages/shared/src/vehicle-catalog.ts` by `scripts/vehicles/build_catalog.py`.
- `packages/shared/src/vehicles.ts` turns that into real-world geometry (scaled to the size catalog) and handling per
  class (compact, sedan, sports, supercar, SUV, pickup, van, truck, bus, motorcycle, bicycle).
- `packages/shared/src/physics-vehicle.ts` drives them on Rapier's raycast vehicle: engine, front-biased brakes,
  speed-sensitive steering, suspension, tyre grip per surface, stability control (off with the handbrake), and
  two-wheelers kept upright. Import physics from `@game/shared/physics`.
- `apps/client/src/game/babylon/vehicles.ts` draws a `VehicleSnapshot`: body pose, steering and spinning wheels (or
  whole axles), suspension travel, per-car paint with gloss / metallic / matte finish, see-through glass, headlights
  (low/high), brake, reverse and siren lamps. Models whose wheels are part of the body still drive, without spinning.
- The sky (`public/assets/environment/sky.hdr`, from `scripts/environment/make_sky_hdr.py`) lights every PBR material
  and gives paint its reflections.
- Try it in `/sandbox`: walk to the car and press **E**: the character walks to the door, reaches for it and fades
  into the car (hidden while driving: the cars have no interior). Getting out needs the car stopped; the character
  fades back in beside the door. The character is fully physical: blocked by cars, walls and crates, walks up the
  ramp and the staircase, falls off edges and lands on what is below. They can push crates (with a person's
  strength) but not cars, and an empty car keeps its parking brake on.
  W/S throttle and brake (hold S to reverse), A/D steer, Space handbrake, **L** headlights, **K** siren, **N** night,
  stop and **E** to get out.

## City

- **One seeded town, shared**: `generateCity({ seed })` in `packages/shared/src/city.ts` builds the same town on the
  server and every client, so nothing about it is sent over the network except the seed (`citySeed` in the room
  state). About 1 km (X) by 600 m (Z), laid out like a life-sim neighbourhood map: quiet 2-lane streets (Kenney's
  **City Kit Roads**: crossroads, T-junctions, corner bends, zebra crossings by the junctions, curved street lights)
  around blocks about 60 m across. **Maple Grove** at -X, **Town Centre** in the middle, **Parkside** at +X.
- **Maple Grove**: detached family houses from Kenney's **City Kit Suburban**, each in one of four colour schemes and on
  its own lot: a front lawn, stepping stones from the door to the sidewalk, a driveway (with the family car most of the
  time), a mailbox, flowers along the front, garden trees, a picket fence round the back garden, now and then a washing
  line. A few blocks are parks (crossing paths, a ring of flowers, benches, rows of trees and pines, a big old tree).
- **Town Centre**: rows of shops and small offices from Kenney's **City Kit Commercial** (three colour schemes), with
  flower beds, bicycles and café tables under parasols out front; some blocks are parks or paved squares with planters
  and a car park.
- **Public buildings**, each on its own block with a paved forecourt and a name board by the sidewalk: **Town Hall**
  (the Town Centre block nearest the middle, with a square), **Police** (police cars in its car park), **Hospital**
  (city-pack's hospital, ambulances), **Bank**, and in Maple Grove the **Fire Station**, **School** (with a
  playground), **Post Office** (vans) and **Library**, with a row of houses or shops behind each (Quaternius'
  **Ultimate Buildings Pack**).
- **Parkside**, the community lots: a **fairground** (entrance arch, food, drink and information stalls, picnic tables
  under parasols: Kenney's **Coaster Kit**), a **skate park** (**Mini Skate**: half-pipes, ramps, rails, a fence), the
  **old graveyard** (**Graveyard Kit**: iron fence and gate, rows of gravestones, a crypt, pines, lamps, pumpkins), an
  **arcade**, a **grocery** and a **diner** you can go into, **food courts** and parks.
- **Monorail**: an elevated track (Coaster Kit) right round Parkside above its boundary streets, on slim pillars
  between the lanes, with a three-car train running round it (`city.monorail`; drawn and moved by the Babylon renderer).
- **Green and street furniture**: lawns, flowers, grass and rocks from the **Stylized Nature MegaKit**, Kenney's garden
  trees in avenues down the sidewalks, and trees on a grid across parks and squares. Benches with bins, hydrants, power
  boxes, ATMs, bus stops, stop signs, Town Centre traffic lights, manhole covers, dumpsters and bin bags beside the
  rows of shops, parked cars (`city-pack`).
- **Traffic and people** (`packages/shared/src/traffic.ts`, drawn by `game/babylon/townLife.ts`): about 28 cars
  drive the streets round the player, in lane, choosing a street at every junction, following the car ahead,
  stopping at red lights in Town Centre and taking turns at the other junctions, and stopping for people and players.
  About 40 people (the modular characters, walk and idle clips) walk round the blocks, stop now and then, cross at
  the corners when no car is close, and some walk a dog (Kenney's cube pets). It's ambient, so each client runs its
  own round its player; in `/sandbox` the cars are also solid (kinematic boxes) to the character and the car.
- **Going inside** is where the game is. The player's **home** (a penthouse near where Town Centre meets Maple Grove:
  **My home** in the sandbox), every public building and Parkside venue, about a third of the houses and half the
  Town Centre buildings (apartments, offices, shops, cafés) can be entered: walk up to the front door and press **E**.
  Each has a real **floor plan** (`interior-plans.ts`, built by `interior-builder.ts`): rooms that tile the building on
  one or two levels, joined by doorways. The builder raises the walls from the plan itself: a shared edge becomes a
  partition papered on each side in its own room's wallpaper (none between rooms of one open-plan zone, glass round
  meeting rooms), outer edges become exterior walls with framed windows glowing with daylight; upstairs stands on a slab
  with a hole over real, walkable stairs (18 steps a storey) and a glass balustrade round the stairwell.
  - **Homes**: **studios** (one room: bed behind a low bookcase, lounge, galley kitchen, shower room), **flats**
    (open-plan living room and kitchen with a dining table, two bedrooms or a bedroom and a kids' room or study, a
    bathroom) and **duplexes** (living room, kitchen with an island, a den, library or playroom, cloakroom, laundry;
    stairs up to a landing, the main bedroom with its bathroom, a second bedroom). Plans are mirrored half the time,
    and rooms pick their furniture, wallpaper and floors, so no two look alike. Two-storey houses get a duplex.
  - **Roof terraces**: penthouses on flat-roofed Town Centre buildings have a door upstairs (**E**: "go up to the
    roof") that takes you onto the building's **real roof**, with the town all round: decking and a lawn, the stair
    hut, an outdoor corner sofa and fire pit, sun loungers under a parasol, a hot tub, a dining table under a pergola,
    a bar, planters, a telescope, glass railings and strings of lights.
  - **Offices** (two floors): reception with the company sign, open-plan desks, a glass meeting room, a break room,
    restrooms; upstairs more desks, the manager's office, a conference room, a lounge and the archive.
  - **Hospital** (two floors): lobby and reception, waiting area, pharmacy, emergency bays with curtained beds, X-ray,
    a café; upstairs three wards (one maternity), the operating theatre, the doctors' office, the nurses' room.
  - **Game centre**: arcade cabinets and claw machines on a starry carpet, four bowling lanes with pins and score
    screens, a billiards lounge, a snack bar, the prize counter. **Event centre**: lobby and ticket desk, cloakroom,
    cocktail lounge; the hall with a stage (the band's kit, speakers, a truss of coloured lights), a glowing dance
    floor, round tables laid for dinner, a long bar, the DJ booth; the green room backstage.
  - Smaller places (shops, cafés, police, fire station, school, town hall, bank, post office, library, grocery,
    diner) are one big furnished room.
  - **People inside** (`TownLife`): staff at their posts (reception, tills, wards, the bar, the stage) now and then
    busy with something, visitors wandering room to room through the doorways (and upstairs residents).
  Furniture is Kenney's **Furniture Kit** and Quaternius' house interior pieces (CC0, packed as `k/furniture/*`,
  `k/house/*`; sizes generated into `furniture-catalog.ts`), the Mini Arcade / Mini Market kits, the Food Kit on the
  tables, and coloured shapes for what no kit has. Insides are built on a grid well under the town (with colliders,
  so the server walks you round them too) and only the one you're in is drawn: floors above you are hidden and walls
  between the camera and you are cut down, doll's-house style.
- **Premium furniture** (`p/<pack>/*`): the best-looking models from the downloaded furniture packs in
  `apps/client/public/assets/furniture` (singles, house-interior, office-pack, coffeehouse-lounge, restaurant-bits) replace the plain
  pieces wherever a better one exists: sofas, beds, kitchens, bathrooms, desks, the pool tables and the stage gear.
  Low-quality models were left out. The packer turns each one to face the room (`yaw`), scales it to real-world size
  (`h`/`w`), sits it on the floor, recolours garish flat colours (the magenta pool felt is green), and keeps textured
  parts as shared `tex-*` materials. The heaviest are `p/office/desk-2`, `standing-desk` and `p/cafe/pool-table`
  (30-60k vertices each), so they're used sparingly.
  **Licence:** Kenney and Quaternius are CC0, but the office, coffeehouse, restaurant and singles packs look like Poly
  Pizza bundles, where models are often CC-BY. Check each pack's licence and add credits before shipping.
- **Wallpaper and floors** from Kenney's **Pattern Pack** and **Pattern Pack Lines**: every room picks a wallpaper
  (flowers, leaves, damask, stars, hearts, stripes...) in bold colours and a floor (parquet, tiles, carpet, marble, a
  checkerboard...) that suit it (`CityShape.pattern`), with skirting boards. The renderer recolours each black-and-white
  tile into the room's two colours.
- Packing for the web: `scripts/city/pack_megakit.py` (ground textures, window rooms) and `scripts/city/pack_town.py`
  (buildings, the hospital, parked cars, nature, props and furniture: OBJ and glb, scaled to metres) write
  `public/assets/city/{megakit,town}/`; `node scripts/city/pack_kenney.mjs` (no dependencies) packs the Kenney kits
  and pattern tiles from `art-source/kenny` and `public/assets/buildings/kenney-city-kit-*` into
  `public/assets/city/kenney/` (`--sizes` prints each piece's size, for the generator's tables). Rerun them if the packs
  change; `game/megakit.ts` loads all three and welds placed pieces into one batch per material (per colour scheme).
- Physics: `addCityColliders(sim, city)` (`@game/shared/physics`) adds the lots, sidewalks, buildings and solid props
  as boxes. The server moves players with the same physical walker as the sandbox (`physics-walker.ts`), so they're
  blocked by buildings, step up kerbs and spawn on a Town Centre sidewalk.
- Drawing: `CityRenderer` (Babylon `game/babylon/city.ts`) streams the city in 120 m chunks round the camera: chunks
  within 260 m are built nearest first, one per frame, rising out of the ground; chunks more than 360 m behind sink
  away and are freed. Each chunk is a dozen meshes (one per material). The Three.js renderer
  (`game/three/city.ts`) builds the same city all at once, with the day look only.
- **Sky** (`game/babylon/sky.ts`): painted panoramas on a dome round the camera: by day blue with drifting clouds and
  a pale haze at the horizon; by night deep blue with stars, a moon, and the city's glow along the horizon.
- **Nights** (**N** or the ☾/☀ button; day is the default): bright enough to see the whole street, most windows lit,
  warm-white and amber street lights (a few pink ones in Parkside) throwing pools of light (`city.lights`), car
  headlights, and a little neon (tubes over shop doors, the odd blade sign, the arcade and the diner: `city.neon`) that
  only comes on after dark. `game/babylon/atmosphere.ts` holds the day and night looks.
- **Camera and map** (`game/CameraControls.tsx`, `game/CityMap.tsx`, in the game and the sandbox): Street / Chase /
  Top views (**V** cycles), turn and zoom buttons, and a town map (**M**, with the monorail and Parkside's lots marked): click anywhere on it to go there (to
  the nearest sidewalk if you click inside a building). In the game the server moves you (`Messages.Teleport`).
- In `/sandbox` the city sits just north of the test yard; the **City** buttons jump to the yard or a district with
  the car parked beside you.

## Configuration

- Server: `PORT` (default `3000`).
- Client: copy `apps/client/.env.example` to `.env` and set `VITE_SERVER_URL` if the server is not on
  `ws://<host>:3000`.
