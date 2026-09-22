import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
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

  // Va declarada ANTES de ':id' porque Nest resuelve las rutas en orden y
  // ':id' capturaría también "12/imagen". Responde la imagen en crudo, no JSON.
  @Get(':id/imagen')
  async findImagen(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { datos, mime } = await this.recetasService.findImagen(id);

    res.set({
      'Content-Type': mime,
      'Content-Length': String(datos.length),
      // La foto de una receta no cambia, así que dejamos que el navegador la
      // cachee y no la vuelva a pedir en cada visita.
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    return new StreamableFile(datos);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.recetasService.findOne(id);
  }
}
