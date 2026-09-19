import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  CurrentUser,
  CurrentUserPayload,
} from './decorators/current-user.decorator';

const REFRESH_COOKIE_NAME = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieOptions(): CookieOptions {
    const isProd = this.config.get('NODE_ENV') === 'production';
    const days = Number(this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS')) || 30;
    return {
      httpOnly: true,
      secure: isProd, // en dev local por http permitimos secure:false
      sameSite: isProd ? 'none' : 'lax', // frontend y API viven en dominios distintos
      path: '/auth',
      domain: this.config.get('COOKIE_DOMAIN') || undefined,
      maxAge: days * 24 * 60 * 60 * 1000,
    };
  }

  private meta(req: Request) {
    return { userAgent: req.headers['user-agent'], ip: req.ip };
  }

  // Extrae el refresh token de la cookie httpOnly (web) o, si no vino, del
  // body (clientes móviles vía Capacitor que guardan el token en storage
  // seguro del dispositivo en vez de depender de cookies).
  private extractRefreshToken(req: Request, dto?: RefreshTokenDto): string {
    const fromCookie =
      (req.cookies?.[REFRESH_COOKIE_NAME] as string) || undefined;
    const token = fromCookie || dto?.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Falta el refresh token');
    }
    return token;
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // limita fuerza bruta / abuso
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { usuario, tokens } = await this.authService.loginWithGoogle(
      dto.idToken,
      this.meta(req),
    );

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, this.cookieOptions());

    return {
      accessToken: tokens.accessToken,
      // También se devuelve en el body para la app móvil (Capacitor), que
      // debe guardarlo en almacenamiento seguro del dispositivo, NUNCA en
      // localStorage. El frontend web puede ignorar este campo y confiar
      // solo en la cookie httpOnly.
      refreshToken: tokens.refreshToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        fotoUrl: usuario.fotoUrl,
      },
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractRefreshToken(req, dto);
    const tokens = await this.authService.refresh(token, this.meta(req));

    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, this.cookieOptions());

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const token = fromCookie || dto?.refreshToken;
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logoutAll(
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.revokeAllForUser(user.id);
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/auth' });
  }
}
