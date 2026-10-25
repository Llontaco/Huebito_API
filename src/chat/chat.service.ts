import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { GUIA_HUEBITO } from './guia-huebito';
import type { MensajeChatDto } from './dto/chat.dto';

export const MODELO_CHAT = 'claude-opus-5-5';
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
  private readonly client: Anthropic | null;
  private catalogo: { texto: string; hasta: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    // Sin clave la API arranca igual; solo el chat responde 503.
    this.client = apiKey
      ? new Anthropic({ apiKey, timeout: 45_000, maxRetries: 1 })
      : null;
  }

  // Lista de recetas por ruleta, para que el asistente recomiende platos que
  // existen. Se arma ordenada (siempre igual) y se guarda 10 minutos, así el
  // prompt del sistema no cambia entre pedidos y se aprovecha la caché.
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
    if (!this.client) {
      throw new ServiceUnavailableException('El asistente todavía no está configurado');
    }
    if (mensajes[0].rol !== 'user' || mensajes[mensajes.length - 1].rol !== 'user') {
      throw new BadRequestException('La conversación debe empezar y terminar con un mensaje del usuario');
    }

    const catalogo = await this.textoCatalogo();

    try {
      const respuesta = await this.client.beta.messages.create({
        model: MODELO_CHAT,
        max_tokens: 2000,
        // Chat de ayuda: respuestas rápidas y baratas. El esfuerzo se sube solo
        // si hiciera falta más razonamiento.
        output_config: { effort: 'low' },
        // Si el modelo rechaza una pregunta por sus filtros, el servidor la
        // reintenta con otro modelo dentro del mismo pedido.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          { type: 'text', text: GUIA_HUEBITO },
          { type: 'text', text: catalogo, cache_control: { type: 'ephemeral' } },
        ],
        messages: mensajes.map((m) => ({ role: m.rol, content: m.texto })),
      });

      if (respuesta.stop_reason === 'refusal') {
        return 'Perdona, con eso no puedo ayudarte. ¿Te ayudo con alguna receta o con cómo usar Huebito?';
      }
      const texto = respuesta.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      return texto || 'No supe qué responder. ¿Puedes contarme un poco más?';
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new HttpException('El asistente está muy ocupado. Intenta en un momento.', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (error instanceof Anthropic.AuthenticationError) {
        this.logger.error('ANTHROPIC_API_KEY inválida');
        throw new ServiceUnavailableException('El asistente no está disponible');
      }
      if (error instanceof Anthropic.APIError) {
        this.logger.error(`Error de la API de Claude ${error.status}: ${error.message}`);
        throw new ServiceUnavailableException('El asistente no está disponible en este momento');
      }
      throw error;
    }
  }
}
