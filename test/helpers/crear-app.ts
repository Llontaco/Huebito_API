import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OAuth2Client } from 'google-auth-library';
import { crearFakePrisma, FakePrisma } from './fake-prisma';

// Variables que la app valida al arrancar. Se fijan ANTES de importar el
// AppModule: Prisma carga el .env al importarse, pero dotenv no pisa lo que ya
// está en process.env, así que las pruebas nunca usan los secretos reales.
export const ENV_PRUEBA = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://prueba:prueba@localhost:5432/prueba',
  CORS_ORIGINS: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'secreto-de-pruebas-de-integracion-0123456789abcdef',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN_DAYS: '30',
  GOOGLE_CLIENT_ID: 'cliente-de-prueba.apps.googleusercontent.com',
  COOKIE_PATH: '/auth',
  COOKIE_DOMAIN: '',
  ANTHROPIC_API_KEY: '',
};
Object.assign(process.env, ENV_PRUEBA);

/* eslint-disable @typescript-eslint/no-var-requires */
const { AppModule } = require('../../src/app.module');
const { PrismaService } = require('../../src/prisma/prisma.service');
const { configurarApp } = require('../../src/setup-app');
/* eslint-enable @typescript-eslint/no-var-requires */

export interface CuentaGoogle {
  sub: string;
  email: string;
  name?: string;
  email_verified?: boolean;
}

// Simula a Google: el "id_token" de prueba es "google:<sub>----..." (el DTO
// exige 20 caracteres, los guiones son relleno) y el espía de verifyIdToken
// devuelve la cuenta registrada para ese sub.
export const idTokenDe = (c: { sub: string }) => `google:${c.sub}${'-'.repeat(20)}`;

export function simularGoogle(cuentas: CuentaGoogle[]) {
  return jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockImplementation(async (opts: any) => {
    const sub = String(opts.idToken).replace(/^google:/, '').replace(/-+$/, '');
    const cuenta = cuentas.find((c) => c.sub === sub);
    if (!cuenta || opts.audience !== ENV_PRUEBA.GOOGLE_CLIENT_ID) throw new Error('Invalid token');
    return { getPayload: () => ({ email_verified: true, ...cuenta }) } as any;
  });
}

export async function crearApp(): Promise<{ app: INestApplication; prisma: FakePrisma }> {
  const prisma = crearFakePrisma();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = modulo.createNestApplication({ logger: false });
  configurarApp(app);
  await app.init();
  return { app, prisma };
}
