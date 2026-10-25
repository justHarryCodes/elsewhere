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
- Server sets `animation` from movement speed; clients send `Messages.Action` for emotes/attacks (keys 1-5).
- Renderers: `game/babylon/humans.ts` and `game/three/humans.ts` (`HumanLibrary.load()` then `createHuman()`).

## Vehicles

- `packages/shared/src/vehicles.ts` defines each drivable car: model file, real-world size, which nodes are
  wheels, which materials are paint / headlights / tail lights / siren, measured wheel and body bounds, and
  handling. Six Quaternius cars share one rig (police car, sports car, SUV, taxi, hatchback, sedan).
- `packages/shared/src/physics-vehicle.ts` drives them on Rapier's raycast vehicle: engine, brakes with front bias,
  speed-sensitive steering, suspension and tyre grip per surface. Import physics from `@game/shared/physics`.
- `apps/client/src/game/babylon/vehicles.ts` draws a `VehicleSnapshot`: body pose, steering and spinning wheels,
  suspension travel, per-car paint, headlights (low/high), brake and reverse lights, and the police siren.
- Try it in `/sandbox`: walk to the car and press **E**. W/S throttle and brake (hold S to reverse), A/D steer,
  Space handbrake, **L** headlights, **K** siren, **N** night.

## Configuration

- Server: `PORT` (default `3000`).
- Client: copy `apps/client/.env.example` to `.env` and set `VITE_SERVER_URL` if the server is not on
  `ws://<host>:3000`.
