import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/setup-app';

// Punto de entrada para Vercel. A diferencia de main.ts, acá la app NO escucha
// un puerto: Vercel invoca esta función por cada petición y nosotros le
// pasamos el request al Express que Nest tiene por dentro.

// Vercel reutiliza el mismo contenedor entre peticiones seguidas ("warm"), así
// que arrancamos Nest una sola vez y lo guardamos. Guardamos la PROMESA, no la
// app ya resuelta: si llegan dos peticiones juntas durante el arranque en frío,
// las dos esperan el mismo bootstrap en vez de lanzar uno cada una (lo que
// abriría dos pools de conexiones a Neon).
let appCacheada: Promise<express.Express> | null = null;

async function crearApp(): Promise<express.Express> {
  const servidorExpress = express();

  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(servidorExpress),
    // En serverless los logs van a los del deployment de Vercel; dejamos solo
    // lo relevante para no llenarlos con una línea por arranque en frío.
    { logger: ['error', 'warn'] },
  );

  configurarApp(app);

  // init() en vez de listen(): monta rutas, guards y pipes pero no abre socket.
  await app.init();

  return servidorExpress;
}

export default async function handler(req: Request, res: Response) {
  if (!appCacheada) {
    appCacheada = crearApp().catch((error) => {
      // Si el arranque falla (p.ej. falta una variable de entorno y Joi la
      // rechaza) hay que limpiar la caché, o el contenedor queda envenenado
      // devolviendo el mismo error hasta que Vercel lo recicle.
      appCacheada = null;
      throw error;
    });
  }

  const servidorExpress = await appCacheada;
  servidorExpress(req, res);
}
