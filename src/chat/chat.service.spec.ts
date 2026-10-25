import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ChatService, MODELO_CHAT } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

const recetas = [
  { nombre: 'Lomo Saltado', tiempoMinutos: 30, dificultad: 'media', categoria: { slug: 'almuerzos' } },
  { nombre: 'Caldo de Gallina', tiempoMinutos: 90, dificultad: 'facil', categoria: { slug: 'sopas' } },
];

function crear(apiKey = 'sk-prueba') {
  const prisma = { receta: { findMany: jest.fn().mockResolvedValue(recetas) } };
  const service = new ChatService(prisma as unknown as PrismaService, new ConfigService({ ANTHROPIC_API_KEY: apiKey }));
  const create = jest.fn();
  if (apiKey) (service as any).client = { beta: { messages: { create } } };
  return { service, create, prisma };
}

const texto = (t: string) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: t }] });
const pregunta = [{ rol: 'user' as const, texto: '¿Cómo giro la ruleta?' }];

describe('ChatService', () => {
  it('sin ANTHROPIC_API_KEY responde 503 sin romper el resto de la API', async () => {
    const { service } = crear('');
    await expect(service.responder(pregunta)).rejects.toThrow(ServiceUnavailableException);
  });

  it('llama a Claude con el modelo, el esfuerzo bajo, fallbacks y la caché del catálogo', async () => {
    const { service, create } = crear();
    create.mockResolvedValue(texto('Toca "Girar".'));

    await expect(service.responder(pregunta)).resolves.toBe('Toca "Girar".');
    const params = create.mock.calls[0][0];
    expect(params.model).toBe(MODELO_CHAT);
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toContain('server-side-fallback-2026-07-01');
    expect(params.messages).toEqual([{ role: 'user', content: '¿Cómo giro la ruleta?' }]);
    expect(params.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.system[1].text).toContain('Almorzar > Sopa o chupe:\nCaldo de Gallina (90 min, facil)');
  });

  it('el catálogo se arma una vez y se reutiliza (prompt estable para la caché)', async () => {
    const { service, create, prisma } = crear();
    create.mockResolvedValue(texto('ok'));
    await service.responder(pregunta);
    await service.responder(pregunta);
    expect(prisma.receta.findMany).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].system).toEqual(create.mock.calls[1][0].system);
  });

  it('la conversación debe empezar y terminar con el usuario', async () => {
    const { service } = crear();
    await expect(service.responder([{ rol: 'assistant', texto: 'hola' }])).rejects.toThrow(/usuario/);
    await expect(
      service.responder([{ rol: 'user', texto: 'a' }, { rol: 'assistant', texto: 'b' }]),
    ).rejects.toThrow(/usuario/);
  });

  it('si el modelo se niega, devuelve un mensaje amable en vez de vacío', async () => {
    const { service, create } = crear();
    create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(service.responder(pregunta)).resolves.toMatch(/no puedo ayudarte/);
  });

  it('un límite de uso de Claude se traduce en 429', async () => {
    const { service, create } = crear();
    create.mockRejectedValue(new Anthropic.RateLimitError(429, {}, 'rate', new Headers()));
    const err = await service.responder(pregunta).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
  });

  it('otros errores de Claude se traducen en 503 sin filtrar detalles', async () => {
    const { service, create } = crear();
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    create.mockRejectedValue(new Anthropic.InternalServerError(500, {}, 'detalle interno', new Headers()));
    await expect(service.responder(pregunta)).rejects.toThrow('El asistente no está disponible en este momento');
  });
});
