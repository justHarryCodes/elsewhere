import { Module } from '@nestjs/common';
import { ColyseusService } from './colyseus.service';

@Module({
  providers: [ColyseusService],
  exports: [ColyseusService],
})
export class GameModule {}
