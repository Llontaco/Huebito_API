import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HistorialService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(usuarioId: number) {
    return this.prisma.historial.findMany({
      where: { usuarioId },
      include: { receta: { include: { categoria: true } } },
      orderBy: { fecha: 'desc' },
      take: 50, // últimas 50 vistas, evita respuestas sin límite
    });
  }

  async create(usuarioId: number, recetaId: number) {
    const receta = await this.prisma.receta.findUnique({
      where: { id: recetaId },
    });
    if (!receta) {
      throw new NotFoundException('Receta no encontrada');
    }
    return this.prisma.historial.create({ data: { usuarioId, recetaId } });
  }
}
