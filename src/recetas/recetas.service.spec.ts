import { NotFoundException } from '@nestjs/common';
import { RecetasService } from './recetas.service';
import { PrismaService } from '../prisma/prisma.service';

function crearPrisma() {
  const prisma = {
    receta: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
    },
    // $transaction recibe las dos consultas ya armadas y las resuelve juntas.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return prisma;
}

describe('RecetasService', () => {
  let prisma: ReturnType<typeof crearPrisma>;
  let service: RecetasService;

  beforeEach(() => {
    prisma = crearPrisma();
    service = new RecetasService(prisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('pagina con 20 por defecto y ordena por nombre', async () => {
      prisma.receta.count.mockResolvedValue(45);
      const res = await service.findAll({});

      expect(prisma.receta.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20, orderBy: { nombre: 'asc' } }),
      );
      expect(res).toEqual({ items: [], total: 45, page: 1, limit: 20 });
    });

    it('nunca devuelve más de 100 por página', async () => {
      await service.findAll({ limit: 500 });
      expect(prisma.receta.findMany.mock.calls[0][0].take).toBe(100);
    });

    it('calcula el salto de la página pedida', async () => {
      await service.findAll({ limit: 10, page: 3 });
      expect(prisma.receta.findMany.mock.calls[0][0].skip).toBe(20);
    });

    it('una página 0 o negativa se trata como la primera', async () => {
      await service.findAll({ page: -4 });
      expect(prisma.receta.findMany.mock.calls[0][0].skip).toBe(0);
    });

    it('combina los filtros de categoría, momento y búsqueda', async () => {
      await service.findAll({ categoriaId: 3, momento: 'cena', q: 'chicha' });
      expect(prisma.receta.findMany.mock.calls[0][0].where).toEqual({
        categoriaId: 3,
        momentos: { has: 'cena' },
        nombre: { contains: 'chicha', mode: 'insensitive' },
      });
    });

    it('nunca manda el binario de la imagen en el listado', async () => {
      await service.findAll({});
      expect(prisma.receta.findMany.mock.calls[0][0].omit).toEqual({ imagenDatos: true });
    });
  });

  describe('findOne', () => {
    it('devuelve la receta sin el binario', async () => {
      prisma.receta.findUnique.mockResolvedValue({ id: 5, nombre: 'Ceviche' });
      await expect(service.findOne(5)).resolves.toEqual({ id: 5, nombre: 'Ceviche' });
      expect(prisma.receta.findUnique.mock.calls[0][0].omit).toEqual({ imagenDatos: true });
    });

    it('responde 404 si no existe', async () => {
      prisma.receta.findUnique.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findImagen', () => {
    it('devuelve los bytes y el tipo', async () => {
      prisma.receta.findUnique.mockResolvedValue({
        imagenDatos: new Uint8Array([1, 2, 3]),
        imagenMime: 'image/jpeg',
      });
      const { datos, mime } = await service.findImagen(1);
      expect(Buffer.isBuffer(datos)).toBe(true);
      expect(datos.length).toBe(3);
      expect(mime).toBe('image/jpeg');
    });

    it('usa image/webp si no hay tipo guardado', async () => {
      prisma.receta.findUnique.mockResolvedValue({
        imagenDatos: new Uint8Array([1]),
        imagenMime: null,
      });
      await expect(service.findImagen(1)).resolves.toMatchObject({ mime: 'image/webp' });
    });

    it('responde 404 si la receta no tiene foto', async () => {
      prisma.receta.findUnique.mockResolvedValue({ imagenDatos: null, imagenMime: null });
      await expect(service.findImagen(1)).rejects.toThrow(NotFoundException);
    });
  });
});
