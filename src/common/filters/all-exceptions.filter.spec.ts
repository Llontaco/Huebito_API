import { ArgumentsHost, BadRequestException, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function crearHost() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const host = {
    switchToHttp: () => ({ getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('AllExceptionsFilter', () => {
  const filtro = new AllExceptionsFilter();

  beforeEach(() => {
    // El filtro loguea los 500; se silencia para no ensuciar la salida.
    jest.spyOn(filtro['logger'], 'error').mockImplementation(() => undefined);
  });

  it('deja pasar el status y mensaje de las HttpException', () => {
    const { host, res } = crearHost();
    filtro.catch(new NotFoundException('Receta no encontrada'), host);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Receta no encontrada' }),
    );
  });

  it('conserva la lista de errores de validación', () => {
    const { host, res } = crearHost();
    filtro.catch(new BadRequestException(['limit must not be greater than 100']), host);
    expect(res.json.mock.calls[0][0].message).toEqual(['limit must not be greater than 100']);
  });

  it('nunca filtra detalles internos de un error inesperado', () => {
    const { host, res } = crearHost();
    filtro.catch(new Error('relation "usuarios" does not exist at db.neon.tech'), host);
    expect(res.status).toHaveBeenCalledWith(500);
    const cuerpo = JSON.stringify(res.json.mock.calls[0][0]);
    expect(cuerpo).not.toContain('usuarios');
    expect(cuerpo).not.toContain('neon');
    expect(cuerpo).toContain('Error interno del servidor');
  });
});
