import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindRecetasDto } from './dto/find-recetas.dto';

// La columna imagen_datos guarda el binario de la foto. NUNCA debe viajar en
// las respuestas JSON: serializarla metería unos 40 KB en base64 por receta,
// o sea varios MB en un listado de 100. Se excluye con `omit` y se sirve
// aparte, en crudo, por GET /recetas/:id/imagen.
const SIN_BINARIO = { imagenDatos: true } as const;

@Injectable()
export class RecetasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindRecetasDto) {
    const limit = Math.min(query.limit ?? 20, 100);
    const page = Math.max(query.page ?? 1, 1);

    const where: Prisma.RecetaWhereInput = {
      ...(query.categoriaId ? { categoriaId: query.categoriaId } : {}),
      ...(query.q
        ? { nombre: { contains: query.q, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.receta.findMany({
        where,
        omit: SIN_BINARIO,
        include: { categoria: true },
        orderBy: { nombre: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.receta.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: number) {
    const receta = await this.prisma.receta.findUnique({
      where: { id },
      omit: SIN_BINARIO,
      include: { categoria: true },
    });
    if (!receta) {
      throw new NotFoundException('Receta no encontrada');
    }
    return receta;
  }

  // Devuelve solo el binario y su tipo, para el endpoint que responde bytes
  // en lugar de JSON.
  async findImagen(id: number) {
    const receta = await this.prisma.receta.findUnique({
      where: { id },
      select: { imagenDatos: true, imagenMime: true },
    });

    if (!receta?.imagenDatos) {
      throw new NotFoundException('Esta receta no tiene imagen');
    }

    return {
      datos: Buffer.from(receta.imagenDatos),
      mime: receta.imagenMime ?? 'image/webp',
    };
  }
}
