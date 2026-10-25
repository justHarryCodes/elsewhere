import type { Server as HttpServer } from 'node:http';
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@game/shared';
import { GameRoom } from './rooms/game.room';

@Injectable()
export class ColyseusService implements OnApplicationShutdown {
  private readonly logger = new Logger(ColyseusService.name);
  private gameServer?: Server;

  attach(httpServer: HttpServer) {
    this.gameServer = new Server({
      transport: new WebSocketTransport({ server: httpServer }),
    });
    this.gameServer.define(ROOM_NAME, GameRoom);
    this.logger.log(`Colyseus room "${ROOM_NAME}" registered`);
  }

  async onApplicationShutdown() {
    await this.gameServer?.gracefullyShutdown(false);
  }
}
