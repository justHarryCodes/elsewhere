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
  retargeted by bone name.
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
  state). About 1 km (X) by 600 m (Z): 4-lane streets (the Downtown City MegaKit's pieces) around blocks about 55 m
  across. **Old Town** at -X, **Downtown** (taller) in the middle, **Industry** at +X.
- **Clusters**: most town blocks hold a cluster of 4 to 14 buildings from Quaternius' **Ultimate Buildings Pack**,
  mixed heights (1 to 6 storeys), each in one of the pack's ten colour schemes, with flower beds along the fronts and
  paths to the sidewalk: up to 5 in a row in the middle of the block, up to 9 in two rows back to back, more in two
  rows along the streets either side of a green courtyard. Other blocks are parks (crossing paths, a ring of flowers,
  benches, rows of trees and pines, a big old tree) or paved squares with planters and a car park.
- **Public buildings**, each on its own block with a paved forecourt and a name board by the sidewalk: **Town Hall**
  (the downtown block nearest the middle, with a square), **Police** (police cars in its car park), **Hospital**
  (city-pack's hospital, ambulances), **Bank**, and in Old Town the **Fire Station**, **School** (with a playground),
  **Post Office** (vans) and **Library**, with a row of houses or shops behind each.
- **Green and street furniture**: lawns, flowers, grass and rocks from the **Stylized Nature MegaKit**, and trees in
  rows: an even avenue down both sidewalks of every street (one kind per street) and a regular grid across each block
  wherever it's clear. Benches with bins, hydrants, mailboxes, power boxes, ATMs, bus stops, billboards, stop signs,
  downtown traffic lights, manhole covers, bicycles by the doors, dumpsters and bin bags beside the rows, washing
  lines in back gardens, parked cars (`city-pack`). Industry keeps works halls assembled from the MegaKit's modules,
  with tanks, chimneys and containers.
- **Traffic and people** (`packages/shared/src/traffic.ts`, drawn by `game/babylon/townLife.ts`): about 28 cars
  drive the streets round the player, in lane, choosing a street at every junction, following the car ahead,
  stopping at red lights downtown and taking turns at the other junctions, and stopping for people and players.
  About 40 people (the modular characters, walk and idle clips) walk round the blocks, stop now and then, cross at
  the corners when no car is close, and some walk a dog (Kenney's cube pets). It's ambient, so each client runs its
  own round its player; in `/sandbox` the cars are also solid (kinematic boxes) to the character and the car.
- **Going inside**: the player's **home** (a house in the middle of Old Town: **My home** in the sandbox) and every
  public building, plus about a fifth of the houses and a third of the downtown buildings (shops, cafés, offices),
  can be entered: walk up to the front door and press **E**. The room (`packages/shared/src/interiors.ts`) is laid out
  for what the building is, furnished from Kenney's furniture kit and the office / coffeehouse packs: the home has a
  living room, kitchen and dining table, bedroom and bathroom; the police station desks and a front counter, the
  hospital a ward, the school a classroom, the library shelves and reading tables, and so on. Rooms are built under
  their buildings (with colliders, so the server walks you round them too) and seen doll's-house style from above;
  the door inside takes you back out.
- Packing for the web: `scripts/city/pack_megakit.py` (streets, works) and `scripts/city/pack_town.py` (buildings,
  the hospital, parked cars, nature, props and furniture: OBJ and glb, scaled to metres) write `public/assets/city/{megakit,town}/`. Rerun them if the packs
  change; `game/megakit.ts` loads both and welds placed pieces into one batch per material (per colour scheme).
- Physics: `addCityColliders(sim, city)` (`@game/shared/physics`) adds the lots, sidewalks, buildings and solid props
  as boxes. The server moves players with the same physical walker as the sandbox (`physics-walker.ts`), so they're
  blocked by buildings, step up kerbs and spawn on a downtown sidewalk.
- Drawing: `CityRenderer` (Babylon `game/babylon/city.ts`) streams the city in 120 m chunks round the camera: chunks
  within 260 m are built nearest first, one per frame, rising out of the ground; chunks more than 360 m behind sink
  away and are freed. Each chunk is a dozen meshes (one per material). The Three.js renderer
  (`game/three/city.ts`) builds the same city all at once, with the day look only.
- **Sky** (`game/babylon/sky.ts`): painted panoramas on a dome round the camera: by day blue with drifting clouds and
  a pale haze at the horizon; by night deep blue with stars, a moon, and the city's glow along the horizon.
- **Big-city nights** (**N** or the ☾/☀ button; day is the default): bright enough to see the whole street, most
  windows lit, warm-white street lamps (amber in Old Town) throwing pools of light (`city.lights`), car headlights,
  and the neon (tubes over shop fronts, blade signs, rooftop billboards, tower outlines: `city.neon`) that only comes
  on after dark. `game/babylon/atmosphere.ts` holds the day and night looks.
- **Camera and map** (`game/CameraControls.tsx`, `game/CityMap.tsx`, in the game and the sandbox): Street / Chase /
  Top views (**V** cycles), turn and zoom buttons, and a neon city map (**M**): click anywhere on it to go there (to
  the nearest sidewalk if you click inside a building). In the game the server moves you (`Messages.Teleport`).
- In `/sandbox` the city sits just north of the test yard; the **City** buttons jump to the yard or a district with
  the car parked beside you.

## Configuration

- Server: `PORT` (default `3000`).
- Client: copy `apps/client/.env.example` to `.env` and set `VITE_SERVER_URL` if the server is not on
  `ws://<host>:3000`.
