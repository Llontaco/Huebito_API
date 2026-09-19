# Huevito API

API en NestJS que expone las recetas, categorías, favoritos e historial ya
existentes en la base de datos Neon (Postgres) del proyecto [Huebito_JS](../Huebito_JS),
con autenticación vía **Google Sign-In** + JWT propio (access + refresh).

## Stack

- NestJS 10 + TypeScript
- Prisma como ORM, contra Neon (Postgres serverless)
- Passport JWT para proteger rutas
- `google-auth-library` para verificar el `id_token` de Google server-side

## Requisitos

- Node.js 20+
- Un proyecto en [Neon](https://neon.tech) con el schema de `Huebito_JS/database/schema.sql` ya aplicado
- Un **OAuth Client ID** de Google (tipo *Web application*) desde [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

## Setup

```bash
npm install
cp .env.example .env
# completa DATABASE_URL, JWT_ACCESS_SECRET, GOOGLE_CLIENT_ID, CORS_ORIGINS...
npx prisma generate

# Si el proyecto de Neon está vacío (sin las tablas todavía), esto crea las
# 6 tablas (las 5 de Huebito_JS/database/schema.sql + refresh_tokens) a
# partir de prisma/schema.prisma, que las replica 1:1:
npx prisma migrate dev --name init

npm run start:dev
```

Para cargar los datos semilla (2 categorías, 38 recetas) una vez creadas las
tablas, corre contra Neon el archivo
`../Huebito_JS/database/seed-sql/insertar-datos.sql` (por ejemplo con `psql
$DATABASE_URL -f ...` o pegándolo en el SQL editor de Neon).

Si las tablas **ya existen** en Neon (creadas antes a mano con `schema.sql`),
usa en cambio `npx prisma db pull` para confirmar que coincide con
`prisma/schema.prisma`, y solo corre una migración para agregar la tabla
nueva `refresh_tokens`.

Genera un `JWT_ACCESS_SECRET` fuerte con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Modelo de datos

Las tablas `categorias`, `recetas`, `usuarios`, `favoritos` e `historial` son
las que ya existen en Neon (ver `prisma/schema.prisma`, mapeado 1:1 vía
`@@map`/`@map`). La única tabla nueva que agrega esta API es
`refresh_tokens`, necesaria para poder revocar sesiones — **solo guarda el
hash SHA-256** del token, nunca el valor en claro.

## Autenticación con Google

Flujo recomendado (funciona igual para la web con Vite y para la app móvil
vía Capacitor):

1. El **cliente** (web o app) hace el login con el SDK de Google (Google
   Identity Services en web, o el plugin nativo de Google Sign-In en
   Capacitor) y obtiene un `id_token`.
2. El cliente manda ese `id_token` a `POST /auth/google`.
3. La API verifica el token contra los servidores de Google (audiencia =
   `GOOGLE_CLIENT_ID`, firma, expiración, `email_verified`), busca o crea el
   `usuario` por `google_id`, y devuelve:
   - `accessToken`: JWT de vida corta (15 min por defecto) — se manda en
     `Authorization: Bearer <token>` en cada request protegido.
   - `refreshToken`: se setea como cookie **httpOnly** (`refresh_token`,
     path `/auth`) y también se devuelve en el body para que la app móvil lo
     guarde en almacenamiento seguro del dispositivo (nunca en
     `localStorage`).
4. Cuando el access token expira, `POST /auth/refresh` (con la cookie, o con
   `{ refreshToken }` en el body) rota el refresh token y devuelve un access
   token nuevo. Cada refresh token es de un solo uso; si se detecta que uno
   ya usado se intenta reusar, se revocan **todas** las sesiones de ese
   usuario (protección contra robo de tokens).
5. `POST /auth/logout` revoca el refresh token actual. `POST /auth/logout-all`
   (requiere estar autenticado) revoca todas las sesiones del usuario.

La API **nunca** confía en nombre/email/foto mandados directamente por el
cliente — todo sale del `id_token` verificado.

## Endpoints

| Método | Ruta                 | Auth | Descripción                              |
|--------|----------------------|------|-------------------------------------------|
| POST   | /auth/google          | No   | Login/registro con Google                 |
| POST   | /auth/refresh          | No*  | Rota refresh token, devuelve access token  |
| POST   | /auth/logout           | No*  | Revoca el refresh token actual             |
| POST   | /auth/logout-all       | Sí   | Revoca todas las sesiones del usuario      |
| GET    | /users/me              | Sí   | Perfil del usuario autenticado             |
| GET    | /categorias            | No   | Lista de categorías                        |
| GET    | /recetas               | No   | Lista de recetas (`?categoriaId&q&page&limit`) |
| GET    | /recetas/:id           | No   | Detalle de una receta                      |
| GET    | /favoritos             | Sí   | Favoritos del usuario autenticado          |
| POST   | /favoritos             | Sí   | Agrega `{ recetaId }` a favoritos          |
| DELETE | /favoritos/:recetaId   | Sí   | Quita una receta de favoritos              |
| GET    | /historial             | Sí   | Últimas recetas vistas (máx. 50)           |
| POST   | /historial             | Sí   | Registra `{ recetaId }` como vista         |
| GET    | /health                | No   | Health check                               |

\* No requiere `Authorization`, pero sí trae un refresh token válido (cookie o body).

## Seguridad — decisiones tomadas

- **Verificación real del token de Google** (`google-auth-library`), chequeando
  audiencia y `email_verified`. Nunca se confía en datos sueltos del cliente.
- **JWT de acceso de vida corta** (15 min) + **refresh token opaco rotable**,
  guardado solo como hash SHA-256 en BD, con **detección de reuso**: si un
  refresh ya usado se reintenta, se cierran todas las sesiones del usuario.
- **Cookies httpOnly** para el refresh token en web (`secure` + `SameSite=None`
  en producción, ya que la API y el frontend viven en dominios distintos).
- **CORS con whitelist explícita** (`CORS_ORIGINS`), no `*`.
- **Rate limiting** global (100 req/min) y más estricto en `/auth/*` vía
  `@nestjs/throttler`.
- **Validación estricta de entrada** (`class-validator` + `whitelist:
  true, forbidNonWhitelisted: true`) — cualquier campo no declarado en el DTO
  hace fallar la petición en vez de ignorarse silenciosamente.
- **Todas las queries van por Prisma** (prepared statements) — sin SQL
  concatenado a mano, cero superficie de SQL injection.
- **Scoping por usuario en cada query** de `favoritos`/`historial`: el
  `usuarioId` sale siempre del JWT (`req.user.id`), nunca de un parámetro de
  la URL o del body — evita IDOR (que un usuario lea/borre datos de otro).
- **Sin fugas de errores**: un filtro global captura cualquier excepción no
  controlada, la loguea completa en el servidor y devuelve al cliente un
  mensaje genérico (nunca un stack trace ni detalles de Prisma/SQL).
- **Helmet** para cabeceras de seguridad HTTP por defecto.
- **Secretos solo por variables de entorno**, validadas al arrancar
  (`src/config/env.validation.ts`) — si falta `JWT_ACCESS_SECRET` o
  `GOOGLE_CLIENT_ID`, la app no levanta.
- **Neon requiere TLS** (`sslmode=require`) — sin esto Neon ni acepta la
  conexión.

### Pendiente / recomendado antes de producción

- Crear en Neon un **rol de BD dedicado** (no el `owner`) con permisos
  mínimos (`SELECT/INSERT/UPDATE/DELETE` solo sobre estas 5-6 tablas) para
  la connection string que use esta API.
- Job periódico (cron) que borre de `refresh_tokens` las filas ya expiradas
  o revocadas hace tiempo.
- Si vas a exponer la API en un dominio propio, ajustar `COOKIE_DOMAIN` y
  confirmar que `CORS_ORIGINS` liste exactamente los orígenes reales (web +
  el scheme de Capacitor).
- Considerar Sentry/logging estructurado para los `error` que hoy solo van a
  stdout.

## Conectar el frontend (Huebito_JS)

El módulo de auth actual de `Huebito_JS` (`src/features/auth/`) es 100%
local (localStorage, sin backend). Cuando esta API esté desplegada, ese
módulo debe reemplazarse por: login con el SDK de Google → `POST
/auth/google` → guardar `accessToken` en memoria (no localStorage) →
mandarlo en cada request → refrescar con `/auth/refresh` cuando expire.
#   H u e b i t o _ A P I  
 