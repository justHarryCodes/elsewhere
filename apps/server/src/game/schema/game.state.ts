import { MapSchema, Schema, type } from '@colyseus/schema';
import { DEFAULT_HUMAN_ANIMATION, DEFAULT_HUMAN_BODY, type PlayerSnapshot } from '@game/shared';

export class Player extends Schema implements PlayerSnapshot {
  @type('string') name = '';
  @type('string') color = '#ffffff';
  @type('string') body: string = DEFAULT_HUMAN_BODY;
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') z = 0;
  @type('number') heading = 0;
  @type('string') animation: string = DEFAULT_HUMAN_ANIMATION;
  @type('uint16') animationSeq = 0;
}

export class GameState extends Schema {
  /** Seed of the city everyone is in; clients generate the same city from it. */
  @type('uint32') citySeed = 0;
  @type({ map: Player }) players = new MapSchema<Player>();
}
