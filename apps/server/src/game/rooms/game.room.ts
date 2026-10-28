import { Client, Room } from 'colyseus';
import {
  ActionMessage,
  CITY_SEED,
  GRAVITY,
  HUMAN_BODIES,
  HumanBody,
  InputMessage,
  JoinOptions,
  Messages,
  PLAYER_SPEED,
  TeleportMessage,
  type DoorMessage,
  KERB_HEIGHT,
  interiorDoorAt,
  strayedFromInterior,
  generateCity,
  arrivalAt,
  sidewalkAt,
  isHumanAnimation,
  isHumanBody,
  locomotionForSpeed,
} from '@game/shared';
import { RULES, WALKER, type Sim, type Walker, addCityColliders, createWalker, createWorld, moveWalker, removeWalker } from '@game/shared/physics';
import { GameState, Player } from '../schema/game.state';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];
const BODIES = Object.keys(HUMAN_BODIES) as HumanBody[];
const MAX_STEPS_PER_TICK = 5; // after a stall, drop time rather than run a burst of steps
const FALL_RESET_Y = -100; // anyone who somehow falls out of the world (below the rooms under it) is put back on a street

export class GameRoom extends Room<GameState> {
  maxClients = 16;
  state = new GameState();

  private readonly city = generateCity({ seed: CITY_SEED });
  private sim?: Sim;
  private accumulator = 0;
  // Latest input per session; the server is authoritative over positions.
  private inputs = new Map<string, InputMessage>();
  // Sessions currently playing a requested action instead of locomotion.
  private acting = new Set<string>();
  private walkers = new Map<string, { walker: Walker; velocityY: number }>();

  async onCreate() {
    this.state.citySeed = this.city.seed;
    this.sim = await createWorld();
    addCityColliders(this.sim, this.city);

    this.onMessage(Messages.Input, (client, message: InputMessage) => {
      this.inputs.set(client.sessionId, sanitizeInput(message));
    });

    this.onMessage(Messages.Teleport, (client, message: TeleportMessage) => {
      const entry = this.walkers.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!entry || !player || !Number.isFinite(message?.x) || !Number.isFinite(message?.z)) return;
      // Right there on open ground; onto the nearest sidewalk if that's inside a building or out of town.
      const to = arrivalAt(this.city, message.x, message.z, player.heading);
      entry.walker.body.setTranslation(to, true);
      entry.velocityY = 0;
      Object.assign(player, { x: to.x, y: to.y, z: to.z, heading: to.heading });
    });

    // E at a front door: into the room under the building, or back out to the street. Or home.
    this.onMessage(Messages.Door, (client, message: DoorMessage) => {
      const entry = this.walkers.get(client.sessionId);
      const player = this.state.players.get(client.sessionId);
      if (!entry || !player) return;
      let to: { x: number; y: number; z: number; heading: number } | undefined;
      if (message?.home) {
        const home = this.city.interiors[this.city.home];
        if (home) to = { x: home.door.x, y: KERB_HEIGHT + 0.05, z: home.door.z, heading: home.door.heading + Math.PI };
      } else {
        // In, out, up to a roof terrace or back down: the doorway says where it leads.
        to = interiorDoorAt(this.city.interiors, player.x, player.y, player.z, 2.6)?.to;
      }
      if (!to) return;
      entry.walker.body.setTranslation(to, true);
      entry.velocityY = 0;
      Object.assign(player, to);
    });

    this.onMessage(Messages.Action, (client, message: ActionMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !isHumanAnimation(message?.animation)) return;
      player.animation = message.animation;
      player.animationSeq = (player.animationSeq + 1) % 65536;
      this.acting.add(client.sessionId);
    });

    // Physics runs at its own fixed rate; state patches still go out at the room's patch rate.
    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), 1000 / RULES.TICK_RATE);
  }

  onJoin(client: Client, options?: JoinOptions) {
    const player = new Player();
    player.name = options?.name?.trim().slice(0, 16) || `Player ${this.clients.length}`;
    player.color = COLORS[this.clients.length % COLORS.length];
    const body = options?.body;
    player.body = isHumanBody(body) ? body : BODIES[this.clients.length % BODIES.length];
    const spawn = this.spawnPoint();
    player.x = spawn.x;
    player.y = spawn.y;
    player.z = spawn.z;
    player.heading = spawn.heading;
    this.state.players.set(client.sessionId, player);
    if (this.sim) this.walkers.set(client.sessionId, { walker: createWalker(this.sim, spawn), velocityY: 0 });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.acting.delete(client.sessionId);
    const entry = this.walkers.get(client.sessionId);
    if (entry && this.sim) removeWalker(this.sim, entry.walker);
    this.walkers.delete(client.sessionId);
  }

  onDispose() {
    this.sim?.world.free();
  }

  /** On a downtown sidewalk, a little apart from everyone else. */
  private spawnPoint() {
    const downtown = this.city.districts.find((d) => d.zone === 'commercial')!;
    const cx = (downtown.x0 + downtown.x1) / 2;
    const cz = (this.city.bounds.z0 + this.city.bounds.z1) / 2;
    const near = this.city.spots
      .filter((s) => s.zone === 'commercial')
      .sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))
      .slice(0, 24);
    const spot = near[Math.floor(Math.random() * near.length)];
    return sidewalkAt(spot, Math.random() < 0.5 ? 1 : -1);
  }

  private update(dt: number) {
    const sim = this.sim;
    if (!sim) return;
    this.accumulator = Math.min(this.accumulator + dt, RULES.DT * MAX_STEPS_PER_TICK);
    while (this.accumulator >= RULES.DT) {
      this.step(sim, RULES.DT);
      this.accumulator -= RULES.DT;
    }
  }

  private step(sim: Sim, dt: number) {
    this.state.players.forEach((player, sessionId) => {
      const entry = this.walkers.get(sessionId);
      if (!entry) return;
      const input = this.inputs.get(sessionId) ?? { x: 0, z: 0 };
      const moving = input.x !== 0 || input.z !== 0;

      entry.velocityY = Math.max(entry.velocityY + GRAVITY * dt, -WALKER.maxFallSpeed);
      const { position, grounded } = moveWalker(entry.walker, {
        x: input.x * PLAYER_SPEED * dt,
        y: entry.velocityY * dt,
        z: input.z * PLAYER_SPEED * dt,
      });
      if (grounded && entry.velocityY < 0) entry.velocityY = 0;
      // Anyone who got out of a building's plan (into the void round it) is back on the street at its door.
      const back = strayedFromInterior(this.city.interiors, position.x, position.y, position.z);
      if (back) {
        entry.walker.body.setTranslation(back, true);
        entry.velocityY = 0;
        Object.assign(position, back);
      }
      if (position.y < FALL_RESET_Y) {
        const spawn = this.spawnPoint();
        entry.walker.body.setTranslation(spawn, true);
        entry.velocityY = 0;
        Object.assign(position, spawn);
      }
      player.x = position.x;
      player.y = position.y;
      player.z = position.z;

      if (moving) {
        player.heading = Math.atan2(input.x, input.z);
        this.acting.delete(sessionId);
      }
      if (!this.acting.has(sessionId)) {
        player.animation = locomotionForSpeed(moving ? PLAYER_SPEED * Math.hypot(input.x, input.z) : 0);
      }
    });
    sim.world.step();
  }
}

function sanitizeInput(message: InputMessage): InputMessage {
  const x = Number.isFinite(message?.x) ? message.x : 0;
  const z = Number.isFinite(message?.z) ? message.z : 0;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}
