import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { createHash } from 'crypto';
import { AuthService, GRACIA_ROTACION_MS } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

const usuario = {
  id: 7,
  nombre: 'Ana Pérez',
  email: 'ana@gmail.com',
  googleId: 'google-sub-1',
  fotoUrl: 'https://foto/ana.jpg',
  fechaRegistro: new Date(),
};

function crearPrismaMock() {
  return {
    usuario: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
  };
}

const config = new ConfigService({
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: 30,
});

function payloadGoogle(extra: Record<string, unknown> = {}) {
  return {
    getPayload: () => ({
      sub: 'google-sub-1',
      email: 'ana@gmail.com',
      email_verified: true,
      name: 'Ana Pérez',
      picture: 'https://foto/ana.jpg',
      ...extra,
    }),
  };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof crearPrismaMock>;
  let service: AuthService;
  let jwt: JwtService;
  let verify: jest.SpyInstance;

  beforeEach(() => {
    prisma = crearPrismaMock();
    jwt = new JwtService();
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwt,
      config,
    );
    verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
  });

  afterEach(() => jest.restoreAllMocks());

  describe('loginWithGoogle', () => {
    it('crea el usuario la primera vez que entra con Google', async () => {
      verify.mockResolvedValue(payloadGoogle());
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue(usuario);

      const { usuario: u, tokens } = await service.loginWithGoogle('tok', {
        userAgent: 'jest',
        ip: '1.1.1.1',
      });

      expect(prisma.usuario.create).toHaveBeenCalledWith({
        data: {
          nombre: 'Ana Pérez',
          email: 'ana@gmail.com',
          googleId: 'google-sub-1',
          fotoUrl: 'https://foto/ana.jpg',
        },
      });
      expect(u.id).toBe(7);
      expect(tokens.refreshToken).toHaveLength(128);
      // Solo se guarda el hash del refresh token, nunca el token en claro.
      const guardado = prisma.refreshToken.create.mock.calls[0][0].data;
      expect(guardado.tokenHash).toBe(hash(tokens.refreshToken));
      expect(guardado.tokenHash).not.toBe(tokens.refreshToken);
    });

    it('reutiliza el usuario existente sin crear otro', async () => {
      verify.mockResolvedValue(payloadGoogle());
      prisma.usuario.findUnique.mockResolvedValueOnce(usuario);

      await service.loginWithGoogle('tok', {});

      expect(prisma.usuario.create).not.toHaveBeenCalled();
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it('vincula Google a una cuenta que ya existía con ese email', async () => {
      verify.mockResolvedValue(payloadGoogle());
      prisma.usuario.findUnique
        .mockResolvedValueOnce(null) // por googleId
        .mockResolvedValueOnce({ ...usuario, googleId: null }); // por email
      prisma.usuario.update.mockResolvedValue(usuario);

      await service.loginWithGoogle('tok', {});

      expect(prisma.usuario.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ googleId: 'google-sub-1' }) }),
      );
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('usa la parte local del email si Google no manda nombre', async () => {
      verify.mockResolvedValue(payloadGoogle({ name: undefined }));
      prisma.usuario.findUnique.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue(usuario);

      await service.loginWithGoogle('tok', {});

      expect(prisma.usuario.create.mock.calls[0][0].data.nombre).toBe('ana');
    });

    it('rechaza un token que Google no valida', async () => {
      verify.mockRejectedValue(new Error('Wrong recipient'));
      await expect(service.loginWithGoogle('tok', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rechaza cuentas con el email sin verificar', async () => {
      verify.mockResolvedValue(payloadGoogle({ email_verified: false }));
      await expect(service.loginWithGoogle('tok', {})).rejects.toThrow(
        'El email de la cuenta de Google no está verificado',
      );
    });

    it('rechaza un payload sin sub o sin email', async () => {
      verify.mockResolvedValue(payloadGoogle({ email: undefined }));
      await expect(service.loginWithGoogle('tok', {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('emite un access token firmado con el id y el email', async () => {
      verify.mockResolvedValue(payloadGoogle());
      prisma.usuario.findUnique.mockResolvedValue(usuario);

      const { tokens } = await service.loginWithGoogle('tok', {});
      // Prisma carga el .env al importarse y process.env manda sobre los
      // valores del ConfigService de prueba: se verifica con el que use el servicio.
      const decodificado = jwt.verify(tokens.accessToken, {
        secret: config.get<string>('JWT_ACCESS_SECRET'),
      });

      expect(decodificado).toMatchObject({ sub: 7, email: 'ana@gmail.com' });
    });

    it('recorta el user-agent a 255 caracteres', async () => {
      verify.mockResolvedValue(payloadGoogle());
      prisma.usuario.findUnique.mockResolvedValue(usuario);

      await service.loginWithGoogle('tok', { userAgent: 'a'.repeat(400) });

      expect(prisma.refreshToken.create.mock.calls[0][0].data.userAgent).toHaveLength(255);
    });
  });

  describe('refresh', () => {
    const vigente = () => ({
      id: 'rt-1',
      usuarioId: 7,
      usuario,
      revokedAt: null,
      replacedByTokenHash: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    it('rota el token: marca el viejo y emite uno nuevo enlazado', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(vigente());

      const nuevo = await service.refresh('token-viejo', {});

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hash('token-viejo') } }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { replacedByTokenHash: hash(nuevo.refreshToken) },
      });
    });

    it('rechaza un token que no existe', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.refresh('x', {})).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza un token vencido sin revocar las demás sesiones', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...vigente(),
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.refresh('x', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('si se reusa un token rotado hace tiempo, revoca todas las sesiones', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...vigente(),
        revokedAt: new Date(Date.now() - GRACIA_ROTACION_MS - 1000),
        replacedByTokenHash: 'otro',
      });

      await expect(service.refresh('x', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { usuarioId: 7, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('si el token se rotó hace un instante (dos pestañas), no castiga al usuario', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...vigente(),
        revokedAt: new Date(Date.now() - 500),
        replacedByTokenHash: 'otro',
      });

      await expect(service.refresh('x', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('un token revocado por logout (sin reemplazo) siempre cuenta como reuso', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...vigente(),
        revokedAt: new Date(Date.now() - 500),
        replacedByTokenHash: null,
      });

      await expect(service.refresh('x', {})).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: 7, revokedAt: null } }),
      );
    });

    it('si otra petición ganó la rotación en paralelo, no emite un segundo token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(vigente());
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('x', {})).rejects.toThrow('Refresh token ya utilizado');
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoca el token por su hash', async () => {
      await service.logout('mi-token');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: hash('mi-token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('no falla si la base da error (no revela si el token existía)', async () => {
      prisma.refreshToken.updateMany.mockRejectedValue(new Error('db'));
      await expect(service.logout('x')).resolves.toBeUndefined();
    });
  });
});
