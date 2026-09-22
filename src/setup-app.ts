import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

// Middleware, CORS y pipes de la API. Vive aparte de main.ts porque hay dos
// formas de arrancar la misma app y tienen que quedar configuradas igual:
//
//   - main.ts        -> servidor de siempre (npm run start), escucha un puerto
//   - api/index.ts   -> función serverless de Vercel, no escucha nada
//
// Si esto estuviera duplicado en los dos, cualquier cambio de seguridad
// (helmet, CORS, whitelist del ValidationPipe) se aplicaría en local y se
// olvidaría en producción, que es justo donde importa.
export function configurarApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Detrás de un proxy/CDN (Vercel, Render, nginx...) esto hace que req.ip y
  // X-Forwarded-Proto se lean bien: lo necesita el rate limiter para no ver
  // todas las peticiones como si vinieran de la misma IP, y las cookies
  // "secure" para no romperse.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(
    helmet({
      // Por defecto helmet manda Cross-Origin-Resource-Policy: same-origin,
      // y eso impide que el navegador renderice las imágenes de las recetas
      // cuando el front corre en otro dominio que la API. El endpoint
      // GET /recetas/:id/imagen es público y de solo lectura, así que se
      // permite embeberlo desde otros orígenes.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());

  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true, // necesario para que viaje la cookie de refresh token
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta cualquier campo no declarado en el DTO
      forbidNonWhitelisted: true, // y rechaza la petición si vino uno
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
