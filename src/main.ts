import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configurarApp } from './setup-app';

// Arranque como servidor de siempre: escucha un puerto y se queda vivo.
// En Vercel no se usa este archivo, sino api/index.ts (función serverless);
// los dos comparten configurarApp() para no divergir.
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  configurarApp(app);

  const port = app.get(ConfigService).get<number>('PORT') ?? 3000;
  await app.listen(port);
  Logger.log(`API escuchando en http://localhost:${port}`, 'Bootstrap');
}
bootstrap();
