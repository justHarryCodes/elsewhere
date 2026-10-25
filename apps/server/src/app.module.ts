import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { HealthController } from './health.controller';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    // In production the server also serves the built client (apps/client/dist).
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'client', 'dist'),
      exclude: ['/api/{*path}'],
    }),
    GameModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
