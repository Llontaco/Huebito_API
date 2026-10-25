import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CachePublicoInterceptor } from '../common/interceptors/cache-publico.interceptor';
import { CategoriasService } from './categorias.service';

// Endpoints públicos de solo lectura — sin guard, no exponen nada sensible.
@Controller('categorias')
@UseInterceptors(CachePublicoInterceptor)
export class CategoriasController {
  constructor(private readonly categoriasService: CategoriasService) {}

  @Get()
  findAll() {
    return this.categoriasService.findAll();
  }
}
