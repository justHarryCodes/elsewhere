import { Client, Room } from 'colyseus';
import {
  ActionMessage,
  HUMAN_BODIES,
  HumanBody,
  InputMessage,
  JoinOptions,
  Messages,
  PLAYER_SPEED,
  TICK_RATE,
  WORLD_HALF_SIZE,
  isHumanAnimation,
  isHumanBody,
  locomotionForSpeed,
} from '@game/shared';
import { GameState, Player } from '../schema/game.state';

const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];
const BODIES = Object.keys(HUMAN_BODIES) as HumanBody[];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export class GameRoom extends Room<GameState> {
  maxClients = 16;
  state = new GameState();

  // Latest input per session; the server is authoritative over positions.
  private inputs = new Map<string, InputMessage>();
  // Sessions currently playing a requested action instead of locomotion.
  private acting = new Set<string>();

  onCreate() {
    this.onMessage(Messages.Input, (client, message: InputMessage) => {
      this.inputs.set(client.sessionId, sanitizeInput(message));
    });

    this.onMessage(Messages.Action, (client, message: ActionMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || !isHumanAnimation(message?.animation)) return;
      player.animation = message.animation;
      player.animationSeq = (player.animationSeq + 1) % 65536;
      this.acting.add(client.sessionId);
    });

    this.setSimulationInterval((deltaMs) => this.update(deltaMs / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client, options?: JoinOptions) {
    const player = new Player();
    player.name = options?.name?.trim().slice(0, 16) || `Player ${this.clients.length}`;
    player.color = COLORS[this.clients.length % COLORS.length];
    const body = options?.body;
    player.body = isHumanBody(body) ? body : BODIES[this.clients.length % BODIES.length];
    player.x = (Math.random() - 0.5) * 10;
    player.z = (Math.random() - 0.5) * 10;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.inputs.delete(client.sessionId);
    this.acting.delete(client.sessionId);
  }

  private update(dt: number) {
    this.state.players.forEach((player, sessionId) => {
      const input = this.inputs.get(sessionId) ?? { x: 0, z: 0 };
      const moving = input.x !== 0 || input.z !== 0;

      if (moving) {
        player.x = clamp(player.x + input.x * PLAYER_SPEED * dt, -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
        player.z = clamp(player.z + input.z * PLAYER_SPEED * dt, -WORLD_HALF_SIZE, WORLD_HALF_SIZE);
        player.heading = Math.atan2(input.x, input.z);
        this.acting.delete(sessionId);
      }

      if (!this.acting.has(sessionId)) {
        player.animation = locomotionForSpeed(moving ? PLAYER_SPEED * Math.hypot(input.x, input.z) : 0);
      }
    });
  }
}

function sanitizeInput(message: InputMessage): InputMessage {
  const x = Number.isFinite(message?.x) ? message.x : 0;
  const z = Number.isFinite(message?.z) ? message.z : 0;
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
}
