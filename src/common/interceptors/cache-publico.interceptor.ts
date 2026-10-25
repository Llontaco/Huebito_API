import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';

// Recetas y categorías son públicas y cambian muy poco. Con estas cabeceras el
// CDN de Vercel (el nodo más cercano al usuario, p. ej. São Paulo para Lima)
// guarda la respuesta y la entrega sin despertar la función ni consultar Neon:
//   - max-age=60: el navegador reutiliza la respuesta 1 minuto.
//   - s-maxage=600: el CDN la sirve 10 minutos sin preguntar.
//   - stale-while-revalidate: pasado ese tiempo sigue entregando la copia al
//     instante mientras la renueva por detrás, así nadie espera.
export const CACHE_PUBLICO =
  'public, max-age=60, s-maxage=600, stale-while-revalidate=86400';

@Injectable()
export class CachePublicoInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        // Solo respuestas exitosas: un 404 o 500 no debe quedar en caché.
        if (!res.headersSent && !res.getHeader('Cache-Control')) {
          res.setHeader('Cache-Control', CACHE_PUBLICO);
        }
      }),
    );
  }
}
