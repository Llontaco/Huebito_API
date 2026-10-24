import { NotFoundException } from '@nestjs/common';
import { HistorialService } from './historial.service';
import { PrismaService } from '../prisma/prisma.service';

describe('HistorialService', () => {
  const prisma = {
    receta: { findUnique: jest.fn() },
    historial: { findMany: jest.fn(), create: jest.fn() },
  };
  const service = new HistorialService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('devuelve como máximo las 50 visitas más recientes del usuario', async () => {
    prisma.historial.findMany.mockResolvedValue([]);
    await service.findAllForUser(2);
    expect(prisma.historial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: 2 },
        orderBy: { fecha: 'desc' },
        take: 50,
      }),
    );
  });

  it('registra una visita a una receta existente', async () => {
    prisma.receta.findUnique.mockResolvedValue({ id: 3 });
    prisma.historial.create.mockResolvedValue({ id: 1 });
    await service.create(2, 3);
    expect(prisma.historial.create).toHaveBeenCalledWith({
      data: { usuarioId: 2, recetaId: 3 },
    });
  });

  it('responde 404 si la receta no existe', async () => {
    prisma.receta.findUnique.mockResolvedValue(null);
    await expect(service.create(2, 999)).rejects.toThrow(NotFoundException);
  });
});
