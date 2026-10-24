import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FavoritosService } from './favoritos.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FavoritosService', () => {
  const prisma = {
    receta: { findUnique: jest.fn() },
    favorito: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new FavoritosService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('lista solo los favoritos del usuario del token', async () => {
    prisma.favorito.findMany.mockResolvedValue([]);
    await service.findAllForUser(4);
    expect(prisma.favorito.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuarioId: 4 } }),
    );
  });

  it('guarda un favorito de una receta existente', async () => {
    prisma.receta.findUnique.mockResolvedValue({ id: 10 });
    prisma.favorito.create.mockResolvedValue({ usuarioId: 4, recetaId: 10 });

    await expect(service.create(4, 10)).resolves.toEqual({ usuarioId: 4, recetaId: 10 });
  });

  it('responde 404 si la receta no existe', async () => {
    prisma.receta.findUnique.mockResolvedValue(null);
    await expect(service.create(4, 999)).rejects.toThrow(NotFoundException);
    expect(prisma.favorito.create).not.toHaveBeenCalled();
  });

  it('responde 409 si ya estaba en favoritos', async () => {
    prisma.receta.findUnique.mockResolvedValue({ id: 10 });
    prisma.favorito.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicado', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(service.create(4, 10)).rejects.toThrow(ConflictException);
  });

  it('propaga cualquier otro error de la base', async () => {
    prisma.receta.findUnique.mockResolvedValue({ id: 10 });
    prisma.favorito.create.mockRejectedValue(new Error('se cayó la base'));
    await expect(service.create(4, 10)).rejects.toThrow('se cayó la base');
  });

  it('al borrar, filtra por usuario: nunca toca favoritos ajenos', async () => {
    prisma.favorito.deleteMany.mockResolvedValue({ count: 1 });
    await service.remove(4, 10);
    expect(prisma.favorito.deleteMany).toHaveBeenCalledWith({
      where: { usuarioId: 4, recetaId: 10 },
    });
  });

  it('responde 404 al borrar un favorito que no existe', async () => {
    prisma.favorito.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(4, 10)).rejects.toThrow(NotFoundException);
  });
});
