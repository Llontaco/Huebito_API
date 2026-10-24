import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Usuario } from '@prisma/client';

export interface RequestMeta {
  userAgent?: string;
  ip?: string;
}

// Ventana en la que un refresh token recién rotado se considera "carrera" del
// mismo cliente y no un reuso malicioso.
export const GRACIA_ROTACION_MS = 30_000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.config.get<string>('GOOGLE_CLIENT_ID'),
    );
  }

  /**
   * Verifica el id_token de Google server-side. Nunca confiar en datos de
   * usuario (nombre/email/foto) mandados directamente por el cliente:
   * todo sale de este payload firmado y verificado por Google.
   */
  private async verifyGoogleIdToken(idToken: string) {
    let ticket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.config.get<string>('GOOGLE_CLIENT_ID'),
      });
    } catch (err) {
      this.logger.warn(`Google id_token inválido: ${(err as Error).message}`);
      throw new UnauthorizedException('Token de Google inválido');
    }

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Token de Google inválido');
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException(
        'El email de la cuenta de Google no está verificado',
      );
    }
    return payload;
  }

  async loginWithGoogle(
    idToken: string,
    meta: RequestMeta,
  ): Promise<{
    usuario: Usuario;
    tokens: TokenPair;
  }> {
    const payload = await this.verifyGoogleIdToken(idToken);

    let usuario = await this.prisma.usuario.findUnique({
      where: { googleId: payload.sub },
    });

    if (!usuario) {
      // Puede existir ya un usuario con ese email (p.ej. de una migración
      // futura de cuentas con password). Si existe, vinculamos la cuenta de
      // Google en vez de crear un usuario duplicado.
      const existingByEmail = await this.prisma.usuario.findUnique({
        where: { email: payload.email },
      });

      usuario = existingByEmail
        ? await this.prisma.usuario.update({
            where: { id: existingByEmail.id },
            data: {
              googleId: payload.sub,
              fotoUrl: payload.picture ?? existingByEmail.fotoUrl,
            },
          })
        : await this.prisma.usuario.create({
            data: {
              nombre: payload.name ?? payload.email.split('@')[0],
              email: payload.email,
              googleId: payload.sub,
              fotoUrl: payload.picture,
            },
          });
    }

    const tokens = await this.issueTokenPair(usuario, meta);
    return { usuario, tokens };
  }

  private signAccessToken(usuario: Pick<Usuario, 'id' | 'email'>): string {
    return this.jwt.sign(
      { sub: usuario.id, email: usuario.email },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
      },
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokenPair(
    usuario: Usuario,
    meta: RequestMeta,
    replacesTokenId?: string,
  ): Promise<TokenPair> {
    const accessToken = this.signAccessToken(usuario);

    const refreshToken = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const days = Number(this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS')) || 30;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 255),
        ip: meta.ip,
      },
    });

    if (replacesTokenId) {
      await this.prisma.refreshToken.update({
        where: { id: replacesTokenId },
        data: { replacedByTokenHash: tokenHash },
      });
    }

    return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
  }

  /**
   * Rotación de refresh tokens con detección de reuso: cada refresh token es
   * de un solo uso. Si alguien intenta reusar uno ya rotado (p.ej. porque fue
   * robado y tanto el atacante como el usuario legítimo lo usan), se
   * interpreta como señal de robo y se revocan TODAS las sesiones del
   * usuario, forzando volver a loguearse.
   */
  async refresh(plainToken: string, meta: RequestMeta): Promise<TokenPair> {
    const tokenHash = this.hashToken(plainToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { usuario: true },
    });

    if (!record) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (record.revokedAt) {
      await this.manejarTokenYaUsado(record);
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }

    // Marca este token como usado antes de emitir el nuevo (rotación). Es un
    // updateMany condicionado a revokedAt = null para que sea atómico: si dos
    // peticiones llegan a la vez con el mismo token, solo una lo "gana".
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new UnauthorizedException('Refresh token ya utilizado');
    }

    return this.issueTokenPair(record.usuario, meta, record.id);
  }

  /**
   * Un token ya revocado puede volver por dos motivos:
   *  - carrera legítima: el mismo cliente pidió dos refresh casi a la vez
   *    (dos pestañas, o React en modo estricto). El token se rotó hace un
   *    instante; se rechaza la petición sin castigar al usuario.
   *  - reuso real: alguien guardó un token viejo y lo reintenta. Señal de
   *    robo: se revocan todas las sesiones del usuario.
   */
  private async manejarTokenYaUsado(record: {
    usuarioId: number;
    revokedAt: Date | null;
    replacedByTokenHash: string | null;
  }): Promise<never> {
    const msDesdeRotacion = Date.now() - (record.revokedAt?.getTime() ?? 0);
    const esCarrera =
      !!record.replacedByTokenHash && msDesdeRotacion < GRACIA_ROTACION_MS;

    if (!esCarrera) {
      this.logger.warn(
        `Posible reuso de refresh token revocado (usuario ${record.usuarioId}) — revocando todas sus sesiones`,
      );
      await this.revokeAllForUser(record.usuarioId);
    }
    throw new UnauthorizedException('Refresh token inválido o expirado');
  }

  async logout(plainToken: string): Promise<void> {
    const tokenHash = this.hashToken(plainToken);
    // No revelamos si el token existía o no (evita enumerar sesiones válidas).
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async revokeAllForUser(usuarioId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
