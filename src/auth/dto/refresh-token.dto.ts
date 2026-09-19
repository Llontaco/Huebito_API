import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  // Opcional: si el cliente es la app móvil (Capacitor) y no puede depender
  // de la cookie httpOnly, manda el refresh token en el body. El cliente
  // web normalmente lo trae solo en la cookie.
  @IsOptional()
  @IsString()
  @MinLength(20)
  refreshToken?: string;
}
