import { Controller, Get } from '@nestjs/common';
import { CategoriasService } from './categorias.service';

// Endpoints públicos de solo lectura — sin guard, no exponen nada sensible.
@Controller('categorias')
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Get()
  findAll() {
    return this.categoriasService.findAll();
  }
}
