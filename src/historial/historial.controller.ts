import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';
import { HistorialService } from './historial.service';
import { CreateHistorialDto } from './dto/create-historial.dto';

@Controller('historial')
@UseGuards(JwtAuthGuard)
export class HistorialController {
  constructor(private readonly historialService: HistorialService) {}

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.historialService.findAllForUser(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateHistorialDto,
  ) {
    return this.historialService.create(user.id, dto.recetaId);
  }
}
