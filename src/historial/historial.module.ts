import { Module } from '@nestjs/common';
import { HistorialController } from './historial.controller';
import { HistorialService } from './historial.service';

@Module({
  controllers: [HistorialController],
  providers: [HistorialService],
})
export class HistorialModule {}
