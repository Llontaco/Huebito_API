import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  // El id_token que devuelve el SDK de Google (Google Identity Services en
  // web, o el plugin nativo de Google Sign-In en Capacitor). La API lo
  // verifica contra Google — nunca confiar en datos de usuario mandados
  // "sueltos" desde el cliente (nombre, email, foto, etc.).
  @IsString()
  @MinLength(20)
  idToken: string;
}
