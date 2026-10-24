import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  const prisma = { usuario: { findUnique: jest.fn() } };
  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('devuelve el perfil sin el googleId', async () => {
    prisma.usuario.findUnique.mockResolvedValue({ id: 1, nombre: 'Ana' });
    await service.findProfile(1);

    const { select } = prisma.usuario.findUnique.mock.calls[0][0];
    expect(select).toEqual({
      id: true,
      nombre: true,
      email: true,
      fotoUrl: true,
      fechaRegistro: true,
    });
    expect(select.googleId).toBeUndefined();
  });

  it('responde 404 si el usuario ya no existe', async () => {
    prisma.usuario.findUnique.mockResolvedValue(null);
    await expect(service.findProfile(1)).rejects.toThrow(NotFoundException);
  });
});
