import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as jsonwebtoken from 'jsonwebtoken';
import { crearApp, simularGoogle, idTokenDe, ENV_PRUEBA } from './helpers/crear-app';
import { FakePrisma } from './helpers/fake-prisma';

// Pruebas de integración: la API Nest completa (rutas, ValidationPipe, guards
// JWT, cookies, throttler, helmet, CORS) contra una base en memoria.

const ANA = { sub: 'g-ana', email: 'ana@gmail.com', name: 'Ana Pérez' };
const LUIS = { sub: 'g-luis', email: 'luis@gmail.com', name: 'Luis Rojas' };
const SIN_VERIFICAR = { sub: 'g-sin-verificar', email: 'x@gmail.com', name: 'X', email_verified: false };

function cookieRefresh(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith('refresh_token='));
}
const soloValor = (cookie: string) => cookie.split(';')[0];

describe('API Huebito (integración)', () => {
  let app: INestApplication;
  let prisma: FakePrisma;
  let srv: any;

  const entrar = (c: { sub: string } = ANA) =>
    request(srv).post('/auth/google').send({ idToken: idTokenDe(c) });

  beforeEach(async () => {
    simularGoogle([ANA, LUIS, SIN_VERIFICAR]);
    ({ app, prisma } = await crearApp());
    srv = app.getHttpServer();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe('endpoints públicos', () => {
    it('GET /health responde ok', async () => {
      const res = await request(srv).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /categorias lista las categorías ordenadas', async () => {
      const res = await request(srv).get('/categorias').expect(200);
      expect(res.body.map((c) => c.slug)).toEqual(['bebidas', 'desayunos']);
    });

    it('GET /recetas pagina y nunca incluye el binario de la foto', async () => {
      const res = await request(srv).get('/recetas?limit=2').expect(200);
      expect(res.body).toMatchObject({ total: 3, page: 1, limit: 2 });
      expect(res.body.items).toHaveLength(2);
      for (const r of res.body.items) expect(r).not.toHaveProperty('imagenDatos');
    });

    it('filtra por categoría y por momento del día', async () => {
      const res = await request(srv).get('/recetas?categoriaId=3&momento=desayuno').expect(200);
      expect(res.body.items.map((r) => r.nombre)).toEqual(['Café americano']);
    });

    it('busca por nombre sin importar mayúsculas', async () => {
      const res = await request(srv).get('/recetas?q=CHICHA').expect(200);
      expect(res.body.items.map((r) => r.nombre)).toEqual(['Chicha morada']);
    });

    it('GET /recetas/:id devuelve la receta con su categoría y su video', async () => {
      const res = await request(srv).get('/recetas/1').expect(200);
      expect(res.body).toMatchObject({
        nombre: 'Pan con palta',
        videoUrl: 'https://www.youtube.com/watch?v=abc',
        categoria: { slug: 'desayunos' },
      });
    });

    it('GET /recetas/:id/imagen sirve los bytes con caché larga', async () => {
      const res = await request(srv).get('/recetas/2/imagen').expect(200);
      expect(res.headers['content-type']).toBe('image/jpeg');
      expect(res.headers['cache-control']).toContain('max-age=31536000');
      expect(res.body.length).toBe(3);
    });

    it('404 para recetas o fotos que no existen', async () => {
      await request(srv).get('/recetas/999').expect(404);
      await request(srv).get('/recetas/1/imagen').expect(404);
    });
  });

  describe('validación de entradas', () => {
    it.each([
      ['/recetas?limit=500', 'limit mayor que 100'],
      ['/recetas?limit=0', 'limit cero'],
      ['/recetas?categoriaId=abc', 'categoriaId no numérico'],
      ['/recetas?momento=madrugada', 'momento desconocido'],
      ['/recetas?q=' + 'a'.repeat(101), 'búsqueda demasiado larga'],
      ['/recetas?campoRaro=1', 'parámetro no declarado'],
      ['/recetas/abc', 'id no numérico'],
    ])('400 para %s (%s)', async (ruta) => {
      await request(srv).get(ruta).expect(400);
    });

    it('rechaza campos extra en el cuerpo (forbidNonWhitelisted)', async () => {
      await request(srv).post('/auth/google').send({ idToken: idTokenDe(ANA), esAdmin: true }).expect(400);
    });

    it('rechaza un id_token demasiado corto sin llamar a Google', async () => {
      await request(srv).post('/auth/google').send({ idToken: 'corto' }).expect(400);
    });

    it('una búsqueda con caracteres de SQL se trata como texto', async () => {
      const res = await request(srv).get("/recetas?q=' OR 1=1 --").expect(200);
      expect(res.body.items).toEqual([]);
    });
  });

  describe('login con Google y sesión', () => {
    it('crea el usuario la primera vez y devuelve tokens + cookie httpOnly', async () => {
      const res = await entrar().expect(200);

      expect(res.body.usuario).toMatchObject({ nombre: 'Ana Pérez', email: 'ana@gmail.com' });
      expect(res.body.usuario).not.toHaveProperty('googleId');
      expect(res.body.accessToken).toBeTruthy();
      const cookie = cookieRefresh(res);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/auth/);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(prisma._db.usuarios).toHaveLength(1);
    });

    it('la segunda vez reutiliza el mismo usuario', async () => {
      await entrar().expect(200);
      await entrar().expect(200);
      expect(prisma._db.usuarios).toHaveLength(1);
    });

    it('rechaza un token que Google no reconoce y cuentas sin verificar', async () => {
      await entrar({ sub: 'desconocido' }).expect(401);
      await entrar(SIN_VERIFICAR).expect(401);
      expect(prisma._db.usuarios).toHaveLength(0);
    });

    it('GET /users/me exige un access token válido', async () => {
      const { body } = await entrar().expect(200);

      const yo = await request(srv).get('/users/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
      expect(yo.body.email).toBe('ana@gmail.com');
      expect(yo.body).not.toHaveProperty('googleId');

      await request(srv).get('/users/me').expect(401);
      await request(srv).get('/users/me').set('Authorization', 'Bearer basura').expect(401);
    });

    it('rechaza tokens firmados con otro secreto, sin firma o vencidos', async () => {
      const { body } = await entrar().expect(200);
      const id = body.usuario.id;
      const falsos = [
        jsonwebtoken.sign({ sub: id, email: 'ana@gmail.com' }, 'otro-secreto-cualquiera-de-32-caracteres!!'),
        jsonwebtoken.sign({ sub: id, email: 'ana@gmail.com' }, null as any, { algorithm: 'none' }),
        jsonwebtoken.sign(
          { sub: id, email: 'ana@gmail.com', exp: Math.floor(Date.now() / 1000) - 60 },
          ENV_PRUEBA.JWT_ACCESS_SECRET,
        ),
      ];
      for (const t of falsos) {
        await request(srv).get('/users/me').set('Authorization', `Bearer ${t}`).expect(401);
      }
    });

    it('refresh con la cookie rota el token y el viejo deja de servir', async () => {
      const cookie1 = soloValor(cookieRefresh(await entrar().expect(200)));

      const r1 = await request(srv).post('/auth/refresh').set('Cookie', cookie1).expect(200);
      const cookie2 = soloValor(cookieRefresh(r1));
      expect(cookie2).not.toBe(cookie1);
      await request(srv).get('/users/me').set('Authorization', `Bearer ${r1.body.accessToken}`).expect(200);

      // El token viejo ya no se acepta...
      await request(srv).post('/auth/refresh').set('Cookie', cookie1).expect(401);
      // ...pero fue dentro del margen de carrera: la sesión nueva sigue viva.
      await request(srv).post('/auth/refresh').set('Cookie', cookie2).expect(200);
    });

    it('reusar un token viejo pasado el margen revoca todas las sesiones', async () => {
      const cookie1 = soloValor(cookieRefresh(await entrar().expect(200)));
      const r1 = await request(srv).post('/auth/refresh').set('Cookie', cookie1).expect(200);
      const cookie2 = soloValor(cookieRefresh(r1));

      // Simula que el token viejo se rotó hace 1 minuto.
      const viejo = prisma._db.refreshTokens.find((t) => t.replacedByTokenHash);
      viejo.revokedAt = new Date(Date.now() - 60_000);

      await request(srv).post('/auth/refresh').set('Cookie', cookie1).expect(401);
      await request(srv).post('/auth/refresh').set('Cookie', cookie2).expect(401);
    });

    it('dos refresh simultáneos con el mismo token: uno gana y la sesión no se pierde', async () => {
      const cookie = soloValor(cookieRefresh(await entrar().expect(200)));

      const [a, b] = await Promise.all([
        request(srv).post('/auth/refresh').set('Cookie', cookie),
        request(srv).post('/auth/refresh').set('Cookie', cookie),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);

      const ganador = a.status === 200 ? a : b;
      await request(srv).post('/auth/refresh').set('Cookie', soloValor(cookieRefresh(ganador))).expect(200);
    });

    it('el refresh token también se acepta en el cuerpo (app móvil)', async () => {
      const login = await entrar().expect(200);
      await request(srv).post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
    });

    it('sin refresh token responde 401', async () => {
      await request(srv).post('/auth/refresh').expect(401);
    });

    it('logout revoca el token y borra la cookie', async () => {
      const cookie = soloValor(cookieRefresh(await entrar().expect(200)));

      const out = await request(srv).post('/auth/logout').set('Cookie', cookie).expect(204);
      expect(cookieRefresh(out)).toMatch(/^refresh_token=;/);
      await request(srv).post('/auth/refresh').set('Cookie', cookie).expect(401);
    });

    it('logout-all cierra todas las sesiones del usuario', async () => {
      const a = await entrar().expect(200);
      const b = await entrar().expect(200);

      await request(srv).post('/auth/logout-all').set('Authorization', `Bearer ${a.body.accessToken}`).expect(204);
      await request(srv).post('/auth/refresh').set('Cookie', soloValor(cookieRefresh(b))).expect(401);
    });
  });

  describe('favoritos e historial', () => {
    const auth = async (c = ANA) => ({ Authorization: `Bearer ${(await entrar(c).expect(200)).body.accessToken}` });

    it('exigen sesión', async () => {
      await request(srv).get('/favoritos').expect(401);
      await request(srv).post('/favoritos').send({ recetaId: 1 }).expect(401);
      await request(srv).delete('/favoritos/1').expect(401);
      await request(srv).get('/historial').expect(401);
      await request(srv).post('/historial').send({ recetaId: 1 }).expect(401);
    });

    it('guardar, listar, duplicar y borrar un favorito', async () => {
      const a = await auth();

      await request(srv).post('/favoritos').set(a).send({ recetaId: 1 }).expect(201);
      await request(srv).post('/favoritos').set(a).send({ recetaId: 1 }).expect(409);
      await request(srv).post('/favoritos').set(a).send({ recetaId: 999 }).expect(404);
      await request(srv).post('/favoritos').set(a).send({ recetaId: 'uno' }).expect(400);
      await request(srv).post('/favoritos').set(a).send({ recetaId: -1 }).expect(400);

      const lista = await request(srv).get('/favoritos').set(a).expect(200);
      expect(lista.body).toHaveLength(1);
      expect(lista.body[0].receta.nombre).toBe('Pan con palta');
      expect(lista.body[0].receta).not.toHaveProperty('imagenDatos');

      await request(srv).delete('/favoritos/1').set(a).expect(204);
      await request(srv).delete('/favoritos/1').set(a).expect(404);
    });

    it('un usuario no ve ni borra los favoritos de otro', async () => {
      const ana = await auth(ANA);
      const luis = await auth(LUIS);

      await request(srv).post('/favoritos').set(ana).send({ recetaId: 2 }).expect(201);

      expect((await request(srv).get('/favoritos').set(luis).expect(200)).body).toEqual([]);
      await request(srv).delete('/favoritos/2').set(luis).expect(404);
      expect((await request(srv).get('/favoritos').set(ana).expect(200)).body).toHaveLength(1);
    });

    it('el historial guarda las visitas, la más reciente primero', async () => {
      const a = await auth();

      await request(srv).post('/historial').set(a).send({ recetaId: 1 }).expect(201);
      await new Promise((r) => setTimeout(r, 5));
      await request(srv).post('/historial').set(a).send({ recetaId: 3 }).expect(201);
      await request(srv).post('/historial').set(a).send({ recetaId: 999 }).expect(404);

      const res = await request(srv).get('/historial').set(a).expect(200);
      expect(res.body.map((h) => h.receta.nombre)).toEqual(['Café americano', 'Pan con palta']);
    });
  });

  describe('seguridad HTTP', () => {
    it('manda las cabeceras de helmet y oculta la tecnología', async () => {
      const res = await request(srv).get('/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS solo autoriza los orígenes configurados', async () => {
      const ok = await request(srv).get('/health').set('Origin', 'http://localhost:5173');
      expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(ok.headers['access-control-allow-credentials']).toBe('true');

      const malo = await request(srv).get('/health').set('Origin', 'https://sitio-malicioso.com');
      expect(malo.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('limita los intentos de login (10 por minuto)', async () => {
      const estados: number[] = [];
      for (let i = 0; i < 12; i++) estados.push((await entrar({ sub: 'desconocido' })).status);
      expect(estados.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(estados.slice(10)).toEqual([429, 429]);
    });

    it('un error inesperado no expone detalles internos', async () => {
      prisma.categoria.findMany = async () => {
        throw new Error('connect ECONNREFUSED db.neon.tech:5432 tabla categorias');
      };
      const res = await request(srv).get('/categorias').expect(500);
      expect(JSON.stringify(res.body)).not.toMatch(/neon|ECONNREFUSED|categorias/);
    });
  });
});
