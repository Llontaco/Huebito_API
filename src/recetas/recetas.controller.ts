import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { FindRecetasDto } from './dto/find-recetas.dto';

// Endpoints públicos de solo lectura.
@Controller('recetas')
export class RecetasController {
  constructor(private readonly recetasService: RecetasService) {}

  @Get()
  findAll(@Query() query: FindRecetasDto) {
    return this.recetasService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.findOne(id);
  }
}
