import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MensajeChatDto {
  @IsIn(['user', 'assistant'])
  rol: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  texto: string;
}

// La conversación completa viaja en cada pedido (la API de Claude no guarda
// estado). Se limita a los últimos 20 mensajes para acotar costo y abuso.
export class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MensajeChatDto)
  mensajes: MensajeChatDto[];
}
