import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SERVER_PORT } from '@game/shared';
import { AppModule } from './app.module';
import { ColyseusService } from './game/colyseus.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.enableShutdownHooks();

  // Colyseus shares Nest's HTTP server: matchmaking + WebSocket upgrades on the same port.
  app.get(ColyseusService).attach(app.getHttpServer());

  const port = Number(process.env.PORT ?? SERVER_PORT);
  await app.listen(port);
  console.log(`Server listening on http://localhost:${port}`);
}

void bootstrap();
