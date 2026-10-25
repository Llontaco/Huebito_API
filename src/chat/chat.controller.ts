import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';

// Asistente de la app. Público (también lo usan los invitados), con un límite
// de pedidos por IP porque cada respuesta es una llamada a Gemini (con límite diario en el plan gratuito).
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  async responder(@Body() dto: ChatDto) {
    return { respuesta: await this.chatService.responder(dto.mensajes) };
  }
}
