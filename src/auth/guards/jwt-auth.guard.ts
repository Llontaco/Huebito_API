import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Protege cualquier endpoint que requiera un usuario autenticado.
// Uso: @UseGuards(JwtAuthGuard)
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
