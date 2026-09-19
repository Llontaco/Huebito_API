import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Si vas detrás de un proxy/CDN (Render, Railway, Fly, nginx, etc.),
    // esto hace que req.ip y el header X-Forwarded-Proto se lean bien —
    // importante para el rate limiter y para que las cookies "secure" y
    // los redirects funcionen correctamente.
    logger: ['error', 'warn', 'log'],
  });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const config = app.get(ConfigService);

  app.use(helmet());
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

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  Logger.log(`API escuchando en http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
