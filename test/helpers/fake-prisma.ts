import { Prisma } from '@prisma/client';

// Base de datos en memoria con la misma forma que el PrismaClient, pero solo
// con los métodos que usa la API. Sirve para las pruebas de integración: la
// app Nest corre entera (rutas, pipes, guards, JWT, cookies) sin tocar Neon.

type Fila = Record<string, any>;

function coincide(fila: Fila, where: Fila = {}): boolean {
  return Object.entries(where).every(([campo, condicion]) => {
    const valor = fila[campo];
    if (condicion && typeof condicion === 'object' && !(condicion instanceof Date)) {
      if ('has' in condicion) return Array.isArray(valor) && valor.includes(condicion.has);
      if ('contains' in condicion) {
        const a = String(valor ?? '');
        const b = String(condicion.contains);
        return condicion.mode === 'insensitive'
          ? a.toLowerCase().includes(b.toLowerCase())
          : a.includes(b);
      }
    }
    return valor === condicion;
  });
}

function ordenar(filas: Fila[], orderBy?: Fila) {
  if (!orderBy) return filas;
  const [campo, dir] = Object.entries(orderBy)[0];
  return [...filas].sort((a, b) => {
    const r = a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : 0;
    return dir === 'desc' ? -r : r;
  });
}

function sinCampos(fila: Fila, omit?: Fila) {
  if (!fila || !omit) return fila;
  const copia = { ...fila };
  for (const [k, v] of Object.entries(omit)) if (v) delete copia[k];
  return copia;
}

function elegir(fila: Fila, select?: Fila) {
  if (!fila || !select) return fila;
  return Object.fromEntries(Object.keys(select).filter((k) => select[k]).map((k) => [k, fila[k]]));
}

export function crearFakePrisma() {
  const db = {
    categorias: [] as Fila[],
    recetas: [] as Fila[],
    usuarios: [] as Fila[],
    refreshTokens: [] as Fila[],
    favoritos: [] as Fila[],
    historial: [] as Fila[],
  };
  let siguienteId = 1000;
  const nuevoId = () => ++siguienteId;

  const conCategoria = (r: Fila, include?: Fila) =>
    include?.categoria ? { ...r, categoria: db.categorias.find((c) => c.id === r.categoriaId) } : r;
  const conReceta = (f: Fila, include?: Fila) =>
    include?.receta
      ? { ...f, receta: conCategoria(sinCampos(db.recetas.find((r) => r.id === f.recetaId), { imagenDatos: true }), include.receta.include) }
      : f;

  const prisma = {
    _db: db,
    $connect: async () => undefined,
    $disconnect: async () => undefined,
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),

    categoria: {
      findMany: async ({ orderBy }: Fila = {}) => ordenar(db.categorias, orderBy),
    },

    receta: {
      findMany: async ({ where, omit, include, orderBy, skip = 0, take }: Fila = {}) =>
        ordenar(db.recetas.filter((r) => coincide(r, where)), orderBy)
          .slice(skip, take ? skip + take : undefined)
          .map((r) => conCategoria(sinCampos(r, omit), include)),
      count: async ({ where }: Fila = {}) => db.recetas.filter((r) => coincide(r, where)).length,
      findUnique: async ({ where, omit, include, select }: Fila) => {
        const r = db.recetas.find((x) => x.id === where.id);
        if (!r) return null;
        return select ? elegir(r, select) : conCategoria(sinCampos(r, omit), include);
      },
    },

    usuario: {
      findUnique: async ({ where, select }: Fila) =>
        elegir(db.usuarios.find((u) => coincide(u, where)) ?? null, select),
      create: async ({ data }: Fila) => {
        if (db.usuarios.some((u) => u.email === data.email)) {
          throw new Prisma.PrismaClientKnownRequestError('email duplicado', { code: 'P2002', clientVersion: 'fake' });
        }
        const u = { id: nuevoId(), fechaRegistro: new Date(), fotoUrl: null, googleId: null, ...data };
        db.usuarios.push(u);
        return u;
      },
      update: async ({ where, data }: Fila) => {
        const u = db.usuarios.find((x) => x.id === where.id);
        Object.assign(u, data);
        return u;
      },
    },

    refreshToken: {
      create: async ({ data }: Fila) => {
        const t = { id: `rt-${nuevoId()}`, revokedAt: null, replacedByTokenHash: null, createdAt: new Date(), ...data };
        db.refreshTokens.push(t);
        return t;
      },
      findUnique: async ({ where, include }: Fila) => {
        const t = db.refreshTokens.find((x) => coincide(x, where));
        if (!t) return null;
        return include?.usuario ? { ...t, usuario: db.usuarios.find((u) => u.id === t.usuarioId) } : { ...t };
      },
      update: async ({ where, data }: Fila) => {
        const t = db.refreshTokens.find((x) => x.id === where.id);
        Object.assign(t, data);
        return t;
      },
      updateMany: async ({ where, data }: Fila) => {
        const filas = db.refreshTokens.filter((x) => coincide(x, where));
        filas.forEach((x) => Object.assign(x, data));
        return { count: filas.length };
      },
    },

    favorito: {
      findMany: async ({ where, include, orderBy }: Fila) =>
        ordenar(db.favoritos.filter((f) => coincide(f, where)), orderBy).map((f) => conReceta(f, include)),
      create: async ({ data }: Fila) => {
        if (db.favoritos.some((f) => f.usuarioId === data.usuarioId && f.recetaId === data.recetaId)) {
          throw new Prisma.PrismaClientKnownRequestError('duplicado', { code: 'P2002', clientVersion: 'fake' });
        }
        const f = { id: nuevoId(), fechaGuardado: new Date(), ...data };
        db.favoritos.push(f);
        return f;
      },
      deleteMany: async ({ where }: Fila) => {
        const antes = db.favoritos.length;
        db.favoritos = db.favoritos.filter((f) => !coincide(f, where));
        return { count: antes - db.favoritos.length };
      },
    },

    historial: {
      findMany: async ({ where, include, orderBy, take }: Fila) =>
        ordenar(db.historial.filter((h) => coincide(h, where)), orderBy)
          .slice(0, take)
          .map((h) => conReceta(h, include)),
      create: async ({ data }: Fila) => {
        const h = { id: nuevoId(), fecha: new Date(), ...data };
        db.historial.push(h);
        return h;
      },
    },
  };

  // Datos de ejemplo: 2 categorías y 3 recetas (una con foto).
  db.categorias.push({ id: 1, nombre: 'Desayunos', slug: 'desayunos' }, { id: 3, nombre: 'Bebidas', slug: 'bebidas' });
  db.recetas.push(
    { id: 1, categoriaId: 1, nombre: 'Pan con palta', momentos: [], videoUrl: 'https://www.youtube.com/watch?v=abc', imagenDatos: null, imagenMime: null },
    { id: 2, categoriaId: 3, nombre: 'Chicha morada', momentos: ['almuerzo', 'cena'], videoUrl: null, imagenDatos: new Uint8Array([0xff, 0xd8, 0xff]), imagenMime: 'image/jpeg' },
    { id: 3, categoriaId: 3, nombre: 'Café americano', momentos: ['desayuno'], videoUrl: null, imagenDatos: null, imagenMime: null },
  );

  return prisma;
}

export type FakePrisma = ReturnType<typeof crearFakePrisma>;
