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
- Try it in `/sandbox`: walk to the car and press **E**: the character walks to the door, opens it and gets in
  (hidden while driving: the cars have no interior). The character is fully physical: blocked by cars, walls and
  crates (and pushes crates), walks up the ramp and the staircase, falls off edges and lands on what is below.
  W/S throttle and brake (hold S to reverse), A/D steer, Space handbrake, **L** headlights, **K** siren, **N** night,
  stop and **E** to get out.

## City

- **One seeded city, shared**: `generateCity({ seed })` in `packages/shared/src/city.ts` builds the same city on the
  server and every client, so nothing about it is sent over the network except the seed (`citySeed` in the room
  state). About 1 km (X) by 600 m (Z) on a grid of 8 m Kenney road tiles: **homes** at the -X end, **downtown** in
  the middle (towers gather at its centre, zebra crossings and traffic lights at its junctions), **industry** at the
  +X end with yards of containers, tanks and chimneys. A ring road and a main avenue run through all three; each
  district has its own block sizes, and some side streets are left out to make bigger blocks.
- Model sizes come from `packages/shared/src/city-catalog.ts`, generated by `scripts/city/build_city_catalog.py`
  (rerun it after adding models to the kits). Building fronts face the street; the road surface is y = 0 and the
  sidewalks and lots are an 8 cm kerb above it.
- Physics: `addCityColliders(sim, city)` (`@game/shared/physics`) adds the lots, sidewalks, buildings and solid props
  as boxes. The server now moves players with the same physical walker as the sandbox (`physics-walker.ts`), so
  they're blocked by buildings, step up kerbs and spawn on a downtown sidewalk.
- Drawing: `CityRenderer` (Babylon `game/babylon/city.ts`, Three `game/three/city.ts`) loads each model once and
  draws every copy as an instance, batched per 200 m chunk so off-screen chunks are skipped.
- In `/sandbox` the city sits just north of the test yard; the **City** buttons jump to the yard or a district with
  the car parked beside you.

## Configuration

- Server: `PORT` (default `3000`).
- Client: copy `apps/client/.env.example` to `.env` and set `VITE_SERVER_URL` if the server is not on
  `ws://<host>:3000`.
