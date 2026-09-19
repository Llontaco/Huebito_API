import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindRecetasDto } from './dto/find-recetas.dto';

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
      include: { categoria: true },
    });
    if (!receta) {
      throw new NotFoundException('Receta no encontrada');
    }
    return receta;
  }
}
