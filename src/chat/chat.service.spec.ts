import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, FinishReason } from '@google/genai';
import { ChatService, MODELO_CHAT_POR_DEFECTO } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

const recetas = [
  { nombre: 'Lomo Saltado', tiempoMinutos: 30, dificultad: 'media', categoria: { slug: 'almuerzos' } },
  { nombre: 'Caldo de Gallina', tiempoMinutos: 90, dificultad: 'facil', categoria: { slug: 'sopas' } },
];

function crear(env: Record<string, string> = { GEMINI_API_KEY: 'clave-prueba' }) {
  const prisma = { receta: { findMany: jest.fn().mockResolvedValue(recetas) } };
  const service = new ChatService(prisma as unknown as PrismaService, new ConfigService(env));
  const generateContent = jest.fn();
  if (env.GEMINI_API_KEY) (service as any).ai = { models: { generateContent } };
  return { service, generateContent, prisma };
}

const respuesta = (text: string, finishReason = FinishReason.STOP) => ({ text, candidates: [{ finishReason }] });
const pregunta = [{ rol: 'user' as const, texto: '¿Cómo giro la ruleta?' }];

describe('ChatService (Gemini)', () => {
  it('sin GEMINI_API_KEY responde 503 sin romper el resto de la API', async () => {
    const { service } = crear({});
    await expect(service.responder(pregunta)).rejects.toThrow(ServiceUnavailableException);
  });

  it('usa el modelo por defecto o el de GEMINI_MODEL', () => {
    expect(crear().service.modelo).toBe(MODELO_CHAT_POR_DEFECTO);
    expect(crear({ GEMINI_API_KEY: 'x', GEMINI_MODEL: 'gemini-2.5-pro' }).service.modelo).toBe('gemini-2.5-pro');
  });

  it('manda la conversación con los roles de Gemini, la guía y el catálogo', async () => {
    const { service, generateContent } = crear();
    generateContent.mockResolvedValue(respuesta('Toca "Girar".'));

    await expect(
      service.responder([
        { rol: 'user', texto: 'hola' },
        { rol: 'assistant', texto: '¡Hola!' },
        { rol: 'user', texto: '¿Cómo giro la ruleta?' },
      ]),
    ).resolves.toBe('Toca "Girar".');

    const params = generateContent.mock.calls[0][0];
    expect(params.model).toBe(MODELO_CHAT_POR_DEFECTO);
    expect(params.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(params.contents[2].parts).toEqual([{ text: '¿Cómo giro la ruleta?' }]);
    expect(params.config.systemInstruction).toContain('Eres Huebi');
    expect(params.config.systemInstruction).toContain('Almorzar > Sopa o chupe:\nCaldo de Gallina (90 min, facil)');
    expect(params.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
  });

  it('el catálogo se arma una vez y se reutiliza', async () => {
    const { service, generateContent, prisma } = crear();
    generateContent.mockResolvedValue(respuesta('ok'));
    await service.responder(pregunta);
    await service.responder(pregunta);
    expect(prisma.receta.findMany).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].config.systemInstruction).toBe(
      generateContent.mock.calls[1][0].config.systemInstruction,
    );
  });

  it('la conversación debe empezar y terminar con el usuario', async () => {
    const { service } = crear();
    await expect(service.responder([{ rol: 'assistant', texto: 'hola' }])).rejects.toThrow(/usuario/);
  });

  it('si Gemini bloquea la respuesta por seguridad, devuelve un mensaje amable', async () => {
    const { service, generateContent } = crear();
    generateContent.mockResolvedValue(respuesta(undefined, FinishReason.SAFETY));
    await expect(service.responder(pregunta)).resolves.toMatch(/no puedo ayudarte/);
  });

  it('el límite del plan gratuito (429) se traduce en 429', async () => {
    const { service, generateContent } = crear();
    generateContent.mockRejectedValue(new ApiError({ message: 'quota', status: 429 }));
    const err = await service.responder(pregunta).catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(429);
  });

  it('otros errores de Gemini (clave inválida, caída) se traducen en 503', async () => {
    const { service, generateContent } = crear();
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);
    generateContent.mockRejectedValue(new ApiError({ message: 'API key not valid', status: 400 }));
    await expect(service.responder(pregunta)).rejects.toThrow('El asistente no está disponible en este momento');
  });
});
