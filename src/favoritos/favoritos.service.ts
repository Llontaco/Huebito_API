import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class FavoritosService {
  constructor(private readonly prisma: PrismaService) {}

  // Siempre filtrado por usuarioId del token — nunca por un id recibido del
  // cliente, para que un usuario jamás pueda leer/borrar favoritos ajenos.
  findAllForUser(usuarioId: number) {
    return this.prisma.favorito.findMany({
      where: { usuarioId },
      include: { receta: { include: { categoria: true } } },
      orderBy: { fechaGuardado: 'desc' },
    });
  }

  async create(usuarioId: number, recetaId: number) {
    const receta = await this.prisma.receta.findUnique({
      where: { id: recetaId },
    });
    if (!receta) {
      throw new NotFoundException('Receta no encontrada');
    }
    try {
      return await this.prisma.favorito.create({
        data: { usuarioId, recetaId },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Ya está en favoritos');
      }
      throw err;
    }
  }

  async remove(usuarioId: number, recetaId: number) {
    const result = await this.prisma.favorito.deleteMany({
      where: { usuarioId, recetaId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Favorito no encontrado');
    }
  }
}
