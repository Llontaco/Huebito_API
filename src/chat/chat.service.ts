import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, FinishReason, GoogleGenAI } from '@google/genai';
import { PrismaService } from '../prisma/prisma.service';
import { GUIA_HUEBITO } from './guia-huebito';
import type { MensajeChatDto } from './dto/chat.dto';

// Modelo de Gemini por defecto: rápido y dentro del plan gratuito. Se puede
// cambiar con la variable GEMINI_MODEL sin tocar código.
export const MODELO_CHAT_POR_DEFECTO = 'gemini-2.5-flash';
const VIGENCIA_CATALOGO_MS = 10 * 60 * 1000;

const NOMBRES_RULETA: Record<string, string> = {
  desayunos: 'Desayunar',
  almuerzos: 'Almorzar > Almuerzo clásico',
  sopas: 'Almorzar > Sopa o chupe',
  entradas: 'Almorzar > Entrada',
  cenas: 'Cenar',
  bebidas: 'ruleta de bebidas (acompañante)',
};

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ai: GoogleGenAI | null;
  readonly modelo: string;
  private catalogo: { texto: string; hasta: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.modelo = config.get<string>('GEMINI_MODEL') || MODELO_CHAT_POR_DEFECTO;
    // Sin clave la API arranca igual; solo el chat responde 503.
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  // Lista de recetas por ruleta, para que el asistente recomiende platos que
  // existen. Se arma ordenada (siempre igual) y se guarda 10 minutos, así las
  // instrucciones no cambian entre pedidos y Gemini puede reutilizarlas.
  private async textoCatalogo(): Promise<string> {
    if (this.catalogo && this.catalogo.hasta > Date.now()) return this.catalogo.texto;

    const recetas = await this.prisma.receta.findMany({
      select: { nombre: true, tiempoMinutos: true, dificultad: true, categoria: { select: { slug: true } } },
      orderBy: { nombre: 'asc' },
    });
    const porCategoria = new Map<string, string[]>();
    for (const r of recetas) {
      const lista = porCategoria.get(r.categoria.slug) ?? [];
      lista.push(`${r.nombre} (${r.tiempoMinutos ?? '?'} min, ${r.dificultad ?? 'media'})`);
      porCategoria.set(r.categoria.slug, lista);
    }
    const bloques = Object.keys(NOMBRES_RULETA)
      .filter((slug) => porCategoria.has(slug))
      .map((slug) => `${NOMBRES_RULETA[slug]}:\n${porCategoria.get(slug).join('; ')}`);

    const texto = `Catálogo de recetas de Huebito (nombre, tiempo, dificultad), agrupado por la ruleta donde aparece:\n\n${bloques.join('\n\n')}`;
    this.catalogo = { texto, hasta: Date.now() + VIGENCIA_CATALOGO_MS };
    return texto;
  }

  async responder(mensajes: MensajeChatDto[]): Promise<string> {
    if (!this.ai) {
      throw new ServiceUnavailableException('El asistente todavía no está configurado');
    }
    if (mensajes[0].rol !== 'user' || mensajes[mensajes.length - 1].rol !== 'user') {
      throw new BadRequestException('La conversación debe empezar y terminar con un mensaje del usuario');
    }

    const catalogo = await this.textoCatalogo();

    try {
      const respuesta = await this.ai.models.generateContent({
        model: this.modelo,
        // Gemini llama "model" al rol del asistente.
        contents: mensajes.map((m) => ({
          role: m.rol === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.texto }],
        })),
        config: {
          systemInstruction: `${GUIA_HUEBITO}\n\n${catalogo}`,
          maxOutputTokens: 2000,
          temperature: 0.7,
          // En los modelos Flash el razonamiento extra no hace falta para un chat
          // de ayuda: apagarlo hace las respuestas más rápidas.
          ...(this.modelo.includes('flash') ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      });

      const motivo = respuesta.candidates?.[0]?.finishReason;
      if (motivo === FinishReason.SAFETY || motivo === FinishReason.PROHIBITED_CONTENT || respuesta.promptFeedback?.blockReason) {
        return 'Perdona, con eso no puedo ayudarte. ¿Te ayudo con alguna receta o con cómo usar Huebito?';
      }
      return respuesta.text?.trim() || 'No supe qué responder. ¿Puedes contarme un poco más?';
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429) {
          // El plan gratuito tiene un límite de pedidos por minuto y por día.
          throw new HttpException('El asistente está muy ocupado. Intenta en un momento.', HttpStatus.TOO_MANY_REQUESTS);
        }
        this.logger.error(`Error de la API de Gemini ${error.status}: ${error.message}`);
        throw new ServiceUnavailableException('El asistente no está disponible en este momento');
      }
      throw error;
    }
  }
}
